"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { instanceRoot, projectRoot, resolveDataPath } = require("./runtimePaths");

function cleanText(value, max = 320) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
}

function clipText(value, max = 240) {
  const normalized = cleanText(String(value || "").replace(/\s+/g, " "), max + 32);
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function buildPidVersion(pid, timestamp) {
  const normalizedPid = cleanText(pid, 160);
  const normalizedTimestamp = cleanText(timestamp, 80);
  if (normalizedPid && normalizedTimestamp) return `${normalizedPid}@${normalizedTimestamp}`;
  return normalizedPid || normalizedTimestamp || "";
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

function readNdjsonFile(filePath) {
  try {
    return String(fs.readFileSync(filePath, "utf8") || "")
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function resolveFirstExistingPath(candidates = []) {
  for (const candidate of candidates) {
    const normalized = cleanText(candidate, 2000);
    if (normalized && fs.existsSync(normalized)) return normalized;
  }
  return cleanText(candidates[0], 2000);
}

function selectDocs(payload, ids = []) {
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];
  return normalizeStringArray(ids, 40)
    .map((id) => documents.find((entry) => cleanText(entry.id, 40).toUpperCase() === id.toUpperCase()))
    .filter(Boolean)
    .map((entry) => ({
      id: cleanText(entry.id, 40),
      title: cleanText(entry.title, 200),
      type: cleanText(entry.type, 80),
      summary: clipText(entry.summary || entry.body || "", 220)
    }));
}

function defaultMistakePaths() {
  return [
    resolveDataPath("mistake-ledger.ndjson"),
    path.join(projectRoot, "data", "mistake-ledger.ndjson")
  ];
}

function collectDeviceTokens(usbState = {}, deviceSurface = null) {
  const tokens = [
    cleanText(usbState.primaryHardwareLabel, 160),
    cleanText(usbState.matchedNamedSurfaceId, 120),
    cleanText(usbState.matchedNamedSurfaceLabel, 160),
    cleanText(usbState.liveTransport?.serial, 160),
    cleanText(usbState.liveTransport?.model, 160),
    cleanText(usbState.liveTransport?.product, 160),
    cleanText(usbState.liveTransport?.deviceCode, 160)
  ];
  if (deviceSurface) {
    tokens.push(cleanText(deviceSurface.id, 120), cleanText(deviceSurface.label, 160), ...(deviceSurface.aliases || []));
  }
  return normalizeStringArray(tokens, 160);
}

function collectSurfaceTokens(deviceSurface = null) {
  if (!deviceSurface) return [];
  return normalizeStringArray([
    cleanText(deviceSurface.id, 120),
    cleanText(deviceSurface.label, 160),
    ...(deviceSurface.aliases || []),
    cleanText(deviceSurface.transport?.liveSerial, 160),
    cleanText(deviceSurface.transport?.correctedNaming, 160),
    cleanText(deviceSurface.transport?.targetLabel, 160)
  ], 160);
}

function resolveDeviceSurface(profile = {}) {
  const usbState = profile.deviceSpecificUsbState || {};
  const deviceTable = Array.isArray(profile.namedSurfaces?.deviceTable) ? profile.namedSurfaces.deviceTable : [];
  const explicit = cleanText(usbState.matchedNamedSurfaceId, 120);
  if (explicit) {
    return deviceTable.find((entry) => cleanText(entry.id, 120) === explicit) || null;
  }
  const observedTokens = collectDeviceTokens(usbState).map((value) => value.toLowerCase());
  if (observedTokens.length < 1) return null;
  return deviceTable.find((entry) => {
    const aliases = collectSurfaceTokens(entry).map((value) => value.toLowerCase());
    return aliases.some((alias) => alias && observedTokens.some((token) => token.includes(alias) || alias.includes(token)));
  }) || null;
}

function inferRouteKind(usbState = {}) {
  if (cleanText(usbState.liveTransport?.routeKind, 80)) return cleanText(usbState.liveTransport.routeKind, 80);
  if (usbState.gate?.transportVisible) return "usb_visible";
  if (cleanText(usbState.hardwareFreshness, 80) === "last_observed") return "memory_only";
  return "unknown";
}

function buildAnchorIds(profile = {}, deviceSurface = null) {
  const usbState = profile.deviceSpecificUsbState || {};
  const relevantSurfaceIds = new Set(normalizeStringArray([
    cleanText(profile.namedSurfaces?.activationLaw?.primarySurfaceId, 120),
    cleanText(profile.hostAuthority?.derivedIngressSurfaceId, 120),
    cleanText(deviceSurface?.id, 120),
    ...((profile.wavePlan?.scoutLanes || []).map((entry) => cleanText(entry.surfaceId, 120))),
    ...((profile.wavePlan?.backlineLanes || []).map((entry) => cleanText(entry.surfaceId, 120)))
  ], 120));
  const bundleAnchorIds = (Array.isArray(profile.namedSurfaces?.capabilityBundleTable) ? profile.namedSurfaces.capabilityBundleTable : [])
    .filter((entry) => Array.isArray(entry.surfaceIds) && entry.surfaceIds.some((surfaceId) => relevantSurfaceIds.has(cleanText(surfaceId, 120))))
    .flatMap((entry) => entry.anchorIds || []);
  const ids = [
    ...((profile.languageFocus || []).map((entry) => cleanText(entry.id, 40))),
    ...normalizeStringArray(deviceSurface?.lxAnchors || [], 40),
    ...normalizeStringArray(profile.namedSurfaces?.activationLaw?.deviceIsolationAnchors || [], 40),
    ...normalizeStringArray(profile.namedSurfaces?.activationLaw?.quarantineAnchors || [], 40),
    ...normalizeStringArray(profile.wavePlan?.patternIds || [], 40),
    ...normalizeStringArray(bundleAnchorIds, 40),
    "LX-377",
    "LX-380"
  ];
  const transportText = [
    cleanText(usbState.liveTransport?.model, 160),
    cleanText(usbState.liveTransport?.product, 160),
    cleanText(usbState.liveTransport?.deviceCode, 160),
    cleanText(deviceSurface?.id, 120),
    ...(deviceSurface?.aliases || [])
  ].join(" ").toLowerCase();
  if (transportText.includes("sm_a065m") || transportText.includes("a06") || transportText.includes("felipe")) {
    ids.unshift("LX-354");
  }
  return normalizeStringArray(ids, 40).slice(0, 24);
}

function buildDeviceMistakes(profile = {}, deviceSurface = null, options = {}) {
  const tokens = collectDeviceTokens(profile.deviceSpecificUsbState || {}, deviceSurface).map((value) => value.toLowerCase());
  const mistakePath = resolveFirstExistingPath(options.mistakePaths || defaultMistakePaths());
  const rows = readNdjsonFile(mistakePath)
    .filter((entry) => {
      const haystack = JSON.stringify(entry || {}).toLowerCase();
      if (tokens.some((token) => token && haystack.includes(token))) return true;
      return haystack.includes("device")
        || haystack.includes("phone")
        || haystack.includes("usb")
        || cleanText(entry.feature, 80).toLowerCase().includes("device")
        || cleanText(entry.laneId, 80).toLowerCase().includes("device");
    })
    .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime())
    .slice(0, 4)
    .map((entry) => ({
      at: cleanText(entry.at, 80),
      severity: cleanText(entry.severity, 40),
      feature: cleanText(entry.feature, 80),
      laneId: cleanText(entry.laneId, 80),
      message: clipText(entry.message || "", 220),
      avoidance: clipText(entry.avoidance || "", 220),
      indexedAs: normalizeStringArray(entry.context?.indexedAs || [], 40)
    }));
  return {
    mistakePath: safeRelativePath(mistakePath),
    entries: rows
  };
}

function buildControlMap(profile = {}, deviceSurface = null) {
  const activationTable = Array.isArray(profile.namedSurfaces?.activationTable) ? profile.namedSurfaces.activationTable : [];
  const toolProfiles = Array.isArray(profile.namedSurfaces?.toolProfileTable) ? profile.namedSurfaces.toolProfileTable : [];
  const bundles = Array.isArray(profile.namedSurfaces?.capabilityBundleTable) ? profile.namedSurfaces.capabilityBundleTable : [];
  const connectorMap = profile.leaderCatalogs?.connectorMap || {};
  const relevantSurfaceIds = normalizeStringArray([
    cleanText(profile.namedSurfaces?.activationLaw?.primarySurfaceId, 120),
    cleanText(profile.hostAuthority?.ownerSurfaceId, 120),
    cleanText(profile.hostAuthority?.sovereignRootSurfaceId, 120),
    cleanText(profile.hostAuthority?.derivedIngressSurfaceId, 120),
    cleanText(deviceSurface?.id, 120),
    ...((profile.wavePlan?.scoutLanes || []).map((entry) => cleanText(entry.surfaceId, 120))),
    ...((profile.wavePlan?.backlineLanes || []).map((entry) => cleanText(entry.surfaceId, 120)))
  ], 120);
  return {
    relevantSurfaceIds,
    surfaces: activationTable
      .filter((entry) => relevantSurfaceIds.includes(cleanText(entry.surfaceId, 120)))
      .map((entry) => ({
        surfaceId: cleanText(entry.surfaceId, 120),
        state: cleanText(entry.state, 120),
        profileId: cleanText(entry.profileId, 120),
        activePid: cleanText(entry.activePid, 160),
        tools: normalizeStringArray(entry.tools || [], 120),
        skills: normalizeStringArray(entry.skills || [], 120),
        abilityChain: normalizeStringArray(entry.abilityChain || [], 120)
      })),
    bundleIds: bundles
      .filter((entry) => (entry.surfaceIds || []).some((surfaceId) => relevantSurfaceIds.includes(cleanText(surfaceId, 120))))
      .map((entry) => cleanText(entry.id, 120)),
    toolProfileIds: toolProfiles
      .filter((entry) => relevantSurfaceIds.includes(cleanText(entry.surfaceId, 120)))
      .map((entry) => cleanText(entry.id, 120)),
    hookIngress: {
      mode: cleanText(profile.incomingHookIngress?.mode, 120),
      chain: normalizeStringArray(profile.incomingHookIngress?.executionChain || [], 80),
      dispatchLane: cleanText(profile.incomingHookIngress?.dispatchLane, 120),
      dispatchPolicy: cleanText(profile.incomingHookIngress?.dispatchPolicy, 120)
    },
    omnichannelIndex: {
      catalogId: cleanText(connectorMap.catalogId, 120),
      pinState: cleanText(connectorMap.pinState, 120),
      runtimeRoot: cleanText(connectorMap.runtimeRoot, 240),
      sourceRuntimeRoot: cleanText(connectorMap.sourceRuntimeRoot, 240),
      leaderSurfaceIds: normalizeStringArray(connectorMap.leaderSurfaceIds || [], 80)
    },
    computeWatchIds: normalizeStringArray(
      (Array.isArray(profile.hostAuthority?.computeSurfaces) ? profile.hostAuthority.computeSurfaces : [])
        .map((entry) => cleanText(entry.id, 120)),
      120
    ),
    wave: {
      waveId: cleanText(profile.wavePlan?.waveId, 160),
      executionOrder: normalizeStringArray(profile.wavePlan?.executionOrder || [], 80)
    }
  };
}

function buildMistakeIndex(profile = {}, mistakes = {}, deviceSurface = null) {
  const entries = Array.isArray(mistakes.entries) ? mistakes.entries : [];
  const surfaceId = cleanText(
    deviceSurface?.id || profile.deviceSpecificUsbState?.matchedNamedSurfaceId || "observed_device",
    120
  ) || "observed_device";
  const latestEntry = entries[0] || null;
  const indexedAs = normalizeStringArray([
    ...entries.flatMap((entry) => entry.indexedAs || []),
    ...normalizeStringArray(profile.namedSurfaces?.activationLaw?.deviceIsolationAnchors || [], 40),
    ...normalizeStringArray(profile.namedSurfaces?.activationLaw?.quarantineAnchors || [], 40)
  ], 40);
  const laneIds = normalizeStringArray(
    entries.flatMap((entry) => [cleanText(entry.laneId, 80), cleanText(entry.feature, 80)]),
    80
  );
  return {
    indexId: `mistake-index:${surfaceId}`,
    deviceSurfaceId: surfaceId,
    mistakePath: cleanText(mistakes.mistakePath, 240),
    entryCount: entries.length,
    latestAt: cleanText(latestEntry?.at, 80),
    indexedAs,
    laneIds,
    activeLessons: entries.map((entry, index) => ({
      ordinal: index + 1,
      at: cleanText(entry.at, 80),
      severity: cleanText(entry.severity, 40),
      laneId: cleanText(entry.laneId, 80),
      feature: cleanText(entry.feature, 80),
      lesson: clipText(entry.message || "", 220),
      avoidance: clipText(entry.avoidance || "", 220),
      indexedAs: normalizeStringArray(entry.indexedAs || [], 40)
    })),
    signature: cleanText(
      [
        surfaceId,
        cleanText(latestEntry?.at, 80) || "no-mistake",
        String(entries.length),
        indexedAs.join(",")
      ].join("|"),
      240
    )
  };
}

function inferOmniPosition(authorityRole = "", controlState = "") {
  const role = cleanText(authorityRole, 120).toLowerCase();
  const state = cleanText(controlState, 120).toLowerCase();
  if (role.includes("sovereign")) return "host_root";
  if (role.includes("owner")) return "owner_admin";
  if (role.includes("derived_ingress") || state.includes("derived_ingress")) return "derived_ingress";
  if (role.includes("guardrail")) return "guardrail";
  if (role.includes("sequencer")) return "sequencer";
  if (role.includes("anchor")) return "anchor";
  if (role.includes("phone_memory")) return "device_memory";
  if (role.includes("attached_device") || state.includes("transport") || state.includes("wait_adb")) return "device_boundary";
  return "support_surface";
}

function inferOmniRank(position = "") {
  const normalized = cleanText(position, 80).toLowerCase();
  if (normalized === "host_root") return "r0_host_root";
  if (normalized === "owner_admin") return "r1_owner_admin";
  if (normalized === "derived_ingress") return "r2_derived_ingress";
  if (["guardrail", "sequencer", "anchor"].includes(normalized)) return "r3_control_support";
  if (["device_boundary", "device_memory"].includes(normalized)) return "r4_device_boundary";
  if (["automatic_ability", "service_operator", "compute_watch"].includes(normalized)) return "r5_runtime_unit";
  return "r6_support_surface";
}

function inferOmniSelectionState(state = "") {
  const normalized = cleanText(state, 120).toLowerCase();
  if (
    normalized === "owner_gated_execution_root"
    || normalized === "derived_support"
    || normalized === "paired_device_memory"
    || normalized === "usable_now"
    || normalized === "service_ready"
    || normalized === "auto_ready"
  ) {
    return "usable_now";
  }
  if (normalized.includes("derived_ingress")) return "usable_now";
  if (normalized.includes("pending_route") || normalized.includes("transport") || normalized.includes("wait_adb") || normalized.includes("auto_pending")) {
    return "named_ready_pending_route";
  }
  if (normalized.includes("partial")) return "partial_context";
  if (normalized.includes("manual") || normalized.includes("declared")) return "pending_identity";
  if (normalized.includes("idle") || normalized.includes("dormant")) return "named_dormant_until_called";
  return "named_only";
}

function inferDeviceAwareness(unit = {}, packet = {}) {
  const surfaceId = cleanText(unit.surfaceId || unit.deviceSurfaceId, 120);
  const position = cleanText(unit.position, 80).toLowerCase();
  const activeDeviceSurfaceId = cleanText(packet.device?.surfaceId, 120);
  if (surfaceId && activeDeviceSurfaceId && surfaceId === activeDeviceSurfaceId) {
    return "active_device_surface";
  }
  if (position.includes("device")) {
    return "attached_device";
  }
  return "local_host";
}

function buildOmniSelectionKey(unit = {}) {
  return cleanText([
    cleanText(unit.surfaceId || unit.id, 120) || "unnamed_unit",
    cleanText(unit.profileId, 120) || "no_profile",
    cleanText(unit.pidVersion, 240) || "no_pid_version",
    cleanText(unit.deviceSurfaceId, 120) || "no_device",
    cleanText(unit.timestamp, 80) || "no_timestamp"
  ].join("|"), 640);
}

function buildOmniSurfaceUnits(profile = {}, packet = {}) {
  const hostSurfaces = Array.isArray(profile.hostAuthority?.surfaces) ? profile.hostAuthority.surfaces : [];
  const activationMap = new Map(
    (Array.isArray(profile.namedSurfaces?.activationTable) ? profile.namedSurfaces.activationTable : [])
      .map((entry) => [cleanText(entry.surfaceId, 120), entry])
      .filter((entry) => entry[0])
  );
  return hostSurfaces.map((surface) => {
    const activation = activationMap.get(cleanText(surface.surfaceId, 120)) || {};
    const position = inferOmniPosition(surface.authorityRole, surface.controlState);
    const unit = {
      id: cleanText(surface.surfaceId, 120),
      category: "surface",
      unitType: cleanText(surface.kind, 80).includes("device") ? "device_surface" : "agent_surface",
      surfaceId: cleanText(surface.surfaceId, 120),
      profileId: cleanText(surface.profileId || activation.profileId, 120),
      pidVersion: cleanText(activation.activePidVersion || surface.activePid, 240),
      timestamp: cleanText(activation.timestamp || surface.timestamp || packet.generatedAt, 80),
      position,
      rank: inferOmniRank(position),
      authorityRole: cleanText(surface.authorityRole, 120),
      controlState: cleanText(surface.controlState, 120),
      selectionState: inferOmniSelectionState(surface.controlState || activation.state),
      selectionPolicy: "named_only_pid_version_device_time",
      deviceSurfaceId: cleanText(
        cleanText(surface.authorityRole, 120).includes("device") ? surface.surfaceId : packet.device?.surfaceId,
        120
      ),
      serviceType: cleanText(surface.kind, 80) || "surface",
      skills: normalizeStringArray(surface.skills || [], 120),
      tools: normalizeStringArray(surface.tools || [], 120),
      abilityChain: normalizeStringArray(surface.abilityChain || activation.abilityChain || [], 120)
    };
    return {
      ...unit,
      deviceAwareness: inferDeviceAwareness(unit, packet),
      selectionKey: buildOmniSelectionKey(unit)
    };
  });
}

function buildOmniAbilityUnits(packet = {}) {
  return (Array.isArray(packet.abilityActions) ? packet.abilityActions : []).map((entry) => {
    const unit = {
      id: cleanText(entry.id, 120),
      category: "ability",
      unitType: "automatic_ability",
      surfaceId: cleanText(entry.controllerSurfaceId, 120),
      profileId: cleanText(entry.profileId, 120),
      pidVersion: cleanText(entry.pidVersion, 240),
      timestamp: cleanText(entry.timestamp, 80),
      position: "automatic_ability",
      rank: inferOmniRank("automatic_ability"),
      authorityRole: "derived_ability",
      controlState: cleanText(entry.actionState, 120),
      selectionState: inferOmniSelectionState(entry.actionState),
      selectionPolicy: "named_only_pid_version_device_time",
      deviceSurfaceId: cleanText(entry.deviceSurfaceId, 120),
      deviceAwareness: "device_specific",
      serviceType: cleanText(entry.serviceType, 120),
      thinkingMode: cleanText(entry.thinkingMode, 120),
      selfReflectMode: cleanText(entry.selfReflectMode, 120),
      anchorIds: normalizeStringArray(entry.anchorIds || [], 40)
    };
    return {
      ...unit,
      selectionKey: buildOmniSelectionKey(unit)
    };
  });
}

function buildOmniServiceUnits(packet = {}) {
  return (Array.isArray(packet.serviceActions) ? packet.serviceActions : []).map((entry) => {
    const unit = {
      id: cleanText(entry.id, 120),
      category: "service",
      unitType: "service_operator",
      surfaceId: cleanText(entry.controllerSurfaceId, 120),
      profileId: cleanText(entry.profileId, 120),
      pidVersion: cleanText(entry.pidVersion, 240),
      timestamp: cleanText(entry.timestamp, 80),
      position: "service_operator",
      rank: inferOmniRank("service_operator"),
      authorityRole: "derived_service",
      controlState: cleanText(entry.actionState, 120),
      selectionState: inferOmniSelectionState(entry.actionState),
      selectionPolicy: "named_only_pid_version_device_time",
      deviceSurfaceId: cleanText(entry.deviceSurfaceId, 120),
      deviceAwareness: "device_specific",
      serviceType: cleanText(entry.serviceType, 120),
      serviceScope: cleanText(entry.serviceScope, 120),
      selfReflectMode: cleanText(entry.selfReflectMode, 120),
      anchorIds: normalizeStringArray(entry.anchorIds || [], 40)
    };
    return {
      ...unit,
      selectionKey: buildOmniSelectionKey(unit)
    };
  });
}

function buildOmniComputeWatchUnits(packet = {}) {
  return (Array.isArray(packet.computeWatchers) ? packet.computeWatchers : []).map((entry) => {
    const unit = {
      id: cleanText(entry.id, 120),
      category: "compute_watch",
      unitType: "compute_watch",
      surfaceId: cleanText(entry.stewardSurfaceId, 120),
      profileId: "",
      pidVersion: "",
      timestamp: cleanText(entry.timestamp, 80),
      position: "compute_watch",
      rank: inferOmniRank("compute_watch"),
      authorityRole: "watch_surface",
      controlState: cleanText(entry.controlState, 120),
      selectionState: inferOmniSelectionState(entry.controlState),
      selectionPolicy: "named_only_pid_version_device_time",
      deviceSurfaceId: cleanText(cleanText(entry.scope, 120) === "attached_devices" ? packet.device?.surfaceId : "local_host", 120),
      serviceType: cleanText(entry.serviceType, 120),
      watcherSurfaceIds: normalizeStringArray(entry.watcherSurfaceIds || [], 80),
      resources: normalizeStringArray(entry.resources || [], 80)
    };
    return {
      ...unit,
      deviceAwareness: inferDeviceAwareness(unit, packet),
      selectionKey: buildOmniSelectionKey(unit)
    };
  });
}

function buildOmniAgentMap(profile = {}, packet = {}) {
  const units = [
    ...buildOmniSurfaceUnits(profile, packet),
    ...buildOmniAbilityUnits(packet),
    ...buildOmniServiceUnits(packet),
    ...buildOmniComputeWatchUnits(packet)
  ];
  const primaryByPosition = (position) => units.find((entry) => cleanText(entry.position, 80) === position)?.id || "";
  return {
    mapId: "omni-agent-map-v1",
    generatedAt: cleanText(packet.generatedAt, 80),
    selectionPolicy: "named_only_pid_version_device_time",
    keyFields: ["surfaceId", "profileId", "pidVersion", "deviceSurfaceId", "timestamp"],
    unitCount: units.length,
    readyUnitCount: units.filter((entry) => cleanText(entry.selectionState, 80) === "usable_now").length,
    categories: {
      surface: units.filter((entry) => entry.category === "surface").length,
      ability: units.filter((entry) => entry.category === "ability").length,
      service: units.filter((entry) => entry.category === "service").length,
      computeWatch: units.filter((entry) => entry.category === "compute_watch").length
    },
    primaryPositions: {
      root: primaryByPosition("host_root"),
      owner: primaryByPosition("owner_admin"),
      ingress: primaryByPosition("derived_ingress"),
      sequencer: primaryByPosition("sequencer"),
      guardrail: primaryByPosition("guardrail"),
      boundary: primaryByPosition("device_boundary"),
      deviceMemory: primaryByPosition("device_memory"),
      ability: units.find((entry) => entry.category === "ability")?.id || "",
      service: units.find((entry) => entry.category === "service")?.id || ""
    },
    units
  };
}

function matchOmniField(actual, expected) {
  const normalizedExpected = cleanText(expected, 240);
  if (!normalizedExpected) return true;
  return cleanText(actual, 240) === normalizedExpected;
}

function matchOmniDeviceScope(unit = {}, expectedDeviceSurfaceId = "") {
  const normalizedExpected = cleanText(expectedDeviceSurfaceId, 120);
  if (!normalizedExpected) return true;
  const actual = cleanText(unit.deviceSurfaceId, 120);
  if (actual === normalizedExpected) return true;
  const awareness = cleanText(unit.deviceAwareness, 80).toLowerCase();
  if (awareness === "local_host") return true;
  if (actual === "local_host") return true;
  return false;
}

function scoreOmniSelection(unit = {}, criteria = {}) {
  let score = 0;
  if (cleanText(unit.selectionState, 80) === "usable_now") score += 10;
  if (cleanText(unit.pidVersion, 240)) score += 4;
  if (cleanText(unit.deviceSurfaceId, 120) && cleanText(unit.deviceSurfaceId, 120) === cleanText(criteria.deviceSurfaceId, 120)) score += 6;
  if (cleanText(unit.position, 80) && cleanText(unit.position, 80) === cleanText(criteria.position, 80)) score += 6;
  if (cleanText(unit.category, 80) && cleanText(unit.category, 80) === cleanText(criteria.category, 80)) score += 4;
  if (cleanText(unit.id, 120) && cleanText(unit.id, 120) === cleanText(criteria.id, 120)) score += 8;
  const unitTime = new Date(cleanText(unit.timestamp, 80) || 0).getTime();
  if (Number.isFinite(unitTime)) {
    score += Math.floor(unitTime / 100000000000);
  }
  return score;
}

function resolveOmniAgentSelection(omniAgentMap = {}, criteria = {}) {
  const units = Array.isArray(omniAgentMap.units) ? omniAgentMap.units.slice() : [];
  let matches = units.filter((unit) => (
    matchOmniField(unit.id, criteria.id)
    && matchOmniField(unit.category, criteria.category)
    && matchOmniField(unit.position, criteria.position)
    && matchOmniField(unit.surfaceId, criteria.surfaceId)
    && matchOmniField(unit.profileId, criteria.profileId)
    && matchOmniField(unit.pidVersion, criteria.pidVersion)
    && matchOmniDeviceScope(unit, criteria.deviceSurfaceId)
    && matchOmniField(unit.selectionState, criteria.selectionState)
    && matchOmniField(unit.serviceType, criteria.serviceType)
    && matchOmniField(unit.authorityRole, criteria.authorityRole)
  ));

  if (criteria.requireReady) {
    const readyMatches = matches.filter((unit) => cleanText(unit.selectionState, 80) === "usable_now");
    if (readyMatches.length > 0) {
      matches = readyMatches;
    }
  }

  matches.sort((left, right) => scoreOmniSelection(right, criteria) - scoreOmniSelection(left, criteria));
  const selected = matches[0] || null;
  return {
    found: Boolean(selected),
    criteria: {
      id: cleanText(criteria.id, 120),
      category: cleanText(criteria.category, 80),
      position: cleanText(criteria.position, 80),
      surfaceId: cleanText(criteria.surfaceId, 120),
      profileId: cleanText(criteria.profileId, 120),
      pidVersion: cleanText(criteria.pidVersion, 240),
      deviceSurfaceId: cleanText(criteria.deviceSurfaceId, 120),
      selectionState: cleanText(criteria.selectionState, 120),
      serviceType: cleanText(criteria.serviceType, 120),
      authorityRole: cleanText(criteria.authorityRole, 120),
      requireReady: Boolean(criteria.requireReady)
    },
    matchCount: matches.length,
    selected,
    proof: selected
      ? cleanText(`${cleanText(selected.id, 120)}|${cleanText(selected.profileId, 120) || "no_profile"}|${cleanText(selected.pidVersion, 240) || "no_pid_version"}|${cleanText(selected.deviceSurfaceId, 120) || "no_device"}|${cleanText(selected.selectionState, 120)}`, 640)
      : ""
  };
}

function buildOmniSelectionProofs(packet = {}) {
  const omniAgentMap = packet.omniAgentMap || {};
  const deviceSurfaceId = cleanText(packet.device?.surfaceId, 120);
  return [
    {
      id: "ingress-ready-on-device",
      result: resolveOmniAgentSelection(omniAgentMap, {
        position: "derived_ingress",
        deviceSurfaceId,
        requireReady: true
      })
    },
    {
      id: "service-ready-on-device",
      result: resolveOmniAgentSelection(omniAgentMap, {
        category: "service",
        deviceSurfaceId,
        requireReady: true
      })
    },
    {
      id: "boundary-for-falcon",
      result: resolveOmniAgentSelection(omniAgentMap, {
        position: "device_boundary",
        id: "falcon-2",
        requireReady: false
      })
    }
  ];
}

function isRouteLive(packet = {}) {
  const adbState = cleanText(packet.device?.adbState, 120).toLowerCase();
  const routeKind = cleanText(packet.device?.routeKind, 80).toLowerCase();
  return adbState === "authorized_adb"
    || routeKind === "wireless_adb"
    || routeKind === "usb_visible";
}

function buildAbilityActions(profile = {}, packet = {}) {
  const bundles = Array.isArray(profile.namedSurfaces?.capabilityBundleTable) ? profile.namedSurfaces.capabilityBundleTable : [];
  const routeLive = isRouteLive(packet);
  const pidReady = Boolean(cleanText(packet.controller?.pid, 160));
  const profileReady = Boolean(cleanText(packet.controller?.profileId, 120));
  const memoryReady = Boolean(cleanText(packet.memory?.curatedMemoryPath, 240));
  const indexReady = Boolean(cleanText(packet.index?.profile, 40));
  const mistakeReady = Boolean(cleanText(packet.mistakeIndex?.indexId, 160));
  return bundles
    .filter((bundle) => bundle.automaticUse)
    .map((bundle) => {
      let actionState = "blocked";
      if (pidReady && profileReady && memoryReady && indexReady && mistakeReady) {
        actionState = routeLive ? "auto_ready" : "auto_pending";
      } else if (pidReady || profileReady) {
        actionState = "auto_partial";
      }
      return {
        id: cleanText(bundle.id, 120),
        label: cleanText(bundle.label, 160),
        serviceType: cleanText(bundle.serviceType, 120),
        controllerSurfaceId: cleanText(packet.controller?.surfaceId, 120),
        profileId: cleanText(packet.controller?.profileId, 120),
        pid: cleanText(packet.controller?.pid, 160),
        pidVersion: cleanText(packet.controller?.pidVersion || buildPidVersion(packet.controller?.pid, packet.controller?.timestamp), 240),
        timestamp: cleanText(packet.generatedAt, 80),
        deviceSurfaceId: cleanText(packet.device?.surfaceId || "observed_device", 120),
        routeKind: cleanText(packet.device?.routeKind, 80),
        adbState: cleanText(packet.device?.adbState, 120),
        memoryPath: cleanText(packet.memory?.curatedMemoryPath, 240),
        indexProfile: cleanText(packet.index?.profile, 40),
        mistakeIndexId: cleanText(packet.mistakeIndex?.indexId, 160),
        triggerPolicy: cleanText(bundle.automaticUse?.triggerPolicy, 120),
        triggerWhen: normalizeStringArray(bundle.automaticUse?.triggerWhen || [], 120),
        flow: normalizeStringArray(bundle.automaticUse?.flow || [], 120),
        recordTo: normalizeStringArray(bundle.automaticUse?.recordTo || [], 120),
        delayMode: cleanText(bundle.automaticUse?.delayMode, 120),
        reflectionRunsPerWave: Number(bundle.automaticUse?.reflectionRunsPerWave || 0),
        waveSetId: cleanText(bundle.automaticUse?.waveSetId, 160),
        thinkingMode: cleanText(bundle.thinkingMode, 120),
        selfReflectMode: cleanText(bundle.selfReflectMode, 120),
        skills: normalizeStringArray(bundle.skills || [], 120),
        tools: normalizeStringArray(bundle.tools || [], 120),
        anchorIds: normalizeStringArray(bundle.anchorIds || [], 40),
        actionState
      };
    });
}

function buildServiceActions(profile = {}, packet = {}) {
  const bundles = Array.isArray(profile.namedSurfaces?.capabilityBundleTable) ? profile.namedSurfaces.capabilityBundleTable : [];
  const routeLive = isRouteLive(packet);
  return bundles
    .filter((bundle) => cleanText(bundle.category, 80) === "service" || Array.isArray(bundle.partProfiles) && bundle.partProfiles.length > 0)
    .map((bundle) => ({
      id: cleanText(bundle.id, 120),
      label: cleanText(bundle.label, 160),
      serviceType: cleanText(bundle.serviceType, 120),
      serviceScope: cleanText(bundle.serviceScope, 120) || "whole_only",
      controllerSurfaceId: cleanText(packet.controller?.surfaceId, 120),
      profileId: cleanText(packet.controller?.profileId, 120),
      pid: cleanText(packet.controller?.pid, 160),
      pidVersion: cleanText(packet.controller?.pidVersion || buildPidVersion(packet.controller?.pid, packet.controller?.timestamp), 240),
      timestamp: cleanText(packet.generatedAt, 80),
      deviceSurfaceId: cleanText(packet.device?.surfaceId || "observed_device", 120),
      memoryPath: cleanText(packet.memory?.curatedMemoryPath, 240),
      indexProfile: cleanText(packet.index?.profile, 40),
      mistakeIndexId: cleanText(packet.mistakeIndex?.indexId, 160),
      activationGate: cleanText(bundle.activationGate, 120),
      helperPolicy: cleanText(bundle.helperPolicy, 120),
      thinkingMode: cleanText(bundle.thinkingMode, 120),
      selfReflectMode: cleanText(bundle.selfReflectMode, 120),
      recordTo: normalizeStringArray(bundle.recordTo || [], 120),
      anchorIds: normalizeStringArray(bundle.anchorIds || [], 40),
      partProfiles: (Array.isArray(bundle.partProfiles) ? bundle.partProfiles : []).map((part) => ({
        id: cleanText(part.id, 120),
        profileId: cleanText(part.profileId, 120),
        serviceType: cleanText(part.serviceType, 120)
      })),
      actionState: routeLive ? "service_ready" : "service_bounded_pending_route"
    }));
}

function buildComputeWatchers(profile = {}, packet = {}) {
  const computeSurfaces = Array.isArray(profile.hostAuthority?.computeSurfaces) ? profile.hostAuthority.computeSurfaces : [];
  return computeSurfaces.map((surface) => ({
    id: cleanText(surface.id, 120),
    label: cleanText(surface.label, 160),
    serviceType: cleanText(surface.serviceType, 120),
    scope: cleanText(surface.scope, 120),
    stewardSurfaceId: cleanText(surface.stewardSurfaceId, 120),
    watcherSurfaceIds: normalizeStringArray(surface.watcherSurfaceIds || [], 80),
    resources: normalizeStringArray(surface.resources || [], 80),
    controlState: cleanText(surface.controlState, 120),
    timestamp: cleanText(packet.generatedAt, 80)
  }));
}

function buildLeaderIndexPacket(profile = {}, packet = {}) {
  const leaderIndex = profile.namedSurfaces?.leaderIndex || {};
  return {
    catalogId: cleanText(leaderIndex.catalogId, 120),
    summary: cleanText(leaderIndex.summary, 240),
    selectionLaw: cleanText(leaderIndex.selectionLaw, 120),
    replacementRule: cleanText(leaderIndex.replacementRule, 160),
    promotionGate: cleanText(leaderIndex.promotionGate, 160),
    operationalPacketLineLimit: Number(leaderIndex.operationalPacketLineLimit || 35),
    structuralPacketKinds: normalizeStringArray(leaderIndex.structuralPacketKinds || [], 80),
    codeEnvelope: {
      symbolBudget: Number(leaderIndex.codeEnvelope?.symbolBudget || 50),
      designGoal: cleanText(leaderIndex.codeEnvelope?.designGoal, 160),
      mode: cleanText(leaderIndex.codeEnvelope?.mode, 160)
    },
    gnnChain: normalizeStringArray(leaderIndex.gnnChain || packet.controlMap?.hookIngress?.chain || [], 80),
    bodySystem: normalizeStringArray(leaderIndex.bodySystem || [], 80),
    categories: (leaderIndex.categories || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      label: cleanText(entry.label, 160),
      deviceAwareness: cleanText(entry.deviceAwareness, 120),
      pidAwareness: cleanText(entry.pidAwareness, 120),
      selfReflectAware: entry.selfReflectAware !== false,
      planningAware: entry.planningAware !== false,
      gnnAware: entry.gnnAware !== false,
      structural: entry.structural === true,
      subcategories: (entry.subcategories || []).map((subcategory) => ({
        id: cleanText(subcategory.id, 120),
        label: cleanText(subcategory.label, 160)
      }))
    })),
    accessLevels: (leaderIndex.accessLevels || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      label: cleanText(entry.label, 160),
      priority: Number(entry.priority || 99),
      surfaceIds: normalizeStringArray(entry.surfaceIds || [], 120),
      authorityRoles: normalizeStringArray(entry.authorityRoles || [], 120),
      categories: normalizeStringArray(entry.categories || [], 120),
      controlStates: normalizeStringArray(entry.controlStates || [], 120),
      defaultChoiceBundleIds: normalizeStringArray(entry.defaultChoiceBundleIds || [], 120)
    })),
    choiceBundles: (leaderIndex.choiceBundles || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      label: cleanText(entry.label, 160),
      accessLevelIds: normalizeStringArray(entry.accessLevelIds || [], 120),
      categoryIds: normalizeStringArray(entry.categoryIds || [], 120),
      stageIds: normalizeStringArray(entry.stageIds || [], 120),
      bundleIds: normalizeStringArray(entry.bundleIds || [], 120),
      serviceIds: normalizeStringArray(entry.serviceIds || [], 120),
      decisionMode: cleanText(entry.decisionMode, 120)
    })),
    developmentStages: (leaderIndex.developmentStages || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      label: cleanText(entry.label, 160),
      order: Number(entry.order || 99),
      choiceBundleIds: normalizeStringArray(entry.choiceBundleIds || [], 120),
      accessLevelIds: normalizeStringArray(entry.accessLevelIds || [], 120),
      packetLineLimit: Number(entry.packetLineLimit || leaderIndex.operationalPacketLineLimit || 35),
      structural: entry.structural === true,
      defaultActive: entry.defaultActive === true,
      gnnMode: cleanText(entry.gnnMode, 120),
      selfReflectMode: cleanText(entry.selfReflectMode, 120),
      planningMode: cleanText(entry.planningMode, 120)
    })),
    counts: {
      categoryCount: Number(leaderIndex.counts?.categoryCount || 0),
      subcategoryCount: Number(leaderIndex.counts?.subcategoryCount || 0),
      accessLevelCount: Number(leaderIndex.counts?.accessLevelCount || 0),
      choiceBundleCount: Number(leaderIndex.counts?.choiceBundleCount || 0),
      stageCount: Number(leaderIndex.counts?.stageCount || 0)
    }
  };
}

function inferLeaderCategoryId(unit = {}) {
  if (cleanText(unit.category, 80) === "ability") return "ability";
  if (cleanText(unit.category, 80) === "service") return "skill";
  if (cleanText(unit.category, 80) === "compute_watch") return "world_model";
  const position = cleanText(unit.position, 80).toLowerCase();
  if (["host_root", "owner_admin", "derived_ingress", "guardrail", "sequencer", "anchor"].includes(position)) {
    return "root_authority";
  }
  if (["device_boundary", "device_memory"].includes(position)) {
    return "world_model";
  }
  return "omni_map";
}

function inferLeaderSubcategoryIds(unit = {}, leaderIndex = {}) {
  const categoryId = inferLeaderCategoryId(unit);
  const position = cleanText(unit.position, 80).toLowerCase();
  const serviceType = cleanText(unit.serviceType, 120).toLowerCase();
  const rows = [];
  if (categoryId === "memory") {
    rows.push("reflection_memory");
  } else if (categoryId === "rule") {
    rows.push("dispatch_rule");
  } else if (categoryId === "world_model") {
    if (cleanText(unit.category, 80) === "compute_watch") rows.push("gnn_observation");
    if (["device_boundary", "device_memory"].includes(position)) rows.push("device_observation");
    rows.push("route_truth");
  } else if (categoryId === "root_authority") {
    if (position === "host_root" || position === "owner_admin") rows.push("sovereign_root");
    if (position === "derived_ingress") rows.push("derived_ingress");
    if (["guardrail", "sequencer", "anchor"].includes(position)) rows.push("approval_chain");
  } else if (categoryId === "skill") {
    rows.push(serviceType.includes("pentest") ? "service_parts" : "operator_skill");
  } else if (categoryId === "ability") {
    rows.push("self_reflection");
    rows.push("planning");
    if (serviceType.includes("transcription")) rows.push("transcription_injection");
  } else if (categoryId === "omni_map") {
    rows.push("choice_bundle_map");
    rows.push("selection_proof");
  }
  const validIds = new Set(
    (leaderIndex.categories || [])
      .find((entry) => cleanText(entry.id, 120) === categoryId)?.subcategories
      ?.map((entry) => cleanText(entry.id, 120)) || []
  );
  return normalizeStringArray(rows.filter((entry) => validIds.size < 1 || validIds.has(entry)), 120);
}

function resolveLeaderAccessLevel(unit = {}, leaderIndex = {}) {
  const levels = Array.isArray(leaderIndex.accessLevels) ? leaderIndex.accessLevels : [];
  const surfaceId = cleanText(unit.id, 120) || cleanText(unit.surfaceId, 120);
  const authorityRole = cleanText(unit.authorityRole, 120);
  const controlState = cleanText(unit.controlState, 120);
  const categoryId = inferLeaderCategoryId(unit);
  return levels.find((level) => (
    normalizeStringArray(level.surfaceIds || [], 120).includes(surfaceId)
    || normalizeStringArray(level.authorityRoles || [], 120).includes(authorityRole)
    || normalizeStringArray(level.controlStates || [], 120).includes(controlState)
    || normalizeStringArray(level.categories || [], 120).includes(categoryId)
  )) || null;
}

function resolveLeaderChoiceBundleIds(unit = {}, leaderIndex = {}, accessLevel = null) {
  const serviceId = cleanText(unit.id, 120);
  const matchedBundles = (Array.isArray(leaderIndex.choiceBundles) ? leaderIndex.choiceBundles : [])
    .filter((bundle) => (
      normalizeStringArray(bundle.accessLevelIds || [], 120).includes(cleanText(accessLevel?.id, 120))
      || normalizeStringArray(bundle.serviceIds || [], 120).includes(serviceId)
      || normalizeStringArray(bundle.surfaceIds || [], 120).includes(cleanText(unit.surfaceId, 120))
    ))
    .map((bundle) => cleanText(bundle.id, 120));
  return normalizeStringArray([
    ...(accessLevel?.defaultChoiceBundleIds || []),
    ...matchedBundles
  ], 120);
}

function resolveLeaderStageIds(choiceBundleIds = [], leaderIndex = {}) {
  const bundleIdSet = new Set(normalizeStringArray(choiceBundleIds || [], 120));
  return normalizeStringArray(
    (Array.isArray(leaderIndex.developmentStages) ? leaderIndex.developmentStages : [])
      .filter((stage) => normalizeStringArray(stage.choiceBundleIds || [], 120).some((entry) => bundleIdSet.has(entry)))
      .map((stage) => cleanText(stage.id, 120)),
    120
  );
}

function applyLeaderIndexToUnit(unit = {}, packet = {}) {
  const leaderIndex = packet.leaderIndex || {};
  const accessLevel = resolveLeaderAccessLevel(unit, leaderIndex);
  const choiceBundleIds = resolveLeaderChoiceBundleIds(unit, leaderIndex, accessLevel);
  return {
    ...unit,
    leaderCategoryId: inferLeaderCategoryId(unit),
    leaderSubcategoryIds: inferLeaderSubcategoryIds(unit, leaderIndex),
    accessLevelId: cleanText(accessLevel?.id, 120),
    choiceBundleIds,
    developmentStageIds: resolveLeaderStageIds(choiceBundleIds, leaderIndex)
  };
}

function buildPortablePacket(packet = {}) {
  return {
    schemaVersion: 1,
    packetId: cleanText(packet.packetId, 160),
    generatedAt: cleanText(packet.generatedAt, 80),
    host: cleanText(packet.host, 120),
    controller: packet.controller || {},
    device: packet.device || {},
    language: {
      system: cleanText(packet.language?.system, 160),
      anchorIds: normalizeStringArray(packet.language?.anchorIds || [], 40),
      anchorDocs: (packet.language?.anchorDocs || []).map((entry) => ({
        id: cleanText(entry.id, 40),
        title: cleanText(entry.title, 200)
      }))
    },
    memory: {
      latestHeartbeatAt: cleanText(packet.memory?.latestHeartbeatAt, 80),
      latestReflectionAt: cleanText(packet.memory?.latestReflectionAt, 80),
      latestMistakeAt: cleanText(packet.memory?.latestMistake?.at, 80),
      latestMistake: clipText(packet.memory?.latestMistake?.message || "", 220)
    },
    mistakeIndex: {
      indexId: cleanText(packet.mistakeIndex?.indexId, 160),
      deviceSurfaceId: cleanText(packet.mistakeIndex?.deviceSurfaceId, 120),
      entryCount: Number(packet.mistakeIndex?.entryCount || 0),
      latestAt: cleanText(packet.mistakeIndex?.latestAt, 80),
      indexedAs: normalizeStringArray(packet.mistakeIndex?.indexedAs || [], 40),
      signature: cleanText(packet.mistakeIndex?.signature, 240)
    },
    selfHealing: {
      tupleId: cleanText(packet.selfHealing?.tupleId, 160),
      method: cleanText(packet.selfHealing?.method, 120),
      controllerSurfaceId: cleanText(packet.selfHealing?.controllerSurfaceId, 120),
      profileId: cleanText(packet.selfHealing?.profileId, 120),
      pid: cleanText(packet.selfHealing?.pid, 160),
      pidVersion: cleanText(packet.selfHealing?.pidVersion, 240),
      timestamp: cleanText(packet.selfHealing?.timestamp, 80),
      deviceSurfaceId: cleanText(packet.selfHealing?.deviceSurfaceId, 120),
      routeKind: cleanText(packet.selfHealing?.routeKind, 80),
      nextRequiredAction: cleanText(packet.selfHealing?.nextRequiredAction, 160),
      mistakeIndexId: cleanText(packet.selfHealing?.mistakeIndexId, 160),
      waveId: cleanText(packet.selfHealing?.waveId, 160)
    },
    abilityActions: (packet.abilityActions || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      serviceType: cleanText(entry.serviceType, 120),
      actionState: cleanText(entry.actionState, 120),
      triggerPolicy: cleanText(entry.triggerPolicy, 120),
      thinkingMode: cleanText(entry.thinkingMode, 120),
      selfReflectMode: cleanText(entry.selfReflectMode, 120),
      pidVersion: cleanText(entry.pidVersion, 240),
      timestamp: cleanText(entry.timestamp, 80),
      deviceSurfaceId: cleanText(entry.deviceSurfaceId, 120),
      anchorIds: normalizeStringArray(entry.anchorIds || [], 40)
    })),
    serviceActions: (packet.serviceActions || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      serviceType: cleanText(entry.serviceType, 120),
      serviceScope: cleanText(entry.serviceScope, 120),
      actionState: cleanText(entry.actionState, 120),
      pidVersion: cleanText(entry.pidVersion, 240),
      timestamp: cleanText(entry.timestamp, 80),
      partProfiles: (entry.partProfiles || []).map((part) => ({
        id: cleanText(part.id, 120),
        profileId: cleanText(part.profileId, 120),
        serviceType: cleanText(part.serviceType, 120)
      }))
    })),
    computeWatchers: (packet.computeWatchers || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      serviceType: cleanText(entry.serviceType, 120),
      scope: cleanText(entry.scope, 120),
      stewardSurfaceId: cleanText(entry.stewardSurfaceId, 120),
      watcherSurfaceIds: normalizeStringArray(entry.watcherSurfaceIds || [], 80),
      resources: normalizeStringArray(entry.resources || [], 80)
    })),
    omniAgentMap: {
      mapId: cleanText(packet.omniAgentMap?.mapId, 120),
      selectionPolicy: cleanText(packet.omniAgentMap?.selectionPolicy, 120),
      keyFields: normalizeStringArray(packet.omniAgentMap?.keyFields || [], 80),
      unitCount: Number(packet.omniAgentMap?.unitCount || 0),
      readyUnitCount: Number(packet.omniAgentMap?.readyUnitCount || 0),
      primaryPositions: {
        root: cleanText(packet.omniAgentMap?.primaryPositions?.root, 120),
        owner: cleanText(packet.omniAgentMap?.primaryPositions?.owner, 120),
        ingress: cleanText(packet.omniAgentMap?.primaryPositions?.ingress, 120),
        boundary: cleanText(packet.omniAgentMap?.primaryPositions?.boundary, 120),
        ability: cleanText(packet.omniAgentMap?.primaryPositions?.ability, 120),
        service: cleanText(packet.omniAgentMap?.primaryPositions?.service, 120)
      },
      units: (packet.omniAgentMap?.units || []).map((entry) => ({
        id: cleanText(entry.id, 120),
        category: cleanText(entry.category, 80),
        position: cleanText(entry.position, 80),
        rank: cleanText(entry.rank, 80),
        selectionState: cleanText(entry.selectionState, 120),
        profileId: cleanText(entry.profileId, 120),
        pidVersion: cleanText(entry.pidVersion, 240),
        deviceSurfaceId: cleanText(entry.deviceSurfaceId, 120),
        timestamp: cleanText(entry.timestamp, 80)
      }))
    },
    omniSelectionProofs: (packet.omniSelectionProofs || []).map((entry) => ({
      id: cleanText(entry.id, 120),
      found: Boolean(entry.result?.found),
      matchCount: Number(entry.result?.matchCount || 0),
      proof: cleanText(entry.result?.proof, 640)
    })),
    controlMap: packet.controlMap || {},
    shareIntent: {
      target: "usb_remigration",
      summary: "Portable-safe packet so the next host can rehydrate the same device-specific controller state without cold relearn."
    }
  };
}

function buildCompactPortablePacketText(packet = {}) {
  const bundleIds = normalizeStringArray(packet.controlMap?.bundleIds || [], 80).join(",");
  const toolProfileIds = normalizeStringArray(packet.controlMap?.toolProfileIds || [], 80).join(",");
  const hookChain = normalizeStringArray(packet.controlMap?.hookIngress?.chain || [], 40).join(">");
  const omnichannelIndex = packet.controlMap?.omnichannelIndex || {};
  const waveOrder = normalizeStringArray(packet.controlMap?.wave?.executionOrder || [], 40).join(">");
  const anchors = normalizeStringArray(packet.language?.anchorIds || [], 40).join(",");
  const mistakeKeys = normalizeStringArray(packet.mistakeIndex?.indexedAs || [], 40).join(",");
  const primaryAbility = Array.isArray(packet.abilityActions) ? packet.abilityActions[0] || null : null;
  const primaryService = Array.isArray(packet.serviceActions) ? packet.serviceActions[0] || null : null;
  const computeWatch = (packet.computeWatchers || [])
    .map((entry) => `${cleanText(entry.id, 40)}:${normalizeStringArray(entry.watcherSurfaceIds || [], 40).join("+")}`)
    .join("|");
  const omniAgentMap = packet.omniAgentMap || {};
  const omniPrimary = omniAgentMap.primaryPositions || {};
  const primaryProofs = (packet.omniSelectionProofs || [])
    .map((entry) => `${cleanText(entry.id, 40)}:${entry.result?.found ? "ok" : "miss"}`)
    .join("|");
  const timeGuard = [
    `mutation@${cleanText(packet.memory?.latestMistake?.at, 80) || "unknown"}`,
    `repair@${cleanText(packet.selfHealing?.timestamp, 80) || "unknown"}`,
    `observe@${cleanText(packet.generatedAt, 80) || "unknown"}`
  ].join("|");
  const floorStates = (packet.floorRepair?.floors || [])
    .map((entry) => `${cleanText(entry.id, 40)}=${cleanText(entry.state, 40)}`)
    .join(",");
  const repairStates = (packet.floorRepair?.backlineRepairs || [])
    .map((entry) => `${cleanText(entry.id, 40)}=${cleanText(entry.fix, 60)}`)
    .join(",");
  const lines = [
    "@packet liris-device-language-v1",
    `generated=${cleanText(packet.generatedAt, 80)}`,
    `host=${cleanText(packet.host, 80)}`,
    `controller=${cleanText(packet.controller?.surfaceId, 80)}/${cleanText(packet.controller?.profileId, 80)}/${cleanText(packet.controller?.pidVersion || buildPidVersion(packet.controller?.pid, packet.controller?.timestamp), 240)}`,
    `device=${cleanText(packet.device?.surfaceId || "observed_device", 80)}|${cleanText(packet.device?.primaryLabel, 120)}|${cleanText(packet.device?.hardwareLabel, 120)}`,
    `route=${cleanText(packet.device?.routeKind, 80)}|${cleanText(packet.device?.adbState, 80)}|${cleanText(packet.device?.serial, 120)}|${cleanText(packet.device?.model, 120)}`,
    `next=${cleanText(packet.device?.nextRequiredAction, 120)}`,
    `memory=${cleanText(packet.memory?.curatedMemoryPath, 120)}|heartbeat=${cleanText(packet.memory?.latestHeartbeatAt, 80)}|reflection=${cleanText(packet.memory?.latestReflectionAt, 80)}`,
    `index=${cleanText(packet.index?.profile, 40)}|docs=${Number(packet.index?.documentCount || 0)}|sig=${cleanText(packet.index?.signature, 120)}|mistakes=${Number(packet.index?.mistakeEntryCount || 0)}`,
    `mistake_index=${cleanText(packet.mistakeIndex?.indexId, 160)}|latest=${cleanText(packet.mistakeIndex?.latestAt, 80)}|count=${Number(packet.mistakeIndex?.entryCount || 0)}`,
    `mistake_keys=${mistakeKeys}`,
    `anchors=${anchors}`,
    `latest_mistake=${cleanText(packet.memory?.latestMistake?.at, 80)}|${clipText(packet.memory?.latestMistake?.message || "", 180)}`,
    `self_heal=${cleanText(packet.selfHealing?.tupleId, 160)}|${cleanText(packet.selfHealing?.method, 80)}|${cleanText(packet.selfHealing?.pidVersion || buildPidVersion(packet.selfHealing?.pid, packet.selfHealing?.timestamp), 240)}|${cleanText(packet.selfHealing?.deviceSurfaceId, 80)}`,
    `heal_next=${cleanText(packet.selfHealing?.nextRequiredAction, 160)}|wave=${cleanText(packet.selfHealing?.waveId, 120)}|mistake=${cleanText(packet.selfHealing?.mistakeIndexId, 120)}`,
    `hook_mode=${cleanText(packet.controlMap?.hookIngress?.mode, 80)}`,
    `hook_chain=${hookChain}`,
    `dispatch=${cleanText(packet.controlMap?.hookIngress?.dispatchLane, 80)}|${cleanText(packet.controlMap?.hookIngress?.dispatchPolicy, 80)}`,
    `omnichannel_index=${cleanText(omnichannelIndex.catalogId, 80)}|${cleanText(omnichannelIndex.pinState, 80)}`,
    `wave=${cleanText(packet.controlMap?.wave?.waveId, 120)}|${waveOrder}`,
    `bundles=${bundleIds}`,
    `tool_profiles=${toolProfileIds}`,
    `ability_use=${cleanText(primaryAbility?.id, 80)}|${cleanText(primaryAbility?.actionState, 80)}|${cleanText(primaryAbility?.triggerPolicy, 80)}`,
    `ability_flow=${normalizeStringArray(primaryAbility?.flow || [], 40).join(">")}`,
    `service_use=${cleanText(primaryService?.id, 80)}|${cleanText(primaryService?.serviceType, 80)}|${cleanText(primaryService?.serviceScope, 80)}`,
    `compute_watch=${computeWatch}`,
    `omni_map=${cleanText(omniAgentMap.mapId, 80)}|units=${Number(omniAgentMap.unitCount || 0)}|ready=${Number(omniAgentMap.readyUnitCount || 0)}|policy=${cleanText(omniAgentMap.selectionPolicy, 80)}`,
    `omni_roles=root:${cleanText(omniPrimary.root, 40)}|ingress:${cleanText(omniPrimary.ingress, 40)}|boundary:${cleanText(omniPrimary.boundary, 40)}|ability:${cleanText(omniPrimary.ability, 40)}|service:${cleanText(omniPrimary.service, 40)}`,
    `omni_proofs=${primaryProofs}`,
    `time_guard=${timeGuard}`,
    `floors=${floorStates}`,
    `repairs=${repairStates}`,
    "share=usb_remigration|portable_safe_compact"
  ];
  return `${lines.join("\n")}\n`;
}

function buildLanguageFloorModel(profile = {}, packet = {}) {
  const usbState = profile.deviceSpecificUsbState || {};
  const hookIngress = packet.controlMap?.hookIngress || {};
  const portablePath = "data/liris-index/device-language-portable.json";
  const repairTimestamp = cleanText(packet.generatedAt, 80);
  return {
    method: "6x6xomnishannon_floor_up",
    floors: [
      {
        id: "canon_floor",
        law: "canon_memory_sovereign",
        state: cleanText(profile.index?.profile, 80) ? "anchored" : "missing",
        subject: "Forever memory lives in index-backed canon, not in runtime wrappers.",
        evidence: [
          cleanText(profile.index?.profile, 80),
          cleanText(profile.index?.signature, 120),
          cleanText(profile.memory?.curatedMemory?.relativePath, 240)
        ].filter(Boolean)
      },
      {
        id: "identity_floor",
        law: "named_pid_profile_device",
        state: cleanText(packet.controller?.pid, 160) && cleanText(packet.device?.surfaceId, 120) ? "anchored" : "partial",
        subject: "Controller identity must bind PID, profile, and exact named device surface.",
        evidence: [
          cleanText(packet.controller?.surfaceId, 120),
          cleanText(packet.controller?.profileId, 120),
          cleanText(packet.controller?.pid, 160),
          cleanText(packet.device?.surfaceId, 120)
        ].filter(Boolean)
      },
      {
        id: "portal_floor",
        law: "host_lane_surface_device_mode",
        state: cleanText(packet.device?.routeKind, 80) ? "anchored" : "partial",
        subject: "Every live packet must declare host, lane, surface, device, and mode.",
        evidence: [
          cleanText(profile.hostAuthority?.hostScope, 120),
          cleanText(hookIngress.dispatchLane, 120),
          cleanText(packet.controller?.surfaceId, 120),
          cleanText(packet.device?.surfaceId || packet.device?.primaryLabel, 160),
          cleanText(packet.device?.routeKind, 80)
        ].filter(Boolean)
      },
      {
        id: "proof_floor",
        law: "route_then_delivery_then_cross_host",
        state: cleanText(packet.device?.adbState, 120) === "authorized_adb" ? "route_live" : "route_pending",
        subject: "Proof order stays explicit: local route first, delivery second, cross-host only when asked.",
        evidence: [
          cleanText(packet.device?.adbState, 120),
          cleanText(packet.device?.serial, 160),
          cleanText(packet.device?.nextRequiredAction, 160)
        ].filter(Boolean)
      },
      {
        id: "control_floor",
        law: "hookwall_gnn_shannon_execute",
        state: cleanText(hookIngress.mode, 120) ? "anchored" : "partial",
        subject: "Control stays on the declared ingress chain and bounded dispatch surface.",
        evidence: [
          cleanText(hookIngress.mode, 120),
          normalizeStringArray(hookIngress.chain || [], 80).join(" > "),
          cleanText(hookIngress.dispatchPolicy, 120)
        ].filter(Boolean)
      },
      {
        id: "portable_floor",
        law: "portable_safe_rehydration",
        state: "anchored",
        subject: "The next host must rehydrate from a portable-safe packet instead of cold relearn.",
        evidence: [
          portablePath,
          cleanText(packet.generatedAt, 80),
          cleanText(packet.device?.surfaceId || packet.device?.primaryLabel, 160)
        ].filter(Boolean)
      },
      {
        id: "timeline_floor",
        law: "timestamped_mutation_repair_current_state",
        state: cleanText(packet.memory?.latestMistake?.at, 80) && repairTimestamp ? "anchored" : "partial",
        subject: "Reflection must separate historical mutation, later repair, and current observed state instead of flattening them into one claim.",
        evidence: [
          cleanText(packet.memory?.latestMistake?.at, 80),
          repairTimestamp,
          cleanText(packet.generatedAt, 80)
        ].filter(Boolean)
      }
    ],
    backlineRepairs: [
      {
        id: "transport_not_sovereignty",
        issue: "Transport can carry truth but must not silently become authority.",
        fix: cleanText(packet.device?.routeKind, 80) === "wireless_adb"
          ? "wireless_adb_route_explicit"
          : "route_kind_explicit"
      },
      {
        id: "device_drift_guard",
        issue: "Cross-device assumptions collapse control surfaces.",
        fix: cleanText(packet.device?.surfaceId, 120) ? "named_device_surface_pinned" : "device_packet_required"
      },
      {
        id: "hidden_fallback_guard",
        issue: "Implicit fallback recreates lost language failure.",
        fix: cleanText(packet.device?.nextRequiredAction, 160) || "negative_proof_required"
      },
      {
        id: "compression_without_erasure",
        issue: "Compressed packets must keep owner, proof, relation, and route.",
        fix: normalizeStringArray(packet.language?.anchorIds || [], 40).length > 0 ? "anchor_ids_pinned" : "anchor_ids_missing"
      },
      {
        id: "cross_host_gate",
        issue: "Cross-host remigration must stay owner-gated and packet-led.",
        fix: cleanText(profile.hostAuthority?.crossHostLeaseMergePolicy, 80) === "deny"
          ? "cross_host_merge_denied_without_packet"
          : "cross_host_policy_review"
      },
      {
        id: "portable_rehydration",
        issue: "Remigration must load the same state in milliseconds, not relearn it.",
        fix: "portable_safe_packet_exported"
      },
      {
        id: "timestamp_state_guard",
        issue: "Reflection must not confuse repaired current state with historical non-mutation.",
        fix: "mutation_repair_current_state_separated"
      }
    ]
  };
}

function buildLirisDeviceLanguagePacket(profile = {}, options = {}) {
  const deviceSurface = resolveDeviceSurface(profile);
  const usbState = profile.deviceSpecificUsbState || {};
  const anchorIds = buildAnchorIds(profile, deviceSurface);
  const anchorDocs = selectDocs(options.runningIndexPayload || null, anchorIds);
  const mistakes = buildDeviceMistakes(profile, deviceSurface, options);
  const latestMistake = mistakes.entries[0] || null;
  const device = {
    surfaceId: cleanText(deviceSurface?.id, 120),
    surfaceLabel: cleanText(deviceSurface?.label, 160),
    routeKind: inferRouteKind(usbState),
    primaryLabel: cleanText(
      deviceSurface?.label
        || usbState.liveTransport?.model
        || usbState.primaryHardwareLabel,
      160
    ),
    hardwareLabel: cleanText(usbState.primaryHardwareLabel, 160),
    adbState: cleanText(usbState.adbState, 120),
    serial: cleanText(usbState.liveTransport?.serial, 160),
    model: cleanText(usbState.liveTransport?.model, 160),
    product: cleanText(usbState.liveTransport?.product, 160),
    deviceCode: cleanText(usbState.liveTransport?.deviceCode, 160),
    capturedAt: cleanText(usbState.capturedAt, 80),
    hardwareObservedAt: cleanText(usbState.hardwareObservedAt, 80),
    nextRequiredAction: cleanText(usbState.gate?.nextRequiredAction, 160)
  };
  const packet = {
    schemaVersion: 1,
    packetId: "liris-device-language-v1",
    generatedAt: new Date().toISOString(),
    host: cleanText(profile.identity?.nodeId || "liris", 120),
    controller: {
      surfaceId: cleanText(usbState.controller?.surfaceId, 120),
      profileId: cleanText(usbState.controller?.profileId, 120),
      pid: cleanText(usbState.controller?.pid, 160),
      pidVersion: cleanText(usbState.controller?.pidVersion || buildPidVersion(usbState.controller?.pid, usbState.controller?.timestamp), 240),
      timestamp: cleanText(usbState.controller?.timestamp, 80),
      state: cleanText(usbState.controller?.state, 120)
    },
    device,
    language: {
      system: "bidirectional_knowledge_language_v1_device_specific",
      anchorIds,
      anchorDocs,
      executionOrder: normalizeStringArray([
        "memory",
        "index",
        "map",
        "mistake",
        "control"
      ], 80)
    },
    memory: {
      curatedMemoryPath: cleanText(profile.memory?.curatedMemory?.relativePath, 240),
      latestHeartbeatAt: cleanText(profile.memory?.latestHeartbeat?.payloadTs || profile.memory?.latestHeartbeat?.receivedAt, 80),
      latestReflectionAt: cleanText(profile.memory?.latestReflection?.lastReflectionAt, 80),
      latestQuestion: clipText(profile.memory?.latestReflection?.lastQuestion || "", 180),
      latestMistake,
      mistakes: mistakes.entries,
      mistakePath: mistakes.mistakePath
    },
    index: {
      profile: cleanText(profile.index?.profile, 40),
      documentCount: Number(profile.index?.documentCount || 0),
      signature: cleanText(profile.index?.signature, 120),
      activeSnapshotPath: cleanText(profile.index?.activeSnapshotPath, 240)
    },
    controlMap: buildControlMap(profile, deviceSurface)
  };
  packet.mistakeIndex = buildMistakeIndex(profile, mistakes, deviceSurface);
  packet.index.mistakeIndexId = cleanText(packet.mistakeIndex.indexId, 160);
  packet.index.mistakeEntryCount = Number(packet.mistakeIndex.entryCount || 0);
  packet.floorRepair = buildLanguageFloorModel(profile, packet);
  packet.selfHealing = {
    tupleId: `self-heal:${cleanText(packet.device.surfaceId || "observed_device", 120)}`,
    method: "pid_profile_timestamp_device_specific",
    controllerSurfaceId: cleanText(packet.controller.surfaceId, 120),
    profileId: cleanText(packet.controller.profileId, 120),
    pid: cleanText(packet.controller.pid, 160),
    pidVersion: cleanText(packet.controller.pidVersion || buildPidVersion(packet.controller.pid, packet.generatedAt), 240),
    timestamp: cleanText(packet.generatedAt, 80),
    deviceSurfaceId: cleanText(packet.device.surfaceId || "observed_device", 120),
    routeKind: cleanText(packet.device.routeKind, 80),
    adbState: cleanText(packet.device.adbState, 120),
    nextRequiredAction: cleanText(packet.device.nextRequiredAction, 160) || "rebind_and_record",
    mistakeIndexId: cleanText(packet.mistakeIndex.indexId, 160),
    waveId: cleanText(packet.controlMap?.wave?.waveId, 160),
    repairIds: normalizeStringArray((packet.floorRepair?.backlineRepairs || []).map((entry) => entry.id), 80)
  };
  packet.abilityActions = buildAbilityActions(profile, packet);
  packet.serviceActions = buildServiceActions(profile, packet);
  packet.computeWatchers = buildComputeWatchers(profile, packet);
  packet.omniAgentMap = buildOmniAgentMap(profile, packet);
  packet.omniSelectionProofs = buildOmniSelectionProofs(packet);
  packet.portable = buildPortablePacket(packet);
  return packet;
}

function getLirisDeviceLanguagePacketPath(options = {}) {
  const requested = cleanText(options.deviceLanguageOutputPath, 2000);
  if (requested) return path.resolve(requested);
  return resolveDataPath("liris-index", "device-language-packet.json");
}

function getLirisDeviceLanguagePortablePath(options = {}) {
  const requested = cleanText(options.deviceLanguagePortableOutputPath, 2000);
  if (requested) return path.resolve(requested);
  return resolveDataPath("liris-index", "device-language-portable.json");
}

function getLirisDeviceLanguageCompactPortablePath(options = {}) {
  const requested = cleanText(options.deviceLanguageCompactPortableOutputPath, 2000);
  if (requested) return path.resolve(requested);
  return resolveDataPath("liris-index", "device-language-portable.packet.txt");
}

function writeJsonAtomic(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, targetPath);
}

function writeLirisDeviceLanguagePacket(packet, options = {}) {
  const outputPath = getLirisDeviceLanguagePacketPath(options);
  const portablePath = getLirisDeviceLanguagePortablePath(options);
  const compactPortablePath = getLirisDeviceLanguageCompactPortablePath(options);
  writeJsonAtomic(outputPath, packet);
  writeJsonAtomic(portablePath, packet.portable || buildPortablePacket(packet));
  fs.mkdirSync(path.dirname(compactPortablePath), { recursive: true });
  fs.writeFileSync(compactPortablePath, buildCompactPortablePacketText(packet), "utf8");
  return {
    outputPath,
    relativePath: safeRelativePath(outputPath),
    portablePath,
    portableRelativePath: safeRelativePath(portablePath),
    compactPortablePath,
    compactPortableRelativePath: safeRelativePath(compactPortablePath)
  };
}

module.exports = {
  buildLirisDeviceLanguagePacket,
  buildCompactPortablePacketText,
  buildOmniAgentMap,
  resolveOmniAgentSelection,
  getLirisDeviceLanguageCompactPortablePath,
  getLirisDeviceLanguagePacketPath,
  getLirisDeviceLanguagePortablePath,
  writeLirisDeviceLanguagePacket
};
