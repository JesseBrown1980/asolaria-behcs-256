const fs = require("fs");
const path = require("path");

const { projectRoot, resolveDataPath } = require("../runtimePaths");
const { buildMobileInboxState } = require("../mobileInbox");
const { getPhoneMirrorStatus } = require("./phoneMirrorConnector");

const CATALOG_PATH = path.join(projectRoot, "config", "phone-surface.catalog.json");
const PHONE_UI_DIR = resolveDataPath("phone-ui-run");
const KNOWN_TOOL_FILES = Object.freeze([
  "Start-Asolaria-Phone.ps1",
  "Start-Asolaria-PhoneBackgroundKeeper.ps1",
  "Start-Asolaria-PhoneTunnelMonitor.ps1",
  "Test-Asolaria-PhoneTunnelPath.ps1",
  "Test-Startup-HealthSnapshot.ps1",
  "Keep-Asolaria-PhoneBackground.ps1",
  "Keep-Asolaria-PhoneTunnelSmoke.ps1"
]);
const ALLOWED_CHANNELS = new Set(["usb", "vpn", "private_internet", "public_internet"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function parseOptionalBool(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return undefined;
}

function readCatalog() {
  try {
    const raw = fs.readFileSync(CATALOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function listToolingStatus() {
  const toolsDir = path.join(projectRoot, "tools");
  return KNOWN_TOOL_FILES.map((name) => {
    const fullPath = path.join(toolsDir, name);
    let updatedAt = "";
    let sizeBytes = 0;
    try {
      const stat = fs.statSync(fullPath);
      updatedAt = stat.mtime.toISOString();
      sizeBytes = Number(stat.size || 0);
    } catch (_error) {
      updatedAt = "";
      sizeBytes = 0;
    }
    return {
      name,
      path: fullPath,
      exists: fs.existsSync(fullPath),
      updatedAt,
      sizeBytes
    };
  });
}

function summarizeCaptureDir(dirPath, sampleLimit = 4) {
  const safeLimit = clampInt(sampleLimit, 4, 1, 12);
  if (!fs.existsSync(dirPath)) {
    return {
      path: dirPath,
      exists: false,
      count: 0,
      latestUpdatedAt: "",
      latestPath: "",
      sample: []
    };
  }

  let entries = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          updatedAt: stat.mtime.toISOString(),
          updatedAtMs: stat.mtimeMs,
          sizeBytes: Number(stat.size || 0)
        };
      })
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.name.localeCompare(right.name));
  } catch (_error) {
    entries = [];
  }

  return {
    path: dirPath,
    exists: true,
    count: entries.length,
    latestUpdatedAt: entries[0]?.updatedAt || "",
    latestPath: entries[0]?.path || "",
    sample: entries.slice(0, safeLimit).map((entry) => ({
      name: entry.name,
      path: entry.path,
      updatedAt: entry.updatedAt,
      sizeBytes: entry.sizeBytes
    }))
  };
}

function emptyPhoneStatus() {
  return {
    adbFound: false,
    adbPath: "",
    devices: [],
    selectedDeviceId: "",
    authorizedDeviceCount: 0,
    snapshot: {
      fileName: "",
      capturedAt: "",
      capturedAtMs: 0,
      width: 0,
      height: 0,
      orientation: "",
      imageReady: false
    },
    voice: {
      hasLatest: false,
      updatedAt: ""
    },
    lastError: ""
  };
}

async function resolvePhoneStatus(options = {}) {
  if (parseOptionalBool(options.skipAdb) === true) {
    return {
      ...emptyPhoneStatus(),
      adbSkipped: true
    };
  }
  return getPhoneMirrorStatus({
    deviceId: options.deviceId,
    timeoutMs: options.timeoutMs
  });
}

function inferSelectedChannel(phoneStatus = {}, requestedChannel = "") {
  const normalizedRequested = normalizeText(requestedChannel).toLowerCase();
  if (normalizedRequested && ALLOWED_CHANNELS.has(normalizedRequested)) {
    return {
      channel: normalizedRequested,
      reason: `Requested channel accepted: ${normalizedRequested}.`,
      fallbackUsed: false
    };
  }
  if (Number(phoneStatus.authorizedDeviceCount || 0) > 0) {
    return {
      channel: "usb",
      reason: "Inferred from local ADB-authorized phone visibility.",
      fallbackUsed: false
    };
  }
  return {
    channel: "private_internet",
    reason: "Fell back to private_internet because no authorized phone device is visible.",
    fallbackUsed: true
    };
}

function buildConnectionRouting(phoneStatus = {}, requestedChannel = "", catalog = {}) {
  const selected = inferSelectedChannel(phoneStatus, requestedChannel);
  const detectedAvailable = Number(phoneStatus.authorizedDeviceCount || 0) > 0 ? ["usb"] : [];
  const filteredAvailable = detectedAvailable.length > 0 ? detectedAvailable.slice() : [selected.channel];
  return {
    preferred: [selected.channel],
    detectedAvailable,
    filteredAvailable,
    removedChannels: [],
    removedDetails: [],
    selected,
    remoteBaseUrl: normalizeText(catalog?.bridge?.gatewayBaseUrl || ""),
    policy: {
      remoteBaseUrl: normalizeText(catalog?.bridge?.gatewayBaseUrl || ""),
      allowPublicInternet: false,
      publicInternetPrivate: true,
      remoteAuthRequired: false,
      requireEncryptedRemote: false,
      stealthDeny: false
    }
  };
}

async function getRecoveredPhoneSurfaceStatus(options = {}) {
  const catalog = readCatalog();
  const phone = await resolvePhoneStatus(options);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    catalog,
    livePhone: phone,
    captures: {
      root: PHONE_UI_DIR,
      dashboard: summarizeCaptureDir(path.join(PHONE_UI_DIR, "2026-03-30-dashboard"), options.sampleLimit),
      telegram: summarizeCaptureDir(path.join(PHONE_UI_DIR, "2026-03-30-telegram"), options.sampleLimit)
    },
    tooling: {
      toolsDir: path.join(projectRoot, "tools"),
      scripts: listToolingStatus()
    }
  };
}

async function getRecoveredPhoneInboxStatus(options = {}) {
  const surface = await getRecoveredPhoneSurfaceStatus(options);
  const connectionRouting = buildConnectionRouting(surface.livePhone, options.channel, surface.catalog);
  const inbox = buildMobileInboxState({
    approvalLimit: clampInt(options.approvalLimit, 6, 1, 40),
    taskLimit: clampInt(options.taskLimit, 6, 1, 40),
    noteLimit: clampInt(options.noteLimit, 4, 1, 24),
    connectionRouting,
    control: { armed: false },
    guardian: { mode: "local_skill" },
    approvals: { mode: "local_skill", preference: "" },
    push: { enabled: false, subscriptions: 0, reason: "local_skill_action" },
    workOrgs: { activeOrg: "", activeOrgLabel: "" }
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    catalog: surface.catalog,
    livePhone: surface.livePhone,
    captures: surface.captures,
    tooling: surface.tooling,
    connectionRouting,
    inbox
  };
}

function manifest() {
  return {
    id: "phone-recovered-surface",
    version: "0.1.0",
    description: "Exposes the recovered Jesse phone surface locally: catalog, ADB visibility, phone UI captures, tooling scripts, and mobile inbox projection.",
    capabilities: ["surface-status", "mobile-inbox-status"],
    readScopes: ["filesystem:data-dir", "filesystem:tools-dir", "phone:adb-status"],
    writeScopes: [],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "safe-repeat",
    timeoutMs: 15000,
    secretRequirements: [],
    sideEffects: [],
    failureModes: ["catalog-missing", "adb-unavailable", "phone-disconnected"],
    emittedEvents: []
  };
}

module.exports = {
  getRecoveredPhoneSurfaceStatus,
  getRecoveredPhoneInboxStatus,
  manifest
};
