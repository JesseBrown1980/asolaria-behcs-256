const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { logsDir } = require("../runtimePaths");

const PRO_MIRROR_PID_FILE = path.join(logsDir, "phone-pro-mirror.pid");
const DEFAULT_WINDOW_TITLE = "Asolaria Pro Mirror";
const VERSION_CACHE_TTL_MS = 10 * 60 * 1000;

const PRO_MIRROR_STATE = {
  lastStartedAt: "",
  lastStoppedAt: "",
  lastError: "",
  lastDeviceId: "",
  lastArgs: [],
  versionValue: "",
  versionCheckedAtMs: 0
};

function normalizeText(value) {
  return String(value || "").trim();
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function ensureDirExists(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true });
}

function readPidFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const parsed = Number(String(fs.readFileSync(filePath, "utf8") || "").trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
  } catch (_error) {
    return 0;
  }
}

function writePidFile(filePath, pid) {
  ensureDirExists(path.dirname(filePath));
  fs.writeFileSync(filePath, `${Number(pid || 0) || 0}\n`, "utf8");
}

function removePidFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_error) {
    // ignore
  }
}

function isPidRunning(pid) {
  const value = Number(pid || 0);
  if (!Number.isFinite(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function runCommandSync(exe, args, options = {}) {
  const timeoutMs = clampInt(options.timeoutMs, 7000, 1000, 60000);
  const result = childProcess.spawnSync(exe, args, {
    windowsHide: true,
    encoding: "utf8",
    timeout: timeoutMs
  });
  return {
    code: Number(result.status || 0),
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

function firstExisting(candidates = []) {
  for (const value of candidates) {
    const candidate = normalizeText(value);
    if (!candidate) continue;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function findWingetScrcpyPath() {
  const localAppData = normalizeText(process.env.LOCALAPPDATA);
  if (!localAppData) return "";
  const base = path.join(
    localAppData,
    "Microsoft",
    "WinGet",
    "Packages",
    "Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe"
  );
  try {
    if (!fs.existsSync(base)) return "";
    const direct = path.join(base, "scrcpy.exe");
    if (fs.existsSync(direct)) {
      return direct;
    }
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry?.isDirectory()) continue;
      const candidate = path.join(base, entry.name, "scrcpy.exe");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch (_error) {
    return "";
  }
  return "";
}

function resolveScrcpyPath() {
  const localAppData = normalizeText(process.env.LOCALAPPDATA);
  const userProfile = normalizeText(process.env.USERPROFILE);
  const direct = firstExisting([
    normalizeText(process.env.ASOLARIA_SCRCPY_PATH),
    "C:\\Program Files\\scrcpy\\scrcpy.exe",
    "C:\\ProgramData\\chocolatey\\lib\\scrcpy\\tools\\scrcpy.exe",
    localAppData ? `${localAppData}\\Microsoft\\WinGet\\Packages\\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\\scrcpy.exe` : "",
    userProfile ? `${userProfile}\\scoop\\apps\\scrcpy\\current\\scrcpy.exe` : ""
  ]);
  if (direct) {
    return direct;
  }
  const wingetNested = findWingetScrcpyPath();
  if (wingetNested) {
    return wingetNested;
  }

  try {
    const where = runCommandSync("where", ["scrcpy"], { timeoutMs: 4000 });
    if (where.code === 0) {
      const first = where.stdout
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

function resolveAdbPath() {
  const localAppData = normalizeText(process.env.LOCALAPPDATA);
  const direct = firstExisting([
    normalizeText(process.env.ASOLARIA_ADB_PATH),
    "C:\\Users\\acer\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
    "C:\\Android\\platform-tools\\adb.exe",
    "C:\\platform-tools\\adb.exe",
    "C:\\Program Files\\Android\\platform-tools\\adb.exe",
    localAppData
      ? `${localAppData}\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools\\adb.exe`
      : ""
  ]);
  if (direct) {
    return direct;
  }
  try {
    const where = runCommandSync("where", ["adb.exe"], { timeoutMs: 4000 });
    if (where.code === 0) {
      const first = where.stdout
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

function parseAdbDevices(stdout) {
  const rows = [];
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.toLowerCase().startsWith("list of devices attached")) continue;
    const match = /^(\S+)\s+(\S+)$/i.exec(line);
    if (!match) continue;
    rows.push({
      id: match[1],
      state: match[2]
    });
  }
  return rows;
}

function listAuthorizedDevices(adbPath) {
  if (!adbPath) return [];
  const result = runCommandSync(adbPath, ["devices"], { timeoutMs: 5000 });
  if (result.code !== 0) return [];
  return parseAdbDevices(result.stdout).filter((row) => String(row.state || "").toLowerCase() === "device");
}

function sanitizeBitRate(value) {
  const raw = normalizeText(value);
  if (!raw) return "8M";
  const normalized = raw.toUpperCase();
  if (!/^\d+(K|M|G)?$/.test(normalized)) {
    return "8M";
  }
  return normalized;
}

function sanitizeWindowTitle(value) {
  const text = normalizeText(value).replace(/[^a-zA-Z0-9 .:_-]/g, "_");
  if (!text) return DEFAULT_WINDOW_TITLE;
  return text.slice(0, 70);
}

function resolveDeviceId(options = {}) {
  const requested = normalizeText(options.deviceId);
  if (requested) {
    return requested;
  }
  const adbPath = resolveAdbPath();
  const devices = listAuthorizedDevices(adbPath);
  if (!devices.length) {
    return "";
  }
  const preferred = normalizeText(PRO_MIRROR_STATE.lastDeviceId);
  const remembered = preferred ? devices.find((row) => row.id === preferred) : null;
  if (remembered) {
    return remembered.id;
  }
  return devices[0].id;
}

function buildStartArgs(options = {}) {
  const args = [];
  const deviceId = resolveDeviceId(options);
  const maxFps = clampInt(options.maxFps, 60, 15, 120);
  const maxSize = clampInt(options.maxSize, 0, 0, 4096);
  const videoBitRate = sanitizeBitRate(options.videoBitRate);
  const windowTitle = sanitizeWindowTitle(options.windowTitle);
  const alwaysOnTop = Boolean(options.alwaysOnTop);
  const stayAwake = options.stayAwake === undefined ? true : Boolean(options.stayAwake);
  const turnScreenOffRequested = Boolean(options.turnScreenOff);
  // Safety default: keep the physical phone screen visible unless explicitly
  // allowed by runtime env override.
  const turnScreenOff = turnScreenOffRequested
    && normalizeText(process.env.ASOLARIA_ALLOW_TURN_SCREEN_OFF) === "1";
  const noAudio = options.noAudio === undefined ? true : Boolean(options.noAudio);
  const noControl = Boolean(options.noControl);
  const fullscreen = Boolean(options.fullscreen);

  if (deviceId) {
    args.push("-s", deviceId);
  }
  args.push("--window-title", windowTitle);
  args.push("--max-fps", String(maxFps));
  args.push("--video-bit-rate", videoBitRate);
  if (maxSize > 0) {
    args.push("--max-size", String(maxSize));
  }
  if (alwaysOnTop) {
    args.push("--always-on-top");
  }
  if (stayAwake) {
    args.push("--stay-awake");
  }
  if (turnScreenOff) {
    args.push("--turn-screen-off");
  }
  if (noAudio) {
    args.push("--no-audio");
  }
  if (noControl) {
    args.push("--no-control");
  }
  if (fullscreen) {
    args.push("--fullscreen");
  }

  return {
    args,
    deviceId,
    options: {
      maxFps,
      maxSize,
      videoBitRate,
      windowTitle,
      alwaysOnTop,
      stayAwake,
      turnScreenOff,
      noAudio,
      noControl,
      fullscreen
    }
  };
}

function getScrcpyVersion(scrcpyPath) {
  const nowMs = Date.now();
  if (
    PRO_MIRROR_STATE.versionValue
    && nowMs - Number(PRO_MIRROR_STATE.versionCheckedAtMs || 0) < VERSION_CACHE_TTL_MS
  ) {
    return PRO_MIRROR_STATE.versionValue;
  }
  if (!scrcpyPath) {
    PRO_MIRROR_STATE.versionValue = "";
    PRO_MIRROR_STATE.versionCheckedAtMs = nowMs;
    return "";
  }
  const result = runCommandSync(scrcpyPath, ["--version"], { timeoutMs: 5000 });
  const line = String(result.stdout || result.stderr || "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .find(Boolean) || "";
  PRO_MIRROR_STATE.versionValue = line.slice(0, 120);
  PRO_MIRROR_STATE.versionCheckedAtMs = nowMs;
  return PRO_MIRROR_STATE.versionValue;
}

function getPhoneProMirrorStatus() {
  const scrcpyPath = resolveScrcpyPath();
  const pid = readPidFile(PRO_MIRROR_PID_FILE);
  const running = isPidRunning(pid);
  if (!running && pid > 0) {
    removePidFile(PRO_MIRROR_PID_FILE);
  }
  const adbPath = resolveAdbPath();
  const devices = listAuthorizedDevices(adbPath);

  return {
    pidFilePath: PRO_MIRROR_PID_FILE,
    pid: running ? pid : 0,
    running,
    scrcpyFound: Boolean(scrcpyPath),
    scrcpyPath: scrcpyPath || "",
    scrcpyVersion: getScrcpyVersion(scrcpyPath),
    adbFound: Boolean(adbPath),
    adbPath: adbPath || "",
    devices,
    lastStartedAt: PRO_MIRROR_STATE.lastStartedAt || "",
    lastStoppedAt: PRO_MIRROR_STATE.lastStoppedAt || "",
    lastError: PRO_MIRROR_STATE.lastError || "",
    lastDeviceId: PRO_MIRROR_STATE.lastDeviceId || "",
    lastArgs: Array.isArray(PRO_MIRROR_STATE.lastArgs) ? PRO_MIRROR_STATE.lastArgs.slice(0, 40) : []
  };
}

function startPhoneProMirror(options = {}) {
  const status = getPhoneProMirrorStatus();
  if (status.running && status.pid > 0) {
    return {
      ok: true,
      alreadyRunning: true,
      pid: status.pid,
      status
    };
  }

  const scrcpyPath = status.scrcpyPath || resolveScrcpyPath();
  if (!scrcpyPath) {
    throw new Error("scrcpy_not_found");
  }

  const prepared = buildStartArgs(options);
  const child = childProcess.spawn(scrcpyPath, prepared.args, {
    cwd: path.dirname(scrcpyPath),
    windowsHide: true,
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  const pid = Number(child.pid || 0) || 0;
  if (pid <= 0) {
    throw new Error("scrcpy_start_failed");
  }

  writePidFile(PRO_MIRROR_PID_FILE, pid);
  PRO_MIRROR_STATE.lastStartedAt = new Date().toISOString();
  PRO_MIRROR_STATE.lastError = "";
  PRO_MIRROR_STATE.lastArgs = prepared.args.slice(0, 80);
  PRO_MIRROR_STATE.lastDeviceId = prepared.deviceId || "";

  return {
    ok: true,
    started: true,
    pid,
    deviceId: prepared.deviceId || "",
    options: prepared.options,
    status: getPhoneProMirrorStatus()
  };
}

function stopPhoneProMirror() {
  const pid = readPidFile(PRO_MIRROR_PID_FILE);
  let stopped = false;
  let reason = "not_running";

  if (pid > 0 && isPidRunning(pid)) {
    try {
      process.kill(pid);
      stopped = true;
      reason = "killed";
    } catch (error) {
      reason = `kill_error:${String(error?.code || "unknown").toLowerCase()}`;
      PRO_MIRROR_STATE.lastError = String(error?.message || error || "scrcpy_stop_failed");
    }
  }

  removePidFile(PRO_MIRROR_PID_FILE);
  PRO_MIRROR_STATE.lastStoppedAt = new Date().toISOString();

  return {
    ok: true,
    stopped,
    pid: pid || 0,
    reason,
    status: getPhoneProMirrorStatus()
  };
}

module.exports = {
  getPhoneProMirrorStatus,
  startPhoneProMirror,
  stopPhoneProMirror
};
