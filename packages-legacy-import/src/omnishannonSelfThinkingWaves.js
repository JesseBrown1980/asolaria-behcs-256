"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { instanceRoot, projectRoot, resolveDataPath } = require("./runtimePaths");

function cleanText(value, max = 240) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
}

function clipText(value, max = 220) {
  const normalized = cleanText(String(value || "").replace(/\s+/g, " "), max + 32);
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
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
  const rows = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = cleanText(value, max);
    const lower = normalized.toLowerCase();
    if (!normalized || seen.has(lower)) continue;
    seen.add(lower);
    rows.push(normalized);
  }
  return rows;
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

function resolveWaveRoot(options = {}) {
  const requested = cleanText(options.selfThinkingWaveRoot, 2000);
  if (requested) return path.resolve(requested);
  return resolveDataPath("liris-index", "omnishannon-self-waves");
}

function resolvePulseRecordPath(profile = {}, options = {}) {
  const requested = cleanText(options.selfThinkingWaveRecordPath, 2000);
  if (requested) return path.resolve(requested);
  const configured = cleanText(profile.wavePlan?.pulse?.recordPath, 2000);
  if (!configured) return resolveDataPath("liris-index", "omnishannon-wave-pulses.ndjson");
  if (path.isAbsolute(configured)) return configured;
  if (/^[A-Za-z]:[\\/]/.test(configured)) return path.resolve(configured);
  const withoutLeadingData = configured.replace(/^data[\\/]/i, "");
  return resolveDataPath(withoutLeadingData);
}

function summarizeLane(entry = {}) {
  return {
    id: cleanText(entry.id, 120),
    surfaceId: cleanText(entry.surfaceId, 120),
    surfaceLabel: cleanText(entry.surfaceLabel || entry.label, 160),
    profileId: cleanText(entry.profileId, 120),
    pid: cleanText(entry.pid, 160),
    state: cleanText(entry.state, 120),
    question: clipText(entry.question || "", 200)
  };
}

function normalizeChain(values = []) {
  return normalizeStringArray(values, 80);
}

function assessWaveState(waveId, profile = {}, wave = {}) {
  const latestReflectionAt = cleanText(profile.memory?.latestReflection?.lastReflectionAt, 80);
  const curatedMemoryPath = cleanText(profile.deviceLanguage?.memory?.curatedMemoryPath, 240);
  const documentCount = Number(profile.index?.documentCount || 0);
  const signature = cleanText(profile.index?.signature, 120);
  const deviceRoute = cleanText(profile.deviceLanguage?.device?.routeKind, 80);
  const adbState = cleanText(profile.deviceLanguage?.device?.adbState, 80);
  const scoutLanes = Array.isArray(profile.wavePlan?.scoutLanes) ? profile.wavePlan.scoutLanes : [];
  const backlineLanes = Array.isArray(profile.wavePlan?.backlineLanes) ? profile.wavePlan.backlineLanes : [];
  const hookChain = normalizeChain(profile.incomingHookIngress?.executionChain || []);
  const repairIds = normalizeStringArray((profile.deviceLanguage?.floorRepair?.backlineRepairs || []).map((entry) => entry.id), 80);
  const mistakeIndexId = cleanText(profile.deviceLanguage?.mistakeIndex?.indexId, 160);
  const selfHealingTupleId = cleanText(profile.deviceLanguage?.selfHealing?.tupleId, 160);

  if (waveId === "wave-01-memory") {
    if (curatedMemoryPath && latestReflectionAt) return { state: "pass", signal: "memory_reflection_ready" };
    return { state: "warn", signal: "memory_or_reflection_missing" };
  }
  if (waveId === "wave-02-index") {
    if (documentCount > 0 && signature) return { state: "pass", signal: "index_signature_ready" };
    return { state: "fail", signal: "index_not_ready" };
  }
  if (waveId === "wave-03-device") {
    if (deviceRoute && adbState === "authorized_adb") return { state: "pass", signal: "device_route_live" };
    if (deviceRoute) return { state: "warn", signal: "device_route_present_not_live" };
    return { state: "fail", signal: "device_route_missing" };
  }
  if (waveId === "wave-04-scout") {
    if (scoutLanes.length === 6 && (wave.laneSet || []).length === 6) return { state: "pass", signal: "scout_lattice_complete" };
    return { state: "fail", signal: "scout_lattice_incomplete" };
  }
  if (waveId === "wave-05-backline") {
    if (backlineLanes.length === 6 && hookChain.join(">") === "hookwall>GNN>Shannon>execute") {
      return { state: "pass", signal: "backline_shannon_chain_ready" };
    }
    return { state: "warn", signal: "backline_or_chain_incomplete" };
  }
  if (waveId === "wave-06-self-heal") {
    if (mistakeIndexId && selfHealingTupleId && repairIds.length >= 6) return { state: "pass", signal: "self_heal_index_ready" };
    return { state: "fail", signal: "self_heal_index_incomplete" };
  }
  return { state: "warn", signal: "wave_not_classified" };
}

function buildWaveReflection(profile = {}, wave = {}) {
  const latestReflection = profile.memory?.latestReflection || {};
  const latestQuestion = cleanText(latestReflection.lastQuestion, 200);
  const latestReflectionAt = cleanText(latestReflection.lastReflectionAt, 80);
  const hookChain = normalizeChain(profile.incomingHookIngress?.executionChain || []);
  const latestMistakeAt = cleanText(profile.deviceLanguage?.memory?.latestMistake?.at, 80);
  const latestMistakeMessage = clipText(profile.deviceLanguage?.memory?.latestMistake?.message || "", 180);
  const latestRepairAt = cleanText(profile.deviceLanguage?.selfHealing?.timestamp, 80);
  const laneQuestions = normalizeStringArray((wave.laneSet || []).map((entry) => entry.question), 200);
  const assessment = assessWaveState(cleanText(wave.waveId, 120), profile, wave);
  const question = clipText(
    laneQuestions[0] || `${cleanText(wave.title, 120)}: what is the current device-specific truth and does it still hold through Shannon?`,
    200
  );
  const evidence = normalizeStringArray([
    cleanText(profile.deviceLanguage?.device?.surfaceId, 120),
    cleanText(profile.deviceLanguage?.device?.routeKind, 80),
    cleanText(profile.deviceLanguage?.mistakeIndex?.indexId, 160),
    cleanText(profile.deviceLanguage?.selfHealing?.tupleId, 160),
    cleanText(profile.index?.signature, 120)
  ], 160);
  return {
    method: "self_reflection_wave_v1",
    judgedAt: cleanText(wave.generatedAt, 80),
    sourceQuestion: latestQuestion,
    sourceReflectionAt: latestReflectionAt,
    question,
    chain: hookChain,
    state: cleanText(assessment.state, 40),
    signal: cleanText(assessment.signal, 120),
    evidence,
    temporalState: {
      mode: "mutation_repair_current_state",
      mutationAt: latestMistakeAt,
      repairAt: latestRepairAt,
      observedAt: cleanText(wave.generatedAt, 80),
      historicalMutation: latestMistakeMessage,
      currentState: cleanText(assessment.signal, 120)
    }
  };
}

function buildDelayedReflectionSchedule(profile = {}, wave = {}) {
  const matrix = profile.wavePlan?.matrix || {};
  const count = Math.max(1, Number(matrix.delayedReflectionCount || 12));
  const stepSeconds = Math.max(1, Number(matrix.delayedReflectionStepSeconds || 30));
  const baseTime = new Date(cleanText(wave.generatedAt, 80) || Date.now());
  const controller = profile.deviceLanguage?.controller || {};
  const device = profile.deviceLanguage?.device || {};
  return {
    mode: cleanText(matrix.delayedReflectionMode || "single_agent_inherited", 120),
    count,
    stepSeconds,
    allowControllerSelfReflection: matrix.allowControllerSelfReflection !== false,
    totalLeafTests: Math.max(1, Number(matrix.primaryWaveCount || 6))
      * Math.max(1, Number(matrix.branchCount || 6))
      * Math.max(1, Number(matrix.componentCount || 6))
      * count,
    slots: Array.from({ length: count }, (_value, index) => {
      const slotTime = new Date(baseTime.getTime() + ((index + 1) * stepSeconds * 1000));
      return {
        slot: index + 1,
        scheduledAt: slotTime.toISOString(),
        target: cleanText(device.surfaceId || "observed_device", 120),
        controllerPid: cleanText(controller.pidVersion || buildPidVersion(controller.pid, controller.timestamp), 240),
        state: "scheduled"
      };
    })
  };
}

function buildWavePacket(base = {}, spec = {}) {
  const nodes = normalizeStringArray(spec.nodes || [], 160);
  const edges = normalizeStringArray(spec.edges || [], 200);
  const components = normalizeStringArray(spec.components || [], 160);
  const anchors = normalizeStringArray(spec.anchorIds || [], 40);
  const packet = {
    packetId: "omnishannon-self-thinking-wave-v1",
    waveId: cleanText(spec.waveId, 120),
    ordinal: Number(spec.ordinal || 0),
    title: cleanText(spec.title, 160),
    generatedAt: cleanText(base.generatedAt, 80),
    discoveryMethod: "GNN",
    controller: base.controller,
    device: base.device,
    purpose: clipText(spec.purpose || "", 220),
    nodes,
    edges,
    components,
    anchors,
    matrix: base.matrix || {},
    mistakeIndexId: cleanText(base.mistakeIndexId, 160),
    selfHealingTupleId: cleanText(base.selfHealingTupleId, 160),
    nextWaveId: cleanText(spec.nextWaveId, 120),
    laneSet: Array.isArray(spec.laneSet) ? spec.laneSet.map((entry) => summarizeLane(entry)) : [],
    record: {
      indexProfile: cleanText(base.indexProfile, 40),
      indexSignature: cleanText(base.indexSignature, 120),
      timestamp: cleanText(base.generatedAt, 80),
      hostScope: cleanText(base.hostScope, 120)
    }
  };
  packet.selfReflection = buildWaveReflection(base.profile || {}, packet);
  packet.delayedReflection = buildDelayedReflectionSchedule(base.profile || {}, packet);
  packet.test = {
    state: cleanText(packet.selfReflection?.state, 40),
    signal: cleanText(packet.selfReflection?.signal, 120),
    shannonChain: normalizeChain(packet.selfReflection?.chain || [])
  };
  return packet;
}

function buildCompactWavePacketText(wave = {}) {
  const laneIds = normalizeStringArray((wave.laneSet || []).map((entry) => entry.id), 80).join(",");
  const laneSurfaces = normalizeStringArray((wave.laneSet || []).map((entry) => entry.surfaceId), 80).join(",");
  const lines = [
    "@packet omnishannon-self-thinking-wave-v1",
    `wave=${cleanText(wave.waveId, 120)}|${Number(wave.ordinal || 0)}|${cleanText(wave.title, 120)}`,
    `generated=${cleanText(wave.generatedAt, 80)}`,
    `method=${cleanText(wave.discoveryMethod, 40)}`,
    `controller=${cleanText(wave.controller?.surfaceId, 80)}/${cleanText(wave.controller?.profileId, 80)}/${cleanText(wave.controller?.pidVersion || buildPidVersion(wave.controller?.pid, wave.controller?.timestamp), 240)}`,
    `device=${cleanText(wave.device?.surfaceId || "observed_device", 80)}|${cleanText(wave.device?.routeKind, 80)}|${cleanText(wave.device?.adbState, 80)}`,
    `purpose=${clipText(wave.purpose, 180)}`,
    `nodes=${normalizeStringArray(wave.nodes || [], 120).join(",")}`,
    `edges=${normalizeStringArray(wave.edges || [], 160).join(",")}`,
    `components=${normalizeStringArray(wave.components || [], 120).join(",")}`,
    `anchors=${normalizeStringArray(wave.anchors || [], 40).join(",")}`,
    `mistake_index=${cleanText(wave.mistakeIndexId, 160)}`,
    `self_heal=${cleanText(wave.selfHealingTupleId, 160)}`,
    `reflect=${cleanText(wave.selfReflection?.state, 40)}|${cleanText(wave.selfReflection?.judgedAt, 80)}|${cleanText(wave.selfReflection?.signal, 120)}`,
    `time_state=mutation@${cleanText(wave.selfReflection?.temporalState?.mutationAt, 80) || "unknown"}|repair@${cleanText(wave.selfReflection?.temporalState?.repairAt, 80) || "unknown"}|observe@${cleanText(wave.selfReflection?.temporalState?.observedAt, 80) || "unknown"}`,
    `delay=${cleanText(wave.delayedReflection?.mode, 80)}|slots=${Number(wave.delayedReflection?.count || 0)}|step=${Number(wave.delayedReflection?.stepSeconds || 0)}s|self=${wave.delayedReflection?.allowControllerSelfReflection ? "yes" : "no"}`,
    `matrix=${Number(wave.matrix?.primaryWaveCount || 0)}x${Number(wave.matrix?.branchCount || 0)}x${Number(wave.matrix?.componentCount || 0)}x${Number(wave.matrix?.delayedReflectionCount || 0)}|leaf=${Number(wave.delayedReflection?.totalLeafTests || 0)}`,
    `shannon=${normalizeChain(wave.selfReflection?.chain || []).join(">")}`,
    `lanes=${laneIds}`,
    `lane_surfaces=${laneSurfaces}`,
    `next=${cleanText(wave.nextWaveId, 120)}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildOmnishannonSelfThinkingWaves(profile = {}, options = {}) {
  const generatedAt = new Date().toISOString();
  const matrix = profile.wavePlan?.matrix || {};
  const controller = {
    surfaceId: cleanText(profile.deviceLanguage?.controller?.surfaceId, 120),
    profileId: cleanText(profile.deviceLanguage?.controller?.profileId, 120),
    pid: cleanText(profile.deviceLanguage?.controller?.pid, 160),
    pidVersion: cleanText(profile.deviceLanguage?.controller?.pidVersion || buildPidVersion(profile.deviceLanguage?.controller?.pid, profile.deviceLanguage?.controller?.timestamp), 240),
    timestamp: cleanText(profile.deviceLanguage?.controller?.timestamp, 80)
  };
  const device = {
    surfaceId: cleanText(profile.deviceLanguage?.device?.surfaceId || "observed_device", 120) || "observed_device",
    primaryLabel: cleanText(profile.deviceLanguage?.device?.primaryLabel, 160),
    routeKind: cleanText(profile.deviceLanguage?.device?.routeKind, 80),
    adbState: cleanText(profile.deviceLanguage?.device?.adbState, 80),
    serial: cleanText(profile.deviceLanguage?.device?.serial, 160)
  };
  const base = {
    generatedAt,
    controller,
    device,
    profile,
    matrix: {
      primaryWaveCount: Math.max(1, Number(matrix.primaryWaveCount || 6)),
      branchCount: Math.max(1, Number(matrix.branchCount || 6)),
      componentCount: Math.max(1, Number(matrix.componentCount || 6)),
      delayedReflectionCount: Math.max(1, Number(matrix.delayedReflectionCount || 12))
    },
    mistakeIndexId: cleanText(profile.deviceLanguage?.mistakeIndex?.indexId, 160),
    selfHealingTupleId: cleanText(profile.deviceLanguage?.selfHealing?.tupleId, 160),
    indexProfile: cleanText(profile.index?.profile, 40),
    indexSignature: cleanText(profile.index?.signature, 120),
    hostScope: cleanText(profile.hostAuthority?.hostScope, 120)
  };
  const anchorIds = normalizeStringArray(profile.deviceLanguage?.language?.anchorIds || [], 40);
  const bundles = normalizeStringArray(profile.deviceLanguage?.controlMap?.bundleIds || [], 120);
  const toolProfiles = normalizeStringArray(profile.deviceLanguage?.controlMap?.toolProfileIds || [], 120);
  const scoutLanes = Array.isArray(profile.wavePlan?.scoutLanes) ? profile.wavePlan.scoutLanes : [];
  const backlineLanes = Array.isArray(profile.wavePlan?.backlineLanes) ? profile.wavePlan.backlineLanes : [];
  const latestMistake = cleanText(profile.deviceLanguage?.memory?.latestMistake?.message, 220);
  const repairIds = normalizeStringArray((profile.deviceLanguage?.floorRepair?.backlineRepairs || []).map((entry) => entry.id), 80);
  const waveSpecs = [
    {
      waveId: "wave-01-memory",
      ordinal: 1,
      title: "Memory Wave",
      purpose: "Rehydrate the device-specific memory floor before any discovery branch expands.",
      nodes: [
        "controller",
        "curated_memory",
        "latest_heartbeat",
        "latest_reflection",
        "mistake_index"
      ],
      edges: [
        "controller->curated_memory",
        "curated_memory->latest_heartbeat",
        "curated_memory->latest_reflection",
        "curated_memory->mistake_index"
      ],
      components: [
        cleanText(profile.deviceLanguage?.memory?.curatedMemoryPath, 160),
        cleanText(profile.deviceLanguage?.memory?.latestHeartbeatAt, 80),
        cleanText(profile.deviceLanguage?.memory?.latestReflectionAt, 80)
      ],
      anchorIds: anchorIds.slice(0, 4),
      nextWaveId: "wave-02-index"
    },
    {
      waveId: "wave-02-index",
      ordinal: 2,
      title: "Index Wave",
      purpose: "Pin index truth, anchors, and signature so the device does not relearn what the index already knows.",
      nodes: [
        "controller",
        "running_index",
        "anchor_ids",
        "mistake_index"
      ],
      edges: [
        "controller->running_index",
        "running_index->anchor_ids",
        "anchor_ids->mistake_index"
      ],
      components: [
        `profile:${cleanText(profile.index?.profile, 40)}`,
        `docs:${Number(profile.index?.documentCount || 0)}`,
        `sig:${cleanText(profile.index?.signature, 120)}`
      ],
      anchorIds: anchorIds.slice(0, 8),
      nextWaveId: "wave-03-device"
    },
    {
      waveId: "wave-03-device",
      ordinal: 3,
      title: "Device Wave",
      purpose: "Lock exact named device, route, and live transport into the graph before any control expansion.",
      nodes: [
        "controller",
        device.surfaceId,
        cleanText(device.routeKind, 80),
        cleanText(device.serial, 160) || "transport"
      ],
      edges: [
        "controller->device_surface",
        "device_surface->route_kind",
        "route_kind->transport_serial"
      ],
      components: [
        cleanText(profile.deviceLanguage?.device?.primaryLabel, 160),
        cleanText(profile.deviceLanguage?.device?.routeKind, 80),
        cleanText(profile.deviceLanguage?.device?.adbState, 80),
        cleanText(profile.deviceLanguage?.device?.serial, 160)
      ],
      anchorIds: anchorIds.slice(0, 6),
      nextWaveId: "wave-04-scout"
    },
    {
      waveId: "wave-04-scout",
      ordinal: 4,
      title: "Scout Wave",
      purpose: "Run the six named scout lanes to discover host, PID, index, device, memory, and root boundaries.",
      nodes: [
        "scout_lattice",
        ...scoutLanes.map((entry) => cleanText(entry.id, 120))
      ],
      edges: scoutLanes.map((entry) => `scout_lattice->${cleanText(entry.id, 120)}`),
      components: scoutLanes.map((entry) => `${cleanText(entry.id, 120)}:${cleanText(entry.surfaceId, 120)}`),
      anchorIds: anchorIds.slice(0, 8),
      nextWaveId: "wave-05-backline",
      laneSet: scoutLanes
    },
    {
      waveId: "wave-05-backline",
      ordinal: 5,
      title: "Backline Wave",
      purpose: "Run the six named backline lanes to verify provenance, quarantine, route truth, and dispatch bounds.",
      nodes: [
        "backline_lattice",
        ...backlineLanes.map((entry) => cleanText(entry.id, 120))
      ],
      edges: backlineLanes.map((entry) => `backline_lattice->${cleanText(entry.id, 120)}`),
      components: backlineLanes.map((entry) => `${cleanText(entry.id, 120)}:${cleanText(entry.surfaceId, 120)}`),
      anchorIds: anchorIds.slice(0, 8),
      nextWaveId: "wave-06-self-heal",
      laneSet: backlineLanes
    },
    {
      waveId: "wave-06-self-heal",
      ordinal: 6,
      title: "Self-Heal Wave",
      purpose: "Close the loop by binding mistakes, repairs, hook control, and the PID/profile self-heal tuple.",
      nodes: [
        "mistake_index",
        "repair_set",
        "hook_chain",
        "self_heal_tuple"
      ],
      edges: [
        "mistake_index->repair_set",
        "repair_set->hook_chain",
        "hook_chain->self_heal_tuple"
      ],
      components: [
        ...bundles.map((entry) => `bundle:${entry}`),
        ...toolProfiles.map((entry) => `tool:${entry}`),
        ...repairIds.map((entry) => `repair:${entry}`),
        latestMistake ? `lesson:${latestMistake}` : ""
      ],
      anchorIds: anchorIds,
      nextWaveId: "wave-complete"
    }
  ];
  const waves = waveSpecs.map((spec) => buildWavePacket(base, spec));
  const summary = {
    passCount: waves.filter((wave) => cleanText(wave.test?.state, 40) === "pass").length,
    warnCount: waves.filter((wave) => cleanText(wave.test?.state, 40) === "warn").length,
    failCount: waves.filter((wave) => cleanText(wave.test?.state, 40) === "fail").length,
    shannonChain: normalizeChain(profile.incomingHookIngress?.executionChain || []),
    matrix: {
      primaryWaveCount: Math.max(1, Number(matrix.primaryWaveCount || 6)),
      branchCount: Math.max(1, Number(matrix.branchCount || 6)),
      componentCount: Math.max(1, Number(matrix.componentCount || 6)),
      delayedReflectionCount: Math.max(1, Number(matrix.delayedReflectionCount || 12)),
      delayedReflectionMode: cleanText(matrix.delayedReflectionMode || "single_agent_inherited", 120),
      delayedReflectionStepSeconds: Math.max(1, Number(matrix.delayedReflectionStepSeconds || 30)),
      allowControllerSelfReflection: matrix.allowControllerSelfReflection !== false,
      totalLeafTests: Math.max(1, Number(matrix.primaryWaveCount || 6))
        * Math.max(1, Number(matrix.branchCount || 6))
        * Math.max(1, Number(matrix.componentCount || 6))
        * Math.max(1, Number(matrix.delayedReflectionCount || 12))
    }
  };
  return {
    packetId: "omnishannon-self-thinking-v1",
    generatedAt,
    discoveryMethod: "GNN",
    waveSetId: cleanText(profile.wavePlan?.waveId || "omnishannon-6x6-device-specific", 160),
    host: cleanText(profile.identity?.nodeId || "liris", 120),
    rootPath: resolveWaveRoot(options),
    relativeRootPath: safeRelativePath(resolveWaveRoot(options)),
    pulseRecordPath: resolvePulseRecordPath(profile, options),
    pulseRecordRelativePath: safeRelativePath(resolvePulseRecordPath(profile, options)),
    controller,
    device,
    mistakeIndexId: base.mistakeIndexId,
    selfHealingTupleId: base.selfHealingTupleId,
    summary,
    waveCount: waves.length,
    waves: waves.map((wave) => ({
      waveId: wave.waveId,
      ordinal: wave.ordinal,
      title: wave.title,
      purpose: wave.purpose,
      nextWaveId: wave.nextWaveId,
      laneCount: Array.isArray(wave.laneSet) ? wave.laneSet.length : 0,
      testState: cleanText(wave.test?.state, 40),
      testSignal: cleanText(wave.test?.signal, 120)
    })),
    packets: waves
  };
}

function writeJsonAtomic(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, targetPath);
}

function appendPulseRecords(recordPath, packet = {}) {
  if (!recordPath) return;
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  const lines = (packet.packets || []).map((wave) => JSON.stringify({
    at: cleanText(packet.generatedAt, 80),
    packetId: cleanText(packet.packetId, 160),
    waveSetId: cleanText(packet.waveSetId, 160),
    waveId: cleanText(wave.waveId, 120),
    ordinal: Number(wave.ordinal || 0),
    method: "GNN",
    controllerSurfaceId: cleanText(packet.controller?.surfaceId, 120),
    controllerPid: cleanText(packet.controller?.pid, 160),
    deviceSurfaceId: cleanText(packet.device?.surfaceId, 120),
    routeKind: cleanText(packet.device?.routeKind, 80),
    mistakeIndexId: cleanText(packet.mistakeIndexId, 160),
    reflectionState: cleanText(wave.test?.state, 40),
    reflectionSignal: cleanText(wave.test?.signal, 120),
    nextWaveId: cleanText(wave.nextWaveId, 120)
  }));
  if (lines.length > 0) {
    fs.appendFileSync(recordPath, `${lines.join("\n")}\n`, "utf8");
  }
}

function writeOmnishannonSelfThinkingWaves(packet, options = {}) {
  const rootPath = resolveWaveRoot(options);
  fs.mkdirSync(rootPath, { recursive: true });
  const manifest = {
    packetId: cleanText(packet.packetId, 160),
    generatedAt: cleanText(packet.generatedAt, 80),
    discoveryMethod: cleanText(packet.discoveryMethod, 40),
    waveSetId: cleanText(packet.waveSetId, 160),
    waveCount: Number(packet.waveCount || 0),
    host: cleanText(packet.host, 120),
    controller: packet.controller || {},
    device: packet.device || {},
    mistakeIndexId: cleanText(packet.mistakeIndexId, 160),
    selfHealingTupleId: cleanText(packet.selfHealingTupleId, 160),
    summary: packet.summary || {},
    waves: (packet.packets || []).map((wave) => ({
      waveId: cleanText(wave.waveId, 120),
      ordinal: Number(wave.ordinal || 0),
      title: cleanText(wave.title, 160),
      jsonPath: `${cleanText(wave.waveId, 120)}.json`,
      compactPath: `${cleanText(wave.waveId, 120)}.packet.txt`,
      nextWaveId: cleanText(wave.nextWaveId, 120),
      testState: cleanText(wave.test?.state, 40),
      testSignal: cleanText(wave.test?.signal, 120)
    }))
  };
  writeJsonAtomic(path.join(rootPath, "manifest.json"), manifest);
  for (const wave of packet.packets || []) {
    const waveId = cleanText(wave.waveId, 120);
    writeJsonAtomic(path.join(rootPath, `${waveId}.json`), wave);
    fs.writeFileSync(path.join(rootPath, `${waveId}.packet.txt`), buildCompactWavePacketText(wave), "utf8");
  }
  const pulseRecordPath = resolvePulseRecordPath(packet, options);
  appendPulseRecords(pulseRecordPath, packet);
  return {
    rootPath,
    relativeRootPath: safeRelativePath(rootPath),
    manifestPath: path.join(rootPath, "manifest.json"),
    manifestRelativePath: safeRelativePath(path.join(rootPath, "manifest.json")),
    pulseRecordPath,
    pulseRecordRelativePath: safeRelativePath(pulseRecordPath),
    waveCount: Number(packet.waveCount || 0)
  };
}

module.exports = {
  buildCompactWavePacketText,
  buildOmnishannonSelfThinkingWaves,
  writeOmnishannonSelfThinkingWaves
};
