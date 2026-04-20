"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { instanceRoot, projectRoot } = require("./runtimePaths");

function cleanText(value, max = 240) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
}

function safeRelativePath(filePath) {
  const normalized = cleanText(filePath, 2000);
  if (!normalized) {
    return "";
  }
  if (!path.isAbsolute(normalized)) {
    return normalized.replace(/\\/g, "/");
  }
  const absolutePath = path.resolve(normalized);
  for (const rootPath of [instanceRoot, projectRoot]) {
    const relativePath = path.relative(rootPath, absolutePath);
    if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      return relativePath.replace(/\\/g, "/");
    }
  }
  return absolutePath;
}

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function normalizeHardwareRows(line) {
  return String(line || "")
    .split(";")
    .map((entry) => cleanText(entry, 240))
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*\[([^/\]]+)\/([^\]]+)\]$/);
      return {
        label: cleanText(match?.[1] || entry, 160),
        kind: cleanText(match?.[2], 80),
        status: cleanText(match?.[3], 80)
      };
    });
}

function parseDeviceRows(lines = []) {
  const rows = [];
  let inSection = false;
  for (const rawLine of lines) {
    const line = cleanText(rawLine, 400);
    if (!line) {
      if (inSection) break;
      continue;
    }
    if (/^adb devices -l$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection || /^List of devices attached/i.test(line)) {
      continue;
    }
    const match = line.match(/^(\S+)\s+(\S+)(.*)$/);
    if (!match) continue;
    rows.push({
      serial: cleanText(match[1], 160),
      state: cleanText(match[2], 80),
      extra: cleanText(match[3], 200)
    });
  }
  return rows;
}

function parseDeviceExtra(extra = "") {
  const facts = {};
  for (const token of String(extra || "").trim().split(/\s+/)) {
    const match = token.match(/^([a-z0-9_]+):(.+)$/i);
    if (!match) continue;
    facts[match[1].toLowerCase()] = cleanText(match[2], 160);
  }
  return facts;
}

function detectAdbState(text, deviceRows, hardwareRows) {
  if (/\bConnected and authorized\./i.test(text) || deviceRows.some((row) => row.state === "device")) {
    return "authorized_adb";
  }
  if (/unauthorized device/i.test(text) || deviceRows.some((row) => row.state === "unauthorized")) {
    return "unauthorized_adb";
  }
  if (/No device detected\./i.test(text) && hardwareRows.length > 0) {
    return "wpd_visible_adb_inactive";
  }
  if (/No device detected\./i.test(text)) {
    return "no_device";
  }
  if (deviceRows.length > 0) {
    return cleanText(deviceRows[0].state, 80) || "adb_present_unknown";
  }
  return "unknown";
}

function listCandidateLogs(options = {}) {
  const logsDirs = Array.isArray(options.logsDirs) && options.logsDirs.length > 0
    ? options.logsDirs
    : [path.join(instanceRoot, "logs"), path.join(projectRoot, "logs")];
  const rows = [];
  for (const logsDir of logsDirs) {
    const normalizedDir = cleanText(logsDir, 2000);
    if (!normalizedDir || !fs.existsSync(normalizedDir)) continue;
    for (const entry of fs.readdirSync(normalizedDir)) {
      if (!/^adb-health-\d{8}-\d{6}\.log$/i.test(entry)) continue;
      const filePath = path.join(normalizedDir, entry);
      const stat = fs.statSync(filePath);
      rows.push({
        filePath,
        name: entry,
        mtimeMs: stat.mtimeMs
      });
    }
  }
  return rows.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function matchNamedSurface(hardwareRows = [], deviceRows = [], namedSurfaces = {}) {
  const observedTokens = [
    ...hardwareRows.map((row) => `${cleanText(row.label, 160)} ${cleanText(row.kind, 80)} ${cleanText(row.status, 80)}`),
    ...deviceRows.map((row) => {
      const facts = parseDeviceExtra(row.extra);
      return [
        cleanText(row.serial, 160),
        cleanText(row.state, 80),
        cleanText(row.extra, 200),
        cleanText(facts.model, 160),
        cleanText(facts.product, 160),
        cleanText(facts.device, 160)
      ].join(" ");
    })
  ]
    .flatMap((entry) => String(entry || "").split(/\s+/))
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
  const surfaceRows = Array.isArray(namedSurfaces.deviceTable) ? namedSurfaces.deviceTable : [];
  for (const device of surfaceRows) {
    const aliases = [
      cleanText(device.id, 120),
      cleanText(device.label, 160),
      ...((device.aliases || []).map((alias) => cleanText(alias, 120))),
      cleanText(device.transport?.liveSerial, 160),
      cleanText(device.transport?.correctedNaming, 120),
      cleanText(device.transport?.targetLabel, 160)
    ]
      .filter(Boolean)
      .map((alias) => alias.toLowerCase());
    if (aliases.some((alias) => observedTokens.some((token) => token.includes(alias) || alias.includes(token)))) {
      return device;
    }
  }
  return null;
}

function nextRequiredAction(adbState) {
  if (adbState === "authorized_adb") {
    return "adb_ready";
  }
  if (adbState === "unauthorized_adb") {
    return "accept_this_computer";
  }
  if (adbState === "wpd_visible_adb_inactive") {
    return "unlock_device_enable_usb_debugging_accept_computer";
  }
  if (adbState === "no_device") {
    return "verify_cable_and_usb_mode";
  }
  return "inspect_usb_route_truth";
}

function buildPidVersion(pid, timestamp) {
  const normalizedPid = cleanText(pid, 160);
  const normalizedTimestamp = cleanText(timestamp, 80);
  if (normalizedPid && normalizedTimestamp) {
    return `${normalizedPid}@${normalizedTimestamp}`;
  }
  return normalizedPid || normalizedTimestamp || "";
}

function readLogEvidence(logRow) {
  const text = String(fs.readFileSync(logRow.filePath, "utf8") || "");
  const lines = text.split(/\r?\n/);
  const hardwareLine = lines.find((line) => /^Windows-visible phone hardware:/i.test(String(line || "").trim())) || "";
  const hardwareRows = normalizeHardwareRows(hardwareLine.replace(/^Windows-visible phone hardware:\s*/i, ""));
  const deviceRows = parseDeviceRows(lines);
  const adbPathLine = lines.find((line) => /^ADB executable:/i.test(String(line || "").trim())) || "";
  return {
    ...logRow,
    text,
    lines,
    hardwareRows,
    deviceRows,
    adbPath: cleanText(adbPathLine.replace(/^ADB executable:\s*/i, ""), 240),
    capturedAt: toIsoDate(logRow.mtimeMs, "")
  };
}

function readLatestDeviceSpecificUsbState(options = {}) {
  const evidenceRows = listCandidateLogs(options).map((logRow) => readLogEvidence(logRow));
  const latest = evidenceRows[0];
  if (!latest) {
    return {
      found: false,
      filePath: "",
      relativePath: "",
      capturedAt: "",
      adbState: "missing"
    };
  }

  const latestHardware = evidenceRows.find((entry) => entry.hardwareRows.length > 0) || latest;
  const observedHardwareRows = latest.hardwareRows.length > 0 ? latest.hardwareRows : latestHardware.hardwareRows;
  const matchedSurface = matchNamedSurface(observedHardwareRows, latest.deviceRows, options.namedSurfaces || {});
  const primarySurface = options.namedSurfaces?.primarySurface || {};
  const primaryInstantLoad = primarySurface.instantLoad || {};
  const controllerPid = cleanText(options.pidProfile?.selected?.spawnPid || primarySurface.pid?.spawnPid, 160);
  const controllerProfileId = cleanText(primaryInstantLoad.profileId, 120);
  const controllerTimestamp = cleanText(primaryInstantLoad.timestamp || options.pidProfile?.selected?.spawnedAt, 80);
  const adbState = detectAdbState(latest.text, latest.deviceRows, latest.hardwareRows);
  const liveDeviceFacts = parseDeviceExtra(latest.deviceRows[0]?.extra);
  const liveSerial = cleanText(latest.deviceRows[0]?.serial, 160);

  return {
    found: true,
    source: "adb_health_log",
    filePath: latest.filePath,
    relativePath: safeRelativePath(latest.filePath),
    capturedAt: latest.capturedAt,
    adbPath: latest.adbPath,
    adbState,
    deviceRows: latest.deviceRows,
    hardwareRows: observedHardwareRows,
    liveHardwareRows: latest.hardwareRows,
    hardwareObservedAt: latestHardware.capturedAt,
    hardwareRelativePath: safeRelativePath(latestHardware.filePath),
    hardwareFreshness: latest.hardwareRows.length > 0 ? "live" : "last_observed",
    primaryHardwareLabel: cleanText(observedHardwareRows[0]?.label, 160),
    matchedNamedSurfaceId: cleanText(matchedSurface?.id, 120),
    matchedNamedSurfaceLabel: cleanText(matchedSurface?.label, 160),
    matchedProfileIds: Array.isArray(matchedSurface?.profileIds) ? matchedSurface.profileIds.slice(0, 4) : [],
    liveTransport: {
      serial: liveSerial,
      routeKind: adbState === "authorized_adb" || adbState === "unauthorized_adb"
        ? (liveSerial.includes(":") ? "wireless_adb" : "usb_adb")
        : "",
      model: cleanText(liveDeviceFacts.model, 160),
      product: cleanText(liveDeviceFacts.product, 160),
      deviceCode: cleanText(liveDeviceFacts.device, 160)
    },
    controller: {
      surfaceId: cleanText(primarySurface.id, 120),
      label: cleanText(primarySurface.label, 160),
      profileId: controllerProfileId,
      pid: controllerPid,
      pidVersion: buildPidVersion(controllerPid, controllerTimestamp),
      timestamp: controllerTimestamp,
      state: cleanText(primarySurface.state, 120)
    },
    gate: {
      transportVisible: latest.hardwareRows.length > 0,
      lastKnownHardwareVisible: observedHardwareRows.length > 0,
      adbAuthorized: adbState === "authorized_adb",
      nextRequiredAction: nextRequiredAction(adbState)
    }
  };
}

module.exports = {
  readLatestDeviceSpecificUsbState
};
