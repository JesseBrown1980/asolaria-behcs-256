const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { projectRoot, resolveDataPath } = require("../runtimePaths");
const { appendMistakeLedgerBatch, appendMistakeLedger } = require("../mistakeLedgerStore");
const { capturePhoneMirrorSnapshot } = require("./phoneMirrorConnector");

const DEFAULT_TIMEOUT_MS = 15000;
const REPORT_PREFIX = "phone-developer-options-sweep";
const MISTAKE_LOG_PATH = resolveDataPath("phone-developer-options-mistakes.json");
const REPORTS_DIR = path.join(projectRoot, "reports");

const DEVELOPER_OPTION_CATALOG = Object.freeze([
  Object.freeze({
    id: "show_touches",
    label: "Show Touches",
    category: "input",
    key: "show_touches",
    namespaces: Object.freeze(["system", "global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Visual touch-point indicator."
  }),
  Object.freeze({
    id: "pointer_location",
    label: "Pointer Location",
    category: "input",
    key: "pointer_location",
    namespaces: Object.freeze(["system", "global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Input trace overlay (x/y and gesture path)."
  }),
  Object.freeze({
    id: "debug_layout",
    label: "Show Layout Bounds",
    category: "drawing",
    key: "debug_layout",
    namespaces: Object.freeze(["global", "system"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "View clipping/layout boundaries."
  }),
  Object.freeze({
    id: "window_animation_scale",
    label: "Window Animation Scale",
    category: "drawing",
    key: "window_animation_scale",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Window transition animation multiplier."
  }),
  Object.freeze({
    id: "transition_animation_scale",
    label: "Transition Animation Scale",
    category: "drawing",
    key: "transition_animation_scale",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Activity transition animation multiplier."
  }),
  Object.freeze({
    id: "animator_duration_scale",
    label: "Animator Duration Scale",
    category: "drawing",
    key: "animator_duration_scale",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Property animator duration multiplier."
  }),
  Object.freeze({
    id: "show_hw_screen_updates",
    label: "Show HW Screen Updates",
    category: "drawing",
    key: "show_hw_screen_updates",
    namespaces: Object.freeze(["system", "global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Flashes updated screen regions."
  }),
  Object.freeze({
    id: "show_hw_layers_updates",
    label: "Show HW Layers Updates",
    category: "drawing",
    key: "show_hw_layers_updates",
    namespaces: Object.freeze(["system", "global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Highlights hardware layer updates."
  }),
  Object.freeze({
    id: "debug_hw_overdraw",
    label: "Debug HW Overdraw",
    category: "hardware",
    key: "debug.hwui.overdraw",
    namespaces: Object.freeze(["global", "system"]),
    onValue: "show",
    offValue: "off",
    defaultSweep: true,
    risky: false,
    description: "Overdraw visualization mode."
  }),
  Object.freeze({
    id: "debug_hwui_profile",
    label: "Profile GPU Rendering",
    category: "hardware",
    key: "debug.hwui.profile",
    namespaces: Object.freeze(["global", "system"]),
    onValue: "visual_bars",
    offValue: "false",
    defaultSweep: true,
    risky: false,
    description: "GPU render timing bars."
  }),
  Object.freeze({
    id: "debug_hwui_show_dirty_regions",
    label: "Show Dirty Regions",
    category: "hardware",
    key: "debug.hwui.show_dirty_regions",
    namespaces: Object.freeze(["global", "system"]),
    onValue: "true",
    offValue: "false",
    defaultSweep: true,
    risky: false,
    description: "Highlights repainted surfaces."
  }),
  Object.freeze({
    id: "debug_egl_force_msaa",
    label: "Force 4x MSAA",
    category: "hardware",
    key: "debug.egl.force_msaa",
    namespaces: Object.freeze(["global", "system"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Force multisample anti-aliasing."
  }),
  Object.freeze({
    id: "disable_usb_audio_routing",
    label: "Disable USB Audio Routing",
    category: "media",
    key: "disable_usb_audio_routing",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Prevents automatic USB audio route."
  }),
  Object.freeze({
    id: "bluetooth_disable_absolute_volume",
    label: "Disable Absolute Volume",
    category: "media",
    key: "bluetooth_disable_absolute_volume",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Separate phone and headset volume controls."
  }),
  Object.freeze({
    id: "show_notification_channel_warnings",
    label: "Notification Channel Warnings",
    category: "media",
    key: "show_notification_channel_warnings",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Warns on notifications missing channel config."
  }),
  Object.freeze({
    id: "wifi_verbose_logging_enabled",
    label: "Wi-Fi Verbose Logging",
    category: "system",
    key: "wifi_verbose_logging_enabled",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Extended Wi-Fi diagnostics logging."
  }),
  Object.freeze({
    id: "mobile_data_always_on",
    label: "Mobile Data Always Active",
    category: "system",
    key: "mobile_data_always_on",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Keeps cellular data active for fast handoff."
  }),
  Object.freeze({
    id: "tether_offload_disabled",
    label: "Disable Tether Hardware Offload",
    category: "system",
    key: "tether_offload_disabled",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: true,
    risky: false,
    description: "Software path for tether packet handling."
  }),
  Object.freeze({
    id: "verify_apps_over_usb",
    label: "Verify Apps Over USB",
    category: "system",
    key: "verifier_verify_adb_installs",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: false,
    risky: true,
    description: "Google Play Protect verification of ADB installs."
  }),
  Object.freeze({
    id: "force_allow_on_external",
    label: "Force Allow Apps on External",
    category: "system",
    key: "force_allow_on_external",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: false,
    risky: true,
    description: "Allow apps to move to external storage."
  }),
  Object.freeze({
    id: "always_finish_activities",
    label: "Don't Keep Activities",
    category: "system",
    key: "always_finish_activities",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: false,
    risky: true,
    description: "Destroy every activity on background."
  }),
  Object.freeze({
    id: "stay_on_while_plugged_in",
    label: "Stay Awake While Charging",
    category: "system",
    key: "stay_on_while_plugged_in",
    namespaces: Object.freeze(["global"]),
    onValue: "3",
    offValue: "0",
    defaultSweep: false,
    risky: true,
    description: "Keep display awake while on USB/AC power."
  }),
  Object.freeze({
    id: "force_resizable_activities",
    label: "Force Resizable Activities",
    category: "system",
    key: "force_resizable_activities",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: false,
    risky: true,
    description: "Allow multi-window on non-opted apps."
  }),
  Object.freeze({
    id: "enable_freeform_support",
    label: "Enable Freeform Windows",
    category: "system",
    key: "enable_freeform_support",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: false,
    risky: true,
    description: "Enable freeform window management."
  }),
  Object.freeze({
    id: "force_rtl_layout",
    label: "Force RTL Layout Direction",
    category: "system",
    key: "debug.force_rtl",
    namespaces: Object.freeze(["global"]),
    onValue: "1",
    offValue: "0",
    defaultSweep: false,
    risky: true,
    description: "Force right-to-left app layout."
  })
]);

const CATALOG_BY_ID = new Map(DEVELOPER_OPTION_CATALOG.map((entry) => [entry.id, entry]));

function normalizeText(value) {
  return String(value || "").trim();
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return Boolean(fallback);
  }
  const text = normalizeText(value).toLowerCase();
  if (!text) return Boolean(fallback);
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return Boolean(fallback);
}

function parseCsvList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  const text = normalizeText(value);
  if (!text) return [];
  return text
    .split(/[,\s]+/g)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function uniqueStrings(items) {
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => normalizeText(item)).filter(Boolean)));
}

function normalizeNamespaces(entry) {
  const rows = uniqueStrings(entry?.namespaces || []);
  if (rows.length > 0) {
    return rows;
  }
  return ["global"];
}

function toPublicCatalogEntry(entry) {
  return {
    id: String(entry.id || ""),
    label: String(entry.label || entry.id || ""),
    category: String(entry.category || "system"),
    key: String(entry.key || ""),
    namespaces: normalizeNamespaces(entry),
    onValue: String(entry.onValue || ""),
    offValue: String(entry.offValue || ""),
    defaultSweep: Boolean(entry.defaultSweep),
    risky: Boolean(entry.risky),
    description: String(entry.description || "")
  };
}

function selectCatalog(options = {}) {
  const includeRisky = parseBoolean(options.includeRisky, false);
  const onlyDefaultSweep = parseBoolean(options.onlyDefaultSweep, false);
  const ids = new Set(parseCsvList(options.ids).map((item) => item.toLowerCase()));
  const categories = new Set(parseCsvList(options.categories).map((item) => item.toLowerCase()));

  const filtered = DEVELOPER_OPTION_CATALOG.filter((entry) => {
    if (!includeRisky && entry.risky) {
      return false;
    }
    if (onlyDefaultSweep && !entry.defaultSweep) {
      return false;
    }
    if (ids.size > 0 && !ids.has(String(entry.id || "").toLowerCase())) {
      return false;
    }
    if (categories.size > 0 && !categories.has(String(entry.category || "").toLowerCase())) {
      return false;
    }
    return true;
  });
  return [...filtered].sort((a, b) => {
    const categoryDiff = String(a.category || "").localeCompare(String(b.category || ""));
    if (categoryDiff !== 0) {
      return categoryDiff;
    }
    return String(a.label || a.id || "").localeCompare(String(b.label || b.id || ""));
  });
}

function listPhoneDeveloperOptions(options = {}) {
  return selectCatalog(options).map((entry) => toPublicCatalogEntry(entry));
}

function resolveAdbPath() {
  const envPath = normalizeText(process.env.ASOLARIA_ADB_PATH);
  const localAppData = normalizeText(process.env.LOCALAPPDATA);
  const candidates = [
    envPath,
    "C:\\Users\\acer\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
    "C:\\Android\\platform-tools\\adb.exe",
    "C:\\platform-tools\\adb.exe",
    "C:\\Program Files\\Android\\platform-tools\\adb.exe",
    localAppData
      ? `${localAppData}\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools\\adb.exe`
      : ""
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
  const timeoutMs = Math.max(2000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(exe, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        child.kill();
      } catch (_error) {
        // ignore
      }
      reject(new Error(`command_timeout_${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
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
      const result = {
        code: Number(code || 0),
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks)
      };
      if (result.code !== 0 && !options.allowNonZero) {
        const stderr = String(result.stderr.toString("utf8") || "").trim();
        const stdout = String(result.stdout.toString("utf8") || "").trim();
        reject(new Error(stderr || stdout || `command_exit_${result.code}`));
        return;
      }
      resolve(result);
    });
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

function chooseAuthorizedDevice(rows = [], requestedId = "") {
  const wanted = normalizeText(requestedId);
  const connected = rows.filter((row) => String(row.state || "").toLowerCase() === "device");
  if (connected.length < 1) {
    return "";
  }
  if (wanted) {
    const match = connected.find((row) => row.id === wanted);
    if (match) {
      return match.id;
    }
  }
  return connected[0].id;
}

async function resolvePhoneDeviceContext(options = {}) {
  const adbPath = resolveAdbPath();
  if (!adbPath) {
    throw new Error("adb_not_found");
  }
  const listResult = await runAdb(adbPath, ["devices"], {
    timeoutMs: clampInt(options.timeoutMs, 8000, 3000, 45000)
  });
  const rows = parseAdbDevices(listResult.stdout.toString("utf8"));
  const deviceId = chooseAuthorizedDevice(rows, options.deviceId);
  if (!deviceId) {
    throw new Error("no_authorized_phone_device");
  }
  return {
    adbPath,
    deviceId,
    devices: rows
  };
}

function sleepMs(delayMs) {
  const wait = Math.max(0, Number(delayMs || 0));
  if (!wait) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, wait));
}

function isUnsetValue(value) {
  const text = normalizeText(value).toLowerCase();
  return !text || text === "null" || text === "undefined";
}

function canonicalSettingValue(value) {
  const text = normalizeText(value).toLowerCase();
  if (isUnsetValue(text)) {
    return "";
  }
  if (["1", "true", "on", "enabled", "yes"].includes(text)) {
    return "1";
  }
  if (["0", "false", "off", "disabled", "no"].includes(text)) {
    return "0";
  }
  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return String(numeric);
  }
  return text;
}

function matchesExpectedValue(actualValue, expectedValue) {
  const actual = canonicalSettingValue(actualValue);
  const expected = canonicalSettingValue(expectedValue);
  if (!expected) {
    return actual === expected;
  }
  return actual === expected;
}

async function readSetting(ctx, namespace, key, timeoutMs) {
  try {
    const result = await runAdb(
      ctx.adbPath,
      ["-s", ctx.deviceId, "shell", "settings", "get", namespace, key],
      {
        timeoutMs,
        allowNonZero: true
      }
    );
    const value = String(result.stdout.toString("utf8") || "").replace(/\u0000/g, "").trim();
    return {
      namespace,
      key,
      value,
      ok: result.code === 0,
      exitCode: Number(result.code || 0),
      error: "",
      isUnset: isUnsetValue(value)
    };
  } catch (error) {
    return {
      namespace,
      key,
      value: "",
      ok: false,
      exitCode: -1,
      error: String(error?.message || error || "settings_get_failed"),
      isUnset: true
    };
  }
}

async function readSettingAcrossNamespaces(ctx, entry, timeoutMs) {
  const namespaces = normalizeNamespaces(entry);
  const rows = [];
  for (const namespace of namespaces) {
    rows.push(await readSetting(ctx, namespace, entry.key, timeoutMs));
  }
  const preferred = rows.find((row) => row.ok && !row.isUnset)
    || rows.find((row) => row.ok)
    || rows[0]
    || {
      namespace: namespaces[0] || "global",
      key: entry.key,
      value: "",
      ok: false,
      exitCode: -1,
      error: "settings_read_unavailable",
      isUnset: true
    };
  return {
    value: String(preferred.value || ""),
    namespace: String(preferred.namespace || namespaces[0] || "global"),
    isUnset: Boolean(preferred.isUnset),
    rows
  };
}

async function writeSetting(ctx, namespace, key, value, timeoutMs) {
  const result = await runAdb(
    ctx.adbPath,
    ["-s", ctx.deviceId, "shell", "settings", "put", namespace, key, String(value)],
    {
      timeoutMs,
      allowNonZero: true
    }
  );
  return {
    namespace,
    key,
    value: String(value),
    ok: result.code === 0,
    exitCode: Number(result.code || 0),
    stdout: String(result.stdout.toString("utf8") || "").trim(),
    stderr: String(result.stderr.toString("utf8") || "").trim()
  };
}

function prioritizeNamespaces(namespaces = [], preferredNamespace = "") {
  const ordered = [];
  const preferred = normalizeText(preferredNamespace);
  if (preferred && namespaces.includes(preferred)) {
    ordered.push(preferred);
  }
  for (const namespace of namespaces) {
    if (!ordered.includes(namespace)) {
      ordered.push(namespace);
    }
  }
  return ordered.length > 0 ? ordered : ["global"];
}

async function applyEntryStateFromContext(ctx, entry, state, options = {}) {
  const timeoutMs = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 3000, 120000);
  const targetValue = state === "on" ? entry.onValue : entry.offValue;
  const current = await readSettingAcrossNamespaces(ctx, entry, timeoutMs);
  const namespaces = prioritizeNamespaces(normalizeNamespaces(entry), current.namespace);
  const attempts = [];
  let writeOk = null;

  for (const namespace of namespaces) {
    const attempt = await writeSetting(ctx, namespace, entry.key, targetValue, timeoutMs);
    attempts.push(attempt);
    if (attempt.ok) {
      writeOk = attempt;
      break;
    }
  }

  const after = await readSettingAcrossNamespaces(ctx, entry, timeoutMs);
  const verified = matchesExpectedValue(after.value, targetValue);
  return {
    state,
    targetValue: String(targetValue),
    before: current,
    after,
    attempts,
    writeOk: Boolean(writeOk),
    writeNamespace: writeOk ? String(writeOk.namespace || "") : "",
    verified
  };
}

function sanitizeFileName(value, fallback) {
  const raw = normalizeText(value || fallback);
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  if (!safe) {
    return fallback;
  }
  return safe.endsWith(".png") ? safe : `${safe}.png`;
}

function createUtcStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${mm}${dd}-${hh}${mi}${ss}Z`;
}

function buildCaptureFileName(index, entry, state) {
  const id = String(entry?.id || "option").toLowerCase();
  const prefix = String(index + 1).padStart(2, "0");
  return sanitizeFileName(`phone-devopt-${prefix}-${id}-${state}.png`, `phone-devopt-${prefix}-${state}.png`);
}

async function captureStepSnapshot(entry, index, state, options = {}) {
  const enabled = parseBoolean(options.capture, true);
  if (!enabled) {
    return null;
  }
  const timeoutMs = clampInt(options.captureTimeoutMs, 30000, 4000, 180000);
  try {
    return await capturePhoneMirrorSnapshot({
      deviceId: options.deviceId,
      timeoutMs,
      fileName: buildCaptureFileName(index, entry, state)
    });
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error || "capture_failed"),
      fileName: buildCaptureFileName(index, entry, state),
      outputPath: ""
    };
  }
}

function createMistake(entry, stage, error, extra = {}) {
  return {
    at: new Date().toISOString(),
    optionId: String(entry?.id || ""),
    optionLabel: String(entry?.label || ""),
    category: String(entry?.category || ""),
    stage: String(stage || "unknown"),
    error: String(error || "unknown_error"),
    ...extra
  };
}

function ensureDir(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true });
}

function appendMistakeLog(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length < 1) {
    ensureDir(path.dirname(MISTAKE_LOG_PATH));
    if (!fs.existsSync(MISTAKE_LOG_PATH)) {
      fs.writeFileSync(MISTAKE_LOG_PATH, "[]\n", "utf8");
    }
    return MISTAKE_LOG_PATH;
  }
  ensureDir(path.dirname(MISTAKE_LOG_PATH));
  let existing = [];
  try {
    const raw = fs.readFileSync(MISTAKE_LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      existing = parsed;
    }
  } catch (_error) {
    existing = [];
  }
  const merged = [...existing, ...rows].slice(-1200);
  fs.writeFileSync(MISTAKE_LOG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return MISTAKE_LOG_PATH;
}

function mirrorMistakesToSharedLedger(items = [], meta = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length < 1) {
    return;
  }
  const runId = normalizeText(meta.runId);
  const deviceId = normalizeText(meta.deviceId);
  const operation = normalizeText(meta.operation || "sweep").toLowerCase();
  const payload = rows.map((item) => ({
    feature: "phone_developer_options",
    operation,
    type: normalizeText(item?.stage || "mistake").toLowerCase(),
    severity: "medium",
    actor: "falcon",
    laneId: "falcon",
    message: `${normalizeText(item?.optionId || "unknown")} ${normalizeText(item?.stage || "stage")} ${normalizeText(item?.error || "")}`.trim(),
    code: normalizeText(item?.error || ""),
    context: {
      runId,
      deviceId,
      optionId: normalizeText(item?.optionId || ""),
      optionLabel: normalizeText(item?.optionLabel || ""),
      category: normalizeText(item?.category || ""),
      stage: normalizeText(item?.stage || ""),
      expected: normalizeText(item?.expected || ""),
      actual: normalizeText(item?.actual || "")
    }
  }));
  appendMistakeLedgerBatch(payload);
}

function summarizeAttempts(attempts = []) {
  return (Array.isArray(attempts) ? attempts : []).map((row) => ({
    namespace: String(row?.namespace || ""),
    ok: Boolean(row?.ok),
    exitCode: Number(row?.exitCode || 0),
    stderr: String(row?.stderr || "").slice(0, 240),
    stdout: String(row?.stdout || "").slice(0, 240)
  }));
}

function buildSweepMarkdown(report) {
  const lines = [];
  lines.push("# Phone Developer Options Sweep");
  lines.push("");
  lines.push(`- runId: ${report.runId}`);
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- finishedAt: ${report.finishedAt}`);
  lines.push(`- durationMs: ${report.durationMs}`);
  lines.push(`- deviceId: ${report.deviceId}`);
  lines.push(`- selected: ${report.totals.selected}`);
  lines.push(`- passed: ${report.totals.passed}`);
  lines.push(`- failed: ${report.totals.failed}`);
  lines.push(`- mistakes: ${report.totals.mistakes}`);
  lines.push(`- capture: ${report.captureEnabled ? "on" : "off"} (${report.captureIntervalMs}ms interval)`);
  lines.push(`- includeRisky: ${report.includeRisky ? "true" : "false"}`);
  lines.push(`- onlyDefaultSweep: ${report.onlyDefaultSweep ? "true" : "false"}`);
  lines.push("");
  lines.push("## Options");
  lines.push("");
  for (const step of report.steps) {
    const mark = step.ok ? "PASS" : "FAIL";
    lines.push(`- ${mark} ${step.id} (${step.category}) before=${step.beforeValue || "null"} afterOn=${step.afterOnValue || "null"} afterOff=${step.afterOffValue || "null"} restored=${step.restoredValue || "null"}`);
  }
  lines.push("");
  lines.push("## Mistakes");
  lines.push("");
  if (report.mistakes.length < 1) {
    lines.push("- none");
  } else {
    for (const item of report.mistakes) {
      lines.push(`- ${item.optionId} stage=${item.stage} error=${item.error}`);
    }
  }
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push(`- json: ${report.paths.json}`);
  lines.push(`- markdown: ${report.paths.markdown}`);
  lines.push(`- jsonLatest: ${report.paths.jsonLatest}`);
  lines.push(`- markdownLatest: ${report.paths.markdownLatest}`);
  lines.push(`- mistakeLog: ${report.paths.mistakeLog}`);
  return `${lines.join("\n")}\n`;
}

function writeSweepReport(report) {
  ensureDir(REPORTS_DIR);
  const json = JSON.stringify(report, null, 2) + "\n";
  const markdown = buildSweepMarkdown(report);
  fs.writeFileSync(report.paths.json, json, "utf8");
  fs.writeFileSync(report.paths.markdown, markdown, "utf8");
  fs.writeFileSync(report.paths.jsonLatest, json, "utf8");
  fs.writeFileSync(report.paths.markdownLatest, markdown, "utf8");
}

async function getPhoneDeveloperOptionsStatus(options = {}) {
  const timeoutMs = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 3000, 120000);
  const entries = selectCatalog({
    includeRisky: options.includeRisky,
    onlyDefaultSweep: options.onlyDefaultSweep,
    ids: options.ids,
    categories: options.categories
  });
  const ctx = await resolvePhoneDeviceContext(options);
  const rows = [];
  for (const entry of entries) {
    const current = await readSettingAcrossNamespaces(ctx, entry, timeoutMs);
    rows.push({
      ...toPublicCatalogEntry(entry),
      currentValue: String(current.value || ""),
      currentNamespace: String(current.namespace || ""),
      currentUnset: Boolean(current.isUnset),
      reads: current.rows.map((row) => ({
        namespace: String(row.namespace || ""),
        ok: Boolean(row.ok),
        value: String(row.value || ""),
        unset: Boolean(row.isUnset),
        exitCode: Number(row.exitCode || 0),
        error: String(row.error || "")
      })),
      onMatch: matchesExpectedValue(current.value, entry.onValue),
      offMatch: matchesExpectedValue(current.value, entry.offValue)
    });
  }
  return {
    ok: true,
    count: rows.length,
    deviceId: ctx.deviceId,
    includeRisky: parseBoolean(options.includeRisky, false),
    onlyDefaultSweep: parseBoolean(options.onlyDefaultSweep, false),
    options: rows
  };
}

async function setPhoneDeveloperOptionState(options = {}) {
  const id = normalizeText(options.id || options.toggleId).toLowerCase();
  const state = normalizeText(options.state).toLowerCase();
  let resolvedDeviceId = normalizeText(options.deviceId);
  try {
    if (!id) {
      throw new Error("developer_option_id_required");
    }
    const entry = CATALOG_BY_ID.get(id);
    if (!entry) {
      throw new Error(`developer_option_not_found:${id}`);
    }
    if (state !== "on" && state !== "off") {
      throw new Error("state_must_be_on_or_off");
    }
    const timeoutMs = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 3000, 120000);
    const waitMs = clampInt(options.waitMs, 600, 0, 10000);
    const ctx = await resolvePhoneDeviceContext(options);
    resolvedDeviceId = normalizeText(ctx.deviceId);

    const action = await applyEntryStateFromContext(ctx, entry, state, { timeoutMs });
    if (waitMs > 0) {
      await sleepMs(waitMs);
    }
    const verified = Boolean(action.verified);
    const requireVerified = parseBoolean(options.requireVerified, false);
    if (!action.writeOk) {
      throw new Error(`developer_option_write_failed:${id}:${state}`);
    }
    if (requireVerified && !verified) {
      throw new Error(`developer_option_verify_failed:${id}:${state}`);
    }

    const capture = await captureStepSnapshot(entry, 0, state, {
      capture: options.capture,
      captureTimeoutMs: options.captureTimeoutMs,
      deviceId: ctx.deviceId
    });

    return {
      ok: true,
      id: entry.id,
      label: entry.label,
      category: entry.category,
      state,
      targetValue: state === "on" ? entry.onValue : entry.offValue,
      verified,
      deviceId: ctx.deviceId,
      writeNamespace: String(action.writeNamespace || ""),
      beforeValue: String(action.before?.value || ""),
      afterValue: String(action.after?.value || ""),
      beforeNamespace: String(action.before?.namespace || ""),
      afterNamespace: String(action.after?.namespace || ""),
      attempts: summarizeAttempts(action.attempts),
      capture: capture
        ? {
          ok: capture.ok !== false,
          fileName: String(capture.fileName || ""),
          outputPath: String(capture.outputPath || ""),
          error: String(capture.error || "")
        }
        : null
    };
  } catch (error) {
    appendMistakeLedger({
      feature: "phone_developer_options",
      operation: "set",
      type: "set_failure",
      severity: "high",
      actor: "falcon",
      laneId: "falcon",
      message: String(error?.message || error || "developer_option_set_failed"),
      code: String(error?.message || "developer_option_set_failed"),
      context: {
        optionId: id,
        requestedState: state,
        deviceId: resolvedDeviceId
      }
    });
    throw error;
  }
}

async function runPhoneDeveloperOptionsSweep(options = {}) {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const runId = createUtcStamp(new Date(startedAtMs));
  const timeoutMs = clampInt(options.timeoutMs, DEFAULT_TIMEOUT_MS, 3000, 120000);
  const captureEnabled = parseBoolean(options.capture, true);
  const captureIntervalMs = clampInt(
    options.captureIntervalMs ?? (Number(options.captureIntervalSeconds || 0) * 1000),
    1200,
    0,
    30000
  );
  const restoreOriginal = parseBoolean(options.restoreOriginal, true);
  const includeRisky = parseBoolean(options.includeRisky, false);
  const onlyDefaultSweep = options.onlyDefaultSweep === undefined
    ? true
    : parseBoolean(options.onlyDefaultSweep, true);

  let selectedEntries = [];
  let ctx = null;
  try {
    selectedEntries = selectCatalog({
      includeRisky,
      onlyDefaultSweep,
      ids: options.ids,
      categories: options.categories
    });
    if (selectedEntries.length < 1) {
      throw new Error("developer_option_sweep_empty_selection");
    }

    ctx = await resolvePhoneDeviceContext(options);
    const steps = [];
    const mistakes = [];

    for (let index = 0; index < selectedEntries.length; index += 1) {
      const entry = selectedEntries[index];
      const step = {
        id: String(entry.id || ""),
        label: String(entry.label || ""),
        category: String(entry.category || ""),
        key: String(entry.key || ""),
        risky: Boolean(entry.risky),
        beforeValue: "",
        beforeNamespace: "",
        afterOnValue: "",
        afterOnNamespace: "",
        afterOffValue: "",
        afterOffNamespace: "",
        restoredValue: "",
        restoredNamespace: "",
        onVerified: false,
        offVerified: false,
        writeOnOk: false,
        writeOffOk: false,
        writeOnAttempts: [],
        writeOffAttempts: [],
        captureOn: null,
        captureOff: null,
        restoreApplied: false,
        restoreError: "",
        mistakes: [],
        ok: false
      };

      try {
        const before = await readSettingAcrossNamespaces(ctx, entry, timeoutMs);
        step.beforeValue = String(before.value || "");
        step.beforeNamespace = String(before.namespace || "");

        const applyOn = await applyEntryStateFromContext(ctx, entry, "on", { timeoutMs });
        step.writeOnOk = Boolean(applyOn.writeOk);
        step.writeOnAttempts = summarizeAttempts(applyOn.attempts);
        step.afterOnValue = String(applyOn.after?.value || "");
        step.afterOnNamespace = String(applyOn.after?.namespace || "");
        step.onVerified = Boolean(applyOn.verified);
        if (!applyOn.writeOk) {
          step.mistakes.push(createMistake(entry, "apply_on", "write_failed", {
            attempts: step.writeOnAttempts
          }));
        } else if (!step.onVerified) {
          step.mistakes.push(createMistake(entry, "verify_on", "value_mismatch", {
            expected: String(entry.onValue),
            actual: step.afterOnValue
          }));
        }

        if (captureIntervalMs > 0) {
          await sleepMs(captureIntervalMs);
        }
        step.captureOn = await captureStepSnapshot(entry, index, "on", {
          capture: captureEnabled,
          captureTimeoutMs: options.captureTimeoutMs,
          deviceId: ctx.deviceId
        });
        if (step.captureOn && step.captureOn.ok === false) {
          step.mistakes.push(createMistake(entry, "capture_on", String(step.captureOn.error || "capture_failed")));
        }

        const applyOff = await applyEntryStateFromContext(ctx, entry, "off", { timeoutMs });
        step.writeOffOk = Boolean(applyOff.writeOk);
        step.writeOffAttempts = summarizeAttempts(applyOff.attempts);
        step.afterOffValue = String(applyOff.after?.value || "");
        step.afterOffNamespace = String(applyOff.after?.namespace || "");
        step.offVerified = Boolean(applyOff.verified);
        if (!applyOff.writeOk) {
          step.mistakes.push(createMistake(entry, "apply_off", "write_failed", {
            attempts: step.writeOffAttempts
          }));
        } else if (!step.offVerified) {
          step.mistakes.push(createMistake(entry, "verify_off", "value_mismatch", {
            expected: String(entry.offValue),
            actual: step.afterOffValue
          }));
        }

        if (captureIntervalMs > 0) {
          await sleepMs(captureIntervalMs);
        }
        step.captureOff = await captureStepSnapshot(entry, index, "off", {
          capture: captureEnabled,
          captureTimeoutMs: options.captureTimeoutMs,
          deviceId: ctx.deviceId
        });
        if (step.captureOff && step.captureOff.ok === false) {
          step.mistakes.push(createMistake(entry, "capture_off", String(step.captureOff.error || "capture_failed")));
        }

        if (restoreOriginal && !isUnsetValue(step.beforeValue)) {
          const restoreOrder = prioritizeNamespaces(normalizeNamespaces(entry), step.beforeNamespace);
          let restoreApplied = false;
          for (const namespace of restoreOrder) {
            const attempt = await writeSetting(ctx, namespace, entry.key, step.beforeValue, timeoutMs);
            if (attempt.ok) {
              restoreApplied = true;
              break;
            }
          }
          step.restoreApplied = restoreApplied;
          if (restoreApplied) {
            const restored = await readSettingAcrossNamespaces(ctx, entry, timeoutMs);
            step.restoredValue = String(restored.value || "");
            step.restoredNamespace = String(restored.namespace || "");
            if (!matchesExpectedValue(step.restoredValue, step.beforeValue)) {
              step.mistakes.push(createMistake(entry, "restore_verify", "value_mismatch", {
                expected: step.beforeValue,
                actual: step.restoredValue
              }));
            }
          } else {
            step.restoreError = "restore_failed";
            step.mistakes.push(createMistake(entry, "restore", "write_failed"));
          }
        }
      } catch (error) {
        step.mistakes.push(createMistake(entry, "step_exception", String(error?.message || error || "unknown_error")));
      }

      step.ok = step.mistakes.length < 1;
      if (step.mistakes.length > 0) {
        mistakes.push(...step.mistakes);
      }
      steps.push(step);
    }

    const finishedAtMs = Date.now();
    const finishedAt = new Date(finishedAtMs).toISOString();
    const passed = steps.filter((step) => step.ok).length;
    const failed = steps.length - passed;

    const paths = {
      json: path.join(REPORTS_DIR, `${REPORT_PREFIX}-${runId}.json`),
      markdown: path.join(REPORTS_DIR, `${REPORT_PREFIX}-${runId}.md`),
      jsonLatest: path.join(REPORTS_DIR, `${REPORT_PREFIX}-latest.json`),
      markdownLatest: path.join(REPORTS_DIR, `${REPORT_PREFIX}-latest.md`),
      mistakeLog: MISTAKE_LOG_PATH
    };

    const report = {
      ok: failed < 1,
      runId,
      startedAt,
      finishedAt,
      durationMs: finishedAtMs - startedAtMs,
      deviceId: ctx.deviceId,
      includeRisky,
      onlyDefaultSweep,
      captureEnabled,
      captureIntervalMs,
      restoreOriginal,
      totals: {
        selected: steps.length,
        passed,
        failed,
        mistakes: mistakes.length
      },
      steps,
      mistakes,
      paths
    };

    appendMistakeLog(mistakes);
    mirrorMistakesToSharedLedger(mistakes, {
      runId,
      deviceId: ctx.deviceId,
      operation: "sweep"
    });
    writeSweepReport(report);

    return report;
  } catch (error) {
    appendMistakeLedger({
      feature: "phone_developer_options",
      operation: "sweep",
      type: "sweep_failure",
      severity: "high",
      actor: "falcon",
      laneId: "falcon",
      message: String(error?.message || error || "developer_option_sweep_failed"),
      code: String(error?.message || "developer_option_sweep_failed"),
      context: {
        runId,
        deviceId: normalizeText(ctx?.deviceId || options.deviceId || ""),
        selectedCount: selectedEntries.length,
        includeRisky,
        onlyDefaultSweep
      }
    });
    throw error;
  }
}

module.exports = {
  listPhoneDeveloperOptions,
  getPhoneDeveloperOptionsStatus,
  setPhoneDeveloperOptionState,
  runPhoneDeveloperOptionsSweep
};
