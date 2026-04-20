"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { projectRoot, instanceRoot, resolveDataPath } = require("./runtimePaths");
const { resolveLirisBootstrapConfig } = require("./lirisBootstrapConfig");
const { buildLirisNamedSurfaceRegistry } = require("./lirisNamedSurfaceRegistry");
const { readLatestDeviceSpecificUsbState } = require("./deviceSpecificUsbState");
const { buildLirisDeviceLanguagePacket, writeLirisDeviceLanguagePacket } = require("./lirisDeviceLanguagePacket");
const { readOmnishannonWavePlan } = require("./omnishannonWavePlan");
const { buildOmnishannonSelfThinkingWaves, writeOmnishannonSelfThinkingWaves } = require("./omnishannonSelfThinkingWaves");
const { writeLocalLeaderConnectorCatalogMirror } = require("./leaderConnectorCatalog");
const { readUnifiedIndex } = require("./unifiedAgentIndexStore");

const DEFAULT_LANGUAGE_FOCUS_IDS = Object.freeze([
  "LX-015",
  "LX-122",
  "LX-249",
  "LX-019",
  "LX-204"
]);

function cleanText(value, max = 400) {
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
    const candidateRoot = cleanText(rootPath, 2000);
    if (!candidateRoot) {
      continue;
    }
    const relativePath = path.relative(candidateRoot, absolutePath);
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

function clipText(value, max = 280) {
  const normalized = cleanText(String(value || "").replace(/\s+/g, " "), max + 32);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function buildPidVersion(pid, timestamp) {
  const normalizedPid = cleanText(pid, 160);
  const normalizedTimestamp = cleanText(timestamp, 80);
  if (normalizedPid && normalizedTimestamp) {
    return `${normalizedPid}@${normalizedTimestamp}`;
  }
  return normalizedPid || normalizedTimestamp || "";
}

function normalizeStringArray(values = [], max = 120) {
  const deduped = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = cleanText(value, max);
    const lower = normalized.toLowerCase();
    if (!normalized || seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    deduped.push(normalized);
  }
  return deduped;
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readTextFile(filePath, fallback = "") {
  try {
    return String(fs.readFileSync(filePath, "utf8") || "");
  } catch {
    return fallback;
  }
}

function resolveFirstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    const normalized = cleanText(candidate, 2000);
    if (normalized && fs.existsSync(normalized)) {
      return normalized;
    }
  }
  return cleanText(candidates[0], 2000);
}

function defaultLirisConfigPath(fileName) {
  return [
    path.join(instanceRoot, "config", fileName),
    path.join(projectRoot, "config", fileName)
  ];
}

function defaultLirisDataPath(fileName) {
  return [
    resolveDataPath(fileName),
    path.join(projectRoot, "data", fileName)
  ];
}

function defaultLirisDataDir(dirName, fileName = "") {
  return [
    path.join(instanceRoot, "data", dirName, fileName),
    path.join(projectRoot, "data", dirName, fileName)
  ];
}

function summarizeMarkdownDocument(filePath) {
  const text = readTextFile(filePath, "");
  const lines = text.split("\n");
  const headings = lines
    .map((line) => {
      const match = String(line || "").match(/^#{1,3}\s+(.+?)\s*$/);
      return match ? cleanText(match[1], 120) : "";
    })
    .filter(Boolean)
    .slice(0, 8);
  const title = headings[0] || cleanText(lines.find((line) => cleanText(line)), 120);
  const excerpt = clipText(
    lines
      .map((line) => cleanText(line))
      .filter(Boolean)
      .slice(0, 10)
      .join(" "),
    320
  );

  return {
    found: Boolean(text),
    filePath,
    relativePath: safeRelativePath(filePath),
    title,
    excerpt,
    headings,
    lineCount: lines.filter((line) => String(line).trim()).length
  };
}

function summarizeTextPacket(filePath) {
  const text = readTextFile(filePath, "");
  const lines = text
    .split("\n")
    .map((line) => cleanText(line, 240))
    .filter(Boolean);
  return {
    found: Boolean(text),
    filePath,
    relativePath: safeRelativePath(filePath),
    title: lines[0] || "",
    excerpt: clipText(lines.slice(0, 6).join(" "), 320),
    lineCount: lines.length
  };
}

function summarizeJsonPacket(filePath) {
  const payload = readJsonFile(filePath, null);
  return {
    found: Boolean(payload && typeof payload === "object"),
    filePath,
    relativePath: safeRelativePath(filePath),
    ok: payload?.ok === true,
    taskId: cleanText(payload?.taskId, 120),
    builtAt: cleanText(payload?.builtAt, 80),
    state: cleanText(payload?.state, 120),
    sourceHost: cleanText(payload?.sourceHost, 120),
    targetHost: cleanText(payload?.targetHost, 120),
    targetRuntime: cleanText(payload?.targetRuntime, 120),
    activeRuler: cleanText(payload?.activeRuler, 120),
    requiredTargetCatalog: cleanText(payload?.requiredTargetCatalog, 240),
    requiredTargetCatalogSource: cleanText(payload?.requiredTargetCatalogSource, 240),
    requiredTargetStartup: cleanText(payload?.requiredTargetStartup, 240),
    requiredTargetOmniShannon: cleanText(payload?.requiredTargetOmniShannon, 240),
    requiredTargetLane: cleanText(payload?.requiredTargetLane, 160),
    boundary: clipText(payload?.boundary || "", 280),
    sequence: normalizeStringArray(payload?.sequence || [], 120),
    cutoverResult: {
      sourceHostRole: cleanText(payload?.cutoverResult?.sourceHostRole, 160),
      targetHostRole: cleanText(payload?.cutoverResult?.targetHostRole, 160)
    }
  };
}

function matchesLirisRole(roleKey, entry = {}) {
  const normalizedKey = cleanText(roleKey, 80).toLowerCase();
  const normalizedRole = cleanText(entry.role, 80).toLowerCase();
  return normalizedKey === "liris" || normalizedRole === "liris";
}

function readPidRegistry(options = {}) {
  const registryPath = resolveFirstExistingPath(options.registryPaths || defaultLirisDataPath("spawn-pid-registry.json"));
  return {
    registryPath,
    registry: readJsonFile(registryPath, { active: {}, history: [] }) || { active: {}, history: [] }
  };
}

function normalizePidEntry(roleKey, entry = {}, source = "unknown") {
  const spawnedAt = toIsoDate(entry.spawnedAt, "");
  const despawnedAt = toIsoDate(entry.despawnedAt, "");
  return {
    source,
    roleKey: cleanText(roleKey, 80),
    role: cleanText(entry.role, 80),
    spawnPid: cleanText(entry.spawnPid, 160),
    pidVersion: buildPidVersion(entry.spawnPid, spawnedAt || despawnedAt),
    status: cleanText(entry.status, 40),
    spawnedAt,
    despawnedAt,
    agentId: cleanText(entry.agentId, 120),
    lifecycle: cleanText(entry.lifecycle, 80),
    responsibilityTier: cleanText(entry.responsibilityTier, 80),
    machine: cleanText(entry.machine, 120),
    ip: cleanText(entry.ip, 120),
    osPid: Number.isFinite(Number(entry.osPid)) ? Number(entry.osPid) : 0
  };
}

function comparePidEntries(left = {}, right = {}) {
  const leftTime = new Date(left.spawnedAt || left.despawnedAt || 0).getTime();
  const rightTime = new Date(right.spawnedAt || right.despawnedAt || 0).getTime();
  return rightTime - leftTime;
}

function resolveLatestLirisPidProfile(options = {}) {
  const { registryPath, registry } = readPidRegistry(options);
  const activeEntries = Object.entries(registry.active || {})
    .filter(([roleKey, entry]) => matchesLirisRole(roleKey, entry))
    .map(([roleKey, entry]) => normalizePidEntry(roleKey, entry, "active"))
    .sort(comparePidEntries);

  const historyEntries = Array.isArray(registry.history)
    ? registry.history
      .map((entry) => normalizePidEntry(entry.role || "", entry, "history"))
      .filter((entry) => matchesLirisRole(entry.roleKey || entry.role, entry))
      .sort(comparePidEntries)
    : [];

  const selected = activeEntries[0] || historyEntries[0] || null;
  return {
    found: Boolean(selected),
    registryPath,
    registryRelativePath: safeRelativePath(registryPath),
    activeCount: activeEntries.length,
    historyCount: historyEntries.length,
    selected,
    activeEntries,
    historyEntries: historyEntries.slice(0, 5)
  };
}

function listHeartbeatFiles(options = {}) {
  const candidateDirs = options.heartbeatDirs || [
    ...defaultLirisDataDir("mqtt-inbox"),
    ...defaultLirisDataDir("mqtt-inbox-gaia")
  ];
  const rows = [];
  for (const dirPath of candidateDirs) {
    const normalized = cleanText(dirPath, 2000);
    if (!normalized || !fs.existsSync(normalized)) {
      continue;
    }
    for (const name of fs.readdirSync(normalized)) {
      if (!/asolaria_nodes_liris_runtime_heartbeat\.json$/i.test(name)) {
        continue;
      }
      rows.push(path.join(normalized, name));
    }
  }
  return rows;
}

function parseHeartbeatPayload(rawPayload) {
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    return rawPayload;
  }
  const text = cleanText(rawPayload, 4000);
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function readLatestLirisHeartbeat(options = {}) {
  const heartbeatFiles = listHeartbeatFiles(options)
    .map((filePath) => {
      const payload = readJsonFile(filePath, {});
      return {
        filePath,
        relativePath: safeRelativePath(filePath),
        receivedAt: toIsoDate(payload?.receivedAt, ""),
        topic: cleanText(payload?.topic, 240),
        payload: parseHeartbeatPayload(payload?.payload)
      };
    })
    .sort((left, right) => {
      const leftTime = new Date(left.receivedAt || left.payload?.ts || 0).getTime();
      const rightTime = new Date(right.receivedAt || right.payload?.ts || 0).getTime();
      return rightTime - leftTime;
    });

  const latest = heartbeatFiles[0] || null;
  return {
    found: Boolean(latest),
    latest: latest
      ? {
          filePath: latest.filePath,
          relativePath: latest.relativePath,
          receivedAt: latest.receivedAt,
          payloadTs: toIsoDate(latest.payload?.ts, ""),
          status: cleanText(latest.payload?.status, 80),
          listener: cleanText(latest.payload?.listener, 80),
          nodeId: cleanText(latest.payload?.nodeId, 80),
          uptime: Number.isFinite(Number(latest.payload?.uptime)) ? Number(latest.payload.uptime) : 0,
          topic: latest.topic
        }
      : null
  };
}

function readLatestLirisReflection(options = {}) {
  const reflectStatePath = resolveFirstExistingPath(options.reflectStatePaths || defaultLirisDataDir("liris-index", "reflect-state.json"));
  const reflectionsPath = resolveFirstExistingPath(options.reflectionsPaths || defaultLirisDataDir("liris-index", "reflections.ndjson"));
  const reflectState = readJsonFile(reflectStatePath, {});
  const lastLine = readTextFile(reflectionsPath, "")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .slice(-1)[0] || "";
  const parsedLine = lastLine ? readJsonFileFromLine(lastLine) : null;

  return {
    found: Boolean(reflectState?.lastReflection || parsedLine),
    reflectStatePath,
    reflectionsPath,
    reflectStateRelativePath: safeRelativePath(reflectStatePath),
    reflectionsRelativePath: safeRelativePath(reflectionsPath),
    totalReflections: Number(reflectState?.totalReflections || 0),
    lastReflectionAt: toIsoDate(parsedLine?.at || reflectState?.lastReflection, ""),
    lastQuestion: cleanText(parsedLine?.q || reflectState?.lastQuestion, 200),
    bridgeReachable: typeof parsedLine?.bridge?.reachable === "boolean" ? parsedLine.bridge.reachable : null,
    localRunning: typeof parsedLine?.local?.running === "boolean" ? parsedLine.local.running : null,
    patternsDetected: Number(parsedLine?.patternsDetected || 0)
  };
}

function readJsonFileFromLine(line) {
  try {
    return JSON.parse(String(line || "").trim());
  } catch {
    return null;
  }
}

function detectCuratedMemoryWarnings(memoryText, bootstrapConfig) {
  const warnings = [];
  const normalizedText = String(memoryText || "");
  const sovereignMatch = normalizedText.match(/Sovereign IP:\s*([0-9.]+)/i);
  if (sovereignMatch && sovereignMatch[1] !== cleanText(bootstrapConfig.sovereignHost, 120)) {
    warnings.push({
      code: "stale_sovereign_literal",
      message: `Curated memory still references sovereign ${sovereignMatch[1]} while bootstrap resolves ${bootstrapConfig.sovereignHost || "unknown"}.`
    });
  }

  if (/Do NOT use `mqtt:\/\/`/i.test(normalizedText) && /^mqtt:\/\//i.test(cleanText(bootstrapConfig.mqttBrokerUrl, 160))) {
    warnings.push({
      code: "transport_claim_differs_from_bootstrap",
      message: `Curated memory says to avoid plaintext mqtt://, but the live bootstrap currently resolves ${bootstrapConfig.mqttBrokerUrl}.`
    });
  }

  if (/not currently running|need to start asolaria/i.test(normalizedText)) {
    warnings.push({
      code: "runtime_status_note_is_static",
      message: "Curated memory includes old runtime status notes and should not be treated as live health state."
    });
  }

  return warnings;
}

function normalizeLanguageFocusIds(input = []) {
  const rows = Array.isArray(input) ? input : DEFAULT_LANGUAGE_FOCUS_IDS;
  const deduped = [];
  const seen = new Set();
  for (const value of rows) {
    const id = cleanText(value, 40).toUpperCase();
    if (!/^LX-\d{3,4}$/.test(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    deduped.push(id);
  }
  return deduped.length ? deduped : DEFAULT_LANGUAGE_FOCUS_IDS.slice();
}

function selectLanguageFocusDocuments(payload, focusIds) {
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];
  return focusIds
    .map((id) => documents.find((entry) => cleanText(entry.id, 40).toUpperCase() === id))
    .filter(Boolean)
    .map((entry) => ({
      id: cleanText(entry.id, 40),
      title: cleanText(entry.title, 200),
      type: cleanText(entry.type, 80),
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 8) : [],
      chain: Array.isArray(entry.chain) ? entry.chain.slice(0, 8) : [],
      summary: clipText(entry.summary || entry.body || "", 280),
      relativePath: safeRelativePath(entry.absolutePath || entry.source || "")
    }));
}

function readRunningIndexCandidate(manifestPath) {
  const manifest = readJsonFile(manifestPath, null);
  if (!manifest) {
    return null;
  }
  const absoluteSnapshotPath = cleanText(manifest.activeSnapshotAbsolutePath, 2000);
  const relativeSnapshotPath = cleanText(manifest.activeSnapshotPath, 2000);
  const snapshotPath = absoluteSnapshotPath
    || (relativeSnapshotPath ? path.resolve(path.dirname(manifestPath), relativeSnapshotPath) : "");
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    return null;
  }
  const payload = readJsonFile(snapshotPath, null);
  if (!payload || !Array.isArray(payload.documents)) {
    return null;
  }
  return {
    ...payload,
    runningManifestPath: manifestPath,
    runningManifest: manifest,
    activeSnapshotPath: snapshotPath
  };
}

function readRunningIndex(options = {}) {
  const manifestPaths = options.runningManifestPaths || [
    resolveDataPath("unified-agent-index-running-manifest.json"),
    path.join(projectRoot, "data", "unified-agent-index-running-manifest.json")
  ];
  for (const manifestPath of manifestPaths) {
    const payload = readRunningIndexCandidate(manifestPath);
    if (payload && Array.isArray(payload.documents) && payload.documents.length > 0) {
      return {
        ok: true,
        payload
      };
    }
  }
  try {
    const payload = readUnifiedIndex({
      profile: options.profile || "running",
      autoBuild: false,
      scanMode: "blink"
    });
    return {
      ok: true,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      error: cleanText(error?.message || error, 320),
      payload: null
    };
  }
}

function buildInstantFocus(profile) {
  const focusLines = [];
  const identity = profile.identity || {};
  const pid = profile.pidProfile?.selected || {};
  const heartbeat = profile.memory?.latestHeartbeat || {};
  const reflection = profile.memory?.latestReflection || {};
  const namedSurfaces = profile.namedSurfaces || {};
  const focusIds = Array.isArray(profile.languageFocus)
    ? profile.languageFocus.map((entry) => cleanText(entry.id, 40)).filter(Boolean)
    : [];

  focusLines.push(
    `Identity: ${cleanText(identity.nodeId || "liris", 80)} | ${cleanText(identity.role || "sub_colony", 80)} | ${cleanText(identity.subColonyClass || "unknown", 80)} | ${cleanText(identity.languageVersion || "unknown", 80)} | head=${cleanText(identity.headColony || "asolaria", 80)} | authority=${cleanText(identity.authorityMode || "unknown", 80)}`
  );

  if (pid.spawnPid) {
    focusLines.push(
      `PID anchor: ${cleanText(pid.pidVersion || pid.spawnPid, 240)} (${pid.source || "active"})${pid.machine ? ` on ${pid.machine}` : ""}`
    );
  }

  if (heartbeat.status || heartbeat.payloadTs) {
    focusLines.push(
      `Recent live state: heartbeat=${cleanText(heartbeat.status || "unknown", 40)} listener=${cleanText(heartbeat.listener || "unknown", 40)} at ${cleanText(heartbeat.payloadTs || heartbeat.receivedAt || "unknown", 80)}`
    );
  } else if (reflection.lastReflectionAt) {
    focusLines.push(
      `Recent memory state: reflection at ${reflection.lastReflectionAt}${reflection.lastQuestion ? ` | ${clipText(reflection.lastQuestion, 120)}` : ""}`
    );
  }

  focusLines.push(
    `Knowledge load: memory=${cleanText(profile.memory?.curatedMemory?.relativePath || "", 120)} -> index=${cleanText(profile.index?.profile || "running", 40)} (${Number(profile.index?.documentCount || 0)} docs)`
  );

  if (focusIds.length > 0) {
    focusLines.push(`Language focus: ${focusIds.join(", ")}`);
  }

  const activationNames = Array.isArray(namedSurfaces.activationTable)
    ? namedSurfaces.activationTable.map((entry) => cleanText(entry.surfaceId || entry.label, 80)).filter(Boolean)
    : [];
  if (activationNames.length > 0) {
    focusLines.push(
      `Named surfaces: ${activationNames.join(", ")} | generic=${cleanText(namedSurfaces.activationLaw?.genericSpawnPolicy || "unknown", 80)}`
    );
  }

  const primaryInstantLoad = Array.isArray(namedSurfaces.instantLoadTable)
    ? namedSurfaces.instantLoadTable.find((entry) => entry.surfaceId === cleanText(namedSurfaces.activationLaw?.primarySurfaceId, 80))
    : null;
  if (primaryInstantLoad?.profileId) {
    focusLines.push(
      `Instant load: profile=${primaryInstantLoad.profileId}${primaryInstantLoad.activePidVersion ? ` pid=${primaryInstantLoad.activePidVersion}` : primaryInstantLoad.activePid ? ` pid=${primaryInstantLoad.activePid}` : ""}${primaryInstantLoad.timestamp ? ` ts=${primaryInstantLoad.timestamp}` : ""} | tools=${(primaryInstantLoad.tools || []).join(", ")} | skills=${(primaryInstantLoad.skills || []).join(", ")}`
    );
  }

  const heartbeatProfile = Array.isArray(namedSurfaces.toolProfileTable)
    ? namedSurfaces.toolProfileTable.find((entry) => cleanText(entry.toolKind, 80) === "heartbeat")
    : null;
  if (heartbeatProfile?.id) {
    focusLines.push(
      `Tool profile: ${heartbeatProfile.id} -> ${(heartbeatProfile.abilityChain || []).join(" > ")}`
    );
  }

  const considerationRows = Array.isArray(namedSurfaces.considerationTable)
    ? namedSurfaces.considerationTable.slice(0, 4)
    : [];
  if (considerationRows.length > 0) {
    focusLines.push(
      `Bundle considerations: ${considerationRows.map((entry) => `${cleanText(entry.id, 80)}=${cleanText(entry.state, 80)}`).join(", ")}`
    );
  }

  const helperGateRows = considerationRows.filter((entry) => cleanText(entry.helperPolicy, 120));
  if (helperGateRows.length > 0) {
    focusLines.push(
      `Bundle gates: ${helperGateRows.map((entry) => `${cleanText(entry.id, 80)}(${cleanText(entry.helperPolicy, 120)})`).join(", ")}`
    );
  }

  const indexedAbilityRows = (Array.isArray(namedSurfaces.capabilityBundleTable) ? namedSurfaces.capabilityBundleTable : [])
    .filter((entry) => cleanText(entry.category, 80) === "ability" && Array.isArray(entry.anchorIds) && entry.anchorIds.length > 0)
    .slice(0, 3);
  if (indexedAbilityRows.length > 0) {
    focusLines.push(
      `Indexed abilities: ${indexedAbilityRows.map((entry) => `${cleanText(entry.id, 80)}[${normalizeStringArray(entry.anchorIds || [], 40).join("/")}]`).join(", ")}`
    );
  }

  const automaticAbilityRows = Array.isArray(profile.deviceLanguage?.abilityActions)
    ? profile.deviceLanguage.abilityActions.slice(0, 3)
    : [];
  if (automaticAbilityRows.length > 0) {
    focusLines.push(
      `Automatic use: ${automaticAbilityRows.map((entry) => `${cleanText(entry.id, 80)}=${cleanText(entry.actionState, 80)}|${cleanText(entry.serviceType, 80)}|${cleanText(entry.triggerPolicy, 80)}`).join(", ")}`
    );
  }

  const serviceActionRows = Array.isArray(profile.deviceLanguage?.serviceActions)
    ? profile.deviceLanguage.serviceActions.slice(0, 3)
    : [];
  if (serviceActionRows.length > 0) {
    focusLines.push(
      `Service types: ${serviceActionRows.map((entry) => `${cleanText(entry.id, 80)}=${cleanText(entry.serviceType, 80)}|${cleanText(entry.serviceScope, 80)}|${cleanText(entry.actionState, 80)}`).join(", ")}`
    );
  }

  const hostAuthority = profile.hostAuthority || namedSurfaces.hostAuthority || {};
  if (cleanText(hostAuthority.hostScope, 120)) {
    focusLines.push(
      `Host authority: ${cleanText(hostAuthority.hostScope, 120)} | root=${cleanText(hostAuthority.sovereignRootSurfaceId, 80)} | owner=${cleanText(hostAuthority.ownerSurfaceId, 80)} | compute=${cleanText(hostAuthority.computeAuthority, 120)}`
    );
  }

  const surfaceRoleRows = Array.isArray(hostAuthority.surfaces) ? hostAuthority.surfaces.slice(0, 6) : [];
  if (surfaceRoleRows.length > 0) {
    focusLines.push(
      `Host surfaces: ${surfaceRoleRows.map((entry) => `${cleanText(entry.surfaceId, 80)}=${cleanText(entry.controlState, 120)}`).join(", ")}`
    );
  }

  const computeSurfaceRows = Array.isArray(hostAuthority.computeSurfaces) ? hostAuthority.computeSurfaces.slice(0, 4) : [];
  if (computeSurfaceRows.length > 0) {
    focusLines.push(
      `Compute watchers: ${computeSurfaceRows.map((entry) => `${cleanText(entry.id, 80)}=${normalizeStringArray(entry.watcherSurfaceIds || [], 80).join("/")}`).join(", ")}`
    );
  }

  const incomingHookIngress = profile.incomingHookIngress || namedSurfaces.incomingHookIngress || {};
  if (cleanText(incomingHookIngress.mode, 120)) {
    focusLines.push(
      `Hook ingress: ${cleanText(incomingHookIngress.mode, 120)} | chain=${normalizeStringArray(incomingHookIngress.executionChain || [], 80).join(" > ")} | generic=${cleanText(incomingHookIngress.genericSpawnPolicy, 120)}`
    );
  }

  const acceptedHooks = normalizeStringArray(incomingHookIngress.acceptedHooks || [], 120);
  if (acceptedHooks.length > 0) {
    focusLines.push(`Accepted hooks: ${acceptedHooks.join(", ")}`);
  }

  if (cleanText(incomingHookIngress.dispatchLane, 120)) {
    focusLines.push(
      `Dispatch bounds: ${cleanText(incomingHookIngress.dispatchLane, 120)} | ${cleanText(incomingHookIngress.dispatchPolicy, 120)} | proof=${cleanText(incomingHookIngress.messagingProof, 120)}`
    );
  }

  const connectorCatalog = profile.leaderCatalogs?.connectorMap || namedSurfaces.leaderCatalogs?.connectorMap || null;
  if (connectorCatalog?.catalogId) {
    focusLines.push(
      `Leader connector catalog: ${cleanText(connectorCatalog.catalogId, 120)} | rows=${Number(connectorCatalog.coverage?.normalizedConnectorRows || 0)} | pin=${cleanText(connectorCatalog.runtimeRoot, 240)} | state=${cleanText(connectorCatalog.pinState, 120)}`
    );
    focusLines.push(
      `Omnichannel index: ${cleanText(connectorCatalog.catalogId, 120)} | leaders=${normalizeStringArray(connectorCatalog.leaderSurfaceIds || [], 80).join(", ")}`
    );
  }

  const deviceSpecificUsbState = profile.deviceSpecificUsbState || null;
  if (deviceSpecificUsbState?.found) {
    focusLines.push(
      `USB surface: ${cleanText(deviceSpecificUsbState.primaryHardwareLabel || "unknown", 160)} | state=${cleanText(deviceSpecificUsbState.adbState, 120)} | named=${cleanText(deviceSpecificUsbState.matchedNamedSurfaceId || "unmapped_observed_device", 120)} | controller=${cleanText(deviceSpecificUsbState.controller?.surfaceId, 120)}/${cleanText(deviceSpecificUsbState.controller?.profileId, 120)}/${cleanText(deviceSpecificUsbState.controller?.pidVersion || deviceSpecificUsbState.controller?.pid, 240)} @ ${cleanText(deviceSpecificUsbState.capturedAt, 80)}`
    );
    focusLines.push(
      `USB gate: transport=${deviceSpecificUsbState.gate?.transportVisible ? "visible" : "not_visible"} | hw=${cleanText(deviceSpecificUsbState.hardwareFreshness || "unknown", 40)}@${cleanText(deviceSpecificUsbState.hardwareObservedAt, 80)} | next=${cleanText(deviceSpecificUsbState.gate?.nextRequiredAction, 160)}`
    );
  }

  const deviceLanguage = profile.deviceLanguage || null;
  if (deviceLanguage?.packetId) {
    focusLines.push(
      `Device language: ${cleanText(deviceLanguage.device?.primaryLabel || "unknown", 160)} | route=${cleanText(deviceLanguage.device?.routeKind, 80)} | surface=${cleanText(deviceLanguage.device?.surfaceId || "observed_device", 120)} | pid=${cleanText(deviceLanguage.controller?.pidVersion || deviceLanguage.controller?.pid, 240)}`
    );
    if (Array.isArray(deviceLanguage.language?.anchorIds) && deviceLanguage.language.anchorIds.length > 0) {
      focusLines.push(`Device anchors: ${deviceLanguage.language.anchorIds.join(", ")}`);
    }
    if (deviceLanguage.memory?.latestMistake?.message) {
      focusLines.push(
        `Device mistake: ${cleanText(deviceLanguage.memory.latestMistake.at, 80)} | ${clipText(deviceLanguage.memory.latestMistake.message, 180)}`
      );
    }
    if (deviceLanguage.mistakeIndex?.indexId) {
      focusLines.push(
        `Mistake index: ${cleanText(deviceLanguage.mistakeIndex.indexId, 160)} | entries=${Number(deviceLanguage.mistakeIndex.entryCount || 0)} | latest=${cleanText(deviceLanguage.mistakeIndex.latestAt, 80)} | keys=${normalizeStringArray(deviceLanguage.mistakeIndex.indexedAs || [], 40).join(", ")}`
      );
    }
    if (deviceLanguage.selfHealing?.tupleId) {
      focusLines.push(
        `Self heal: ${cleanText(deviceLanguage.selfHealing.tupleId, 160)} | pid=${cleanText(deviceLanguage.selfHealing.pidVersion || deviceLanguage.selfHealing.pid, 240)} | profile=${cleanText(deviceLanguage.selfHealing.profileId, 120)} | next=${cleanText(deviceLanguage.selfHealing.nextRequiredAction, 160)}`
      );
    }
    focusLines.push(
      `Time guard: mutation=${cleanText(deviceLanguage.memory?.latestMistake?.at, 80) || "unknown"} | repair=${cleanText(deviceLanguage.selfHealing?.timestamp, 80) || "unknown"} | observe=${cleanText(deviceLanguage.generatedAt, 80) || "unknown"}`
    );
    if (deviceLanguage.omniAgentMap?.mapId) {
      focusLines.push(
        `Omni agent map: ${cleanText(deviceLanguage.omniAgentMap.mapId, 120)} | units=${Number(deviceLanguage.omniAgentMap.unitCount || 0)} | ready=${Number(deviceLanguage.omniAgentMap.readyUnitCount || 0)} | policy=${cleanText(deviceLanguage.omniAgentMap.selectionPolicy, 120)}`
      );
      focusLines.push(
        `Omni roles: root=${cleanText(deviceLanguage.omniAgentMap.primaryPositions?.root, 80)} | ingress=${cleanText(deviceLanguage.omniAgentMap.primaryPositions?.ingress, 80)} | boundary=${cleanText(deviceLanguage.omniAgentMap.primaryPositions?.boundary, 80)} | ability=${cleanText(deviceLanguage.omniAgentMap.primaryPositions?.ability, 80)} | service=${cleanText(deviceLanguage.omniAgentMap.primaryPositions?.service, 80)}`
      );
    }
    if (Array.isArray(deviceLanguage.omniSelectionProofs) && deviceLanguage.omniSelectionProofs.length > 0) {
      focusLines.push(
        `Omni proof: ${deviceLanguage.omniSelectionProofs.map((entry) => `${cleanText(entry.id, 80)}=${entry.result?.found ? cleanText(entry.result?.selected?.id, 80) : "miss"}`).join(", ")}`
      );
    }
    if (Array.isArray(deviceLanguage.floorRepair?.floors) && deviceLanguage.floorRepair.floors.length > 0) {
      focusLines.push(
        `Language floors: ${deviceLanguage.floorRepair.floors.map((entry) => `${cleanText(entry.id, 80)}=${cleanText(entry.state, 80)}`).join(", ")}`
      );
    }
    if (Array.isArray(deviceLanguage.floorRepair?.backlineRepairs) && deviceLanguage.floorRepair.backlineRepairs.length > 0) {
      focusLines.push(
        `Language repairs: ${deviceLanguage.floorRepair.backlineRepairs.map((entry) => `${cleanText(entry.id, 80)}=${cleanText(entry.fix, 120)}`).join(", ")}`
      );
    }
  }

  const wavePlan = profile.wavePlan || null;
  if (wavePlan?.found) {
    focusLines.push(
      `Wave plan: ${cleanText(wavePlan.waveId, 160)} | scouts=${Number(wavePlan.scoutLanes?.length || 0)} | backline=${Number(wavePlan.backlineLanes?.length || 0)} | pulse=${cleanText(wavePlan.pulse?.mode, 120)} -> ${cleanText(wavePlan.pulse?.targetDeviceLabel || wavePlan.pulse?.target, 160)}`
    );
    if (wavePlan.matrix?.totalLeafTests) {
      focusLines.push(
        `Wave matrix: ${Number(wavePlan.matrix.primaryWaveCount || 0)}x${Number(wavePlan.matrix.branchCount || 0)}x${Number(wavePlan.matrix.componentCount || 0)}x${Number(wavePlan.matrix.delayedReflectionCount || 0)} | delay=${cleanText(wavePlan.matrix.delayedReflectionMode, 120)}@${Number(wavePlan.matrix.delayedReflectionStepSeconds || 0)}s | self=${wavePlan.matrix.allowControllerSelfReflection ? "yes" : "no"} | leaf=${Number(wavePlan.matrix.totalLeafTests || 0)}`
      );
    }
  }

  const selfThinkingWaves = profile.selfThinkingWaves || null;
  if (selfThinkingWaves?.waveCount) {
    focusLines.push(
      `Self thinking waves: ${Number(selfThinkingWaves.waveCount || 0)} | method=${cleanText(selfThinkingWaves.discoveryMethod, 40)} | root=${cleanText(selfThinkingWaves.relativeRootPath, 240)} | device=${cleanText(selfThinkingWaves.device?.surfaceId || "observed_device", 120)}`
    );
    focusLines.push(
      `Wave test: pass=${Number(selfThinkingWaves.summary?.passCount || 0)} | warn=${Number(selfThinkingWaves.summary?.warnCount || 0)} | fail=${Number(selfThinkingWaves.summary?.failCount || 0)} | shannon=${normalizeStringArray(selfThinkingWaves.summary?.shannonChain || [], 80).join(">")}`
    );
  }

  const usbMigrationPacket = profile.handoffPackets?.usbMigration || null;
  if (usbMigrationPacket?.manifest?.found) {
    focusLines.push(
      `USB handoff: ${cleanText(usbMigrationPacket.manifest.taskId, 120)} | ${cleanText(usbMigrationPacket.manifest.state, 120)} | ${cleanText(usbMigrationPacket.manifest.sourceHost, 120)} -> ${cleanText(usbMigrationPacket.manifest.targetHost, 120)}`
    );
  } else if (usbMigrationPacket?.packet?.found) {
    focusLines.push(
      `USB handoff: ${cleanText(usbMigrationPacket.packet.title, 160)} | file=${cleanText(usbMigrationPacket.packet.relativePath, 200)}`
    );
  }

  return focusLines.filter(Boolean);
}

function buildLirisLoadProfile(options = {}) {
  const bootstrapConfig = resolveLirisBootstrapConfig(options.bootstrapOptions || {});
  const pidProfile = resolveLatestLirisPidProfile(options);
  const latestHeartbeat = readLatestLirisHeartbeat(options);
  const latestReflection = readLatestLirisReflection(options);

  const curatedMemoryPath = resolveFirstExistingPath(options.memoryPaths || defaultLirisConfigPath("liris-agent-memory.md"));
  const skillToolIndexPath = resolveFirstExistingPath(options.indexPaths || defaultLirisConfigPath("liris-skill-tool-index.md"));
  const curatedMemory = summarizeMarkdownDocument(curatedMemoryPath);
  const skillToolIndex = summarizeMarkdownDocument(skillToolIndexPath);
  const memoryWarnings = detectCuratedMemoryWarnings(readTextFile(curatedMemoryPath, ""), bootstrapConfig);

  const runningIndex = readRunningIndex(options);
  const runningPayload = runningIndex.payload || {};
  const languageFocusIds = normalizeLanguageFocusIds(options.languageFocusIds);
  const languageFocus = selectLanguageFocusDocuments(runningPayload, languageFocusIds);
  const namedSurfaces = buildLirisNamedSurfaceRegistry({
    ...options,
    runningIndexPayload: runningPayload
  });
  const deviceSpecificUsbState = readLatestDeviceSpecificUsbState({
    ...options,
    namedSurfaces,
    pidProfile
  });
  const wavePlan = readOmnishannonWavePlan({
    ...options,
    namedSurfaces,
    deviceSpecificUsbState
  });
  const usbMigrationPacketPath = resolveFirstExistingPath(
    options.usbMigrationPacketPaths || defaultLirisConfigPath("liris-usb-migration-handoff.packet.txt")
  );
  const usbMigrationManifestPath = resolveFirstExistingPath(
    options.usbMigrationManifestPaths || defaultLirisConfigPath("liris-usb-migration-handoff.manifest.json")
  );
  const usbMigrationPacket = summarizeTextPacket(usbMigrationPacketPath);
  const usbMigrationManifest = summarizeJsonPacket(usbMigrationManifestPath);

  const profile = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    loadOrder: ["pid", "memory", "index", "named_surfaces", "host_authority", "hook_ingress", "device_specific_usb", "device_language", "omni_agent_map", "omnishannon_wave", "omnishannon_self_thinking"],
    identity: {
      nodeId: cleanText(bootstrapConfig.nodeId, 80),
      role: cleanText(bootstrapConfig.role, 80),
      operator: cleanText(bootstrapConfig.operator, 80),
      sovereignHost: cleanText(bootstrapConfig.sovereignHost, 120),
      mqttBrokerUrl: cleanText(bootstrapConfig.mqttBrokerUrl, 240),
      mqttTopicPrefix: cleanText(bootstrapConfig.mqttTopicPrefix, 240),
      bridgeRelay: cleanText(bootstrapConfig.bridgeRelay, 240),
      bridgeRoom: cleanText(bootstrapConfig.bridgeRoom, 120),
      headColony: cleanText(bootstrapConfig.identity?.headColony || "", 120),
      authorityMode: cleanText(bootstrapConfig.identity?.authorityMode || "", 120),
      languageVersion: cleanText(bootstrapConfig.identity?.languageVersion || "", 120),
      subColonyClass: cleanText(bootstrapConfig.identity?.subColonyClass || "", 120),
      identityPath: safeRelativePath(bootstrapConfig.identityPath)
    },
    pidProfile,
    memory: {
      curatedMemory,
      latestHeartbeat: latestHeartbeat.latest,
      latestReflection,
      warnings: memoryWarnings
    },
    index: {
      ok: Boolean(runningIndex.ok),
      error: cleanText(runningIndex.error, 320),
      profile: cleanText(runningPayload.profile || "running", 40),
      sourceContract: cleanText(runningPayload.sourceContract || "", 120),
      generatedAt: toIsoDate(runningPayload.generatedAt, ""),
      promotedAt: toIsoDate(runningPayload.promotedAt, ""),
      promotedFromProfile: cleanText(runningPayload.promotedFromProfile, 40),
      documentCount: Number(runningPayload.documentCount || 0),
      signature: cleanText(runningPayload.signature, 80),
      activeSnapshotPath: safeRelativePath(runningPayload.activeSnapshotPath || ""),
      runningManifestPath: safeRelativePath(runningPayload.runningManifestPath || ""),
      skillToolIndex
    },
    languageFocus,
    namedSurfaces,
    hostAuthority: namedSurfaces.hostAuthority || null,
    incomingHookIngress: namedSurfaces.incomingHookIngress || null,
    leaderCatalogs: namedSurfaces.leaderCatalogs || {},
    deviceSpecificUsbState,
    wavePlan,
    handoffPackets: {
      usbMigration: {
        packet: usbMigrationPacket,
        manifest: usbMigrationManifest
      }
    }
  };

  profile.deviceLanguage = buildLirisDeviceLanguagePacket(profile, {
    ...options,
    runningIndexPayload: runningPayload
  });
  profile.omniAgentMap = profile.deviceLanguage?.omniAgentMap || null;
  profile.selfThinkingWaves = buildOmnishannonSelfThinkingWaves(profile, options);
  profile.instantFocus = buildInstantFocus(profile);
  return profile;
}

function getLirisLoadProfilePath(options = {}) {
  const requested = cleanText(options.outputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("liris-index", "load-profile.json");
}

function writeLirisLoadProfile(options = {}) {
  const leaderCatalogMirrorWrite = writeLocalLeaderConnectorCatalogMirror(options);
  const profile = buildLirisLoadProfile(options);
  const outputPath = getLirisLoadProfilePath(options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(profile, null, 2), "utf8");
  fs.renameSync(tempPath, outputPath);
  const deviceLanguageWrite = writeLirisDeviceLanguagePacket(profile.deviceLanguage, options);
  const selfThinkingWaveWrite = writeOmnishannonSelfThinkingWaves(profile.selfThinkingWaves, options);
  return {
    ok: true,
    outputPath,
    relativePath: safeRelativePath(outputPath),
    profile,
    leaderCatalogMirrorWrite,
    deviceLanguageWrite,
    selfThinkingWaveWrite
  };
}

module.exports = {
  DEFAULT_LANGUAGE_FOCUS_IDS,
  buildLirisLoadProfile,
  getLirisLoadProfilePath,
  readLatestLirisHeartbeat,
  readLatestLirisReflection,
  readPidRegistry,
  resolveLatestLirisPidProfile,
  writeLirisLoadProfile
};
