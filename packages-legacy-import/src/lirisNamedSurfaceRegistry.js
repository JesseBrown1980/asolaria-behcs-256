"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { projectRoot, instanceRoot, resolveDataPath } = require("./runtimePaths");
const { buildLeaderConnectorCatalog, collectCatalogPinsForSurface } = require("./leaderConnectorCatalog");

const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: 1,
  activationLaw: {
    name: "rule_canon_instant_law",
    summary: "Load named surfaces instantly and keep generic spawn blocked until a named surface matches.",
    primarySurfaceId: "liris-kuromi",
    genericSpawnPolicy: "deny_without_named_surface",
    unnamedToolDivePolicy: "deny_without_surface_match",
    deviceIsolationAnchors: ["LX-349", "LX-350", "LX-351"],
    quarantineAnchors: ["LX-375", "LX-376"],
    defaultIdentityGate: "named_pid_or_profile"
  },
  hostAuthority: {
    hostScope: "rayssa_machine_only",
    summary: "Keep authority device-specific. The local host stays owner-gated sovereign root while Liris accepts derived ingress only on this machine.",
    sovereignRootSurfaceId: "local-sovereign-host",
    ownerSurfaceId: "asolaria",
    derivedIngressSurfaceId: "liris-kuromi",
    guardrailSurfaceIds: ["gaia", "helm", "sentinel"],
    attachedDeviceBoundaryIds: ["falcon-2", "felipe-phone-a", "felipe-phone-b", "trixie", "debora", "the-beast"],
    crossHostLeaseMergePolicy: "deny",
    sharedSovereigntyPromotionPolicy: "deny",
    computeAuthority: "cpu_gpu_local_only",
    surfaceRoles: [],
    computeSurfaces: []
  },
  incomingHookIngress: {
    mode: "admission_ready_derived_ingress",
    summary: "Accept incoming control hooks as device-local derived ingress into hookwall, GNN, Shannon, then execute.",
    executionChain: ["hookwall", "GNN", "Shannon", "execute"],
    acceptedHooks: ["PermissionRequest", "PermissionDenied", "SessionStart", "SessionEnd", "PostToolUseFailure", "SubagentStart", "SubagentStop"],
    dispatchLane: "agent_dispatch_execute",
    dispatchPolicy: "bounded_to_admitted_work",
    messagingProof: "slack_dual_lane_parity",
    computeHookPolicy: "local_host_until_admission_confirmed",
    directSovereignExecutionPolicy: "deny",
    genericSpawnPolicy: "deny_without_named_surface"
  },
  leaderIndex: {
    catalogId: "leader-omni-index-v1",
    summary: "Leader index for the living omni language.",
    selectionLaw: "named_only_pid_version_device_time",
    replacementRule: "live_language_hold_until_pro_ready",
    promotionGate: "pro_ready_required_for_replacement",
    operationalPacketLineLimit: 35,
    structuralPacketKinds: ["json", "catalog", "manifest", "index_table"],
    codeEnvelope: {
      symbolBudget: 50,
      designGoal: "multi_billion_named_combinations",
      mode: "metatagged_field_composition"
    },
    gnnChain: ["observe", "edge_map", "reflect", "plan", "vote", "prove"],
    bodySystem: ["memory", "rule", "world_model", "root_authority", "skill", "ability", "omni_map"],
    categories: [],
    accessLevels: [],
    choiceBundles: [],
    developmentStages: []
  },
  instantLoadProfiles: [],
  toolProfiles: [],
  capabilityBundles: [],
  namedSurfaces: []
});

function cleanText(value, max = 240) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
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

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
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

function readNdjsonFile(filePath) {
  return readTextFile(filePath, "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
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

function resolveInstantLoadProfile(surface = {}, config = {}) {
  const surfaceId = cleanText(surface.id, 80);
  return (Array.isArray(config.instantLoadProfiles) ? config.instantLoadProfiles : [])
    .find((entry) => cleanText(entry.surfaceId, 80) === surfaceId) || null;
}

function buildInstantLoadSpec(surface = {}, config = {}, hints = {}) {
  const profile = resolveInstantLoadProfile(surface, config) || {};
  const timestamp = cleanText(
    hints.timestamp
      || hints.pid?.spawnedAt
      || hints.evidence?.latestAt
      || "",
    80
  );
  return {
    enabled: profile.instantLoad !== false,
    profileId: cleanText(profile.profileId || (Array.isArray(surface.profileIds) ? surface.profileIds[0] : ""), 120),
    timestamp,
    pidVersion: buildPidVersion(hints.pid?.spawnPid, timestamp),
    tools: normalizeStringArray(
      Array.isArray(profile.tools) && profile.tools.length ? profile.tools : (surface.controlSurfaceRefs || []),
      120
    ),
    skills: normalizeStringArray(profile.skills || [], 120),
    abilityChain: normalizeStringArray(
      Array.isArray(profile.abilityChain) && profile.abilityChain.length ? profile.abilityChain : [surface.id],
      120
    )
  };
}

function expandTemplate(value, runtime = {}) {
  const template = cleanText(value, 800);
  if (!template) {
    return "";
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => cleanText(runtime[key], 400));
}

function buildToolProfileChecks(profile = {}, runtime = {}) {
  const vars = {
    bind: cleanText(runtime.bind, 120) || "127.0.0.1",
    port: Number.isFinite(Number(runtime.port)) ? Number(runtime.port) : 4791,
    compatPort: Number.isFinite(Number(runtime.compatPort)) ? Number(runtime.compatPort) : 4781,
    commsPort: Number.isFinite(Number(runtime.commsPort)) ? Number(runtime.commsPort) : 4798,
    falconAgentUrl: cleanText(runtime.falconAgentUrl, 400)
  };
  return (Array.isArray(profile.checks) ? profile.checks : [])
    .map((check) => {
      const kind = cleanText(check.kind, 40) || "http";
      if (kind === "registry") {
        return {
          id: cleanText(check.id, 80) || "federation_nodes",
          kind: "registry",
          label: cleanText(check.label, 120) || "Federation Nodes"
        };
      }
      const url = expandTemplate(check.urlTemplate || check.url, vars);
      if (!url) {
        return null;
      }
      return {
        id: cleanText(expandTemplate(check.id, vars), 80) || url,
        kind: "http",
        label: cleanText(expandTemplate(check.label, vars), 120) || url,
        url
      };
    })
    .filter(Boolean);
}

function buildToolProfileTable(toolProfiles = [], surfaces = [], config = {}, runtime = {}) {
  const surfaceMap = new Map(
    (Array.isArray(surfaces) ? surfaces : [])
      .map((surface) => [cleanText(surface.id, 80), surface])
      .filter((entry) => entry[0])
  );
  return (Array.isArray(toolProfiles) ? toolProfiles : [])
    .map((profile) => {
      const surfaceId = cleanText(profile.surfaceId, 80);
      const surface = surfaceMap.get(surfaceId) || null;
      const instantLoad = surface ? buildInstantLoadSpec(surface, config, {}) : {
        enabled: false,
        profileId: "",
        timestamp: "",
        tools: [],
        skills: [],
        abilityChain: []
      };
      return {
        id: cleanText(profile.id, 120),
        toolKind: cleanText(profile.toolKind, 80),
        surfaceId,
        hostLabel: cleanText(profile.hostLabel || surface?.label, 120),
        channel: cleanText(profile.channel, 120),
        alertsEnabled: profile.alertsEnabled === true,
        profileId: cleanText(profile.profileId || instantLoad.profileId, 120),
        bundleIds: normalizeStringArray(profile.bundleIds || [], 120),
        tools: normalizeStringArray([...(instantLoad.tools || []), ...(profile.tools || [])], 120),
        skills: normalizeStringArray([...(instantLoad.skills || []), ...(profile.skills || [])], 120),
        abilityChain: normalizeStringArray([...(instantLoad.abilityChain || []), ...(profile.abilityChain || [])], 120),
        checks: buildToolProfileChecks(profile, runtime)
      };
    })
    .filter((entry) => entry.id);
}

function collectBundleSurfaceRows(bundle = {}, activationTable = []) {
  const surfaceIds = new Set(normalizeStringArray(bundle.surfaceIds || [], 80).map((value) => value.toLowerCase()));
  return (Array.isArray(activationTable) ? activationTable : [])
    .filter((row) => surfaceIds.has(cleanText(row.surfaceId, 80).toLowerCase()));
}

function collectBundleToolProfiles(bundle = {}, toolProfileTable = []) {
  const profileIds = new Set(normalizeStringArray(bundle.toolProfileIds || [], 120).map((value) => value.toLowerCase()));
  const toolKinds = new Set(normalizeStringArray(bundle.toolKinds || [], 80).map((value) => value.toLowerCase()));
  return (Array.isArray(toolProfileTable) ? toolProfileTable : [])
    .filter((row) => profileIds.has(cleanText(row.id, 120).toLowerCase()) || toolKinds.has(cleanText(row.toolKind, 80).toLowerCase()));
}

function buildAutomaticUse(bundle = {}) {
  const automaticUse = (bundle && typeof bundle.automaticUse === "object") ? bundle.automaticUse : null;
  if (!automaticUse) {
    return null;
  }
  return {
    triggerPolicy: cleanText(automaticUse.triggerPolicy, 120),
    triggerWhen: normalizeStringArray(automaticUse.triggerWhen || [], 120),
    flow: normalizeStringArray(automaticUse.flow || [], 120),
    recordTo: normalizeStringArray(automaticUse.recordTo || [], 120),
    delayMode: cleanText(automaticUse.delayMode, 120),
    reflectionRunsPerWave: Number.isFinite(Number(automaticUse.reflectionRunsPerWave))
      ? Number(automaticUse.reflectionRunsPerWave)
      : 0,
    waveSetId: cleanText(automaticUse.waveSetId, 160)
  };
}

function buildPartProfiles(bundle = {}) {
  return (Array.isArray(bundle.partProfiles) ? bundle.partProfiles : [])
    .map((profile) => ({
      id: cleanText(profile.id, 120),
      profileId: cleanText(profile.profileId, 120),
      serviceType: cleanText(profile.serviceType, 120),
      tools: normalizeStringArray(profile.tools || [], 120),
      skills: normalizeStringArray(profile.skills || [], 120)
    }))
    .filter((entry) => entry.id);
}

function summarizeBundleState(bundle = {}, surfaceRows = []) {
  const states = (Array.isArray(surfaceRows) ? surfaceRows : [])
    .map((row) => cleanText(row.state, 120).toLowerCase())
    .filter(Boolean);
  const helperPolicy = cleanText(bundle.helperPolicy, 120).toLowerCase();
  if (states.some((state) => ["active_primary", "active_named", "ready_on_demand", "admission_ready_derived_ingress"].includes(state))) {
    return helperPolicy.includes("helper_only") ? "active_helper_only" : "active";
  }
  if (states.some((state) => state.includes("quarantined") || state.includes("transport_visible"))) {
    return "quarantined";
  }
  if (states.some((state) => state.includes("manual_registration") || state.includes("declared"))) {
    return "declared";
  }
  if (states.some((state) => state.includes("dormant") || state.includes("idle") || state.includes("profile"))) {
    return "dormant";
  }
  return cleanText(bundle.defaultState || "declared", 80);
}

function buildCapabilityBundleTable(bundles = [], activationTable = [], toolProfileTable = []) {
  return (Array.isArray(bundles) ? bundles : [])
    .map((bundle) => {
      const surfaceRows = collectBundleSurfaceRows(bundle, activationTable);
      const toolRows = collectBundleToolProfiles(bundle, toolProfileTable);
      return {
        id: cleanText(bundle.id, 120),
        label: cleanText(bundle.label || bundle.id, 160),
        category: cleanText(bundle.category, 80) || "composite",
        serviceType: cleanText(bundle.serviceType, 120),
        serviceScope: cleanText(bundle.serviceScope, 120),
        summary: clipText(bundle.summary || bundle.note || "", 280),
        state: summarizeBundleState(bundle, surfaceRows),
        activationGate: cleanText(bundle.activationGate, 120),
        helperPolicy: cleanText(bundle.helperPolicy, 120),
        proofsRequired: normalizeStringArray(bundle.proofsRequired || [], 120),
        anchorIds: normalizeStringArray(bundle.anchorIds || [], 40),
        thinkingMode: cleanText(bundle.thinkingMode, 120),
        selfReflectMode: cleanText(bundle.selfReflectMode, 120),
        recordTo: normalizeStringArray(bundle.recordTo || [], 120),
        automaticUse: buildAutomaticUse(bundle),
        partProfiles: buildPartProfiles(bundle),
        surfaceIds: normalizeStringArray(bundle.surfaceIds || [], 80),
        surfaceStates: surfaceRows.map((row) => `${cleanText(row.surfaceId, 80)}:${cleanText(row.state, 120)}`),
        toolKinds: normalizeStringArray(bundle.toolKinds || [], 80),
        toolProfileIds: normalizeStringArray([...(bundle.toolProfileIds || []), ...toolRows.map((row) => row.id)], 120),
        profileIds: normalizeStringArray([
          ...surfaceRows.map((row) => row.profileId),
          ...toolRows.map((row) => row.profileId)
        ], 120),
        tools: normalizeStringArray([
          ...(bundle.tools || []),
          ...surfaceRows.flatMap((row) => row.tools || []),
          ...toolRows.flatMap((row) => row.tools || [])
        ], 120),
        skills: normalizeStringArray([
          ...(bundle.skills || []),
          ...surfaceRows.flatMap((row) => row.skills || []),
          ...toolRows.flatMap((row) => row.skills || [])
        ], 120),
        abilityChain: normalizeStringArray([
          ...(bundle.abilityChain || []),
          ...surfaceRows.flatMap((row) => row.abilityChain || []),
          ...toolRows.flatMap((row) => row.abilityChain || [])
        ], 120)
      };
    })
    .filter((entry) => entry.id);
}

function buildConsiderationTable(bundleTable = []) {
  return (Array.isArray(bundleTable) ? bundleTable : [])
    .map((bundle) => ({
      id: cleanText(bundle.id, 120),
      label: cleanText(bundle.label, 160),
      state: cleanText(bundle.state, 80),
      serviceType: cleanText(bundle.serviceType, 120),
      activationGate: cleanText(bundle.activationGate, 120),
      helperPolicy: cleanText(bundle.helperPolicy, 120),
      proofsRequired: normalizeStringArray(bundle.proofsRequired || [], 120),
      anchorIds: normalizeStringArray(bundle.anchorIds || [], 40),
      automaticUse: bundle.automaticUse ? {
        triggerPolicy: cleanText(bundle.automaticUse.triggerPolicy, 120),
        triggerWhen: normalizeStringArray(bundle.automaticUse.triggerWhen || [], 120)
      } : null,
      summary: cleanText(bundle.summary, 280)
    }));
}

function collectBundleIdsForSurface(surfaceId, bundleTable = []) {
  const normalizedId = cleanText(surfaceId, 80).toLowerCase();
  if (!normalizedId) {
    return [];
  }
  return normalizeStringArray(
    (Array.isArray(bundleTable) ? bundleTable : [])
      .filter((bundle) => Array.isArray(bundle.surfaceIds) && bundle.surfaceIds.some((entry) => cleanText(entry, 80).toLowerCase() === normalizedId))
      .map((bundle) => bundle.id),
    120
  );
}

function inferHostAuthorityRole(surfaceRole = {}, activationRow = null, hostAuthority = {}) {
  const explicit = cleanText(surfaceRole.authorityRole, 120);
  if (explicit) {
    return explicit;
  }
  const surfaceId = cleanText(surfaceRole.surfaceId || surfaceRole.memberId, 80);
  if (surfaceId && surfaceId === cleanText(hostAuthority.sovereignRootSurfaceId, 80)) {
    return "sovereign_root";
  }
  if (surfaceId && surfaceId === cleanText(hostAuthority.ownerSurfaceId, 80)) {
    return "owner_admin";
  }
  if (surfaceId && surfaceId === cleanText(hostAuthority.derivedIngressSurfaceId, 80)) {
    return "derived_ingress";
  }
  if (normalizeStringArray(hostAuthority.guardrailSurfaceIds || [], 80).includes(surfaceId)) {
    return "derived_support";
  }
  if (normalizeStringArray(hostAuthority.attachedDeviceBoundaryIds || [], 80).includes(surfaceId)) {
    return "attached_device_boundary";
  }
  const kind = cleanText(surfaceRole.kind || activationRow?.kind, 80).toLowerCase();
  if (kind === "device" || kind === "device_profile" || kind === "device_boundary") {
    return "attached_device_boundary";
  }
  return "support_surface";
}

function inferHostControlState(surfaceRole = {}, activationRow = null, hostAuthority = {}) {
  const explicit = cleanText(surfaceRole.controlState, 120);
  if (explicit) {
    return explicit;
  }
  const surfaceId = cleanText(surfaceRole.surfaceId || surfaceRole.memberId, 80);
  if (surfaceId && (
    surfaceId === cleanText(hostAuthority.sovereignRootSurfaceId, 80)
    || surfaceId === cleanText(hostAuthority.ownerSurfaceId, 80)
  )) {
    return "owner_gated_execution_root";
  }
  if (surfaceId && surfaceId === cleanText(hostAuthority.derivedIngressSurfaceId, 80)) {
    return "admission_ready_derived_ingress";
  }
  if (normalizeStringArray(hostAuthority.attachedDeviceBoundaryIds || [], 80).includes(surfaceId)) {
    return "attached_device_boundary";
  }
  const state = cleanText(activationRow?.state, 120).toLowerCase();
  if (state.includes("admission_ready")) return "admission_ready_derived_ingress";
  if (state.includes("transport") || state.includes("quarantined")) return "transport_gated_boundary";
  if (state.includes("wait_adb")) return "wait_adb";
  if (state.includes("manual") || state.includes("declared") || state.includes("profile")) return "declared_boundary";
  if (state.includes("dormant") || state.includes("idle")) return "derived_support";
  return "derived_support";
}

function buildHostAuthority(config = {}, activationTable = [], capabilityBundleTable = [], leaderCatalog = null) {
  const hostAuthority = {
    ...DEFAULT_CONFIG.hostAuthority,
    ...((config && typeof config.hostAuthority === "object") ? config.hostAuthority : {})
  };
  const activationMap = new Map(
    (Array.isArray(activationTable) ? activationTable : [])
      .map((row) => [cleanText(row.surfaceId, 80), row])
      .filter((entry) => entry[0])
  );
  const surfaceDefs = Array.isArray(hostAuthority.surfaceRoles) && hostAuthority.surfaceRoles.length
    ? hostAuthority.surfaceRoles
    : Array.from(activationMap.keys()).map((surfaceId) => ({ surfaceId }));
  const surfaces = surfaceDefs.map((surfaceRole) => {
    const surfaceId = cleanText(surfaceRole.surfaceId || surfaceRole.memberId, 80);
    const activationRow = activationMap.get(surfaceId) || null;
    return {
      surfaceId,
      label: cleanText(surfaceRole.label || activationRow?.label || surfaceId, 160),
      kind: cleanText(surfaceRole.kind || activationRow?.kind || "support_surface", 80),
      state: cleanText(surfaceRole.state || activationRow?.state || "declared", 120),
      authorityRole: inferHostAuthorityRole(surfaceRole, activationRow, hostAuthority),
      controlState: inferHostControlState(surfaceRole, activationRow, hostAuthority),
      responsibility: clipText(surfaceRole.responsibility || "", 220),
      profileId: cleanText(surfaceRole.profileId || activationRow?.profileId, 120),
      timestamp: cleanText(surfaceRole.timestamp || activationRow?.timestamp, 80),
      activePid: cleanText(surfaceRole.activePid || activationRow?.activePid, 160),
      bundleIds: normalizeStringArray([...(surfaceRole.bundleIds || []), ...collectBundleIdsForSurface(surfaceId, capabilityBundleTable)], 120),
      catalogPins: collectCatalogPinsForSurface(surfaceId, leaderCatalog),
      tools: normalizeStringArray([...(activationRow?.tools || []), ...(surfaceRole.tools || [])], 120),
      skills: normalizeStringArray([...(activationRow?.skills || []), ...(surfaceRole.skills || [])], 120),
      abilityChain: normalizeStringArray([...(activationRow?.abilityChain || []), ...(surfaceRole.abilityChain || [])], 120),
      exactNameRequired: activationRow ? Boolean(activationRow.exactNameRequired) : true
    };
  }).filter((entry) => entry.surfaceId);
  const computeSurfaces = (Array.isArray(hostAuthority.computeSurfaces) ? hostAuthority.computeSurfaces : [])
    .map((surface) => ({
      id: cleanText(surface.id, 120),
      label: cleanText(surface.label || surface.id, 160),
      serviceType: cleanText(surface.serviceType, 120),
      scope: cleanText(surface.scope, 120),
      stewardSurfaceId: cleanText(surface.stewardSurfaceId || hostAuthority.ownerSurfaceId, 80),
      watcherSurfaceIds: normalizeStringArray(surface.watcherSurfaceIds || [], 80),
      resources: normalizeStringArray(surface.resources || [], 80),
      controlState: cleanText(surface.controlState, 120),
      anchorIds: normalizeStringArray(surface.anchorIds || [], 40),
      summary: clipText(surface.summary || "", 220)
    }))
    .filter((entry) => entry.id);
  return {
    hostScope: cleanText(hostAuthority.hostScope, 120),
    summary: clipText(hostAuthority.summary || "", 280),
    sovereignRootSurfaceId: cleanText(hostAuthority.sovereignRootSurfaceId, 80),
    ownerSurfaceId: cleanText(hostAuthority.ownerSurfaceId, 80),
    derivedIngressSurfaceId: cleanText(hostAuthority.derivedIngressSurfaceId, 80),
    guardrailSurfaceIds: normalizeStringArray(hostAuthority.guardrailSurfaceIds || [], 80),
    attachedDeviceBoundaryIds: normalizeStringArray(hostAuthority.attachedDeviceBoundaryIds || [], 80),
    crossHostLeaseMergePolicy: cleanText(hostAuthority.crossHostLeaseMergePolicy, 120),
    sharedSovereigntyPromotionPolicy: cleanText(hostAuthority.sharedSovereigntyPromotionPolicy, 120),
    computeAuthority: cleanText(hostAuthority.computeAuthority, 120),
    surfaces,
    computeSurfaces,
    counts: {
      surfaceCount: surfaces.length,
      derivedIngressCount: surfaces.filter((entry) => cleanText(entry.controlState, 120).includes("derived_ingress")).length,
      attachedDeviceCount: surfaces.filter((entry) => cleanText(entry.authorityRole, 120).includes("attached_device")).length,
      localRootCount: surfaces.filter((entry) => cleanText(entry.controlState, 120) === "owner_gated_execution_root").length
    }
  };
}

function buildIncomingHookIngress(config = {}, hostAuthority = {}, activationLaw = {}) {
  const incomingHookIngress = {
    ...DEFAULT_CONFIG.incomingHookIngress,
    ...((config && typeof config.incomingHookIngress === "object") ? config.incomingHookIngress : {})
  };
  return {
    mode: cleanText(incomingHookIngress.mode, 120),
    summary: clipText(incomingHookIngress.summary || "", 280),
    hostScope: cleanText(hostAuthority.hostScope, 120),
    derivedIngressSurfaceId: cleanText(hostAuthority.derivedIngressSurfaceId, 80),
    executionChain: normalizeStringArray(incomingHookIngress.executionChain || [], 80),
    acceptedHooks: normalizeStringArray(incomingHookIngress.acceptedHooks || [], 120),
    dispatchLane: cleanText(incomingHookIngress.dispatchLane, 120),
    dispatchPolicy: cleanText(incomingHookIngress.dispatchPolicy, 120),
    messagingProof: cleanText(incomingHookIngress.messagingProof, 120),
    computeHookPolicy: cleanText(incomingHookIngress.computeHookPolicy, 160),
    directSovereignExecutionPolicy: cleanText(incomingHookIngress.directSovereignExecutionPolicy, 120),
    genericSpawnPolicy: cleanText(incomingHookIngress.genericSpawnPolicy || activationLaw.genericSpawnPolicy, 120)
  };
}

function buildLeaderIndexCategories(leaderIndex = {}, incomingHookIngress = {}) {
  return (Array.isArray(leaderIndex.categories) ? leaderIndex.categories : [])
    .map((category) => ({
      id: cleanText(category.id, 120),
      label: cleanText(category.label || category.id, 160),
      summary: clipText(category.summary || "", 220),
      deviceAwareness: cleanText(category.deviceAwareness, 120) || "device_specific",
      pidAwareness: cleanText(category.pidAwareness, 120) || "pid_version_required",
      selfReflectAware: category.selfReflectAware !== false,
      planningAware: category.planningAware !== false,
      gnnAware: category.gnnAware !== false,
      structural: category.structural === true,
      gnnChain: normalizeStringArray(category.gnnChain || leaderIndex.gnnChain || incomingHookIngress.executionChain || [], 80),
      subcategories: (Array.isArray(category.subcategories) ? category.subcategories : [])
        .map((subcategory) => ({
          id: cleanText(subcategory.id, 120),
          label: cleanText(subcategory.label || subcategory.id, 160),
          summary: clipText(subcategory.summary || "", 180),
          deviceAwareness: cleanText(subcategory.deviceAwareness || category.deviceAwareness, 120) || "device_specific",
          pidAwareness: cleanText(subcategory.pidAwareness || category.pidAwareness, 120) || "pid_version_required",
          selfReflectAware: subcategory.selfReflectAware !== false,
          planningAware: subcategory.planningAware !== false,
          gnnAware: subcategory.gnnAware !== false
        }))
        .filter((entry) => entry.id)
    }))
    .filter((entry) => entry.id);
}

function buildLeaderChoiceBundles(leaderIndex = {}, capabilityBundleTable = []) {
  const bundleMap = new Map(
    (Array.isArray(capabilityBundleTable) ? capabilityBundleTable : [])
      .map((entry) => [cleanText(entry.id, 120), entry])
      .filter((entry) => entry[0])
  );
  return (Array.isArray(leaderIndex.choiceBundles) ? leaderIndex.choiceBundles : [])
    .map((bundle) => {
      const linkedBundles = normalizeStringArray(bundle.bundleIds || [], 120)
        .map((bundleId) => bundleMap.get(bundleId))
        .filter(Boolean);
      return {
        id: cleanText(bundle.id, 120),
        label: cleanText(bundle.label || bundle.id, 160),
        summary: clipText(bundle.summary || "", 220),
        decisionMode: cleanText(bundle.decisionMode, 120),
        accessLevelIds: normalizeStringArray(bundle.accessLevelIds || [], 120),
        categoryIds: normalizeStringArray(bundle.categoryIds || [], 120),
        stageIds: normalizeStringArray(bundle.stageIds || [], 120),
        bundleIds: normalizeStringArray(bundle.bundleIds || [], 120),
        serviceIds: normalizeStringArray(bundle.serviceIds || [], 120),
        surfaceIds: normalizeStringArray(bundle.surfaceIds || [], 120),
        planningAware: bundle.planningAware !== false,
        selfReflectAware: bundle.selfReflectAware !== false,
        gnnAware: bundle.gnnAware !== false,
        tools: normalizeStringArray([
          ...(bundle.tools || []),
          ...linkedBundles.flatMap((entry) => entry.tools || [])
        ], 120),
        skills: normalizeStringArray([
          ...(bundle.skills || []),
          ...linkedBundles.flatMap((entry) => entry.skills || [])
        ], 120)
      };
    })
    .filter((entry) => entry.id);
}

function buildLeaderAccessLevels(leaderIndex = {}, hostAuthority = {}, choiceBundles = []) {
  return (Array.isArray(leaderIndex.accessLevels) ? leaderIndex.accessLevels : [])
    .map((level) => {
      const explicitChoiceBundleIds = normalizeStringArray(level.defaultChoiceBundleIds || [], 120);
      const linkedChoiceBundleIds = choiceBundles
        .filter((bundle) => normalizeStringArray(bundle.accessLevelIds || [], 120).includes(cleanText(level.id, 120)))
        .map((bundle) => bundle.id);
      return {
        id: cleanText(level.id, 120),
        label: cleanText(level.label || level.id, 160),
        summary: clipText(level.summary || "", 220),
        priority: Number.isFinite(Number(level.priority)) ? Number(level.priority) : 99,
        surfaceIds: normalizeStringArray(level.surfaceIds || [], 120),
        authorityRoles: normalizeStringArray(level.authorityRoles || [], 120),
        categories: normalizeStringArray(level.categories || [], 120),
        controlStates: normalizeStringArray(level.controlStates || [], 120),
        approvalState: cleanText(level.approvalState, 120) || cleanText(hostAuthority.computeAuthority, 120),
        defaultChoiceBundleIds: normalizeStringArray([...explicitChoiceBundleIds, ...linkedChoiceBundleIds], 120)
      };
    })
    .filter((entry) => entry.id)
    .sort((left, right) => Number(left.priority || 99) - Number(right.priority || 99));
}

function buildLeaderDevelopmentStages(leaderIndex = {}, incomingHookIngress = {}) {
  return (Array.isArray(leaderIndex.developmentStages) ? leaderIndex.developmentStages : [])
    .map((stage) => ({
      id: cleanText(stage.id, 120),
      label: cleanText(stage.label || stage.id, 160),
      summary: clipText(stage.summary || "", 220),
      order: Number.isFinite(Number(stage.order)) ? Number(stage.order) : 99,
      kind: cleanText(stage.kind, 120) || "white_room_stage",
      accessLevelIds: normalizeStringArray(stage.accessLevelIds || [], 120),
      choiceBundleIds: normalizeStringArray(stage.choiceBundleIds || [], 120),
      proofsRequired: normalizeStringArray(stage.proofsRequired || [], 120),
      packetLineLimit: Number.isFinite(Number(stage.packetLineLimit)) ? Number(stage.packetLineLimit) : Number(leaderIndex.operationalPacketLineLimit || 35),
      structural: stage.structural === true,
      defaultActive: stage.defaultActive === true,
      deviceAwareness: cleanText(stage.deviceAwareness, 120) || "device_specific",
      gnnMode: cleanText(stage.gnnMode, 120) || "observe",
      selfReflectMode: cleanText(stage.selfReflectMode, 120) || "evidence_first",
      planningMode: cleanText(stage.planningMode, 120) || "bounded_planning",
      executionChain: normalizeStringArray(stage.executionChain || leaderIndex.gnnChain || incomingHookIngress.executionChain || [], 80)
    }))
    .filter((entry) => entry.id)
    .sort((left, right) => Number(left.order || 99) - Number(right.order || 99));
}

function buildLeaderIndex(config = {}, hostAuthority = {}, capabilityBundleTable = [], incomingHookIngress = {}, leaderCatalog = null) {
  const leaderIndex = {
    ...DEFAULT_CONFIG.leaderIndex,
    ...((config && typeof config.leaderIndex === "object") ? config.leaderIndex : {})
  };
  const categories = buildLeaderIndexCategories(leaderIndex, incomingHookIngress);
  const choiceBundles = buildLeaderChoiceBundles(leaderIndex, capabilityBundleTable);
  const accessLevels = buildLeaderAccessLevels(leaderIndex, hostAuthority, choiceBundles);
  const developmentStages = buildLeaderDevelopmentStages(leaderIndex, incomingHookIngress);
  const bodySystem = normalizeStringArray(
    Array.isArray(leaderIndex.bodySystem) && leaderIndex.bodySystem.length
      ? leaderIndex.bodySystem
      : categories.map((entry) => entry.id),
    120
  );
  const gnnChain = normalizeStringArray(leaderIndex.gnnChain || incomingHookIngress.executionChain || [], 80);
  return {
    catalogId: cleanText(leaderIndex.catalogId, 120),
    summary: clipText(leaderIndex.summary || "", 280),
    selectionLaw: cleanText(leaderIndex.selectionLaw, 120),
    replacementRule: cleanText(leaderIndex.replacementRule, 160),
    promotionGate: cleanText(leaderIndex.promotionGate, 160),
    operationalPacketLineLimit: Number.isFinite(Number(leaderIndex.operationalPacketLineLimit))
      ? Number(leaderIndex.operationalPacketLineLimit)
      : 35,
    structuralPacketKinds: normalizeStringArray(leaderIndex.structuralPacketKinds || [], 80),
    codeEnvelope: {
      symbolBudget: Number.isFinite(Number(leaderIndex.codeEnvelope?.symbolBudget))
        ? Number(leaderIndex.codeEnvelope.symbolBudget)
        : 50,
      designGoal: cleanText(leaderIndex.codeEnvelope?.designGoal, 160),
      mode: cleanText(leaderIndex.codeEnvelope?.mode, 160)
    },
    gnnChain,
    bodySystem,
    categories,
    accessLevels,
    choiceBundles,
    developmentStages,
    leaderCatalogId: cleanText(leaderCatalog?.catalogId, 120),
    counts: {
      categoryCount: categories.length,
      subcategoryCount: categories.reduce((sum, entry) => sum + Number(entry.subcategories?.length || 0), 0),
      accessLevelCount: accessLevels.length,
      choiceBundleCount: choiceBundles.length,
      stageCount: developmentStages.length
    }
  };
}

function buildAliasSet(surface = {}) {
  return new Set(
    normalizeStringArray([
      surface.id,
      surface.label,
      surface.canonicalPidRole,
      ...(surface.aliases || []),
      ...(surface.profileIds || [])
    ], 120).map((value) => value.toLowerCase())
  );
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
    machine: cleanText(entry.machine, 120),
    osPid: Number.isFinite(Number(entry.osPid)) ? Number(entry.osPid) : 0
  };
}

function comparePidEntries(left = {}, right = {}) {
  const leftTime = new Date(left.spawnedAt || left.despawnedAt || 0).getTime();
  const rightTime = new Date(right.spawnedAt || right.despawnedAt || 0).getTime();
  return rightTime - leftTime;
}

function surfaceMatchesPid(surface, roleValue) {
  const role = cleanText(roleValue, 80).toLowerCase();
  if (!role) {
    return false;
  }
  const aliases = buildAliasSet(surface);
  return aliases.has(role);
}

function summarizePidBinding(surface = {}, registry = {}) {
  const activeEntries = Object.entries(registry.active || {})
    .filter(([roleKey, entry]) => surfaceMatchesPid(surface, roleKey) || surfaceMatchesPid(surface, entry.role))
    .map(([roleKey, entry]) => normalizePidEntry(roleKey, entry, "active"))
    .sort(comparePidEntries);
  const historyEntries = Array.isArray(registry.history)
    ? registry.history
      .filter((entry) => surfaceMatchesPid(surface, entry.role))
      .map((entry) => normalizePidEntry(entry.role || "", entry, "history"))
      .sort(comparePidEntries)
    : [];
  return {
    selected: activeEntries[0] || historyEntries[0] || null
  };
}

function buildSearchText(entry = {}) {
  try {
    return JSON.stringify(entry).toLowerCase();
  } catch {
    return "";
  }
}

function collectMatches(surface = {}, entries = []) {
  const aliases = Array.from(buildAliasSet(surface)).filter(Boolean);
  if (aliases.length < 1) {
    return [];
  }
  return entries.filter((entry) => {
    const haystack = buildSearchText(entry);
    return aliases.some((alias) => haystack.includes(alias));
  });
}

function sortEvidenceEntries(entries = []) {
  return entries.slice().sort((left, right) => {
    const leftTime = new Date(left.at || left.createdAt || left.receivedAt || 0).getTime();
    const rightTime = new Date(right.at || right.createdAt || right.receivedAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function summarizeEvidenceEntry(kind, filePath, entry = {}) {
  if (kind === "mistake") {
    return {
      source: kind,
      at: toIsoDate(entry.at, ""),
      relativePath: safeRelativePath(filePath),
      summary: clipText(`${cleanText(entry.message, 220)} ${cleanText(entry.avoidance, 220)}`, 280)
    };
  }
  if (kind === "manifest") {
    return {
      source: kind,
      at: toIsoDate(entry.createdAt, ""),
      relativePath: safeRelativePath(filePath),
      summary: clipText(
        `${cleanText(entry.target?.label, 220)} ${cleanText(entry.context?.targetRef, 180)} ${cleanText(entry.policy?.approvalState, 80)}`,
        280
      )
    };
  }
  if (kind === "slack") {
    return {
      source: kind,
      at: toIsoDate(entry.at, ""),
      relativePath: safeRelativePath(filePath),
      summary: clipText(cleanText(entry.text, 800), 280)
    };
  }
  return {
    source: kind,
    at: "",
    relativePath: safeRelativePath(filePath),
    summary: ""
  };
}

function extractTransportFacts(manifestMatches = [], mistakeMatches = [], slackMatches = []) {
  const targetRef = cleanText(manifestMatches[0]?.context?.targetRef, 240);
  const combinedSlack = slackMatches.map((entry) => cleanText(entry.text, 1200)).join(" ").toLowerCase();
  const adbMissing = combinedSlack.includes("adb is absent")
    || combinedSlack.includes("no adb")
    || combinedSlack.includes("no authorized adb");
  const controlReadiness = adbMissing
    ? "transport_only"
    : combinedSlack.includes("authorized adb")
      ? "authorized_adb"
      : "";
  const quarantine = combinedSlack.includes("quarantine") || mistakeMatches.some((entry) => cleanText(entry.context?.rule, 200).toLowerCase().includes("device settings"));

  return {
    liveSerial: cleanText(
      mistakeMatches[0]?.context?.liveSerial
        || targetRef.split("\\").slice(-1)[0]
        || "",
      160
    ),
    correctedNaming: cleanText(mistakeMatches[0]?.context?.correctedNaming, 120),
    targetRef,
    targetLabel: cleanText(manifestMatches[0]?.target?.label, 240),
    engagementId: cleanText(manifestMatches[0]?.context?.engagementId, 120),
    taskId: cleanText(manifestMatches[0]?.context?.taskId, 120),
    approvalState: cleanText(manifestMatches[0]?.policy?.approvalState, 80),
    controlReadiness,
    quarantine
  };
}

function inferAgentState(surface = {}, pidBinding = {}) {
  const activeState = cleanText(surface.activeState, 120);
  const historyState = cleanText(surface.historyState, 120);
  if (surface.activationMode === "always_primary" && pidBinding.selected?.spawnPid) {
    return activeState || "active_primary";
  }
  if (pidBinding.selected?.source === "active") {
    return activeState || "active_named";
  }
  if (pidBinding.selected?.source === "history") {
    return historyState || "dormant_last_known_pid";
  }
  if (Array.isArray(surface.profileIds) && surface.profileIds.length > 0) {
    return "profile_declared";
  }
  return cleanText(surface.defaultState || "declared_only", 80);
}

function inferDeviceState(surface = {}, transport = {}, evidenceCount = 0) {
  if (cleanText(surface.activationMode, 80) === "manual_registration_required") {
    return "manual_registration_required";
  }
  if (transport.quarantine || cleanText(surface.defaultState, 120).toLowerCase().includes("quarantine")) {
    return "packet_quarantined";
  }
  if (transport.controlReadiness === "authorized_adb") {
    return "ready_on_demand";
  }
  if (transport.controlReadiness === "transport_only" || transport.targetRef) {
    return "transport_visible_not_authorized";
  }
  if (evidenceCount > 0) {
    return "observed_named_surface";
  }
  return cleanText(surface.defaultState || "declared_only", 80);
}

function resolveAnchorDocs(ids = [], runningIndexPayload = null) {
  const documents = Array.isArray(runningIndexPayload?.documents) ? runningIndexPayload.documents : [];
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

function defaultConfigPaths() {
  return [
    path.join(instanceRoot, "config", "liris-named-surfaces.json"),
    path.join(projectRoot, "config", "liris-named-surfaces.json")
  ];
}

function defaultRegistryPaths() {
  return [
    resolveDataPath("spawn-pid-registry.json"),
    path.join(projectRoot, "data", "spawn-pid-registry.json")
  ];
}

function defaultMistakePaths() {
  return [
    resolveDataPath("mistake-ledger.ndjson"),
    path.join(projectRoot, "data", "mistake-ledger.ndjson")
  ];
}

function defaultManifestPaths() {
  return [
    resolveDataPath("graph-runtime-manifests.ndjson"),
    path.join(projectRoot, "data", "graph-runtime-manifests.ndjson")
  ];
}

function defaultSlackPaths() {
  return [
    path.join(instanceRoot, "reports", "slack-direct-watch-latest.ndjson"),
    path.join(projectRoot, "reports", "slack-direct-watch-latest.ndjson")
  ];
}

function readNamedSurfaceConfig(options = {}) {
  const configPath = resolveFirstExistingPath(options.configPaths || defaultConfigPaths());
  return {
    configPath,
    config: readJsonFile(configPath, DEFAULT_CONFIG) || DEFAULT_CONFIG
  };
}

function readPidRegistry(options = {}) {
  const registryPath = resolveFirstExistingPath(options.registryPaths || defaultRegistryPaths());
  return {
    registryPath,
    registry: readJsonFile(registryPath, { active: {}, history: [] }) || { active: {}, history: [] }
  };
}

function readEvidencePackets(options = {}) {
  const mistakePath = resolveFirstExistingPath(options.mistakePaths || defaultMistakePaths());
  const manifestPath = resolveFirstExistingPath(options.manifestPaths || defaultManifestPaths());
  const slackPath = resolveFirstExistingPath(options.slackPaths || defaultSlackPaths());
  return {
    mistakePath,
    mistakeEntries: readNdjsonFile(mistakePath),
    manifestPath,
    manifestEntries: readNdjsonFile(manifestPath),
    slackPath,
    slackEntries: readNdjsonFile(slackPath)
  };
}

function buildNamedAgentRow(surface = {}, pidBinding = {}, config = {}, leaderCatalog = null) {
  const state = inferAgentState(surface, pidBinding);
  const instantLoad = buildInstantLoadSpec(surface, config, {
    timestamp: cleanText(pidBinding.selected?.spawnedAt, 80),
    pid: pidBinding.selected || {}
  });
  return {
    id: cleanText(surface.id, 80),
    label: cleanText(surface.label, 120),
    kind: cleanText(surface.kind, 40) || "agent",
    aliases: normalizeStringArray(surface.aliases || [], 120),
    preferredControllerRole: cleanText(surface.preferredControllerRole, 80),
    canonicalPidRole: cleanText(surface.canonicalPidRole, 80),
    profileIds: normalizeStringArray(surface.profileIds || [], 120),
    activationMode: cleanText(surface.activationMode, 80),
    defaultState: cleanText(surface.defaultState, 120),
    state,
    identityGate: cleanText(surface.identityGate, 120),
    controlSurfaceRefs: normalizeStringArray(surface.controlSurfaceRefs || [], 120),
    lxAnchors: normalizeStringArray(surface.lxAnchors || [], 40),
    catalogPins: collectCatalogPinsForSurface(surface.id, leaderCatalog),
    pid: pidBinding.selected
      ? {
          found: true,
          source: cleanText(pidBinding.selected.source, 40),
          spawnPid: cleanText(pidBinding.selected.spawnPid, 160),
          pidVersion: cleanText(pidBinding.selected.pidVersion, 240),
          status: cleanText(pidBinding.selected.status, 40),
          spawnedAt: cleanText(pidBinding.selected.spawnedAt, 80),
          machine: cleanText(pidBinding.selected.machine, 120),
          osPid: Number.isFinite(Number(pidBinding.selected.osPid)) ? Number(pidBinding.selected.osPid) : 0
        }
      : {
          found: false,
          source: "",
          spawnPid: "",
          status: "",
          spawnedAt: "",
          machine: "",
          osPid: 0
        },
    instantLoad
  };
}

function buildNamedDeviceRow(surface = {}, evidence = {}, runningIndexPayload = null, config = {}, leaderCatalog = null) {
  const transport = extractTransportFacts(evidence.manifestMatches, evidence.mistakeMatches, evidence.slackMatches);
  const evidenceEntries = [
    ...evidence.mistakeMatches.slice(0, 2).map((entry) => summarizeEvidenceEntry("mistake", evidence.mistakePath, entry)),
    ...evidence.manifestMatches.slice(0, 2).map((entry) => summarizeEvidenceEntry("manifest", evidence.manifestPath, entry)),
    ...evidence.slackMatches.slice(0, 2).map((entry) => summarizeEvidenceEntry("slack", evidence.slackPath, entry))
  ].filter((entry) => entry.summary);
  const latestAt = sortEvidenceEntries([
    ...evidence.mistakeMatches,
    ...evidence.manifestMatches,
    ...evidence.slackMatches
  ])[0];
  const latestEvidenceAt = toIsoDate(latestAt?.at || latestAt?.createdAt || "", "");
  const state = inferDeviceState(surface, transport, evidenceEntries.length);
  const instantLoad = buildInstantLoadSpec(surface, config, {
    timestamp: latestEvidenceAt,
    evidence: { latestAt: latestEvidenceAt }
  });

  return {
    id: cleanText(surface.id, 80),
    label: cleanText(surface.label, 120),
    kind: cleanText(surface.kind, 40) || "device",
    aliases: normalizeStringArray(surface.aliases || [], 120),
    preferredControllerRole: cleanText(surface.preferredControllerRole, 80),
    profileIds: normalizeStringArray(surface.profileIds || [], 120),
    activationMode: cleanText(surface.activationMode, 80),
    defaultState: cleanText(surface.defaultState, 120),
    state,
    identityGate: cleanText(surface.identityGate, 120),
    controlSurfaceRefs: normalizeStringArray(surface.controlSurfaceRefs || [], 120),
    lxAnchors: normalizeStringArray(surface.lxAnchors || [], 40),
    anchorDocs: resolveAnchorDocs(surface.lxAnchors || [], runningIndexPayload),
    catalogPins: collectCatalogPinsForSurface(surface.id, leaderCatalog),
    transport: {
      liveSerial: cleanText(transport.liveSerial, 160),
      correctedNaming: cleanText(transport.correctedNaming, 120),
      targetRef: cleanText(transport.targetRef, 240),
      targetLabel: cleanText(transport.targetLabel, 240),
      engagementId: cleanText(transport.engagementId, 120),
      taskId: cleanText(transport.taskId, 120),
      approvalState: cleanText(transport.approvalState, 80),
      controlReadiness: cleanText(transport.controlReadiness, 80),
      quarantine: Boolean(transport.quarantine)
    },
    evidence: {
      count: evidenceEntries.length,
      latestAt: latestEvidenceAt,
      entries: evidenceEntries
    },
    instantLoad
  };
}

function buildActivationRow(surface = {}, state = "", pidBinding = null, row = null, leaderCatalog = null) {
  const instantLoad = row?.instantLoad || {
    enabled: false,
    profileId: "",
    timestamp: "",
    tools: [],
    skills: [],
    abilityChain: []
  };
  return {
    surfaceId: cleanText(surface.id, 80),
    label: cleanText(surface.label, 120),
    kind: cleanText(surface.kind, 40),
    activationMode: cleanText(surface.activationMode, 80),
    defaultState: cleanText(surface.defaultState, 120),
    state: cleanText(state, 120),
    genericSpawnBlocked: true,
    identityGate: cleanText(surface.identityGate, 120),
    preferredControllerRole: cleanText(surface.preferredControllerRole, 80),
    profileIds: normalizeStringArray(surface.profileIds || [], 120),
    profileId: cleanText(instantLoad.profileId, 120),
    timestamp: cleanText(instantLoad.timestamp, 80),
    pidVersion: cleanText(instantLoad.pidVersion, 240),
    tools: normalizeStringArray(instantLoad.tools || [], 120),
    skills: normalizeStringArray(instantLoad.skills || [], 120),
    abilityChain: normalizeStringArray(instantLoad.abilityChain || [], 120),
    instantLoad: Boolean(instantLoad.enabled),
    exactNameRequired: cleanText(surface.kind, 40) !== "agent" || cleanText(surface.activationMode, 80) !== "always_primary",
    catalogPins: collectCatalogPinsForSurface(surface.id, leaderCatalog),
    triggers: normalizeStringArray(surface.aliases || [], 120),
    activePid: cleanText(pidBinding?.selected?.spawnPid, 160),
    activePidVersion: cleanText(pidBinding?.selected?.pidVersion, 240)
  };
}

function buildLirisNamedSurfaceRegistry(options = {}) {
  const { configPath, config } = readNamedSurfaceConfig(options);
  const { registryPath, registry } = readPidRegistry(options);
  const evidence = readEvidencePackets(options);
  const leaderCatalog = buildLeaderConnectorCatalog(options);
  const activationLaw = {
    ...DEFAULT_CONFIG.activationLaw,
    ...(config.activationLaw || {})
  };
  const surfaces = Array.isArray(config.namedSurfaces) ? config.namedSurfaces : [];
  const agentTable = [];
  const deviceTable = [];
  const activationTable = [];

  for (const surface of surfaces) {
    if (cleanText(surface.kind, 40).toLowerCase() === "agent") {
      const pidBinding = summarizePidBinding(surface, registry);
      const row = buildNamedAgentRow(surface, pidBinding, config, leaderCatalog);
      agentTable.push(row);
      activationTable.push(buildActivationRow(surface, row.state, pidBinding, row, leaderCatalog));
      continue;
    }

    const row = buildNamedDeviceRow(surface, {
      mistakeMatches: sortEvidenceEntries(collectMatches(surface, evidence.mistakeEntries)),
      mistakePath: evidence.mistakePath,
      manifestMatches: sortEvidenceEntries(collectMatches(surface, evidence.manifestEntries)),
      manifestPath: evidence.manifestPath,
      slackMatches: sortEvidenceEntries(collectMatches(surface, evidence.slackEntries)),
      slackPath: evidence.slackPath
    }, options.runningIndexPayload || null, config, leaderCatalog);
    deviceTable.push(row);
    activationTable.push(buildActivationRow(surface, row.state, null, row, leaderCatalog));
  }
  const toolProfileTable = buildToolProfileTable(config.toolProfiles || [], surfaces, config, options);
  const capabilityBundleTable = buildCapabilityBundleTable(config.capabilityBundles || [], activationTable, toolProfileTable);
  const considerationTable = buildConsiderationTable(capabilityBundleTable);
  const hostAuthority = buildHostAuthority(config, activationTable, capabilityBundleTable, leaderCatalog);
  const incomingHookIngress = buildIncomingHookIngress(config, hostAuthority, activationLaw);
  return {
    schemaVersion: Number(config.schemaVersion || DEFAULT_CONFIG.schemaVersion || 1),
    generatedAt: new Date().toISOString(),
    configPath: safeRelativePath(configPath),
    registryPath: safeRelativePath(registryPath),
    activationLaw: {
      name: cleanText(activationLaw.name, 120),
      summary: cleanText(activationLaw.summary, 320),
      primarySurfaceId: cleanText(activationLaw.primarySurfaceId, 80),
      genericSpawnPolicy: cleanText(activationLaw.genericSpawnPolicy, 120),
      unnamedToolDivePolicy: cleanText(activationLaw.unnamedToolDivePolicy, 120),
      defaultIdentityGate: cleanText(activationLaw.defaultIdentityGate, 120),
      deviceIsolationAnchors: normalizeStringArray(activationLaw.deviceIsolationAnchors || [], 40),
      quarantineAnchors: normalizeStringArray(activationLaw.quarantineAnchors || [], 40)
    },
    anchorDocs: resolveAnchorDocs([
      ...(activationLaw.deviceIsolationAnchors || []),
      ...(activationLaw.quarantineAnchors || [])
    ], options.runningIndexPayload || null),
    primarySurface: agentTable.find((entry) => entry.id === cleanText(activationLaw.primarySurfaceId, 80)) || null,
    agentTable,
    deviceTable,
    activationTable,
    instantLoadTable: activationTable.filter((entry) => entry.instantLoad),
    toolProfileTable,
    capabilityBundleTable,
    considerationTable,
    leaderCatalogs: {
      connectorMap: leaderCatalog
    },
    hostAuthority,
    incomingHookIngress,
    counts: {
      agentCount: agentTable.length,
      deviceCount: deviceTable.length,
      activePidCount: agentTable.filter((entry) => entry.pid?.found).length,
      toolProfileCount: toolProfileTable.length,
      bundleCount: capabilityBundleTable.length,
      hostSurfaceCount: hostAuthority.counts.surfaceCount,
      dormantCount: activationTable.filter((entry) => String(entry.state || "").toLowerCase().includes("dormant") || String(entry.state || "").toLowerCase().includes("idle")).length,
      quarantinedCount: deviceTable.filter((entry) => entry.transport?.quarantine || entry.state === "packet_quarantined").length,
      manualRegistrationCount: activationTable.filter((entry) => entry.state === "manual_registration_required" || entry.state === "declared_only").length
    }
  };
}

function resolveNamedToolProfile(options = {}) {
  const { configPath, config } = readNamedSurfaceConfig(options);
  const surfaces = Array.isArray(config.namedSurfaces) ? config.namedSurfaces : [];
  const toolProfileTable = buildToolProfileTable(config.toolProfiles || [], surfaces, config, options);
  const namedProfileId = cleanText(options.namedProfileId, 120);
  const toolKind = cleanText(options.toolKind, 80);
  const selected = toolProfileTable.find((entry) => namedProfileId && entry.id === namedProfileId)
    || toolProfileTable.find((entry) => !namedProfileId && toolKind && entry.toolKind === toolKind)
    || null;
  return selected ? { ...selected, configPath: safeRelativePath(configPath) } : null;
}

module.exports = {
  buildLirisNamedSurfaceRegistry,
  readNamedSurfaceConfig,
  resolveNamedToolProfile
};
