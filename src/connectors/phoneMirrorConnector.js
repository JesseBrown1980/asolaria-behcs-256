const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { resolveCapturePath } = require("../runtimePaths");

const DEFAULT_TIMEOUT_MS = 15000;
const PHONE_SCREEN_FALLBACK_FILE = "phone-screen-latest.png";
const PHONE_VOICE_FALLBACK_FILE = "phone-whatsapp-voice-latest.wav";

const PHONE_MIRROR_STATE = {
  lastPath: "",
  lastFileName: "",
  lastCapturedAt: "",
  lastCapturedAtMs: 0,
  width: 0,
  height: 0,
  orientation: "",
  deviceId: "",
  lastError: "",
  lastVoiceOutputPath: "",
  lastVoiceOutputAt: "",
  lastVoiceOutputAtMs: 0
};

function normalizeText(value) {
  return String(value || "").trim();
}

function safePhoneImageFileName(value, fallback = PHONE_SCREEN_FALLBACK_FILE) {
  const raw = normalizeText(value) || fallback;
  const parsed = path.parse(raw);
  const safeBase = String(parsed.name || "phone-screen-latest")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80) || "phone-screen-latest";
  const ext = ".png";
  return `${safeBase}${ext}`;
}

function safePhoneVoiceFileName(value, fallback = PHONE_VOICE_FALLBACK_FILE) {
  const raw = normalizeText(value) || fallback;
  const parsed = path.parse(raw);
  const safeBase = String(parsed.name || "phone-whatsapp-voice-latest")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80) || "phone-whatsapp-voice-latest";
  return `${safeBase}.wav`;
}

function resolveAdbPath() {
  const envPath = normalizeText(process.env.ASOLARIA_ADB_PATH);
  const candidates = [
    envPath,
    "C:\\Users\\acer\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
    "C:\\Android\\platform-tools\\adb.exe",
    "C:\\platform-tools\\adb.exe",
    "C:\\Program Files\\Android\\platform-tools\\adb.exe",
    "C:\\Users\\acer\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools\\adb.exe"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const where = childProcess.spawnSync("where", ["adb"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 3000
    });
    if (where.status === 0) {
      const first = String(where.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (first && fs.existsSync(first)) {
        return first;
      }
    }
  } catch (_error) {
    // ignore
  }

  return "";
}

function runCommand(exe, args, options = {}) {
  const timeoutMs = Math.max(2500, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(exe, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdoutChunks = [];
    let stderrText = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => {
      stderrText += String(chunk || "");
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = String(stderrText || "").trim();
      const allowNonZero = Boolean(options.allowNonZero);
      if (code !== 0 && !allowNonZero) {
        const reason = stderr || String(stdout.toString("utf8") || "").trim() || "unknown_error";
        return reject(new Error(`Command exited ${code}: ${reason}`));
      }
      return resolve({
        code: Number(code || 0),
        stdout,
        stderr
      });
    });

    if (options.stdinBuffer && Buffer.isBuffer(options.stdinBuffer)) {
      child.stdin.write(options.stdinBuffer);
    } else if (options.stdinText !== undefined) {
      child.stdin.write(String(options.stdinText || ""));
    }
    child.stdin.end();
  });
}

async function runAdb(adbPath, args, options = {}) {
  if (!adbPath) {
    throw new Error("adb_not_found");
  }
  return runCommand(adbPath, args, options);
}

function parseAdbDevices(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (line.toLowerCase().startsWith("list of devices attached")) {
      continue;
    }
    const match = /^(\S+)\s+(\S+)$/.exec(line);
    if (!match) continue;
    rows.push({
      id: match[1],
      state: match[2]
    });
  }
  return rows;
}

function choosePhoneDevice(rows = [], requestedId = "") {
  const normalizedRequested = normalizeText(requestedId);
  const connected = rows.filter((row) => String(row.state || "").toLowerCase() === "device");
  const usbConnected = connected.filter((row) => !String(row.id || "").includes(":"));
  if (!connected.length) {
    return "";
  }
  if (normalizedRequested) {
    const exact = connected.find((row) => row.id === normalizedRequested);
    if (exact) {
      return exact.id;
    }
  }
  if (PHONE_MIRROR_STATE.deviceId) {
    const fromState = connected.find((row) => row.id === PHONE_MIRROR_STATE.deviceId);
    if (fromState) {
      if (!String(fromState.id || "").includes(":") || !usbConnected.length) {
        return fromState.id;
      }
    }
  }
  if (usbConnected.length) {
    return usbConnected[0].id;
  }
  return connected[0].id;
}

function parseUserId(value, fallback = -1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.round(numeric);
}

function parsePmUsers(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const users = [];
  for (const line of lines) {
    const match = /UserInfo\{(\d+):([^:}]+):/.exec(line);
    if (!match) continue;
    users.push({
      id: Number(match[1]),
      label: String(match[2] || "").trim() || `User ${match[1]}`
    });
  }
  return users.filter((row) => Number.isFinite(row.id) && row.id >= 0);
}

function parsePackageList(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const names = [];
  for (const line of lines) {
    const match = /^package:(\S+)$/.exec(line);
    if (!match) continue;
    names.push(String(match[1] || "").trim());
  }
  return Array.from(new Set(names.filter(Boolean)));
}

function buildWhatsAppTargetDescriptor(packageName, userId = 0) {
  const safePkg = normalizeText(packageName) || "com.whatsapp";
  const safeUser = Number.isFinite(Number(userId)) ? Math.max(0, Math.round(Number(userId))) : 0;
  if (safePkg === "com.whatsapp.w4b") {
    return {
      id: safeUser === 0 ? "business" : `business_user_${safeUser}`,
      app: "business",
      label: safeUser === 0 ? "WhatsApp Business" : `WhatsApp Business (user ${safeUser})`,
      packageName: safePkg,
      userId: safeUser
    };
  }
  if (safePkg === "com.whatsapp") {
    return {
      id: safeUser === 0 ? "personal" : `personal_user_${safeUser}`,
      app: "personal",
      label: safeUser === 0 ? "WhatsApp Personal" : `WhatsApp Personal (user ${safeUser})`,
      packageName: safePkg,
      userId: safeUser
    };
  }
  return {
    id: `${safePkg.replace(/[^a-zA-Z0-9]+/g, "_")}_user_${safeUser}`,
    app: "custom",
    label: `${safePkg} (user ${safeUser})`,
    packageName: safePkg,
    userId: safeUser
  };
}

function pickPreferredWhatsAppTarget(targets = []) {
  const rows = Array.isArray(targets) ? targets : [];
  if (rows.length < 1) {
    return null;
  }
  const personalOwner = rows.find((row) => row.id === "personal");
  if (personalOwner) return personalOwner;
  const businessOwner = rows.find((row) => row.id === "business");
  if (businessOwner) return businessOwner;
  const owner = rows.find((row) => Number(row.userId) === 0);
  return owner || rows[0];
}

function parsePngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    return { width: 0, height: 0 };
  }
  const pngSig = "89504e470d0a1a0a";
  if (buffer.slice(0, 8).toString("hex").toLowerCase() !== pngSig) {
    return { width: 0, height: 0 };
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  };
}

function resolveOrientation(width, height) {
  if (width > height) return "landscape";
  if (height > width) return "portrait";
  if (width > 0 && height > 0) return "square";
  return "unknown";
}

function sleepMs(delayMs) {
  const wait = Math.max(0, Number(delayMs || 0));
  if (!wait) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, wait));
}

function parseForegroundComponentFromDump(rawText) {
  const text = String(rawText || "");
  if (!text) {
    return "";
  }

  const patterns = [
    /topResumedActivity[^\n]*?\b([a-zA-Z0-9._$]+\/[a-zA-Z0-9._$]+)\b/,
    /mResumedActivity[^\n]*?\b([a-zA-Z0-9._$]+\/[a-zA-Z0-9._$]+)\b/,
    /mFocusedApp[^\n]*?\b([a-zA-Z0-9._$]+\/[a-zA-Z0-9._$]+)\b/,
    /ACTIVITY\s+([a-zA-Z0-9._$]+\/[a-zA-Z0-9._$]+)\b/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }
  return "";
}

function packageNameFromComponent(component) {
  const normalized = normalizeText(component);
  if (!normalized) {
    return "";
  }
  const slashIndex = normalized.indexOf("/");
  if (slashIndex < 1) {
    return "";
  }
  return normalized.slice(0, slashIndex);
}

function isWhatsAppAuthActivity(component) {
  const value = normalizeText(component).toLowerCase();
  if (!/^(com\.whatsapp|com\.whatsapp\.w4b)\//.test(value)) {
    return false;
  }
  return value.includes("authentication") || value.includes("appauthenticationactivity");
}

async function listPhoneDevices(adbPath, options = {}) {
  const result = await runAdb(adbPath, ["devices"], {
    timeoutMs: options.timeoutMs || 8000
  });
  return parseAdbDevices(result.stdout.toString("utf8"));
}

async function getPhoneMirrorStatus(options = {}) {
  const adbPath = resolveAdbPath();
  const base = {
    adbFound: Boolean(adbPath),
    adbPath: adbPath || "",
    devices: [],
    selectedDeviceId: "",
    authorizedDeviceCount: 0,
    snapshot: {
      fileName: PHONE_MIRROR_STATE.lastFileName || "",
      capturedAt: PHONE_MIRROR_STATE.lastCapturedAt || "",
      capturedAtMs: Number(PHONE_MIRROR_STATE.lastCapturedAtMs || 0),
      width: Number(PHONE_MIRROR_STATE.width || 0),
      height: Number(PHONE_MIRROR_STATE.height || 0),
      orientation: PHONE_MIRROR_STATE.orientation || "",
      imageReady: Boolean(PHONE_MIRROR_STATE.lastPath && fs.existsSync(PHONE_MIRROR_STATE.lastPath))
    },
    voice: {
      hasLatest: Boolean(PHONE_MIRROR_STATE.lastVoiceOutputPath && fs.existsSync(PHONE_MIRROR_STATE.lastVoiceOutputPath)),
      updatedAt: PHONE_MIRROR_STATE.lastVoiceOutputAt || ""
    },
    lastError: PHONE_MIRROR_STATE.lastError || ""
  };
  if (!adbPath) {
    return base;
  }
  try {
    const devices = await listPhoneDevices(adbPath, options);
    const selectedDeviceId = choosePhoneDevice(devices, options.deviceId);
    return {
      ...base,
      devices,
      selectedDeviceId,
      authorizedDeviceCount: devices.filter((row) => String(row.state || "").toLowerCase() === "device").length
    };
  } catch (error) {
    PHONE_MIRROR_STATE.lastError = String(error?.message || error || "adb_devices_failed");
    return base;
  }
}

async function resolvePhoneDeviceContext(options = {}) {
  const adbPath = resolveAdbPath();
  if (!adbPath) {
    throw new Error("adb_not_found");
  }
  const devices = await listPhoneDevices(adbPath, {
    timeoutMs: options.timeoutMs || 8000
  });
  const deviceId = choosePhoneDevice(devices, options.deviceId);
  if (!deviceId) {
    throw new Error("no_authorized_phone_device");
  }
  return {
    adbPath,
    devices,
    deviceId
  };
}

async function listInstalledWhatsAppTargetsFromContext(ctx, options = {}) {
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 12000));
  const usersResult = await runAdb(
    ctx.adbPath,
    ["-s", ctx.deviceId, "shell", "pm", "list", "users"],
    {
      timeoutMs,
      allowNonZero: true
    }
  );
  const users = parsePmUsers(usersResult.stdout.toString("utf8"));
  const knownUsers = users.length > 0
    ? users
    : [{ id: 0, label: "Owner" }];

  const packagesResult = await runAdb(
    ctx.adbPath,
    ["-s", ctx.deviceId, "shell", "pm", "list", "packages"],
    {
      timeoutMs,
      allowNonZero: true
    }
  );
  const packageNames = parsePackageList(packagesResult.stdout.toString("utf8"));
  const candidatePackages = Array.from(new Set(
    packageNames.filter((name) => /^com\.whatsapp(\.w4b)?$/i.test(name))
  ));

  const targets = [];
  for (const packageName of candidatePackages) {
    for (const user of knownUsers) {
      const check = await runAdb(
        ctx.adbPath,
        [
          "-s",
          ctx.deviceId,
          "shell",
          "cmd",
          "package",
          "list",
          "packages",
          "--user",
          String(user.id),
          packageName
        ],
        {
          timeoutMs,
          allowNonZero: true
        }
      );
      const lines = parsePackageList(check.stdout.toString("utf8"));
      if (!lines.includes(packageName)) {
        continue;
      }
      const descriptor = buildWhatsAppTargetDescriptor(packageName, user.id);
      targets.push({
        ...descriptor,
        userLabel: user.label
      });
    }
  }

  const deduped = Array.from(
    new Map(targets.map((row) => [`${row.packageName}|${row.userId}`, row])).values()
  );
  const preferred = pickPreferredWhatsAppTarget(deduped);
  return {
    ok: true,
    deviceId: ctx.deviceId,
    users: knownUsers,
    targets: deduped,
    defaultTargetId: preferred ? String(preferred.id || "") : ""
  };
}

async function resolveWhatsAppTargetFromContext(ctx, options = {}) {
  const requestedApp = normalizeText(options.whatsappApp || options.app || options.target).toLowerCase();
  const requestedPackage = normalizeText(options.whatsappPackage || options.packageName || options.package);
  const requestedUserId = parseUserId(options.userId, -1);

  const inventory = await listInstalledWhatsAppTargetsFromContext(ctx, options);
  const targets = Array.isArray(inventory.targets) ? inventory.targets : [];
  let candidates = [...targets];

  if (requestedPackage) {
    candidates = candidates.filter((row) => String(row.packageName || "") === requestedPackage);
  }

  if (requestedApp) {
    if (requestedApp === "personal" || requestedApp === "default") {
      candidates = candidates.filter((row) => String(row.app || "") === "personal");
    } else if (requestedApp === "business" || requestedApp === "w4b") {
      candidates = candidates.filter((row) => String(row.app || "") === "business");
    } else if (/^(personal|business)_user_\d+$/.test(requestedApp)) {
      candidates = candidates.filter((row) => String(row.id || "") === requestedApp);
    } else if (requestedApp.startsWith("com.")) {
      candidates = candidates.filter((row) => String(row.packageName || "") === requestedApp);
    }
  }

  if (requestedUserId >= 0) {
    candidates = candidates.filter((row) => Number(row.userId) === requestedUserId);
  }

  let chosen = pickPreferredWhatsAppTarget(candidates);
  if (!chosen) {
    let explicitPackage = requestedPackage;
    if (!explicitPackage && (requestedApp === "business" || requestedApp === "w4b")) {
      explicitPackage = "com.whatsapp.w4b";
    } else if (!explicitPackage && (requestedApp === "personal" || requestedApp === "default")) {
      explicitPackage = "com.whatsapp";
    } else if (!explicitPackage && requestedApp.startsWith("com.")) {
      explicitPackage = requestedApp;
    }
    if (explicitPackage) {
      const explicitUser = requestedUserId >= 0 ? requestedUserId : 0;
      chosen = buildWhatsAppTargetDescriptor(explicitPackage, explicitUser);
    }
  }

  if (!chosen) {
    chosen = pickPreferredWhatsAppTarget(targets);
  }
  if (!chosen) {
    chosen = buildWhatsAppTargetDescriptor("com.whatsapp", requestedUserId >= 0 ? requestedUserId : 0);
  }

  return {
    ...chosen,
    inventory
  };
}

async function listInstalledWhatsAppTargets(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  return listInstalledWhatsAppTargetsFromContext(ctx, options);
}

async function inspectForegroundActivityFromContext(ctx, options = {}) {
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 9000));
  const first = await runAdb(
    ctx.adbPath,
    ["-s", ctx.deviceId, "shell", "dumpsys", "activity", "activities"],
    {
      timeoutMs,
      allowNonZero: true
    }
  );
  let component = parseForegroundComponentFromDump(first.stdout.toString("utf8"));

  if (!component) {
    const second = await runAdb(
      ctx.adbPath,
      ["-s", ctx.deviceId, "shell", "dumpsys", "activity", "top"],
      {
        timeoutMs,
        allowNonZero: true
      }
    );
    component = parseForegroundComponentFromDump(second.stdout.toString("utf8"));
  }

  const packageName = packageNameFromComponent(component);
  const isWhatsApp = /^(com\.whatsapp|com\.whatsapp\.w4b)$/i.test(packageName);
  const requiresManualBiometric = isWhatsAppAuthActivity(component);
  return {
    component,
    packageName,
    isWhatsApp,
    requiresManualBiometric
  };
}

async function capturePhoneMirrorSnapshot(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const timeoutMs = Math.max(4000, Number(options.timeoutMs || 20000));
  const fileName = safePhoneImageFileName(options.fileName, PHONE_SCREEN_FALLBACK_FILE);
  const outputPath = resolveCapturePath("phone", fileName);

  const result = await runAdb(ctx.adbPath, ["-s", ctx.deviceId, "exec-out", "screencap", "-p"], {
    timeoutMs
  });
  const bytes = Buffer.from(result.stdout || Buffer.alloc(0));
  if (bytes.length < 80) {
    throw new Error("phone_screencap_empty");
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes);

  const dimensions = parsePngDimensions(bytes);
  const now = Date.now();
  const capturedAt = new Date(now).toISOString();
  const orientation = resolveOrientation(dimensions.width, dimensions.height);

  PHONE_MIRROR_STATE.lastPath = outputPath;
  PHONE_MIRROR_STATE.lastFileName = fileName;
  PHONE_MIRROR_STATE.lastCapturedAt = capturedAt;
  PHONE_MIRROR_STATE.lastCapturedAtMs = now;
  PHONE_MIRROR_STATE.width = dimensions.width;
  PHONE_MIRROR_STATE.height = dimensions.height;
  PHONE_MIRROR_STATE.orientation = orientation;
  PHONE_MIRROR_STATE.deviceId = ctx.deviceId;
  PHONE_MIRROR_STATE.lastError = "";

  return {
    fileName,
    outputPath,
    capturedAt,
    capturedAtMs: now,
    width: dimensions.width,
    height: dimensions.height,
    orientation,
    sizeBytes: bytes.length,
    deviceId: ctx.deviceId
  };
}

function getPhoneMirrorImagePath() {
  const value = String(PHONE_MIRROR_STATE.lastPath || "").trim();
  if (!value) return "";
  if (!fs.existsSync(value)) return "";
  return value;
}

function getPhoneMirrorSnapshotSummary() {
  const imagePath = getPhoneMirrorImagePath();
  return {
    fileName: PHONE_MIRROR_STATE.lastFileName || "",
    capturedAt: PHONE_MIRROR_STATE.lastCapturedAt || "",
    capturedAtMs: Number(PHONE_MIRROR_STATE.lastCapturedAtMs || 0),
    width: Number(PHONE_MIRROR_STATE.width || 0),
    height: Number(PHONE_MIRROR_STATE.height || 0),
    orientation: PHONE_MIRROR_STATE.orientation || "unknown",
    imagePath,
    imageReady: Boolean(imagePath),
    deviceId: PHONE_MIRROR_STATE.deviceId || "",
    lastError: PHONE_MIRROR_STATE.lastError || ""
  };
}

function clampInt(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeCoord(value, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  if (numeric >= 0 && numeric <= 1) {
    return clampInt(numeric * Math.max(1, max - 1), 0, Math.max(0, max - 1));
  }
  return clampInt(numeric, 0, Math.max(0, max - 1));
}

function readControlScreenSize(options = {}) {
  const width = Number(options.screenWidth || PHONE_MIRROR_STATE.width || 0);
  const height = Number(options.screenHeight || PHONE_MIRROR_STATE.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return null;
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

function encodePhoneInputText(value) {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, "%s")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["'`$\\&|;<>()]/g, "")
    .slice(0, 400);
}

async function sendPhoneTap(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const size = readControlScreenSize(options);
  if (!size) {
    throw new Error("phone_screen_size_required");
  }
  const x = normalizeCoord(options.x, size.width);
  const y = normalizeCoord(options.y, size.height);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("tap_coordinates_required");
  }

  await runAdb(ctx.adbPath, ["-s", ctx.deviceId, "shell", "input", "tap", String(x), String(y)], {
    timeoutMs: Math.max(3000, Number(options.timeoutMs || 10000))
  });
  return {
    ok: true,
    deviceId: ctx.deviceId,
    x,
    y,
    width: size.width,
    height: size.height
  };
}

async function sendPhoneSwipe(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const size = readControlScreenSize(options);
  if (!size) {
    throw new Error("phone_screen_size_required");
  }
  const startX = normalizeCoord(options.startX, size.width);
  const startY = normalizeCoord(options.startY, size.height);
  const endX = normalizeCoord(options.endX, size.width);
  const endY = normalizeCoord(options.endY, size.height);
  if (![startX, startY, endX, endY].every((item) => Number.isFinite(item))) {
    throw new Error("swipe_coordinates_required");
  }
  const durationMs = clampInt(Number(options.durationMs || 320), 60, 4000);
  await runAdb(
    ctx.adbPath,
    [
      "-s",
      ctx.deviceId,
      "shell",
      "input",
      "swipe",
      String(startX),
      String(startY),
      String(endX),
      String(endY),
      String(durationMs)
    ],
    {
      timeoutMs: Math.max(3000, Number(options.timeoutMs || 10000))
    }
  );
  return {
    ok: true,
    deviceId: ctx.deviceId,
    startX,
    startY,
    endX,
    endY,
    durationMs,
    width: size.width,
    height: size.height
  };
}

async function sendPhoneText(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const encoded = encodePhoneInputText(options.text);
  if (!encoded) {
    throw new Error("text_required");
  }
  await runAdb(ctx.adbPath, ["-s", ctx.deviceId, "shell", "input", "text", encoded], {
    timeoutMs: Math.max(3000, Number(options.timeoutMs || 10000))
  });
  return {
    ok: true,
    deviceId: ctx.deviceId,
    length: String(options.text || "").length
  };
}

async function sendPhoneKey(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const key = normalizeText(options.key).toUpperCase();
  if (!key) {
    throw new Error("key_required");
  }
  const safeKey = /^\d+$/.test(key) ? key : key.replace(/[^A-Z0-9_]/g, "");
  if (!safeKey) {
    throw new Error("key_invalid");
  }
  await runAdb(ctx.adbPath, ["-s", ctx.deviceId, "shell", "input", "keyevent", safeKey], {
    timeoutMs: Math.max(3000, Number(options.timeoutMs || 10000))
  });
  return {
    ok: true,
    deviceId: ctx.deviceId,
    key: safeKey
  };
}

async function getPhoneForegroundApp(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const foreground = await inspectForegroundActivityFromContext(ctx, {
    timeoutMs: options.timeoutMs
  });
  return {
    ok: true,
    deviceId: ctx.deviceId,
    component: foreground.component,
    packageName: foreground.packageName,
    isWhatsApp: foreground.isWhatsApp,
    requiresManualBiometric: foreground.requiresManualBiometric,
    nextStep: foreground.requiresManualBiometric
      ? "Approve fingerprint on the phone to continue. Android does not allow remote biometric auto-approval."
      : ""
  };
}

async function openPhoneWhatsApp(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const target = await resolveWhatsAppTargetFromContext(ctx, options);
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 10000));
  const explicitTargetRequested = Boolean(
    normalizeText(options.whatsappApp || options.app || options.target)
    || normalizeText(options.whatsappPackage || options.packageName || options.package)
    || options.userId !== undefined
  );
  const inventoryTargets = Array.isArray(target?.inventory?.targets) ? target.inventory.targets : [];
  const fallbackTargets = explicitTargetRequested
    ? []
    : inventoryTargets.filter((row) => (
      String(row.packageName || "") !== String(target.packageName || "")
      || Number(row.userId) !== Number(target.userId)
    ));
  const attemptTargets = [target, ...fallbackTargets];

  let selectedTarget = null;
  for (const candidate of attemptTargets) {
    const monkeyArgs = [
      "-s",
      ctx.deviceId,
      "shell",
      "monkey"
    ];
    if (Number.isFinite(Number(candidate.userId)) && Number(candidate.userId) >= 0) {
      monkeyArgs.push("--user", String(Math.round(Number(candidate.userId))));
    }
    monkeyArgs.push("-p", String(candidate.packageName || "com.whatsapp"), "-c", "android.intent.category.LAUNCHER", "1");

    const launchResult = await runAdb(
      ctx.adbPath,
      monkeyArgs,
      {
        timeoutMs,
        allowNonZero: true
      }
    );
    const launchText = `${String(launchResult.stdout.toString("utf8") || "")}\n${String(launchResult.stderr || "")}`.toLowerCase();
    const launchFailed = (
      launchResult.code !== 0
      || launchText.includes("no activities found")
      || launchText.includes("monkey aborted")
    );
    if (!launchFailed) {
      selectedTarget = candidate;
      break;
    }
  }

  if (!selectedTarget) {
    throw new Error(`whatsapp_target_unavailable:${String(target.packageName || "com.whatsapp")}`);
  }

  let foreground = null;
  if (options.includeForeground !== false) {
    const postLaunchWaitMs = Math.max(0, Math.min(4000, Number(options.postLaunchWaitMs || 700)));
    await sleepMs(postLaunchWaitMs);
    try {
      foreground = await inspectForegroundActivityFromContext(ctx, {
        timeoutMs: options.foregroundTimeoutMs || options.timeoutMs || 9000
      });
    } catch (_error) {
      foreground = null;
    }
  }
  const authenticationRequired = Boolean(foreground?.requiresManualBiometric);
  return {
    ok: true,
    deviceId: ctx.deviceId,
    targetId: String(selectedTarget.id || ""),
    targetApp: String(selectedTarget.app || ""),
    packageName: String(selectedTarget.packageName || ""),
    userId: Number.isFinite(Number(selectedTarget.userId)) ? Number(selectedTarget.userId) : 0,
    foreground,
    authenticationRequired,
    nextStep: authenticationRequired
      ? "Approve fingerprint on the phone to continue. Android does not allow remote biometric auto-approval."
      : ""
  };
}

function normalizeWhatsAppPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 18);
}

async function openPhoneWhatsAppChat(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const target = await resolveWhatsAppTargetFromContext(ctx, options);
  const phone = normalizeWhatsAppPhone(options.phone || options.toNumber || "");
  if (!phone) {
    throw new Error("whatsapp_phone_required");
  }
  const message = String(options.message || "").trim().slice(0, 700);
  const waUrl = message
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${phone}`;
  const startArgs = [
    "-s",
    ctx.deviceId,
    "shell",
    "am",
    "start"
  ];
  if (Number.isFinite(Number(target.userId)) && Number(target.userId) >= 0) {
    startArgs.push("--user", String(Math.round(Number(target.userId))));
  }
  startArgs.push(
    "-a",
    "android.intent.action.VIEW",
    "-d",
    waUrl,
    "-p",
    String(target.packageName || "com.whatsapp")
  );

  const startResult = await runAdb(
    ctx.adbPath,
    startArgs,
    {
      timeoutMs: Math.max(3000, Number(options.timeoutMs || 10000)),
      allowNonZero: true
    }
  );
  const startText = `${String(startResult.stdout.toString("utf8") || "")}\n${String(startResult.stderr || "")}`.toLowerCase();
  if (
    startResult.code !== 0
    || startText.includes("unable to resolve intent")
    || startText.includes("no activity found")
    || startText.includes("error: activity not started")
    || startText.includes("not found")
    || startText.includes("not installed")
  ) {
    throw new Error(`whatsapp_target_unavailable:${String(target.packageName || "com.whatsapp")}`);
  }
  return {
    ok: true,
    deviceId: ctx.deviceId,
    targetId: String(target.id || ""),
    targetApp: String(target.app || ""),
    packageName: String(target.packageName || ""),
    userId: Number.isFinite(Number(target.userId)) ? Number(target.userId) : 0,
    phone,
    url: waUrl
  };
}

function extractUiXmlPayload(rawText) {
  const text = String(rawText || "");
  const index = text.indexOf("<hierarchy");
  if (index >= 0) {
    return text.slice(index).trim();
  }
  return text.trim();
}

async function dumpUiHierarchyFromContext(ctx, options = {}) {
  const remotePath = String(options.remotePath || "/sdcard/asolaria-wa-ui.xml");
  await runAdb(
    ctx.adbPath,
    ["-s", ctx.deviceId, "shell", "uiautomator", "dump", remotePath],
    {
      timeoutMs: Math.max(3000, Number(options.timeoutMs || 10000)),
      allowNonZero: true
    }
  );
  const readBack = await runAdb(
    ctx.adbPath,
    ["-s", ctx.deviceId, "shell", "cat", remotePath],
    {
      timeoutMs: Math.max(3000, Number(options.timeoutMs || 10000)),
      allowNonZero: true
    }
  );
  return extractUiXmlPayload(readBack.stdout.toString("utf8"));
}

function parseBoundsCenterFromNodeText(nodeText) {
  const match = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(String(nodeText || ""));
  if (!match) return null;
  const x1 = Number(match[1]);
  const y1 = Number(match[2]);
  const x2 = Number(match[3]);
  const y2 = Number(match[4]);
  if (![x1, y1, x2, y2].every((item) => Number.isFinite(item))) {
    return null;
  }
  return {
    x1,
    y1,
    x2,
    y2,
    centerX: Math.round((x1 + x2) / 2),
    centerY: Math.round((y1 + y2) / 2)
  };
}

function findWhatsAppSendNode(uiXml) {
  const text = String(uiXml || "");
  if (!text) return null;
  const nodeMatches = text.match(/<node [^>]*>/g) || [];
  const candidates = [];
  for (const nodeText of nodeMatches) {
    const bounds = parseBoundsCenterFromNodeText(nodeText);
    if (!bounds) continue;

    const resourceId = ((/resource-id="([^"]*)"/.exec(nodeText) || [])[1] || "").trim();
    const contentDesc = ((/content-desc="([^"]*)"/.exec(nodeText) || [])[1] || "").trim();
    const label = ((/text="([^"]*)"/.exec(nodeText) || [])[1] || "").trim();
    const lowerRid = resourceId.toLowerCase();
    const lowerDesc = contentDesc.toLowerCase();
    const lowerLabel = label.toLowerCase();
    const clickable = /clickable="true"/.test(nodeText);

    let score = 0;
    if (/com\.whatsapp(\.w4b)?:id\/send/.test(lowerRid)) score += 100;
    if (/\bsend\b/.test(lowerRid)) score += 60;
    if (/\b(send|enviar|mandar)\b/.test(lowerDesc)) score += 45;
    if (/\b(send|enviar|mandar)\b/.test(lowerLabel)) score += 25;
    if (clickable) score += 10;
    score += Math.round(bounds.centerY / 160);
    score += Math.round(bounds.centerX / 220);

    if (score > 0) {
      candidates.push({
        score,
        resourceId,
        contentDesc,
        label,
        ...bounds
      });
    }
  }
  if (candidates.length < 1) {
    return null;
  }
  candidates.sort((a, b) => b.score - a.score || b.centerY - a.centerY || b.centerX - a.centerX);
  return candidates[0];
}

async function sendPhoneWhatsAppLinkedMessage(options = {}) {
  const ctx = await resolvePhoneDeviceContext(options);
  const phone = normalizeWhatsAppPhone(options.phone || options.toNumber || "");
  const message = String(options.message || "").trim().slice(0, 700);
  if (!phone) {
    throw new Error("whatsapp_phone_required");
  }
  if (!message) {
    throw new Error("whatsapp_message_required");
  }

  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 12000));
  const postLaunchWaitMs = Math.max(200, Math.min(6000, Number(options.postLaunchWaitMs || 900)));
  const allowEnterFallback = options.allowEnterFallback !== false;

  const launch = await openPhoneWhatsAppChat({
    deviceId: ctx.deviceId,
    phone,
    message,
    timeoutMs,
    whatsappApp: options.whatsappApp,
    app: options.app,
    whatsappPackage: options.whatsappPackage,
    packageName: options.packageName,
    userId: options.userId
  });

  await sleepMs(postLaunchWaitMs);

  let sendTap = null;
  let sendMethod = "";
  try {
    const uiXml = await dumpUiHierarchyFromContext(ctx, { timeoutMs });
    const node = findWhatsAppSendNode(uiXml);
    if (node && Number.isFinite(node.centerX) && Number.isFinite(node.centerY)) {
      await runAdb(
        ctx.adbPath,
        ["-s", ctx.deviceId, "shell", "input", "tap", String(node.centerX), String(node.centerY)],
        {
          timeoutMs
        }
      );
      sendTap = node;
      sendMethod = "uiautomator_send_button_tap";
    }
  } catch (_error) {
    sendTap = null;
  }

  if (!sendTap && allowEnterFallback) {
    await runAdb(
      ctx.adbPath,
      ["-s", ctx.deviceId, "shell", "input", "keyevent", "KEYCODE_ENTER"],
      {
        timeoutMs,
        allowNonZero: true
      }
    );
    sendMethod = "keyevent_enter_fallback";
  }

  const ok = Boolean(sendTap) || Boolean(sendMethod);
  return {
    ok,
    deviceId: ctx.deviceId,
    targetId: String(launch.targetId || ""),
    targetApp: String(launch.targetApp || ""),
    packageName: String(launch.packageName || ""),
    userId: Number.isFinite(Number(launch.userId)) ? Number(launch.userId) : 0,
    phone,
    url: launch.url,
    sendMethod: sendMethod || "",
    sendTap,
    manualActionRequired: !ok,
    nextStep: ok
      ? ""
      : "WhatsApp chat opened with prefilled text; tap send manually on the phone."
  };
}

function setPhoneMirrorVoiceOutput(outputPath) {
  const fullPath = normalizeText(outputPath);
  if (!fullPath) {
    PHONE_MIRROR_STATE.lastVoiceOutputPath = "";
    PHONE_MIRROR_STATE.lastVoiceOutputAt = "";
    PHONE_MIRROR_STATE.lastVoiceOutputAtMs = 0;
    return;
  }
  PHONE_MIRROR_STATE.lastVoiceOutputPath = fullPath;
  PHONE_MIRROR_STATE.lastVoiceOutputAt = new Date().toISOString();
  PHONE_MIRROR_STATE.lastVoiceOutputAtMs = Date.now();
}

function getPhoneMirrorVoiceOutput() {
  const value = normalizeText(PHONE_MIRROR_STATE.lastVoiceOutputPath);
  const exists = value ? fs.existsSync(value) : false;
  return {
    path: exists ? value : "",
    updatedAt: PHONE_MIRROR_STATE.lastVoiceOutputAt || "",
    updatedAtMs: Number(PHONE_MIRROR_STATE.lastVoiceOutputAtMs || 0)
  };
}

function manifest() {
  return {
    id: "phone_mirror",
    version: "1.0.0",
    description: "Android phone mirror via ADB — screen capture, touch/swipe/key input, WhatsApp deep-link messaging, foreground app detection",
    capabilities: ["screencap", "tap", "swipe", "text_input", "key_input", "foreground_detect", "whatsapp_open", "whatsapp_chat", "whatsapp_send", "ui_hierarchy_dump"],
    readScopes: ["phone_screen", "phone_foreground_activity", "phone_whatsapp_targets", "phone_ui_hierarchy"],
    writeScopes: ["phone_input", "phone_captures"],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 20000,
    secretRequirements: [],
    sideEffects: ["sends input events to phone via ADB", "writes PNG screenshots to disk", "launches WhatsApp intents on phone"],
    failureModes: ["adb_not_found", "no_authorized_phone_device", "phone_screencap_empty", "whatsapp_target_unavailable", "biometric_auth_required"],
    emittedEvents: ["phone.snapshot_captured", "phone.tap_sent", "phone.whatsapp_opened", "phone.whatsapp_message_sent"]
  };
}

module.exports = {
  safePhoneVoiceFileName,
  getPhoneMirrorStatus,
  capturePhoneMirrorSnapshot,
  getPhoneMirrorImagePath,
  getPhoneMirrorSnapshotSummary,
  sendPhoneTap,
  sendPhoneSwipe,
  sendPhoneText,
  sendPhoneKey,
  getPhoneForegroundApp,
  listInstalledWhatsAppTargets,
  openPhoneWhatsApp,
  openPhoneWhatsAppChat,
  sendPhoneWhatsAppLinkedMessage,
  setPhoneMirrorVoiceOutput,
  getPhoneMirrorVoiceOutput,
  manifest
};
