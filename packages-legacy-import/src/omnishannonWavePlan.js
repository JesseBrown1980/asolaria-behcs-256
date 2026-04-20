"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { instanceRoot, projectRoot } = require("./runtimePaths");

function cleanText(value, max = 240) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
}

function clipText(value, max = 280) {
  const normalized = cleanText(String(value || "").replace(/\s+/g, " "), max + 32);
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function safeRelativePath(filePath) {
  const normalized = cleanText(filePath, 2000);
  if (!normalized) return "";
  if (!path.isAbsolute(normalized)) return normalized.replace(/\\/g, "/");
  const absolutePath = path.resolve(normalized);
  for (const rootPath of [instanceRoot, projectRoot]) {
    const relativePath = path.relative(rootPath, absolutePath);
    if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      return relativePath.replace(/\\/g, "/");
    }
  }
  return absolutePath;
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function resolveFirstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    const normalized = cleanText(candidate, 2000);
    if (normalized && fs.existsSync(normalized)) return normalized;
  }
  return cleanText(candidates[0], 2000);
}

function normalizeStringArray(values = [], max = 120) {
  const seen = new Set();
  const rows = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = cleanText(value, max);
    const lower = normalized.toLowerCase();
    if (!normalized || seen.has(lower)) continue;
    seen.add(lower);
    rows.push(normalized);
  }
  return rows;
}

function defaultWavePlanPaths() {
  return [
    path.join(instanceRoot, "config", "liris-omnishannon-wave-plan.json"),
    path.join(projectRoot, "config", "liris-omnishannon-wave-plan.json")
  ];
}

function resolveSurface(surfaceId, namedSurfaces = {}) {
  const surfaces = [
    ...(Array.isArray(namedSurfaces.hostAuthority?.surfaces) ? namedSurfaces.hostAuthority.surfaces : []),
    ...(Array.isArray(namedSurfaces.activationTable) ? namedSurfaces.activationTable : []),
    ...(Array.isArray(namedSurfaces.agentTable) ? namedSurfaces.agentTable : []),
    ...(Array.isArray(namedSurfaces.deviceTable) ? namedSurfaces.deviceTable : [])
  ];
  return surfaces.find((entry) => cleanText(entry.surfaceId || entry.id, 120) === cleanText(surfaceId, 120)) || null;
}

function buildLane(lane = {}, namedSurfaces = {}) {
  const surface = resolveSurface(lane.surfaceId, namedSurfaces);
  return {
    id: cleanText(lane.id, 120),
    label: cleanText(lane.label || lane.id, 160),
    question: clipText(lane.question || "", 220),
    surfaceId: cleanText(lane.surfaceId, 120),
    surfaceLabel: cleanText(surface?.label, 160),
    profileId: cleanText(surface?.profileId || surface?.instantLoad?.profileId, 120),
    pid: cleanText(surface?.activePid || surface?.pid?.spawnPid, 160),
    timestamp: cleanText(surface?.timestamp || surface?.instantLoad?.timestamp, 80),
    state: cleanText(surface?.controlState || surface?.state, 120),
    abilityChain: normalizeStringArray(surface?.abilityChain || surface?.instantLoad?.abilityChain || [], 120)
  };
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function readOmnishannonWavePlan(options = {}) {
  const configPath = resolveFirstExistingPath(options.wavePlanPaths || defaultWavePlanPaths());
  const config = readJsonFile(configPath, null);
  if (!config) {
    return {
      found: false,
      configPath: "",
      relativePath: "",
      waveId: ""
    };
  }

  return {
    found: true,
    configPath,
    relativePath: safeRelativePath(configPath),
    schemaVersion: Number(config.schemaVersion || 1),
    waveId: cleanText(config.waveId, 160),
    label: cleanText(config.label, 160),
    summary: clipText(config.summary || "", 280),
    patternIds: normalizeStringArray(config.patternIds || [], 40),
    executionOrder: normalizeStringArray(config.executionOrder || [], 80),
    scoutLanes: (Array.isArray(config.scoutLanes) ? config.scoutLanes : []).map((lane) => buildLane(lane, options.namedSurfaces || {})),
    backlineLanes: (Array.isArray(config.backlineLanes) ? config.backlineLanes : []).map((lane) => buildLane(lane, options.namedSurfaces || {})),
    matrix: {
      primaryWaveCount: toPositiveInt(config.matrix?.primaryWaveCount, 6),
      branchCount: toPositiveInt(config.matrix?.branchCount, 6),
      componentCount: toPositiveInt(config.matrix?.componentCount, 6),
      delayedReflectionCount: toPositiveInt(config.matrix?.delayedReflectionCount, 12),
      delayedReflectionMode: cleanText(config.matrix?.delayedReflectionMode || "single_agent_inherited", 120),
      delayedReflectionStepSeconds: toPositiveInt(config.matrix?.delayedReflectionStepSeconds, 30),
      allowControllerSelfReflection: config.matrix?.allowControllerSelfReflection !== false,
      totalLeafTests: toPositiveInt(config.matrix?.primaryWaveCount, 6)
        * toPositiveInt(config.matrix?.branchCount, 6)
        * toPositiveInt(config.matrix?.componentCount, 6)
        * toPositiveInt(config.matrix?.delayedReflectionCount, 12)
    },
    pulse: {
      target: cleanText(config.pulse?.target, 80),
      mode: cleanText(config.pulse?.mode, 120),
      recordPath: cleanText(config.pulse?.recordPath, 240),
      targetDeviceLabel: cleanText(options.deviceSpecificUsbState?.primaryHardwareLabel, 160),
      adbState: cleanText(options.deviceSpecificUsbState?.adbState, 120),
      nextRequiredAction: cleanText(options.deviceSpecificUsbState?.gate?.nextRequiredAction, 160)
    }
  };
}

module.exports = {
  readOmnishannonWavePlan
};
