"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { projectRoot, instanceRoot, resolveDataPath } = require("./runtimePaths");
const { buildLirisLoadProfile } = require("./lirisLoadProfile");

const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: 1,
  branchId: "omni-part-language-branch-v1",
  summary: "White-room omni-part language branch built from the living language without replacing it.",
  selectionLaw: "named_only_pid_version_device_time",
  holdRule: "live_language_hold_until_pro_ready",
  promotionGate: "pro_ready_required_for_replacement",
  operationalPacketLineLimit: 35,
  structuralPacketKinds: ["json", "catalog", "manifest", "index_table"],
  codeEnvelope: {
    symbolBudget: 50,
    designGoal: "multi_billion_named_combinations",
    mode: "metatagged_field_composition"
  },
  portableRoot: {
    surfaceId: "asolaria-usb-root",
    label: "Asolaria USB Root",
    drive: "E:\\",
    requiredRoots: [],
    copiedSurfaceIds: []
  },
  universalExpansion: {
    modelId: "",
    summary: "",
    expansionLaw: "",
    machineLaw: "",
    toolLabelLaw: "",
    root: {},
    subordinate: {},
    panel: {},
    map: {},
    governance: {},
    superGovernance: {},
    levels: []
  },
  analysisMemory: {
    analysisId: "analysis-memory-v1",
    summary: "",
    canonPoints: [],
    nextPacketId: "omni-language-fabric-v1"
  },
  timestampMemory: {
    memoryId: "timestamp-memory-v1",
    label: "Timestamp Memory",
    summary: "",
    useLaw: "load_timestamp_memory_before_branch_actions",
    rememberLaw: "automated_timestamp_specific_memory",
    sequenceLaw: "mutation_then_repair_then_current_state",
    translationAvailabilityLaw: "automatic_translation_available_not_required"
  },
  omniLanguagePlanes: {
    fabricId: "omni-language-fabric-v1",
    label: "Omni Language Fabric",
    summary: "",
    orchestrationLaw: "",
    specialistLaw: "",
    translationLaw: "",
    planes: [],
    localityTuple: [],
    hardwareSymbols: []
  },
  futureLayer: {
    mode: "derived_dev_only",
    anchorId: "IX-604",
    appendProtocolAnchorId: "IX-609",
    sourceOfTruthOrder: [],
    deliveryStates: [],
    forbiddenPowers: []
  },
  sessionCapsule: {
    capsuleId: "liris-session-capsule-v1",
    summary: "",
    loadOrder: [],
    memoryClasses: [],
    proofClasses: [],
    pendingGapClasses: []
  },
  controlPanel: {
    panelId: "control-panel-language-v1",
    label: "Control Panel Language",
    summary: "",
    panelModes: [],
    useLaw: "",
    noCodeLaw: "",
    summonLaw: ""
  },
  asolariaHandoff: {
    handoffId: "asolaria-usb-control-panel-handoff-v1",
    label: "Asolaria USB Control Panel Handoff",
    summary: "",
    targetSurfaceId: "asolaria-usb-root",
    targetProfileId: "asolaria-elevated-control-panel-v1",
    targetPidSeed: "asolaria-usb-root",
    targetAccessLevelIds: [],
    targetChoiceBundleIds: [],
    useLaw: "",
    finishLaw: ""
  },
  plannerWave: {
    waveId: "omni-planner-wave-v1",
    label: "Planner Wave",
    summary: "",
    useLaw: "",
    identityModel: "lineage_plus_packet_epoch",
    resultAuthority: "advisory_until_proved",
    lanes: []
  },
  waveAgentClasses: {
    classesId: "omni-wave-agent-classes-v1",
    label: "Wave Agent Classes",
    summary: "",
    useLaw: "route_named_wave_classes_through_control_panel"
  },
  waveLattice: {
    latticeId: "omni-wave-lattice-v1",
    label: "Waves Of Waves",
    summary: "",
    useLaw: "",
    resultAuthority: "advisory_until_proved",
    metaWaves: []
  },
  waveCascade: {
    cascadeId: "omni-wave-cascade-v1",
    label: "Waves Of Waves Of Waves",
    summary: "",
    useLaw: "",
    resultAuthority: "advisory_until_proved",
    deploymentLaw: "",
    overWaves: []
  },
  expansionKnowledge: {
    knowledgeId: "expansion-knowledge-v1",
    label: "Expansion Knowledge",
    summary: "",
    useLaw: "",
    enforcementState: "prepared_not_enforced_until_pro_ready",
    futureGate: "pro_ready_required_for_tier_unlock",
    translationMode: "automatic_micro_packet_translation",
    rootDescentLaw: "asolaria_leader_only_no_lower_level_descent",
    policeLaw: "observer_gnn_auto_watchers_and_shannon_parts",
    reflectionLaw: "augments_existing_self_reflection_waves",
    peerKnowledgeLaw: "governors_know_governors_super_admins_know_super_admins",
    asolariaVisibilityLaw: "bounded_super_admin_visibility_until_evolution",
    emergencyObservationLaw: "new_tiers_publish_device_specific_observation_links",
    timeAwarenessLaw: "device_specific_timestamped_tier_links",
    tiers: []
  },
  legacyReferenceWave: {
    waveId: "omni-legacy-reference-wave-v1",
    catalogId: "omni-legacy-reference-catalog-v1",
    label: "Legacy Reference Wave",
    summary: "",
    useLaw: "",
    resultAuthority: "read_only_reference_input",
    sourceRoots: [],
    references: [],
    sectors: [],
    waves: [],
    campaigns: []
  },
  scoutSix: {
    scoutId: "omni-scout-six-v1",
    summary: "",
    lanes: []
  },
  frontBackWave: {
    waveId: "omni-front-back-wave-v1",
    summary: "",
    frontLanes: [],
    backLanes: []
  },
  researchAnalysis: {
    analysisId: "omni-research-analysis-v1",
    label: "Omni Research Analysis",
    summary: "",
    useLaw: "analyze_branch_then_target_next_waves"
  },
  languageGapAnalysis: {
    analysisId: "omni-language-gap-analysis-v1",
    label: "Omni Language Gap Analysis",
    summary: "",
    useLaw: "",
    resultAuthority: "derived_from_archive_and_proof_analysis",
    focusOverWaveIds: [],
    focusWeaknessIds: [],
    targetPlaneIds: []
  },
  shannonPartInspection: {
    inspectionId: "omni-shannon-part-inspection-v1",
    label: "Omni Shannon Part Inspection",
    summary: "",
    useLaw: "deploy_named_shannon_parts_for_archive_and_proof_inspection",
    resultAuthority: "derived_from_gap_analysis_and_scan",
    focusOverWaveIds: [],
    focusGapIds: [],
    wholeAllowed: false
  },
  shannonPartFindings: {
    findingsId: "omni-shannon-part-findings-v1",
    label: "Omni Shannon Part Findings",
    summary: "",
    useLaw: "derive_named_findings_from_staged_shannon_inspection",
    resultAuthority: "derived_from_named_shannon_part_inspection",
    targetPlaneIds: []
  },
  omniLanguageRevision: {
    revisionId: "omni-language-revision-v1",
    label: "Omni Language Revision",
    summary: "",
    useLaw: "compose_next_compact_revision_from_shannon_findings",
    resultAuthority: "branch_revision_only_until_pro_ready"
  },
  revisionDeployment: {
    deploymentId: "omni-revision-deployment-v1",
    label: "Omni Revision Deployment",
    summary: "",
    useLaw: "deploy_staged_omni_language_revision_by_named_classes",
    resultAuthority: "branch_deployment_only_until_pro_ready"
  },
  deploymentFeedback: {
    feedbackId: "omni-deployment-feedback-v1",
    label: "Omni Deployment Feedback",
    summary: "",
    useLaw: "derive_named_feedback_from_active_revision_deployments",
    resultAuthority: "derived_from_branch_deployment_only_until_pro_ready"
  },
  feedbackWaveCycle: {
    cycleId: "omni-feedback-wave-cycle-v1",
    label: "Omni Feedback Wave Cycle",
    summary: "",
    useLaw: "route_named_deployment_feedback_into_feedback_return_waves",
    resultAuthority: "branch_feedback_cycle_only_until_pro_ready"
  },
  feedbackReturnPayload: {
    payloadId: "omni-feedback-return-payload-v1",
    label: "Omni Feedback Return Payload",
    summary: "",
    useLaw: "route_deep_archive_deltas_directly_into_named_return_waves",
    resultAuthority: "derived_from_deep_archive_delta_for_return_only_until_pro_ready"
  },
  feedbackReturnMint: {
    mintId: "omni-feedback-return-mint-v1",
    label: "Omni Feedback Return Mint",
    summary: "",
    useLaw: "mint_next_named_gap_and_revision_deltas_from_direct_return_payloads",
    resultAuthority: "derived_from_return_payload_and_deep_archive_delta_until_pro_ready"
  },
  feedbackReturnRedeploy: {
    redeployId: "omni-feedback-return-redeploy-v1",
    label: "Omni Feedback Return Redeploy",
    summary: "",
    useLaw: "redeploy_named_mints_into_the_next_governed_scan_window",
    resultAuthority: "derived_from_return_mint_until_pro_ready"
  },
  feedbackReturnFindings: {
    findingsId: "omni-feedback-return-findings-v1",
    label: "Omni Feedback Return Findings",
    summary: "",
    useLaw: "derive_named_findings_from_active_return_redeploys",
    resultAuthority: "derived_from_return_redeploy_until_pro_ready"
  },
  feedbackReturnPressure: {
    pressureId: "omni-feedback-return-pressure-v1",
    label: "Omni Feedback Return Pressure",
    summary: "",
    useLaw: "mint_next_language_pressure_window_from_active_return_findings",
    resultAuthority: "derived_from_return_findings_until_pro_ready"
  },
  feedbackReturnPressureCycle: {
    cycleId: "omni-feedback-return-pressure-cycle-v1",
    label: "Omni Feedback Return Pressure Cycle",
    summary: "",
    useLaw: "active_return_pressure_windows_mint_next_language_gap_revision_cycle",
    resultAuthority: "derived_from_return_pressure_until_pro_ready"
  },
  feedbackReturnPressurePatch: {
    patchId: "omni-feedback-return-pressure-patch-v1",
    label: "Omni Feedback Return Pressure Patch",
    summary: "",
    useLaw: "active_return_pressure_cycles_mint_next_named_branch_patch_window",
    resultAuthority: "derived_from_return_pressure_cycle_until_pro_ready"
  },
  feedbackReturnPatchApply: {
    applyId: "omni-feedback-return-patch-apply-v1",
    label: "Omni Feedback Return Patch Apply",
    summary: "",
    useLaw: "apply_active_return_pressure_patches_into_the_next_named_branch_window",
    resultAuthority: "derived_from_return_pressure_patch_until_pro_ready"
  },
  feedbackReturnPatchApplyFindings: {
    findingsId: "omni-feedback-return-patch-apply-findings-v1",
    label: "Omni Feedback Return Patch Apply Findings",
    summary: "",
    useLaw: "derive_named_findings_from_active_patch_apply_windows",
    resultAuthority: "derived_from_patch_apply_until_pro_ready"
  },
  feedbackReturnPatchApplyPressure: {
    pressureId: "omni-feedback-return-patch-apply-pressure-v1",
    label: "Omni Feedback Return Patch Apply Pressure",
    summary: "",
    useLaw: "mint_next_language_pressure_window_from_active_patch_apply_findings",
    resultAuthority: "derived_from_patch_apply_findings_until_pro_ready"
  },
  feedbackReturnPatchApplyPressureCycle: {
    cycleId: "omni-feedback-return-patch-apply-pressure-cycle-v1",
    label: "Omni Feedback Return Patch Apply Pressure Cycle",
    summary: "",
    useLaw: "active_patch_apply_pressure_windows_mint_next_language_gap_revision_cycle",
    resultAuthority: "derived_from_patch_apply_pressure_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatch: {
    patchId: "omni-feedback-return-patch-apply-pressure-patch-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch",
    summary: "",
    useLaw: "active_patch_apply_pressure_cycles_mint_next_named_branch_patch_window",
    resultAuthority: "derived_from_patch_apply_pressure_cycle_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApply: {
    applyId: "omni-feedback-return-patch-apply-pressure-patch-apply-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply",
    summary: "",
    useLaw: "apply_active_patch_apply_pressure_patches_into_the_next_named_branch_window",
    resultAuthority: "derived_from_patch_apply_pressure_patch_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApplyFindings: {
    findingsId: "omni-feedback-return-patch-apply-pressure-patch-apply-findings-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply Findings",
    summary: "",
    useLaw: "derive_named_findings_from_active_patch_apply_pressure_patch_apply_windows",
    resultAuthority: "derived_from_patch_apply_pressure_patch_apply_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApplyPressure: {
    pressureId: "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply Pressure",
    summary: "",
    useLaw: "mint_next_language_pressure_window_from_active_patch_apply_pressure_patch_apply_findings",
    resultAuthority: "derived_from_patch_apply_pressure_patch_apply_findings_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApplyPressureCycle: {
    cycleId: "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-cycle-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply Pressure Cycle",
    summary: "",
    useLaw: "active_patch_apply_pressure_patch_apply_pressure_windows_mint_next_language_gap_revision_cycle",
    resultAuthority: "derived_from_patch_apply_pressure_patch_apply_pressure_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApplyPressurePatch: {
    patchId: "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply Pressure Patch",
    summary: "",
    useLaw: "mint_next_language_gap_revision_patches_from_active_patch_apply_pressure_patch_apply_pressure_cycles",
    resultAuthority: "derived_from_patch_apply_pressure_patch_apply_pressure_cycle_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply: {
    applyId: "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply Pressure Patch Apply",
    summary: "",
    useLaw: "apply_active_patch_apply_pressure_patch_apply_pressure_patches_into_the_next_named_apply_surface",
    resultAuthority: "derived_from_patch_apply_pressure_patch_apply_pressure_patch_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings: {
    findingsId: "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply-findings-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply Pressure Patch Apply Findings",
    summary: "",
    useLaw: "derive_named_findings_from_active_patch_apply_pressure_patch_apply_pressure_patch_apply_windows",
    resultAuthority: "derived_from_patch_apply_pressure_patch_apply_pressure_patch_apply_until_pro_ready"
  },
  feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure: {
    pressureId: "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply-pressure-v1",
    label: "Omni Feedback Return Patch Apply Pressure Patch Apply Pressure Patch Apply Pressure",
    summary: "",
    useLaw: "mint_next_language_pressure_window_from_active_patch_apply_pressure_patch_apply_pressure_patch_apply_findings",
    resultAuthority: "derived_from_patch_apply_pressure_patch_apply_pressure_patch_apply_findings_until_pro_ready"
  },
  deepArchiveDelta: {
    deltaId: "omni-deep-archive-delta-v1",
    label: "Omni Deep Archive Delta",
    summary: "",
    useLaw: "derive_named_control_plane_deltas_from_deep_archive_findings_and_feedback_cycles",
    resultAuthority: "derived_from_deep_archive_and_feedback_cycle_until_pro_ready"
  },
  adminReflectionTraining: {
    trainingId: "admin-reflection-training-v1",
    label: "Admin Reflection Training",
    summary: "",
    law: "admin_plus_agents_train_with_self_reflection"
  },
  mapMapMappedScanning: {
    scanId: "map-map-mapped-scanning-v1",
    label: "MAP MAP MAPPED scanning",
    summary: "",
    positionMode: "exact_timestamped_structure_learning",
    identityTuple: [],
    cycle: [],
    responseModes: [],
    livingStructureClasses: [],
    availableAccessLevelIds: [],
    availableChoiceBundleIds: [],
    selfReflectModes: {},
    shannonParts: {
      scout: [],
      back: [],
      wholeAllowed: false
    },
    waves: []
  },
  gnnChain: ["observe", "edge_map", "reflect", "plan", "vote", "prove"],
  bodySystem: ["memory", "rule", "world_model", "root_authority", "skill", "ability", "omni_map"],
  categories: [],
  accessLevels: [],
  choiceBundles: [],
  developmentStages: []
});

function cleanText(value, max = 320) {
  return String(value || "").replace(/\r/g, "").trim().slice(0, max);
}

function clipText(value, max = 240) {
  const normalized = cleanText(String(value || "").replace(/\s+/g, " "), max + 32);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function normalizeStringArray(values = [], max = 120) {
  const rows = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = cleanText(value, max);
    const lower = normalized.toLowerCase();
    if (!normalized || seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    rows.push(normalized);
  }
  return rows;
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

function defaultOmniPartBranchConfigPaths() {
  return [
    path.join(instanceRoot, "config", "omni-part-language-branch.json"),
    path.join(projectRoot, "config", "omni-part-language-branch.json")
  ];
}

function readOmniPartBranchConfig(options = {}) {
  const configPath = resolveFirstExistingPath(options.configPaths || defaultOmniPartBranchConfigPaths());
  const config = readJsonFile(configPath, {}) || {};
  return {
    configPath,
    config: {
      ...DEFAULT_CONFIG,
      ...config
    }
  };
}

function buildBranchCategories(config = {}) {
  return (Array.isArray(config.categories) ? config.categories : [])
    .map((category) => ({
      id: cleanText(category.id, 120),
      label: cleanText(category.label || category.id, 160),
      summary: clipText(category.summary || "", 220),
      subcategories: (Array.isArray(category.subcategories) ? category.subcategories : [])
        .map((subcategory) => ({
          id: cleanText(subcategory.id, 120),
          label: cleanText(subcategory.label || subcategory.id, 160)
        }))
        .filter((entry) => entry.id)
    }))
    .filter((entry) => entry.id);
}

function buildBranchAccessLevels(config = {}) {
  return (Array.isArray(config.accessLevels) ? config.accessLevels : [])
    .map((level) => ({
      id: cleanText(level.id, 120),
      label: cleanText(level.label || level.id, 160),
      priority: Number.isFinite(Number(level.priority)) ? Number(level.priority) : 99,
      surfaceIds: normalizeStringArray(level.surfaceIds || [], 120),
      authorityRoles: normalizeStringArray(level.authorityRoles || [], 120),
      categories: normalizeStringArray(level.categories || [], 120),
      defaultChoiceBundleIds: normalizeStringArray(level.defaultChoiceBundleIds || [], 120),
      approvalState: cleanText(level.approvalState, 120)
    }))
    .filter((entry) => entry.id)
    .sort((left, right) => Number(left.priority || 99) - Number(right.priority || 99));
}

function buildBranchChoiceBundles(config = {}) {
  return (Array.isArray(config.choiceBundles) ? config.choiceBundles : [])
    .map((bundle) => ({
      id: cleanText(bundle.id, 120),
      label: cleanText(bundle.label || bundle.id, 160),
      summary: clipText(bundle.summary || "", 220),
      accessLevelIds: normalizeStringArray(bundle.accessLevelIds || [], 120),
      categoryIds: normalizeStringArray(bundle.categoryIds || [], 120),
      bundleIds: normalizeStringArray(bundle.bundleIds || [], 120),
      serviceIds: normalizeStringArray(bundle.serviceIds || [], 120),
      stageIds: normalizeStringArray(bundle.stageIds || [], 120),
      decisionMode: cleanText(bundle.decisionMode, 120)
    }))
    .filter((entry) => entry.id);
}

function buildBranchStages(config = {}) {
  return (Array.isArray(config.developmentStages) ? config.developmentStages : [])
    .map((stage) => ({
      id: cleanText(stage.id, 120),
      label: cleanText(stage.label || stage.id, 160),
      order: Number.isFinite(Number(stage.order)) ? Number(stage.order) : 99,
      accessLevelIds: normalizeStringArray(stage.accessLevelIds || [], 120),
      choiceBundleIds: normalizeStringArray(stage.choiceBundleIds || [], 120),
      proofsRequired: normalizeStringArray(stage.proofsRequired || [], 120),
      packetLineLimit: Number.isFinite(Number(stage.packetLineLimit))
        ? Number(stage.packetLineLimit)
        : Number(config.operationalPacketLineLimit || 35),
      gnnMode: cleanText(stage.gnnMode, 120),
      selfReflectMode: cleanText(stage.selfReflectMode, 120),
      planningMode: cleanText(stage.planningMode, 120),
      defaultActive: stage.defaultActive === true
    }))
    .filter((entry) => entry.id)
    .sort((left, right) => Number(left.order || 99) - Number(right.order || 99));
}

function inferCategoryId(unit = {}) {
  if (cleanText(unit.category, 80) === "ability") return "ability";
  if (cleanText(unit.category, 80) === "service" || cleanText(unit.category, 80) === "service_part") return "skill";
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

function inferSubcategoryIds(unit = {}, categories = []) {
  const categoryId = inferCategoryId(unit);
  const position = cleanText(unit.position, 80).toLowerCase();
  const serviceType = cleanText(unit.serviceType, 120).toLowerCase();
  const rows = [];
  if (categoryId === "world_model") {
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
  } else if (categoryId === "memory") {
    rows.push("reflection_memory");
    rows.push("mistake_memory");
  } else if (categoryId === "rule") {
    rows.push("activation_rule");
    rows.push("packet_budget_rule");
  }
  const validIds = new Set(
    (categories.find((entry) => cleanText(entry.id, 120) === categoryId)?.subcategories || [])
      .map((entry) => cleanText(entry.id, 120))
  );
  return normalizeStringArray(rows.filter((entry) => validIds.size < 1 || validIds.has(entry)), 120);
}

function resolveAccessLevel(unit = {}, accessLevels = []) {
  const surfaceId = cleanText(unit.surfaceId || unit.id, 120);
  const authorityRole = cleanText(unit.authorityRole, 120);
  const categoryId = inferCategoryId(unit);
  return accessLevels.find((level) => (
    normalizeStringArray(level.surfaceIds || [], 120).includes(surfaceId)
    || normalizeStringArray(level.authorityRoles || [], 120).includes(authorityRole)
    || normalizeStringArray(level.categories || [], 120).includes(categoryId)
  )) || null;
}

function resolveChoiceBundleIds(unit = {}, choiceBundles = [], accessLevel = null) {
  const serviceId = cleanText(unit.id, 120);
  const matchedBundles = choiceBundles
    .filter((bundle) => (
      normalizeStringArray(bundle.accessLevelIds || [], 120).includes(cleanText(accessLevel?.id, 120))
      || normalizeStringArray(bundle.serviceIds || [], 120).includes(serviceId)
      || normalizeStringArray(bundle.bundleIds || [], 120).includes(serviceId)
    ))
    .map((bundle) => bundle.id);
  return normalizeStringArray([
    ...(accessLevel?.defaultChoiceBundleIds || []),
    ...matchedBundles
  ], 120);
}

function resolveStageIds(choiceBundleIds = [], stages = []) {
  const choiceBundleIdSet = new Set(normalizeStringArray(choiceBundleIds, 120));
  return normalizeStringArray(
    stages
      .filter((stage) => normalizeStringArray(stage.choiceBundleIds || [], 120).some((entry) => choiceBundleIdSet.has(entry)))
      .map((stage) => stage.id),
    120
  );
}

function buildServicePartUnits(sourceProfile = {}) {
  return (Array.isArray(sourceProfile.deviceLanguage?.serviceActions) ? sourceProfile.deviceLanguage.serviceActions : [])
    .flatMap((service) => (Array.isArray(service.partProfiles) ? service.partProfiles : []).map((part) => ({
      id: cleanText(part.id, 120),
      category: "service_part",
      unitType: "service_part",
      surfaceId: cleanText(service.controllerSurfaceId, 120),
      profileId: cleanText(part.profileId, 120),
      pidVersion: cleanText(service.pidVersion, 240),
      timestamp: cleanText(service.timestamp, 80),
      deviceSurfaceId: cleanText(service.deviceSurfaceId, 120),
      position: "service_part",
      rank: "r5_runtime_unit",
      authorityRole: "derived_service_part",
      controlState: cleanText(service.actionState, 120),
      selectionState: cleanText(service.actionState, 120) === "service_ready" ? "usable_now" : "named_ready_pending_route",
      serviceType: cleanText(part.serviceType || service.serviceType, 120)
    })));
}

function buildPartCatalog(sourceProfile = {}, branch = {}) {
  const sourceUnits = Array.isArray(sourceProfile.omniAgentMap?.units) ? sourceProfile.omniAgentMap.units : [];
  const servicePartUnits = buildServicePartUnits(sourceProfile);
  const allUnits = [...sourceUnits, ...servicePartUnits]
    .map((unit) => {
      const accessLevel = resolveAccessLevel(unit, branch.accessLevels);
      const choiceBundleIds = resolveChoiceBundleIds(unit, branch.choiceBundles, accessLevel);
      return {
        id: cleanText(unit.id, 120),
        category: cleanText(unit.category, 80),
        unitType: cleanText(unit.unitType, 80),
        surfaceId: cleanText(unit.surfaceId, 120),
        profileId: cleanText(unit.profileId, 120),
        pidVersion: cleanText(unit.pidVersion, 240),
        timestamp: cleanText(unit.timestamp, 80),
        deviceSurfaceId: cleanText(unit.deviceSurfaceId, 120),
        position: cleanText(unit.position, 80),
        rank: cleanText(unit.rank, 80),
        authorityRole: cleanText(unit.authorityRole, 120),
        controlState: cleanText(unit.controlState, 120),
        selectionState: cleanText(unit.selectionState, 120),
        serviceType: cleanText(unit.serviceType, 120),
        categoryId: inferCategoryId(unit),
        subcategoryIds: inferSubcategoryIds(unit, branch.categories),
        accessLevelId: cleanText(accessLevel?.id, 120),
        choiceBundleIds,
        stageIds: resolveStageIds(choiceBundleIds, branch.developmentStages),
        selectionKey: cleanText(unit.selectionKey, 640)
      };
    });

  return {
    catalogId: "omni-part-catalog-v1",
    selectionLaw: cleanText(branch.selectionLaw, 120),
    unitCount: allUnits.length,
    readyUnitCount: allUnits.filter((entry) => cleanText(entry.selectionState, 80) === "usable_now").length,
    categoryCounts: {
      surface: allUnits.filter((entry) => entry.category === "surface").length,
      ability: allUnits.filter((entry) => entry.category === "ability").length,
      service: allUnits.filter((entry) => entry.category === "service").length,
      servicePart: allUnits.filter((entry) => entry.category === "service_part").length,
      computeWatch: allUnits.filter((entry) => entry.category === "compute_watch").length
    },
    primaryPositions: sourceProfile.omniAgentMap?.primaryPositions || {},
    bundleIds: normalizeStringArray(
      (Array.isArray(sourceProfile.namedSurfaces?.capabilityBundleTable) ? sourceProfile.namedSurfaces.capabilityBundleTable : [])
        .map((entry) => cleanText(entry.id, 120)),
      120
    ),
    units: allUnits
  };
}

function buildPortableRoot(config = {}) {
  const portableRootConfig = config.portableRoot || {};
  const drive = cleanText(portableRootConfig.drive, 80);
  const requiredRoots = normalizeStringArray(portableRootConfig.requiredRoots || [], 120);
  const visibleRoots = requiredRoots.filter((entry) => fs.existsSync(path.join(drive, entry)));
  return {
    surfaceId: cleanText(portableRootConfig.surfaceId, 120),
    label: cleanText(portableRootConfig.label, 160),
    drive,
    requiredRoots,
    visibleRoots,
    state: visibleRoots.length === requiredRoots.length ? "portable_root_visible" : "portable_root_partial",
    copiedSurfaceIds: normalizeStringArray(portableRootConfig.copiedSurfaceIds || [], 120)
  };
}

function buildUniversalExpansion(config = {}) {
  const expansionConfig = config.universalExpansion || {};
  const buildNode = (value = {}) => ({
    surfaceId: cleanText(value.surfaceId, 120),
    profileId: cleanText(value.profileId, 120),
    levelLabel: cleanText(value.levelLabel, 40),
    deviceSpecificity: cleanText(value.deviceSpecificity, 120),
    superiorSurfaceId: cleanText(value.superiorSurfaceId, 120)
  });
  return {
    modelId: cleanText(expansionConfig.modelId, 120),
    summary: clipText(expansionConfig.summary || "", 240),
    expansionLaw: cleanText(expansionConfig.expansionLaw, 160),
    machineLaw: cleanText(expansionConfig.machineLaw, 160),
    toolLabelLaw: cleanText(expansionConfig.toolLabelLaw, 120),
    root: buildNode(expansionConfig.root),
    subordinate: buildNode(expansionConfig.subordinate),
    panel: buildNode(expansionConfig.panel),
    map: buildNode(expansionConfig.map),
    governance: buildNode(expansionConfig.governance),
    superGovernance: buildNode(expansionConfig.superGovernance),
    levels: (Array.isArray(expansionConfig.levels) ? expansionConfig.levels : [])
      .map((entry) => ({
        id: cleanText(entry.id, 40),
        prime: Number.isFinite(Number(entry.prime)) ? Number(entry.prime) : 0,
        primeCube: Number.isFinite(Number(entry.primeCube)) ? Number(entry.primeCube) : 0,
        kind: cleanText(entry.kind, 120),
        humanLabel: cleanText(entry.humanLabel, 160)
      }))
      .filter((entry) => entry.id)
  };
}

function buildExpansionKnowledge(config = {}, branch = {}) {
  const expansionConfig = config.expansionKnowledge || {};
  const partUnits = Array.isArray(branch.partCatalog?.units) ? branch.partCatalog.units : [];
  const accessLevels = Array.isArray(branch.accessLevels) ? branch.accessLevels : [];
  const accessLevelMap = new Map(accessLevels.map((entry) => [cleanText(entry.id, 120), entry]));
  const surfaceIdsForAccessLevels = (accessLevelIds = []) => normalizeStringArray(
    normalizeStringArray(accessLevelIds, 120)
      .flatMap((id) => normalizeStringArray(accessLevelMap.get(id)?.surfaceIds || [], 120)),
    120
  );
  const policeUnitIds = normalizeStringArray(partUnits
    .filter((entry) => (
      cleanText(entry.accessLevelId, 120) === "observer_gnn"
      || (cleanText(entry.category, 80) === "service_part" && cleanText(entry.id, 120).startsWith("shannon-"))
    ))
    .map((entry) => cleanText(entry.id, 120)), 120);
  const mapLevelLabel = cleanText(branch.universalExpansion?.map?.levelLabel, 40);
  const governanceLevelLabel = cleanText(branch.universalExpansion?.governance?.levelLabel, 40);
  const expansionLevelLabel = cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40);
  const deviceSurfaceId = cleanText(branch.sourceLanguage?.deviceSurfaceId, 120);
  const tiers = (Array.isArray(expansionConfig.tiers) ? expansionConfig.tiers : [])
    .map((tier, index) => {
      const id = cleanText(tier.id, 40);
      const levelIds = normalizeStringArray(tier.levelIds || [], 40);
      const accessLevelIds = normalizeStringArray(tier.accessLevelIds || [], 120);
      return {
        id,
        order: index + 1,
        humanLabel: cleanText(tier.humanLabel || tier.id, 160),
        machineLabel: cleanText(tier.machineLabel || tier.id, 40),
        levelIds,
        accessLevelIds,
        visibility: cleanText(tier.visibility, 120),
        knowledgeKinds: normalizeStringArray(tier.knowledgeKinds || [], 120),
        peerSurfaceIds: surfaceIdsForAccessLevels(accessLevelIds),
        emergencyObservationLinkId: `observe-${id.toLowerCase()}-${deviceSurfaceId || "unknown-device"}`,
        observationMode: "device_specific_emergency_observe",
        timeKey: `${id}@${branch.generatedAt}`,
        lockState: "prepared_future_lock"
      };
    })
    .filter((entry) => entry.id);
  const governorTierIds = tiers
    .filter((entry) => entry.levelIds.includes(governanceLevelLabel))
    .map((entry) => entry.id);
  const superAdminTierIds = tiers
    .filter((entry) => entry.levelIds.includes(expansionLevelLabel) || entry.accessLevelIds.includes("owner_root"))
    .map((entry) => entry.id);
  const governorSurfaceIds = normalizeStringArray(
    tiers
      .filter((entry) => governorTierIds.includes(entry.id))
      .flatMap((entry) => entry.peerSurfaceIds || []),
    120
  );
  const superAdminSurfaceIds = normalizeStringArray(
    tiers
      .filter((entry) => superAdminTierIds.includes(entry.id))
      .flatMap((entry) => entry.peerSurfaceIds || []),
    120
  );

  return {
    knowledgeId: cleanText(expansionConfig.knowledgeId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(expansionConfig.label || expansionConfig.knowledgeId, 160),
    summary: clipText(expansionConfig.summary || "", 240),
    useLaw: cleanText(expansionConfig.useLaw, 160),
    enforcementState: cleanText(expansionConfig.enforcementState, 160),
    futureGate: cleanText(expansionConfig.futureGate, 160),
    translationMode: cleanText(expansionConfig.translationMode, 160),
    rootDescentLaw: cleanText(expansionConfig.rootDescentLaw, 160),
    policeLaw: cleanText(expansionConfig.policeLaw, 160),
    reflectionLaw: cleanText(expansionConfig.reflectionLaw, 160),
    peerKnowledgeLaw: cleanText(expansionConfig.peerKnowledgeLaw, 160),
    asolariaVisibilityLaw: cleanText(expansionConfig.asolariaVisibilityLaw, 160),
    emergencyObservationLaw: cleanText(expansionConfig.emergencyObservationLaw, 160),
    timeAwarenessLaw: cleanText(expansionConfig.timeAwarenessLaw, 160),
    controllerSurfaceId: cleanText(branch.sourceLanguage?.controllerSurfaceId, 120),
    controllerPidVersion: cleanText(branch.sourceLanguage?.pidVersion, 240),
    deviceSurfaceId,
    rootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    policeUnitIds,
    governorTierIds,
    governorSurfaceIds,
    superAdminTierIds,
    superAdminSurfaceIds,
    asolariaVisibleSuperAdminSurfaceIds: normalizeStringArray([
      cleanText(branch.portableRoot?.surfaceId, 120),
      ...superAdminSurfaceIds
    ], 120),
    emergencyObservationLinkIds: normalizeStringArray(tiers.map((entry) => entry.emergencyObservationLinkId), 160),
    levelAxis: {
      root: cleanText(branch.universalExpansion?.root?.levelLabel, 40),
      subordinate: cleanText(branch.universalExpansion?.subordinate?.levelLabel, 40),
      panel: cleanText(branch.universalExpansion?.panel?.levelLabel, 40),
      map: mapLevelLabel,
      governance: governanceLevelLabel,
      expansion: expansionLevelLabel
    },
    tierCount: tiers.length,
    tiers
  };
}

function buildAdminReflectionTraining(branch = {}) {
  const requiredAccessLevelIds = ["owner_root", "super_governance", "leader_orchestrator", "guardrail"]
    .filter((id) => Array.isArray(branch.accessLevels) && branch.accessLevels.some((entry) => cleanText(entry.id, 120) === id));
  return {
    trainingId: "admin-reflection-training-v1",
    generatedAt: branch.generatedAt,
    label: "Admin Reflection Training",
    summary: "Map-aware and governance-aware self-reflection training surface for admin-plus tiers.",
    law: "admin_plus_agents_train_with_self_reflection",
    bundleId: "self-reflection-loop",
    controllerSurfaceId: cleanText(branch.sourceLanguage?.controllerSurfaceId, 120),
    controllerPidVersion: cleanText(branch.sourceLanguage?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sourceLanguage?.deviceSurfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    timeAwarenessLaw: "timestamped_training_visibility_by_level",
    emergencyObservationLaw: cleanText(branch.expansionKnowledge?.emergencyObservationLaw, 160),
    governorSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.governorSurfaceIds || [], 120),
    superAdminSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.superAdminSurfaceIds || [], 120),
    emergencyObservationLinkIds: normalizeStringArray(branch.expansionKnowledge?.emergencyObservationLinkIds || [], 160),
    requiredAccessLevelIds,
    requiredSurfaceIds: normalizeStringArray(
      (Array.isArray(branch.accessLevels) ? branch.accessLevels : [])
        .filter((entry) => requiredAccessLevelIds.includes(cleanText(entry.id, 120)))
        .flatMap((entry) => normalizeStringArray(entry.surfaceIds || [], 120)),
      120
    ),
    stageIds: ["white_room_reflect", "white_room_plan", "white_room_prove"]
  };
}

function buildAnalysisMemory(config = {}, branch = {}) {
  const analysisConfig = config.analysisMemory || {};
  const controller = branch.sourceLanguage || {};
  const portableRoot = branch.portableRoot || {};
  return {
    analysisId: cleanText(analysisConfig.analysisId, 120),
    generatedAt: branch.generatedAt,
    summary: clipText(analysisConfig.summary || "", 240),
    controllerSurfaceId: cleanText(controller.controllerSurfaceId, 120),
    controllerProfileId: cleanText(controller.profileId, 120),
    controllerPidVersion: cleanText(controller.pidVersion, 240),
    deviceSurfaceId: cleanText(controller.deviceSurfaceId, 120),
    portableRootSurfaceId: cleanText(portableRoot.surfaceId, 120),
    holdRule: cleanText(controller.holdRule, 160),
    promotionGate: cleanText(controller.promotionGate, 160),
    canonPoints: normalizeStringArray(analysisConfig.canonPoints || [], 160),
    nextPacketId: cleanText(analysisConfig.nextPacketId || config.omniLanguagePlanes?.fabricId || config.controlPanel?.panelId, 120)
  };
}

function buildTimestampMemory(config = {}, branch = {}) {
  const timestampConfig = config.timestampMemory || {};
  const controller = branch.sourceLanguage || {};
  const portableRoot = branch.portableRoot || {};
  const identityTuple = normalizeStringArray(
    branch.mapMapMappedScanning?.identityTuple
      || config.mapMapMappedScanning?.identityTuple
      || ["surfaceId", "profileId", "pidVersion", "deviceSurfaceId", "timestamp"],
    120
  );
  return {
    memoryId: cleanText(timestampConfig.memoryId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(timestampConfig.label, 160),
    summary: clipText(
      timestampConfig.summary
        || "Automated timestamp-specific memory for exact reload, replay, and omnidirectional translation without identity drift.",
      240
    ),
    useLaw: cleanText(timestampConfig.useLaw, 160),
    rememberLaw: cleanText(timestampConfig.rememberLaw, 160),
    sequenceLaw: cleanText(timestampConfig.sequenceLaw, 160),
    translationAvailabilityLaw: cleanText(timestampConfig.translationAvailabilityLaw, 160),
    controllerSurfaceId: cleanText(controller.controllerSurfaceId, 120),
    controllerProfileId: cleanText(controller.profileId, 120),
    controllerPidVersion: cleanText(controller.pidVersion, 240),
    deviceSurfaceId: cleanText(controller.deviceSurfaceId, 120),
    portableRootSurfaceId: cleanText(portableRoot.surfaceId, 120),
    portableRootState: cleanText(portableRoot.state, 120),
    copiedSurfaceIds: normalizeStringArray(portableRoot.copiedSurfaceIds || [], 120),
    identityTuple,
    exactTimeKey: `${cleanText(controller.controllerSurfaceId, 120)}@${cleanText(controller.pidVersion, 240)}`,
    timeAwarenessLaw: cleanText(branch.expansionKnowledge?.timeAwarenessLaw || "device_specific_timestamped_tier_links", 160)
  };
}

function buildAncestryMemory(config = {}, branch = {}) {
  const ancestryConfig = config.ancestryMemory || {};
  const controller = branch.sourceLanguage || {};
  const portableRoot = branch.portableRoot || {};
  const generatedAt = cleanText(branch.generatedAt, 80);
  const controllerPidVersion = cleanText(controller.pidVersion, 240);
  return {
    memoryId: cleanText(ancestryConfig.memoryId, 120),
    generatedAt,
    label: cleanText(ancestryConfig.label, 160),
    summary: clipText(
      ancestryConfig.summary
        || "Ancestry ordering memory for separating archive lineage, later mutation, repair, and current state.",
      240
    ),
    useLaw: cleanText(ancestryConfig.useLaw, 160),
    orderingLaw: cleanText(ancestryConfig.orderingLaw, 160),
    lineageLaw: cleanText(ancestryConfig.lineageLaw, 160),
    translationAvailabilityLaw: cleanText(ancestryConfig.translationAvailabilityLaw, 160),
    controllerSurfaceId: cleanText(controller.controllerSurfaceId, 120),
    controllerProfileId: cleanText(controller.profileId, 120),
    controllerPidVersion,
    deviceSurfaceId: cleanText(controller.deviceSurfaceId, 120),
    portableRootSurfaceId: cleanText(portableRoot.surfaceId, 120),
    portableRootState: cleanText(portableRoot.state, 120),
    copiedSurfaceIds: normalizeStringArray(portableRoot.copiedSurfaceIds || [], 120),
    ancestryOrder: ["archive", "mutation", "repair", "current"],
    exactAncestryKey: `${cleanText(controller.controllerSurfaceId, 120)}@${controllerPidVersion}@${generatedAt}`,
    timeAwarenessLaw: cleanText(branch.expansionKnowledge?.timeAwarenessLaw || "device_specific_timestamped_tier_links", 160)
  };
}

function insertPlannerWaveLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("planner_wave")) {
    return loadOrder;
  }
  if (loadOrder.includes("scout_six")) {
    return loadOrder.flatMap((entry) => (entry === "scout_six" ? ["planner_wave", entry] : [entry]));
  }
  return [...loadOrder, "planner_wave"];
}

function insertWaveLatticeLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("wave_lattice")) {
    return loadOrder;
  }
  if (loadOrder.includes("legacy_reference_wave")) {
    return loadOrder.flatMap((entry) => (entry === "legacy_reference_wave" ? ["wave_lattice", entry] : [entry]));
  }
  if (loadOrder.includes("scout_six")) {
    return loadOrder.flatMap((entry) => (entry === "scout_six" ? ["wave_lattice", entry] : [entry]));
  }
  return [...loadOrder, "wave_lattice"];
}

function insertWaveCascadeLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("wave_cascade")) {
    return loadOrder;
  }
  if (loadOrder.includes("wave_lattice")) {
    return loadOrder.flatMap((entry) => (entry === "wave_lattice" ? [entry, "wave_cascade"] : [entry]));
  }
  if (loadOrder.includes("legacy_reference_wave")) {
    return loadOrder.flatMap((entry) => (entry === "legacy_reference_wave" ? ["wave_cascade", entry] : [entry]));
  }
  if (loadOrder.includes("deep_archive_replay")) {
    return loadOrder.flatMap((entry) => (entry === "deep_archive_replay" ? ["wave_cascade", entry] : [entry]));
  }
  return [...loadOrder, "wave_cascade"];
}

function insertAncestryMemoryLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("ancestry_memory")) {
    return loadOrder;
  }
  if (loadOrder.includes("timestamp_memory")) {
    return loadOrder.flatMap((entry) => (entry === "timestamp_memory" ? ["ancestry_memory", entry] : [entry]));
  }
  if (loadOrder.includes("memory")) {
    return loadOrder.flatMap((entry) => (entry === "memory" ? ["ancestry_memory", entry] : [entry]));
  }
  return [...loadOrder, "ancestry_memory"];
}

function insertLegacyReferenceLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("legacy_reference_wave")) {
    return loadOrder;
  }
  if (loadOrder.includes("scout_six")) {
    return loadOrder.flatMap((entry) => (entry === "scout_six" ? ["legacy_reference_wave", entry] : [entry]));
  }
  if (loadOrder.includes("front_back_wave")) {
    return loadOrder.flatMap((entry) => (entry === "front_back_wave" ? ["legacy_reference_wave", entry] : [entry]));
  }
  return [...loadOrder, "legacy_reference_wave"];
}

function insertDeepArchiveReplayLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("deep_archive_replay")) {
    return loadOrder;
  }
  if (loadOrder.includes("legacy_reference_wave")) {
    return loadOrder.flatMap((entry) => (entry === "legacy_reference_wave" ? [entry, "deep_archive_replay"] : [entry]));
  }
  if (loadOrder.includes("scout_six")) {
    return loadOrder.flatMap((entry) => (entry === "scout_six" ? ["deep_archive_replay", entry] : [entry]));
  }
  if (loadOrder.includes("front_back_wave")) {
    return loadOrder.flatMap((entry) => (entry === "front_back_wave" ? ["deep_archive_replay", entry] : [entry]));
  }
  if (loadOrder.includes("gnn_vote")) {
    return loadOrder.flatMap((entry) => (entry === "gnn_vote" ? ["deep_archive_replay", entry] : [entry]));
  }
  return [...loadOrder, "deep_archive_replay"];
}

function insertDeepArchiveFindingsLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("deep_archive_findings")) {
    return loadOrder;
  }
  if (loadOrder.includes("deep_archive_replay")) {
    return loadOrder.flatMap((entry) => (entry === "deep_archive_replay" ? [entry, "deep_archive_findings"] : [entry]));
  }
  if (loadOrder.includes("scout_six")) {
    return loadOrder.flatMap((entry) => (entry === "scout_six" ? ["deep_archive_findings", entry] : [entry]));
  }
  return [...loadOrder, "deep_archive_findings"];
}

function insertLanguageGapAnalysisLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("language_gap_analysis")) {
    return loadOrder;
  }
  if (loadOrder.includes("deep_archive_findings")) {
    return loadOrder.flatMap((entry) => (entry === "deep_archive_findings" ? [entry, "language_gap_analysis"] : [entry]));
  }
  if (loadOrder.includes("scout_six")) {
    return loadOrder.flatMap((entry) => (entry === "scout_six" ? ["language_gap_analysis", entry] : [entry]));
  }
  return [...loadOrder, "language_gap_analysis"];
}

function insertShannonPartFindingsLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("shannon_part_findings")) {
    return loadOrder;
  }
  if (loadOrder.includes("language_gap_analysis")) {
    return loadOrder.flatMap((entry) => (entry === "language_gap_analysis" ? [entry, "shannon_part_findings"] : [entry]));
  }
  if (loadOrder.includes("shannon_part_inspection")) {
    return loadOrder.flatMap((entry) => (entry === "shannon_part_inspection" ? [entry, "shannon_part_findings"] : [entry]));
  }
  return [...loadOrder, "shannon_part_findings"];
}

function insertOmniLanguageRevisionLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("omni_language_revision")) {
    return loadOrder;
  }
  if (loadOrder.includes("shannon_part_findings")) {
    return loadOrder.flatMap((entry) => (entry === "shannon_part_findings" ? [entry, "omni_language_revision"] : [entry]));
  }
  if (loadOrder.includes("language_gap_analysis")) {
    return loadOrder.flatMap((entry) => (entry === "language_gap_analysis" ? [entry, "omni_language_revision"] : [entry]));
  }
  return [...loadOrder, "omni_language_revision"];
}

function insertRevisionDeploymentLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("revision_deployment")) {
    return loadOrder;
  }
  if (loadOrder.includes("omni_language_revision")) {
    return loadOrder.flatMap((entry) => (entry === "omni_language_revision" ? [entry, "revision_deployment"] : [entry]));
  }
  if (loadOrder.includes("shannon_part_findings")) {
    return loadOrder.flatMap((entry) => (entry === "shannon_part_findings" ? [entry, "revision_deployment"] : [entry]));
  }
  return [...loadOrder, "revision_deployment"];
}

function insertDeploymentFeedbackLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("deployment_feedback")) {
    return loadOrder;
  }
  if (loadOrder.includes("revision_deployment")) {
    return loadOrder.flatMap((entry) => (entry === "revision_deployment" ? [entry, "deployment_feedback"] : [entry]));
  }
  if (loadOrder.includes("omni_language_revision")) {
    return loadOrder.flatMap((entry) => (entry === "omni_language_revision" ? [entry, "deployment_feedback"] : [entry]));
  }
  return [...loadOrder, "deployment_feedback"];
}

function insertFeedbackWaveCycleLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_wave_cycle")) {
    return loadOrder;
  }
  if (loadOrder.includes("deployment_feedback")) {
    return loadOrder.flatMap((entry) => (entry === "deployment_feedback" ? [entry, "feedback_wave_cycle"] : [entry]));
  }
  if (loadOrder.includes("revision_deployment")) {
    return loadOrder.flatMap((entry) => (entry === "revision_deployment" ? [entry, "feedback_wave_cycle"] : [entry]));
  }
  return [...loadOrder, "feedback_wave_cycle"];
}

function insertDeepArchiveDeltaLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("deep_archive_delta")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_wave_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_wave_cycle" ? [entry, "deep_archive_delta"] : [entry]));
  }
  if (loadOrder.includes("deployment_feedback")) {
    return loadOrder.flatMap((entry) => (entry === "deployment_feedback" ? [entry, "deep_archive_delta"] : [entry]));
  }
  return [...loadOrder, "deep_archive_delta"];
}

function insertFeedbackReturnMintLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_mint")) {
    return loadOrder;
  }
  if (loadOrder.includes("deep_archive_delta")) {
    return loadOrder.flatMap((entry) => (entry === "deep_archive_delta" ? [entry, "feedback_return_mint"] : [entry]));
  }
  if (loadOrder.includes("feedback_wave_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_wave_cycle" ? [entry, "feedback_return_mint"] : [entry]));
  }
  return [...loadOrder, "feedback_return_mint"];
}

function insertFeedbackReturnRedeployLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_redeploy")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_mint")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_mint" ? [entry, "feedback_return_redeploy"] : [entry]));
  }
  if (loadOrder.includes("deep_archive_delta")) {
    return loadOrder.flatMap((entry) => (entry === "deep_archive_delta" ? [entry, "feedback_return_redeploy"] : [entry]));
  }
  return [...loadOrder, "feedback_return_redeploy"];
}

function insertFeedbackReturnFindingsLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_findings")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_redeploy")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_redeploy" ? [entry, "feedback_return_findings"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_mint")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_mint" ? [entry, "feedback_return_findings"] : [entry]));
  }
  return [...loadOrder, "feedback_return_findings"];
}

function insertFeedbackReturnPressureLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_pressure")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_findings")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_findings" ? [entry, "feedback_return_pressure"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_redeploy")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_redeploy" ? [entry, "feedback_return_pressure"] : [entry]));
  }
  return [...loadOrder, "feedback_return_pressure"];
}

function insertFeedbackReturnPressureCycleLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_pressure_cycle")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_pressure")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_pressure" ? [entry, "feedback_return_pressure_cycle"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_findings")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_findings" ? [entry, "feedback_return_pressure_cycle"] : [entry]));
  }
  return [...loadOrder, "feedback_return_pressure_cycle"];
}

function insertFeedbackReturnPressurePatchLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_pressure_patch")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_pressure_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_pressure_cycle" ? [entry, "feedback_return_pressure_patch"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_pressure")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_pressure" ? [entry, "feedback_return_pressure_patch"] : [entry]));
  }
  return [...loadOrder, "feedback_return_pressure_patch"];
}

function insertFeedbackReturnPatchApplyLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_pressure_patch")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_pressure_patch" ? [entry, "feedback_return_patch_apply"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_pressure_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_pressure_cycle" ? [entry, "feedback_return_patch_apply"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply"];
}

function insertFeedbackReturnPatchApplyFindingsLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_findings")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply" ? [entry, "feedback_return_patch_apply_findings"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_pressure_patch")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_pressure_patch" ? [entry, "feedback_return_patch_apply_findings"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_findings"];
}

function insertFeedbackReturnPatchApplyPressureLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_findings")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_findings" ? [entry, "feedback_return_patch_apply_pressure"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply" ? [entry, "feedback_return_patch_apply_pressure"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure"];
}

function insertFeedbackReturnPatchApplyPressureCycleLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_cycle")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure" ? [entry, "feedback_return_patch_apply_pressure_cycle"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_findings")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_findings" ? [entry, "feedback_return_patch_apply_pressure_cycle"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_cycle"];
}

function insertFeedbackReturnPatchApplyPressurePatchLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_cycle" ? [entry, "feedback_return_patch_apply_pressure_patch"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure" ? [entry, "feedback_return_patch_apply_pressure_patch"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch" ? [entry, "feedback_return_patch_apply_pressure_patch_apply"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_cycle" ? [entry, "feedback_return_patch_apply_pressure_patch_apply"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyFindingsLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_findings")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_findings"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_findings"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply_findings"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyPressureLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_findings")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_findings" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply_pressure"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyPressureCycleLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_cycle")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_cycle"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_findings")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_findings" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_cycle"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply_pressure_cycle"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure_cycle" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure_patch" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_cycle")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure_cycle" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_findings")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_findings"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure_patch" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_findings"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_findings"];
}

function insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure")) {
    return loadOrder;
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_findings")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_findings" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure"] : [entry]));
  }
  if (loadOrder.includes("feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply")) {
    return loadOrder.flatMap((entry) => (entry === "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply" ? [entry, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure"] : [entry]));
  }
  return [...loadOrder, "feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure"];
}

function insertControlPanelLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("control_panel_language")) {
    return loadOrder;
  }
  if (loadOrder.includes("planner_wave")) {
    return loadOrder.flatMap((entry) => (entry === "planner_wave" ? ["control_panel_language", entry] : [entry]));
  }
  if (loadOrder.includes("scout_six")) {
    return loadOrder.flatMap((entry) => (entry === "scout_six" ? ["control_panel_language", entry] : [entry]));
  }
  return [...loadOrder, "control_panel_language"];
}

function insertOmniLanguageLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("omni_language_planes")) {
    return loadOrder;
  }
  if (loadOrder.includes("old_language_anchors")) {
    return loadOrder.flatMap((entry) => (entry === "old_language_anchors" ? ["omni_language_planes", entry] : [entry]));
  }
  if (loadOrder.includes("control_panel_language")) {
    return loadOrder.flatMap((entry) => (entry === "control_panel_language" ? ["omni_language_planes", entry] : [entry]));
  }
  return [...loadOrder, "omni_language_planes"];
}

function insertExpansionKnowledgeLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("expansion_knowledge")) {
    return loadOrder;
  }
  if (loadOrder.includes("old_language_anchors")) {
    return loadOrder.flatMap((entry) => (entry === "old_language_anchors" ? ["expansion_knowledge", entry] : [entry]));
  }
  if (loadOrder.includes("control_panel_language")) {
    return loadOrder.flatMap((entry) => (entry === "control_panel_language" ? ["expansion_knowledge", entry] : [entry]));
  }
  return [...loadOrder, "expansion_knowledge"];
}

function insertAdminReflectionTrainingLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("admin_reflection_training")) {
    return loadOrder;
  }
  if (loadOrder.includes("old_language_anchors")) {
    return loadOrder.flatMap((entry) => (entry === "old_language_anchors" ? ["admin_reflection_training", entry] : [entry]));
  }
  if (loadOrder.includes("control_panel_language")) {
    return loadOrder.flatMap((entry) => (entry === "control_panel_language" ? ["admin_reflection_training", entry] : [entry]));
  }
  return [...loadOrder, "admin_reflection_training"];
}

function insertAnalysisMemoryLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("analysis_memory")) {
    return loadOrder;
  }
  if (loadOrder.includes("omni_language_planes")) {
    return loadOrder.flatMap((entry) => (entry === "omni_language_planes" ? ["analysis_memory", entry] : [entry]));
  }
  if (loadOrder.includes("old_language_anchors")) {
    return loadOrder.flatMap((entry) => (entry === "old_language_anchors" ? ["analysis_memory", entry] : [entry]));
  }
  if (loadOrder.includes("control_panel_language")) {
    return loadOrder.flatMap((entry) => (entry === "control_panel_language" ? ["analysis_memory", entry] : [entry]));
  }
  return [...loadOrder, "analysis_memory"];
}

function insertTimestampMemoryLoadOrder(values = []) {
  const loadOrder = normalizeStringArray(values, 120);
  if (loadOrder.includes("timestamp_memory")) {
    return loadOrder;
  }
  if (loadOrder.includes("ancestry_memory")) {
    return loadOrder.flatMap((entry) => (entry === "ancestry_memory" ? [entry, "timestamp_memory"] : [entry]));
  }
  if (loadOrder.includes("pid_version")) {
    return loadOrder.flatMap((entry) => (entry === "pid_version" ? [entry, "timestamp_memory"] : [entry]));
  }
  if (loadOrder.includes("memory")) {
    return loadOrder.flatMap((entry) => (entry === "memory" ? ["timestamp_memory", entry] : [entry]));
  }
  return ["timestamp_memory", ...loadOrder];
}

function buildPlannerLaneSkills(laneId = "", mapsToLaneId = "") {
  const key = cleanText(mapsToLaneId || laneId, 120);
  if (key === "memory_lane") {
    return ["memory_slice_collector", "bundle_ledger", "anchor_recall"];
  }
  if (key === "pid_orchestrator_lane") {
    return ["identity_lineage", "named_selection", "packet_epoch_guard"];
  }
  if (key === "runtime_index_lane") {
    return ["surface_index_routing", "compact_packet_routing", "catalog_projection"];
  }
  if (key === "promotion_proof_lane") {
    return ["proof_gate", "negative_proof", "rollback_proof"];
  }
  if (key === "task_mistake_proof_lane") {
    return ["mistake_timeline", "repair_visibility", "self_heal_guard"];
  }
  if (key === "rule_authority_device_lane") {
    return ["authority_boundary", "device_boundary", "gnn_observer_only"];
  }
  return ["named_white_room_planner"];
}

function buildPlannerLaneChoiceBundleIds(mapsToLaneId = "") {
  const key = cleanText(mapsToLaneId, 120);
  if (key === "memory_lane") {
    return ["white-room-rebuild", "self-reflection-loop"];
  }
  if (key === "pid_orchestrator_lane") {
    return ["leader-orchestrator", "identity-proof"];
  }
  if (key === "runtime_index_lane") {
    return ["leader-index-all", "omni-route"];
  }
  if (key === "promotion_proof_lane") {
    return ["guardrail-gate", "identity-proof"];
  }
  if (key === "task_mistake_proof_lane") {
    return ["self-reflection-loop", "guardrail-gate"];
  }
  if (key === "rule_authority_device_lane") {
    return ["device-boundary", "gnn-observer"];
  }
  return ["leader-orchestrator"];
}

function buildComputeWatcherSet(partCatalog = {}) {
  return (Array.isArray(partCatalog.units) ? partCatalog.units : [])
    .filter((entry) => cleanText(entry.category, 80) === "compute_watch")
    .map((entry) => ({
      id: cleanText(entry.id, 120),
      profileId: cleanText(entry.profileId, 120),
      pidVersion: cleanText(entry.pidVersion, 240),
      deviceSurfaceId: cleanText(entry.deviceSurfaceId, 120),
      serviceType: cleanText(entry.serviceType, 120),
      controlState: cleanText(entry.controlState, 120),
      selectionState: cleanText(entry.selectionState, 120)
    }));
}

function buildOmniLanguagePlanes(config = {}, branch = {}) {
  const planesConfig = config.omniLanguagePlanes || {};
  const partCatalog = branch.partCatalog || {};
  const computeWatchers = buildComputeWatcherSet(partCatalog);
  const validUnitIds = new Set((Array.isArray(partCatalog.units) ? partCatalog.units : []).map((entry) => cleanText(entry.id, 120)));
  const planes = (Array.isArray(planesConfig.planes) ? planesConfig.planes : [])
    .map((plane) => {
      const specialistUnitIds = normalizeStringArray(plane.specialistUnitIds || [], 120)
        .filter((entry) => validUnitIds.has(entry));
      return {
        id: cleanText(plane.id, 120),
        symbol: cleanText(plane.symbol, 12),
        label: cleanText(plane.label || plane.id, 160),
        deviceSpecificity: cleanText(plane.deviceSpecificity, 120),
        toolAccess: cleanText(plane.toolAccess, 120),
        scope: cleanText(plane.scope, 160),
        specialistUnitIds,
        specialistCount: specialistUnitIds.length
      };
    })
    .filter((entry) => entry.id);

  return {
    fabricId: cleanText(planesConfig.fabricId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(planesConfig.label, 160),
    summary: clipText(planesConfig.summary || "", 240),
    orchestrationLaw: cleanText(planesConfig.orchestrationLaw, 160),
    specialistLaw: cleanText(planesConfig.specialistLaw, 160),
    translationLaw: cleanText(planesConfig.translationLaw, 160),
    localityTuple: normalizeStringArray(planesConfig.localityTuple || [], 40),
    hardwareSymbols: (Array.isArray(planesConfig.hardwareSymbols) ? planesConfig.hardwareSymbols : [])
      .map((entry) => ({
        id: cleanText(entry.id, 40),
        symbol: cleanText(entry.symbol, 12)
      }))
      .filter((entry) => entry.id && entry.symbol),
    levelAxis: {
      modelId: cleanText(branch.universalExpansion?.modelId, 120),
      rootLevelLabel: cleanText(branch.universalExpansion?.root?.levelLabel, 40),
      subordinateLevelLabel: cleanText(branch.universalExpansion?.subordinate?.levelLabel, 40),
      panelLevelLabel: cleanText(branch.universalExpansion?.panel?.levelLabel, 40),
      mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
      governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
      expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40)
    },
    portableRootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    controlPanelId: cleanText(branch.controlPanel?.panelId, 120),
    mapScanId: cleanText(branch.mapMapMappedScanning?.scanId, 120),
    computeWatcherIds: normalizeStringArray(computeWatchers.map((entry) => entry.id), 120),
    planes
  };
}

function buildSessionCapsule(config = {}, sourceProfile = {}, branch = {}) {
  const capsuleConfig = config.sessionCapsule || {};
  const controller = sourceProfile.deviceLanguage?.controller || {};
  const device = sourceProfile.deviceLanguage?.device || {};
  const memory = sourceProfile.deviceLanguage?.memory || {};
  const index = sourceProfile.deviceLanguage?.index || {};
  const mistakeIndex = sourceProfile.deviceLanguage?.mistakeIndex || {};
  const selfHealing = sourceProfile.deviceLanguage?.selfHealing || {};
  const selectedPid = sourceProfile.pidProfile?.selected || {};
  const activeBundles = normalizeStringArray(
    (Array.isArray(sourceProfile.namedSurfaces?.capabilityBundleTable) ? sourceProfile.namedSurfaces.capabilityBundleTable : [])
      .map((entry) => cleanText(entry.id, 120)),
    120
  );
  const oldLanguageAnchors = (Array.isArray(sourceProfile.languageFocus) ? sourceProfile.languageFocus : [])
    .slice(0, 8)
    .map((entry) => ({
      id: cleanText(entry.id, 80),
      title: cleanText(entry.title, 200),
      type: cleanText(entry.type, 40),
      relativePath: cleanText(entry.relativePath, 240)
    }))
    .filter((entry) => entry.id);

  return {
    capsuleId: cleanText(capsuleConfig.capsuleId, 120),
    generatedAt: branch.generatedAt,
    summary: clipText(capsuleConfig.summary || "", 240),
    mode: "white_room_session_capsule",
    holdRule: cleanText(branch.sourceLanguage?.holdRule, 160),
    promotionGate: cleanText(branch.sourceLanguage?.promotionGate, 160),
    controller: {
      surfaceId: cleanText(controller.surfaceId, 120),
      profileId: cleanText(controller.profileId, 120),
      pidVersion: cleanText(controller.pidVersion || selectedPid.pidVersion, 240),
      spawnPid: cleanText(selectedPid.spawnPid, 120),
      timestamp: cleanText(controller.timestamp || selectedPid.spawnedAt || branch.generatedAt, 80)
    },
    controllerHost: {
      surfaceId: "liris-here",
      portableRootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
      portableRootState: cleanText(branch.portableRoot?.state, 120)
    },
    universal: {
      modelId: cleanText(branch.universalExpansion?.modelId, 120),
      machineLevelLabel: cleanText(branch.universalExpansion?.subordinate?.levelLabel, 40),
      deviceSpecificity: cleanText(branch.universalExpansion?.subordinate?.deviceSpecificity, 120),
      superiorSurfaceId: cleanText(branch.universalExpansion?.subordinate?.superiorSurfaceId || branch.universalExpansion?.root?.surfaceId, 120),
      superiorLevelLabel: cleanText(branch.universalExpansion?.root?.levelLabel, 40)
    },
    ancestryMemory: {
      memoryId: cleanText(branch.ancestryMemory?.memoryId, 120),
      orderingLaw: cleanText(branch.ancestryMemory?.orderingLaw, 160),
      lineageLaw: cleanText(branch.ancestryMemory?.lineageLaw, 160),
      exactAncestryKey: cleanText(branch.ancestryMemory?.exactAncestryKey, 240)
    },
    languagePlanes: {
      fabricId: cleanText(config.omniLanguagePlanes?.fabricId, 120),
      specialistLaw: cleanText(config.omniLanguagePlanes?.specialistLaw, 160),
      translationLaw: cleanText(config.omniLanguagePlanes?.translationLaw, 160)
    },
    expansionKnowledge: {
      knowledgeId: cleanText(branch.expansionKnowledge?.knowledgeId || config.expansionKnowledge?.knowledgeId, 120),
      enforcementState: cleanText(branch.expansionKnowledge?.enforcementState || config.expansionKnowledge?.enforcementState, 160),
      futureGate: cleanText(branch.expansionKnowledge?.futureGate || config.expansionKnowledge?.futureGate, 160)
    },
    deepArchiveReplay: {
      replayId: cleanText(branch.deepArchiveReplay?.replayId || config.deepArchiveReplay?.replayId, 120),
      triggerLaw: cleanText(branch.deepArchiveReplay?.triggerLaw || config.deepArchiveReplay?.triggerLaw, 160),
      resultAuthority: cleanText(branch.deepArchiveReplay?.resultAuthority || config.deepArchiveReplay?.resultAuthority, 160),
      targetWaveIds: normalizeStringArray(branch.deepArchiveReplay?.waveIds || config.deepArchiveReplay?.waveIds || [], 120)
    },
    deepArchiveFindings: {
      findingsId: cleanText(branch.deepArchiveFindings?.findingsId || config.deepArchiveFindings?.findingsId, 120),
      resultAuthority: cleanText(branch.deepArchiveFindings?.resultAuthority || config.deepArchiveFindings?.resultAuthority, 160),
      findingIds: normalizeStringArray((branch.deepArchiveFindings?.findings || []).map((entry) => entry.id), 120)
    },
    waveCascade: {
      cascadeId: cleanText(branch.waveCascade?.cascadeId || config.waveCascade?.cascadeId, 120),
      resultAuthority: cleanText(branch.waveCascade?.resultAuthority || config.waveCascade?.resultAuthority, 160),
      activeOverWaveIds: normalizeStringArray(branch.waveCascade?.activeOverWaveIds || [], 120),
      stagedOverWaveIds: normalizeStringArray(branch.waveCascade?.stagedOverWaveIds || [], 120)
    },
    adminReflectionTraining: {
      trainingId: cleanText(branch.adminReflectionTraining?.trainingId, 120),
      mapLevelLabel: cleanText(branch.adminReflectionTraining?.mapLevelLabel, 40),
      governanceLevelLabel: cleanText(branch.adminReflectionTraining?.governanceLevelLabel, 40),
      timeAwarenessLaw: cleanText(branch.adminReflectionTraining?.timeAwarenessLaw, 160)
    },
    timestampMemory: {
      memoryId: cleanText(branch.timestampMemory?.memoryId, 120),
      rememberLaw: cleanText(branch.timestampMemory?.rememberLaw, 160),
      sequenceLaw: cleanText(branch.timestampMemory?.sequenceLaw, 160),
      translationAvailabilityLaw: cleanText(branch.timestampMemory?.translationAvailabilityLaw, 160)
    },
    device: {
      surfaceId: cleanText(device.surfaceId, 120),
      routeKind: cleanText(device.routeKind, 80),
      adbState: cleanText(device.adbState, 80),
      hostSurfaceId: cleanText(sourceProfile.hostAuthority?.root?.surfaceId, 120)
    },
    loadOrder: insertTimestampMemoryLoadOrder(
      insertAncestryMemoryLoadOrder(
        insertAnalysisMemoryLoadOrder(
          insertAdminReflectionTrainingLoadOrder(
            insertExpansionKnowledgeLoadOrder(
              insertOmniLanguageLoadOrder(
                insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureLoadOrder(
                insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsLoadOrder(
                insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyLoadOrder(
                  insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchLoadOrder(
                    insertFeedbackReturnPatchApplyPressurePatchApplyPressureCycleLoadOrder(
                      insertFeedbackReturnPatchApplyPressurePatchApplyPressureLoadOrder(
                        insertFeedbackReturnPatchApplyPressurePatchApplyFindingsLoadOrder(
                          insertFeedbackReturnPatchApplyPressurePatchApplyLoadOrder(
                            insertFeedbackReturnPatchApplyPressurePatchLoadOrder(
                              insertFeedbackReturnPatchApplyPressureCycleLoadOrder(
                                insertFeedbackReturnPatchApplyPressureLoadOrder(
                                  insertFeedbackReturnPatchApplyFindingsLoadOrder(
                                    insertFeedbackReturnPatchApplyLoadOrder(
                                      insertFeedbackReturnPressurePatchLoadOrder(
                                        insertFeedbackReturnPressureCycleLoadOrder(
                                          insertFeedbackReturnPressureLoadOrder(
                                            insertFeedbackReturnFindingsLoadOrder(
                                              insertFeedbackReturnRedeployLoadOrder(
                                                insertFeedbackReturnMintLoadOrder(
                                                  insertDeepArchiveDeltaLoadOrder(
                                                    insertFeedbackWaveCycleLoadOrder(
                                                      insertDeploymentFeedbackLoadOrder(
                                                        insertRevisionDeploymentLoadOrder(
                                                          insertOmniLanguageRevisionLoadOrder(
                                                            insertShannonPartFindingsLoadOrder(
                                                              insertLanguageGapAnalysisLoadOrder(
                                                                insertDeepArchiveFindingsLoadOrder(
                                                                  insertDeepArchiveReplayLoadOrder(
                                                                    insertWaveCascadeLoadOrder(
                                                                      insertWaveLatticeLoadOrder(
                                                                        insertControlPanelLoadOrder(
                                                                          insertLegacyReferenceLoadOrder(
                                                                            insertPlannerWaveLoadOrder(capsuleConfig.loadOrder || [])
                                                                          )
                                                                        )
                                                                      )
                                                                    )
                                                                  )
                                                                )
                                                              )
                                                            )
                                                          )
                                                        )
                                                      )
                                                    )
                                                  )
                                                )
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )))
                )
              )
            )
          )
        )
      )
    ),
    memoryClasses: normalizeStringArray(capsuleConfig.memoryClasses || [], 120),
    proofClasses: normalizeStringArray(capsuleConfig.proofClasses || [], 120),
    pendingGapClasses: normalizeStringArray(capsuleConfig.pendingGapClasses || [], 120),
    portableRoot: {
      surfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
      drive: cleanText(branch.portableRoot?.drive, 80),
      state: cleanText(branch.portableRoot?.state, 120),
      copiedSurfaceIds: normalizeStringArray(branch.portableRoot?.copiedSurfaceIds || [], 120)
    },
    memoryRefs: {
      curatedMemoryPath: cleanText(memory.curatedMemoryPath, 240),
      latestReflectionPath: cleanText(sourceProfile.memory?.latestReflection?.reflectStateRelativePath, 240),
      mistakeIndexId: cleanText(mistakeIndex.indexId, 160),
      selfHealingTupleId: cleanText(selfHealing.tupleId || selfHealing.id, 160)
    },
    indexRefs: {
      profile: cleanText(index.profile, 80),
      signature: cleanText(index.signature, 120),
      manifestPath: cleanText(index.manifestPath || sourceProfile.index?.runningManifestPath, 240),
      skillToolIndexPath: cleanText(index.skillToolIndexPath || sourceProfile.index?.skillToolIndex?.relativePath, 240)
    },
    activeBundles,
    oldLanguageAnchors,
    orchestrationState: {
      stageId: "white_room_observe",
      nextPacketId: cleanText(config.controlPanel?.panelId || config.plannerWave?.waveId || config.mapMapMappedScanning?.scanId || config.scoutSix?.scoutId, 120),
      gnnMode: cleanText(branch.gnnChain?.[0], 80),
      replacementState: "living_language_preserved"
    }
  };
}

function buildPlannerWave(config = {}, branch = {}) {
  const plannerConfig = config.plannerWave || {};
  const controller = branch.sessionCapsule?.controller || {};
  const device = branch.sessionCapsule?.device || {};
  const lanes = (Array.isArray(plannerConfig.lanes) ? plannerConfig.lanes : [])
    .map((lane, index) => ({
      id: cleanText(lane.id, 120),
      order: index + 1,
      mapsToLaneId: cleanText(lane.mapsToLaneId, 120),
      profileId: `${cleanText(lane.id, 120)}-profile-v1`,
      pidVersion: `${cleanText(lane.id, 120)}@${branch.generatedAt}`,
      deviceSurfaceId: cleanText(device.surfaceId, 120),
      timestamp: branch.generatedAt,
      serviceType: "white_room_planner_lane",
      skills: buildPlannerLaneSkills(lane.id, lane.mapsToLaneId),
      choiceBundleIds: buildPlannerLaneChoiceBundleIds(lane.mapsToLaneId),
      vote: cleanText(lane.vote, 160),
      keyDecisions: normalizeStringArray(lane.keyDecisions || [], 120),
      risks: normalizeStringArray(lane.risks || [], 120),
      exactIdentity: {
        surfaceId: cleanText(lane.id, 120),
        profileId: `${cleanText(lane.id, 120)}-profile-v1`,
        pidVersion: `${cleanText(lane.id, 120)}@${branch.generatedAt}`,
        deviceSurfaceId: cleanText(device.surfaceId, 120),
        timestamp: branch.generatedAt
      },
      controllerPidVersion: cleanText(controller.pidVersion, 240),
      status: "advisory_ready"
    }))
    .filter((entry) => entry.id);

  return {
    waveId: cleanText(plannerConfig.waveId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(plannerConfig.label, 160),
    summary: clipText(plannerConfig.summary || "", 240),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    stageId: "white_room_plan",
    useLaw: cleanText(plannerConfig.useLaw, 160),
    identityModel: cleanText(plannerConfig.identityModel, 160),
    resultAuthority: cleanText(plannerConfig.resultAuthority, 160),
    laneCount: lanes.length,
    order: lanes.map((entry) => entry.id),
    nextPacketId: cleanText(config.legacyReferenceWave?.waveId || config.mapMapMappedScanning?.scanId || config.scoutSix?.scoutId, 120),
    lanes
  };
}

function buildWaveAgentClasses(config = {}, branch = {}) {
  const classesConfig = config.waveAgentClasses || {};
  const scan = branch.mapMapMappedScanning || {};
  const planner = branch.plannerWave || {};
  const frontBack = branch.frontBackWave || {};
  const activeScanWaveIds = (Array.isArray(scan.waves) ? scan.waves : [])
    .filter((entry) => cleanText(entry.role, 80) === "sector_scan" && cleanText(entry.status, 80) === "ready_to_deploy")
    .map((entry) => cleanText(entry.id, 120));
  const nextWaveIds = normalizeStringArray(
    (branch.researchAnalysis?.nextWaveIds && branch.researchAnalysis.nextWaveIds.length
      ? branch.researchAnalysis.nextWaveIds
      : (Array.isArray(scan.waves) ? scan.waves : [])
        .filter((entry) => cleanText(entry.status, 80) === "staged")
        .slice(0, 6)
        .map((entry) => cleanText(entry.id, 120))),
    120
  );
  const classes = [
    {
      id: "named-planner",
      symbol: "WP",
      label: "Named Planner",
      authority: cleanText(planner.resultAuthority, 120),
      accessLevelIds: ["leader_orchestrator"],
      bundleIds: ["white-room-rebuild"],
      sourceIds: normalizeStringArray((planner.order || []), 120),
      deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
      pidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
      timestamp: branch.generatedAt,
      mode: "plan_named_only"
    },
    {
      id: "self-thinker-scout",
      symbol: "WS",
      label: "Self Thinker Scout",
      authority: "evidence_first",
      accessLevelIds: ["leader_orchestrator", "observer_gnn"],
      bundleIds: ["gnn-observer", "self-reflection-loop"],
      sourceIds: activeScanWaveIds,
      deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
      pidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
      timestamp: branch.generatedAt,
      mode: "scan_return_reflect"
    },
    {
      id: "micro-translation-box",
      symbol: "WM",
      label: "Micro Translation Box",
      authority: "relay_only",
      accessLevelIds: ["leader_orchestrator", "service_operator"],
      bundleIds: ["self-reflection-loop"],
      sourceIds: ["voice-meeting-inject", "translation_micro"],
      deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
      pidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
      timestamp: branch.generatedAt,
      mode: "micro_packet_translation"
    },
    {
      id: "instant-named",
      symbol: "WI",
      label: "Instant Named",
      authority: "named_ready_pending_route",
      accessLevelIds: ["leader_orchestrator", "guardrail"],
      bundleIds: ["leader-orchestrator", "identity-proof"],
      sourceIds: nextWaveIds,
      deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
      pidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
      timestamp: branch.generatedAt,
      mode: "instant_reload_named_only"
    },
    {
      id: "proof-guard",
      symbol: "WG",
      label: "Proof Guard",
      authority: "proof_audit",
      accessLevelIds: ["guardrail", "super_governance"],
      bundleIds: ["guardrail-gate", "shannon-part-or-whole"],
      sourceIds: normalizeStringArray([
        ...(frontBack.backOrder || []),
        "shannon-evidence",
        "shannon-scout"
      ], 120),
      deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
      pidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
      timestamp: branch.generatedAt,
      mode: "prove_gate_backline"
    }
  ];

  return {
    classesId: cleanText(classesConfig.classesId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(classesConfig.label || classesConfig.classesId, 160),
    summary: clipText(classesConfig.summary || "Named wave classes for planner, scout, micro translation, instant reload, and proof guard routing.", 240),
    useLaw: cleanText(classesConfig.useLaw || "route_named_wave_classes_through_control_panel", 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    classCount: classes.length,
    classes
  };
}

function buildWaveLattice(config = {}, branch = {}) {
  const latticeConfig = config.waveLattice || {};
  const plannerWave = branch.plannerWave || {};
  const scoutSix = branch.scoutSix || {};
  const frontBackWave = branch.frontBackWave || {};
  const mapScan = branch.mapMapMappedScanning || {};
  const plannerById = new Map((Array.isArray(plannerWave.lanes) ? plannerWave.lanes : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const scoutById = new Map((Array.isArray(scoutSix.lanes) ? scoutSix.lanes : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const frontById = new Map((Array.isArray(frontBackWave.frontLanes) ? frontBackWave.frontLanes : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const backById = new Map((Array.isArray(frontBackWave.backLanes) ? frontBackWave.backLanes : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const scanById = new Map((Array.isArray(mapScan.waves) ? mapScan.waves : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const metaWaves = (Array.isArray(latticeConfig.metaWaves) ? latticeConfig.metaWaves : [])
    .map((entry, index) => {
      const plannerLaneIds = normalizeStringArray(entry.plannerLaneIds || [], 120).filter((id) => plannerById.has(id));
      const scoutLaneIds = normalizeStringArray(entry.scoutLaneIds || [], 120).filter((id) => scoutById.has(id));
      const frontLaneIds = normalizeStringArray(entry.frontLaneIds || [], 120).filter((id) => frontById.has(id));
      const backLaneIds = normalizeStringArray(entry.backLaneIds || [], 120).filter((id) => backById.has(id));
      const scanWaveIds = normalizeStringArray(entry.scanWaveIds || [], 120).filter((id) => scanById.has(id));
      return {
        id: cleanText(entry.id, 120),
        label: cleanText(entry.label || entry.id, 160),
        order: index + 1,
        purpose: cleanText(entry.purpose, 160),
        planeIds: normalizeStringArray(entry.planeIds || [], 40),
        plannerLaneIds,
        scoutLaneIds,
        frontLaneIds,
        backLaneIds,
        scanWaveIds,
        campaignState: scanWaveIds.some((id) => cleanText(scanById.get(id)?.status, 80) === "ready_to_deploy") ? "ready_to_deploy" : "staged"
      };
    })
    .filter((entry) => entry.id);
  const rootPidVersion = cleanText(branch.asolariaHandoff?.target?.pidVersion || `${cleanText(branch.portableRoot?.surfaceId, 120)}@${branch.generatedAt}`, 240);
  const controllerPidVersion = cleanText(branch.sessionCapsule?.controller?.pidVersion, 240);
  const levelMaps = (Array.isArray(branch.universalExpansion?.levels) ? branch.universalExpansion.levels : [])
    .map((level) => {
      const id = cleanText(level.id, 40);
      const isRoot = id === cleanText(branch.universalExpansion?.root?.levelLabel, 40);
      const isPanel = id === cleanText(branch.universalExpansion?.panel?.levelLabel, 40);
      const isMap = id === cleanText(branch.universalExpansion?.map?.levelLabel, 40);
      const isGov = id === cleanText(branch.universalExpansion?.governance?.levelLabel, 40);
      const isExpand = id === cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40);
      return {
        id,
        kind: cleanText(level.kind, 120),
        humanLabel: cleanText(level.humanLabel, 160),
        timestamp: branch.generatedAt,
        pidVersion: isRoot || isExpand ? rootPidVersion : controllerPidVersion,
        locationCode: isRoot || isExpand ? cleanText(branch.portableRoot?.surfaceId, 120) : cleanText(branch.sessionCapsule?.controllerHost?.surfaceId, 120),
        deviceSurfaceId: isRoot || isExpand ? cleanText(branch.portableRoot?.surfaceId, 120) : cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
        orchestrationRole: isRoot ? "leader_of_leaders" : (isGov ? "governance_window" : (isExpand ? "expansion_console" : (isPanel ? "node_control_panel" : (isMap ? "map_scan" : "node_orchestrator")))),
        networkScope: isRoot ? "portable_root_network" : (isMap ? "local_scan_network" : (isGov ? "cross_campaign_network" : (isExpand ? "cross_colony_network" : "local_node_network"))),
        waveCapacity: isRoot ? 1 : (isPanel ? Number(branch.mapMapMappedScanning?.capacityGovernor?.maxPlannerLanesPerWave || 0) : (isMap ? Number(branch.mapMapMappedScanning?.capacityGovernor?.maxConcurrentScanWaves || 0) : (isGov ? Number(branch.mapMapMappedScanning?.capacityGovernor?.maxActiveCampaigns || 0) : (isExpand ? 1 : Number(branch.mapMapMappedScanning?.capacityGovernor?.maxConcurrentScanWaves || 0))))),
        resourceClass: isRoot ? "portable_root_storage" : cleanText(branch.mapMapMappedScanning?.capacityGovernor?.machineClass, 120)
      };
    })
    .filter((entry) => entry.id);
  const governanceBands = [
    {
      id: "M1",
      levelId: cleanText(branch.universalExpansion?.subordinate?.levelLabel, 40),
      purpose: "node_observe_return",
      triggerWaveIds: ["wave-1-scout-alpha", "wave-2-return-alpha", "wave-3-scout-beta", "wave-4-return-beta"]
    },
    {
      id: "M2",
      levelId: cleanText(branch.universalExpansion?.panel?.levelLabel, 40),
      purpose: "panel_specialist_route",
      triggerWaveIds: ["wave-5-scout-gamma", "wave-6-return-gamma", "wave-9-redeploy-lattice", "wave-10-redeploy-proof-final"]
    },
    {
      id: "M3",
      levelId: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
      purpose: "governance_map_climb",
      triggerWaveIds: ["wave-15-reverse-governance-floor", "wave-16-reverse-governance-return", "wave-17-reverse-super-governance-map"]
    },
    {
      id: "M4",
      levelId: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
      purpose: "expansion_prove_handoff",
      triggerWaveIds: ["wave-18-reverse-super-governance-prove", "wave-13-redeploy-governance", "wave-14-redeploy-promotion"]
    }
  ];

  return {
    latticeId: cleanText(latticeConfig.latticeId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(latticeConfig.label, 160),
    summary: clipText(latticeConfig.summary || "", 240),
    useLaw: cleanText(latticeConfig.useLaw, 160),
    resultAuthority: cleanText(latticeConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    levelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    metaWaveCount: metaWaves.length,
    plannerWaveId: cleanText(plannerWave.waveId, 120),
    scoutSixId: cleanText(scoutSix.scoutId, 120),
    frontBackWaveId: cleanText(frontBackWave.waveId, 120),
    mapScanId: cleanText(mapScan.scanId, 120),
    levelMaps,
    governanceBands,
    metaWaves
  };
}

function buildWaveCascade(config = {}, branch = {}) {
  const cascadeConfig = config.waveCascade || {};
  const waveLattice = branch.waveLattice || {};
  const mapScan = branch.mapMapMappedScanning || {};
  const research = branch.researchAnalysis || {};
  const expansion = branch.expansionKnowledge || {};
  const metaById = new Map((Array.isArray(waveLattice.metaWaves) ? waveLattice.metaWaves : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const scanById = new Map((Array.isArray(mapScan.waves) ? mapScan.waves : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const weaknessById = new Map((Array.isArray(research.weaknesses) ? research.weaknesses : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const bandById = new Map((Array.isArray(waveLattice.governanceBands) ? waveLattice.governanceBands : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const maxConcurrent = Math.max(1, Number(mapScan.capacityGovernor?.maxConcurrentScanWaves || 1));
  let readyCount = 0;
  const overWaves = (Array.isArray(cascadeConfig.overWaves) ? cascadeConfig.overWaves : [])
    .map((entry, index) => {
      const metaWaveIds = normalizeStringArray(entry.metaWaveIds || [], 120).filter((id) => metaById.has(id));
      const bandIds = normalizeStringArray(entry.bandIds || [], 120).filter((id) => bandById.has(id));
      const targetLevelIds = normalizeStringArray(entry.targetLevelIds || [], 40);
      const weaknessIds = normalizeStringArray(entry.weaknessIds || [], 120).filter((id) => weaknessById.has(id));
      const metaWaves = metaWaveIds.map((id) => metaById.get(id)).filter(Boolean);
      const scanWaveIds = normalizeStringArray(metaWaves.flatMap((wave) => wave.scanWaveIds || []), 120).filter((id) => scanById.has(id));
      const scanWaves = scanWaveIds.map((id) => scanById.get(id)).filter(Boolean);
      const weaknesses = weaknessIds.map((id) => weaknessById.get(id)).filter(Boolean);
      const bandPurpose = normalizeStringArray(bandIds.map((id) => cleanText(bandById.get(id)?.purpose, 80)), 120);
      let status = "staged";
      if (scanWaves.some((wave) => cleanText(wave.status, 80) === "ready_to_deploy") && readyCount < maxConcurrent) {
        status = "ready_to_deploy";
        readyCount += 1;
      }
      return {
        id: cleanText(entry.id, 120),
        label: cleanText(entry.label || entry.id, 160),
        order: index + 1,
        purpose: cleanText(entry.purpose, 160),
        metaWaveIds,
        scanWaveIds,
        bandIds,
        bandPurpose,
        targetLevelIds,
        weaknessIds,
        severitySet: normalizeStringArray(weaknesses.map((item) => cleanText(item.severity, 40)), 40),
        triggerLawSet: normalizeStringArray(weaknesses.map((item) => cleanText(item.law, 160)), 200),
        namedSurfaceIds: normalizeStringArray([
          ...metaWaves.flatMap((wave) => [...(wave.frontLaneIds || []), ...(wave.backLaneIds || [])]),
          ...scanWaves.flatMap((wave) => normalizeStringArray(wave.legacyCampaignIds || [], 120))
        ], 120),
        status
      };
    })
    .filter((entry) => entry.id);

  return {
    cascadeId: cleanText(cascadeConfig.cascadeId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(cascadeConfig.label, 160),
    summary: clipText(cascadeConfig.summary || "", 240),
    useLaw: cleanText(cascadeConfig.useLaw, 160),
    resultAuthority: cleanText(cascadeConfig.resultAuthority, 160),
    deploymentLaw: cleanText(cascadeConfig.deploymentLaw, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    rootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    timeAwarenessLaw: cleanText(expansion.timeAwarenessLaw, 160),
    waveLatticeId: cleanText(waveLattice.latticeId, 120),
    researchAnalysisId: cleanText(research.analysisId, 120),
    overWaveCount: overWaves.length,
    activeOverWaveIds: normalizeStringArray(overWaves.filter((entry) => cleanText(entry.status, 80) === "ready_to_deploy").map((entry) => entry.id), 120),
    stagedOverWaveIds: normalizeStringArray(overWaves.filter((entry) => cleanText(entry.status, 80) === "staged").map((entry) => entry.id), 120),
    overWaves,
    nextPacketId: cleanText(mapScan.scanId, 120)
  };
}

function buildLegacyReferenceWave(config = {}, branch = {}) {
  const legacyConfig = config.legacyReferenceWave || {};
  const references = (Array.isArray(legacyConfig.references) ? legacyConfig.references : [])
    .map((reference) => {
      const filePath = cleanText(reference.path, 2000);
      return {
        id: cleanText(reference.id, 120),
        label: cleanText(reference.label || reference.id, 160),
        path: filePath,
        kind: cleanText(reference.kind, 120),
        anchorIds: normalizeStringArray(reference.anchorIds || [], 120),
        namedSurfaceIds: normalizeStringArray(reference.namedSurfaceIds || [], 120),
        visible: filePath ? fs.existsSync(filePath) : false,
        visibility: filePath ? (fs.existsSync(filePath) ? "visible" : "missing") : "missing"
      };
    })
    .filter((entry) => entry.id);
  const referenceById = new Map(references.map((entry) => [entry.id, entry]));
  const sectors = (Array.isArray(legacyConfig.sectors) ? legacyConfig.sectors : [])
    .map((sector, index) => {
      const referenceIds = normalizeStringArray(sector.referenceIds || [], 120);
      const linkedReferences = referenceIds
        .map((referenceId) => referenceById.get(referenceId))
        .filter(Boolean);
      return {
        id: cleanText(sector.id, 120),
        label: cleanText(sector.label || sector.id, 160),
        order: index + 1,
        referenceIds,
        namedSurfaceIds: normalizeStringArray([
          ...(sector.namedSurfaceIds || []),
          ...linkedReferences.flatMap((entry) => entry.namedSurfaceIds || [])
        ], 120),
        visibleReferenceCount: linkedReferences.filter((entry) => entry.visible).length,
        referenceCount: linkedReferences.length,
        status: linkedReferences.some((entry) => entry.visible) ? "ready_to_scan" : "staged_from_catalog"
      };
    })
    .filter((entry) => entry.id);
  const sectorsById = new Map(sectors.map((entry) => [entry.id, entry]));
  const waves = (Array.isArray(legacyConfig.waves) ? legacyConfig.waves : [])
    .map((wave, index) => {
      const sectorIds = normalizeStringArray(wave.sectorIds || [], 120);
      const linkedSectors = sectorIds
        .map((sectorId) => sectorsById.get(sectorId))
        .filter(Boolean);
      return {
        id: cleanText(wave.id, 120),
        role: cleanText(wave.role, 120),
        order: index + 1,
        sectorIds,
        namedSurfaceIds: normalizeStringArray(linkedSectors.flatMap((entry) => entry.namedSurfaceIds || []), 120),
        visibleReferenceCount: linkedSectors.reduce((sum, entry) => sum + Number(entry.visibleReferenceCount || 0), 0),
        status: index === 0 ? "ready_to_deploy" : "staged"
      };
    })
    .filter((entry) => entry.id);
  const waveById = new Map(waves.map((entry) => [entry.id, entry]));
  const campaigns = (Array.isArray(legacyConfig.campaigns) ? legacyConfig.campaigns : [])
    .map((campaign, index) => {
      const waveIds = normalizeStringArray(campaign.waveIds || [], 120);
      const linkedWaves = waveIds
        .map((waveId) => waveById.get(waveId))
        .filter(Boolean);
      return {
        id: cleanText(campaign.id, 120),
        label: cleanText(campaign.label || campaign.id, 160),
        purpose: cleanText(campaign.purpose, 160),
        order: index + 1,
        waveIds,
        namedSurfaceIds: normalizeStringArray(linkedWaves.flatMap((entry) => entry.namedSurfaceIds || []), 120),
        status: linkedWaves.some((entry) => cleanText(entry.status, 80) === "ready_to_deploy") ? "ready_to_deploy" : "staged"
      };
    })
    .filter((entry) => entry.id);

  return {
    waveId: cleanText(legacyConfig.waveId, 120),
    catalogId: cleanText(legacyConfig.catalogId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(legacyConfig.label, 160),
    summary: clipText(legacyConfig.summary || "", 240),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    portableRootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    stageId: "white_room_observe",
    useLaw: cleanText(legacyConfig.useLaw, 160),
    resultAuthority: cleanText(legacyConfig.resultAuthority, 160),
    sourceRoots: normalizeStringArray(legacyConfig.sourceRoots || [], 240),
    sourceRootStates: normalizeStringArray(
      (legacyConfig.sourceRoots || []).map((rootPath) => `${cleanText(rootPath, 2000)}:${fs.existsSync(cleanText(rootPath, 2000)) ? "visible" : "missing"}`),
      240
    ),
    referenceCount: references.length,
    visibleReferenceCount: references.filter((entry) => entry.visible).length,
    namedSurfaceIds: normalizeStringArray(references.flatMap((entry) => entry.namedSurfaceIds || []), 120),
    references,
    sectors,
    sectorCount: sectors.length,
    waves,
    waveCount: waves.length,
    campaigns,
    campaignCount: campaigns.length,
    nextPacketId: cleanText(config.scoutSix?.scoutId || config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildDeepArchiveReplay(config = {}, branch = {}) {
  const replayConfig = config.deepArchiveReplay || {};
  const legacy = branch.legacyReferenceWave || {};
  const references = Array.isArray(legacy.references) ? legacy.references : [];
  const sectors = Array.isArray(legacy.sectors) ? legacy.sectors : [];
  const waves = Array.isArray(legacy.waves) ? legacy.waves : [];
  const campaigns = Array.isArray(legacy.campaigns) ? legacy.campaigns : [];
  const referenceById = new Map(references.map((entry) => [cleanText(entry.id, 120), entry]));
  const sectorIds = normalizeStringArray(replayConfig.sectorIds || [], 120);
  const waveIds = normalizeStringArray(replayConfig.waveIds || [], 120);
  const campaignIds = normalizeStringArray(replayConfig.campaignIds || [], 120);
  const priorityReferenceIds = normalizeStringArray(replayConfig.priorityReferenceIds || [], 120);

  const replaySectors = sectors
    .filter((entry) => sectorIds.includes(cleanText(entry.id, 120)))
    .map((entry) => ({
      id: cleanText(entry.id, 120),
      label: cleanText(entry.label, 160),
      referenceIds: normalizeStringArray(entry.referenceIds || [], 120),
      namedSurfaceIds: normalizeStringArray(entry.namedSurfaceIds || [], 120),
      status: cleanText(entry.status, 80),
      visibleReferenceCount: Number(entry.visibleReferenceCount || 0)
    }));
  const replayWaves = waves
    .filter((entry) => waveIds.includes(cleanText(entry.id, 120)))
    .map((entry) => ({
      id: cleanText(entry.id, 120),
      role: cleanText(entry.role, 120),
      sectorIds: normalizeStringArray(entry.sectorIds || [], 120),
      namedSurfaceIds: normalizeStringArray(entry.namedSurfaceIds || [], 120),
      status: cleanText(entry.status, 80),
      visibleReferenceCount: Number(entry.visibleReferenceCount || 0)
    }));
  const replayCampaigns = campaigns
    .filter((entry) => campaignIds.includes(cleanText(entry.id, 120)))
    .map((entry) => ({
      id: cleanText(entry.id, 120),
      label: cleanText(entry.label, 160),
      purpose: cleanText(entry.purpose, 160),
      waveIds: normalizeStringArray(entry.waveIds || [], 120),
      namedSurfaceIds: normalizeStringArray(entry.namedSurfaceIds || [], 120),
      status: cleanText(entry.status, 80)
    }));
  const replayReferenceIds = normalizeStringArray([
    ...priorityReferenceIds,
    ...replaySectors.flatMap((entry) => entry.referenceIds || [])
  ], 120);
  const replayReferences = replayReferenceIds
    .map((referenceId) => referenceById.get(referenceId))
    .filter(Boolean)
    .map((entry) => ({
      id: cleanText(entry.id, 120),
      label: cleanText(entry.label, 160),
      kind: cleanText(entry.kind, 120),
      path: cleanText(entry.path, 240),
      visible: entry.visible === true,
      visibility: cleanText(entry.visibility, 40),
      namedSurfaceIds: normalizeStringArray(entry.namedSurfaceIds || [], 120)
    }));
  const replayNamedSurfaceIds = normalizeStringArray([
    ...replayReferences.flatMap((entry) => entry.namedSurfaceIds || []),
    ...replaySectors.flatMap((entry) => entry.namedSurfaceIds || []),
    ...replayWaves.flatMap((entry) => entry.namedSurfaceIds || []),
    ...replayCampaigns.flatMap((entry) => entry.namedSurfaceIds || [])
  ], 120);
  const referenceKinds = normalizeStringArray(replayReferences.map((entry) => entry.kind), 120);

  return {
    replayId: cleanText(replayConfig.replayId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(replayConfig.label, 160),
    summary: clipText(replayConfig.summary || "", 240),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    portableRootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    useLaw: cleanText(replayConfig.useLaw, 160),
    triggerLaw: cleanText(replayConfig.triggerLaw, 160),
    resultAuthority: cleanText(replayConfig.resultAuthority, 160),
    ancestryMemoryId: cleanText(branch.ancestryMemory?.memoryId, 120),
    timestampMemoryId: cleanText(branch.timestampMemory?.memoryId, 120),
    sectorIds,
    waveIds,
    campaignIds,
    priorityReferenceIds,
    sectorCount: replaySectors.length,
    waveCount: replayWaves.length,
    campaignCount: replayCampaigns.length,
    referenceCount: replayReferences.length,
    visibleReferenceCount: replayReferences.filter((entry) => entry.visible).length,
    referenceKinds,
    namedSurfaceIds: replayNamedSurfaceIds,
    sectors: replaySectors,
    waves: replayWaves,
    campaigns: replayCampaigns,
    references: replayReferences,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildDeepArchiveFindings(config = {}, branch = {}) {
  const findingsConfig = config.deepArchiveFindings || {};
  const replay = branch.deepArchiveReplay || {};
  const sectors = Array.isArray(replay.sectors) ? replay.sectors : [];
  const references = Array.isArray(replay.references) ? replay.references : [];
  const findingSectors = new Set(normalizeStringArray(findingsConfig.findingSectors || [], 120));
  const findings = sectors
    .filter((entry) => findingSectors.has(cleanText(entry.id, 120)))
    .map((sector, index) => {
      const sectorReferenceIds = normalizeStringArray(sector.referenceIds || [], 120);
      const sectorReferences = references.filter((entry) => sectorReferenceIds.includes(cleanText(entry.id, 120)));
      const namedSurfaceIds = normalizeStringArray([
        ...normalizeStringArray(sector.namedSurfaceIds || [], 120),
        ...sectorReferences.flatMap((entry) => entry.namedSurfaceIds || [])
      ], 120);
      const kindIds = normalizeStringArray(sectorReferences.map((entry) => cleanText(entry.kind, 120)), 120);
      const visibleCount = sectorReferences.filter((entry) => entry.visible === true).length;
      return {
        id: `deep-find-${index + 1}`,
        sectorId: cleanText(sector.id, 120),
        label: cleanText(sector.label, 160),
        visibleReferenceCount: visibleCount,
        referenceCount: sectorReferences.length,
        kindIds,
        namedSurfaceIds,
        risk: visibleCount > 0 ? "archive_truth_requires_named_translation" : "archive_sector_missing_on_device",
        nextWaveIds: normalizeStringArray([
          "wave-5-scout-gamma",
          "wave-6-return-gamma",
          "wave-7-scout-delta",
          "wave-8-return-delta"
        ], 120)
      };
    });

  return {
    findingsId: cleanText(findingsConfig.findingsId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(findingsConfig.label, 160),
    summary: clipText(findingsConfig.summary || "", 240),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    portableRootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    useLaw: cleanText(findingsConfig.useLaw, 160),
    resultAuthority: cleanText(findingsConfig.resultAuthority, 160),
    replayId: cleanText(replay.replayId, 120),
    ancestryMemoryId: cleanText(branch.ancestryMemory?.memoryId, 120),
    timestampMemoryId: cleanText(branch.timestampMemory?.memoryId, 120),
    findingCount: findings.length,
    findings,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildControlPanel(config = {}, branch = {}) {
  const panelConfig = config.controlPanel || {};
  const controller = branch.sessionCapsule?.controller || {};
  const device = branch.sessionCapsule?.device || {};
  const partCatalog = branch.partCatalog || {};
  const plannerWave = branch.plannerWave || {};
  const deepArchiveReplay = branch.deepArchiveReplay || {};
  const deepArchiveFindings = branch.deepArchiveFindings || {};
  const waveCascade = branch.waveCascade || {};
  const computeWatchers = buildComputeWatcherSet(partCatalog);
  const serviceUnitIds = (Array.isArray(partCatalog.units) ? partCatalog.units : [])
    .filter((entry) => ["service", "service_part", "ability"].includes(cleanText(entry.category, 80)))
    .map((entry) => cleanText(entry.id, 120));

  return {
    panelId: cleanText(panelConfig.panelId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(panelConfig.label, 160),
    summary: clipText(panelConfig.summary || "", 240),
    stageId: "white_room_map",
    controllerSurfaceId: cleanText(controller.surfaceId, 120),
    controllerPidVersion: cleanText(controller.pidVersion, 240),
    machineLevelLabel: cleanText(branch.universalExpansion?.panel?.levelLabel, 40),
    deviceSpecificity: cleanText(branch.universalExpansion?.panel?.deviceSpecificity, 120),
    scopeCode: "node_control_panel",
    deviceSurfaceId: cleanText(device.surfaceId, 120),
    portableRootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    panelModes: normalizeStringArray(panelConfig.panelModes || [], 120),
    useLaw: cleanText(panelConfig.useLaw, 160),
    noCodeLaw: cleanText(panelConfig.noCodeLaw, 160),
    summonLaw: cleanText(panelConfig.summonLaw, 160),
    plannerWaveId: cleanText(plannerWave.waveId, 120),
    deepArchiveReplayId: cleanText(deepArchiveReplay.replayId, 120),
    deepArchiveFindingsId: cleanText(deepArchiveFindings.findingsId, 120),
    waveLatticeId: cleanText(branch.waveLattice?.latticeId, 120),
    waveCascadeId: cleanText(waveCascade.cascadeId, 120),
    plannerAuthority: cleanText(plannerWave.resultAuthority, 160),
    rootSurfaceId: cleanText(partCatalog.primaryPositions?.root, 120),
    ingressSurfaceId: cleanText(partCatalog.primaryPositions?.ingress, 120),
    boundarySurfaceId: cleanText(partCatalog.primaryPositions?.boundary, 120),
    serviceSurfaceId: cleanText(partCatalog.primaryPositions?.service, 120),
    computeWatchers,
    specialistUnitIds: normalizeStringArray(serviceUnitIds, 120),
    expansionKnowledgeId: cleanText(branch.expansionKnowledge?.knowledgeId, 120),
    expansionTierIds: normalizeStringArray((branch.expansionKnowledge?.tiers || []).map((entry) => entry.id), 40),
    expansionFutureGate: cleanText(branch.expansionKnowledge?.futureGate, 160),
    expansionEnforcementState: cleanText(branch.expansionKnowledge?.enforcementState, 160),
    governorSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.governorSurfaceIds || [], 120),
    superAdminSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.superAdminSurfaceIds || [], 120),
    emergencyObservationLinkIds: normalizeStringArray(branch.expansionKnowledge?.emergencyObservationLinkIds || [], 160),
    adminReflectionTrainingId: cleanText(branch.adminReflectionTraining?.trainingId, 120),
    timestampMemoryId: cleanText(branch.timestampMemory?.memoryId, 120),
    waveAgentClassesId: cleanText(branch.waveAgentClasses?.classesId, 120),
    waveAgentClassIds: normalizeStringArray((branch.waveAgentClasses?.classes || []).map((entry) => entry.id), 120),
    legacyReferenceWaveId: cleanText(branch.legacyReferenceWave?.waveId, 120),
    nextPacketId: cleanText(waveCascade.cascadeId || deepArchiveReplay.replayId || deepArchiveFindings.findingsId || branch.waveLattice?.latticeId || plannerWave.waveId || config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildAsolariaHandoff(config = {}, branch = {}) {
  const handoffConfig = config.asolariaHandoff || {};
  const targetSurfaceId = cleanText(handoffConfig.targetSurfaceId || branch.portableRoot?.surfaceId, 120);
  const targetProfileId = cleanText(handoffConfig.targetProfileId, 120);
  const targetTimestamp = branch.generatedAt;
  const targetPidVersion = `${cleanText(handoffConfig.targetPidSeed || targetSurfaceId, 120)}@${targetTimestamp}`;
  return {
    handoffId: cleanText(handoffConfig.handoffId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(handoffConfig.label, 160),
    summary: clipText(handoffConfig.summary || "", 240),
    target: {
      surfaceId: targetSurfaceId,
      profileId: targetProfileId,
      pidVersion: targetPidVersion,
      timestamp: targetTimestamp,
      deviceSpecificity: cleanText(branch.universalExpansion?.root?.deviceSpecificity, 120) || "portable_root_only",
      levelLabel: cleanText(branch.universalExpansion?.root?.levelLabel, 40)
    },
    access: {
      accessLevelIds: normalizeStringArray(handoffConfig.targetAccessLevelIds || [], 120),
      choiceBundleIds: normalizeStringArray(handoffConfig.targetChoiceBundleIds || [], 120),
      panelId: cleanText(branch.controlPanel?.panelId, 120),
      panelModes: normalizeStringArray(branch.controlPanel?.panelModes || [], 120)
    },
    memory: {
      shortState: "where_we_left_off_control_panel_first",
      holdRule: cleanText(branch.sourceLanguage?.holdRule, 160),
      promotionGate: cleanText(branch.sourceLanguage?.promotionGate, 160),
      selfHealingTupleId: cleanText(branch.sessionCapsule?.memoryRefs?.selfHealingTupleId, 160),
      mistakeIndexId: cleanText(branch.sessionCapsule?.memoryRefs?.mistakeIndexId, 160),
      anchorIds: normalizeStringArray((branch.sessionCapsule?.oldLanguageAnchors || []).map((entry) => entry.id), 120),
      sourceControllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240)
    },
    instructions: {
      useLaw: cleanText(handoffConfig.useLaw, 160),
      finishLaw: cleanText(handoffConfig.finishLaw, 160),
      loadOrder: [
        "memory_slice",
        "timestamp_memory",
        "expansion_knowledge",
        "control_panel_language",
        "wave_lattice",
        "wave_cascade",
        "planner_wave",
        "legacy_reference_wave",
        "deep_archive_replay",
        "map_map_mapped_scanning",
        "return_reflect",
        "redeploy"
      ],
      nextPacketId: cleanText(branch.controlPanel?.panelId, 120),
      timestampMemoryId: cleanText(branch.timestampMemory?.memoryId, 120),
      expansionKnowledgeId: cleanText(branch.expansionKnowledge?.knowledgeId, 120),
      rootDescentLaw: cleanText(branch.expansionKnowledge?.rootDescentLaw, 160),
      policeUnitIds: normalizeStringArray(branch.expansionKnowledge?.policeUnitIds || [], 120),
      governorSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.governorSurfaceIds || [], 120),
      superAdminSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.asolariaVisibleSuperAdminSurfaceIds || [], 120),
      emergencyObservationLinkIds: normalizeStringArray(branch.expansionKnowledge?.emergencyObservationLinkIds || [], 160),
      adminReflectionTrainingId: cleanText(branch.adminReflectionTraining?.trainingId, 120),
      waveLatticeId: cleanText(branch.waveLattice?.latticeId, 120),
      waveCascadeId: cleanText(branch.waveCascade?.cascadeId, 120),
      plannerWaveId: cleanText(branch.plannerWave?.waveId, 120),
      legacyReferenceWaveId: cleanText(branch.legacyReferenceWave?.waveId, 120),
      deepArchiveReplayId: cleanText(branch.deepArchiveReplay?.replayId, 120),
      deepArchiveFindingsId: cleanText(branch.deepArchiveFindings?.findingsId, 120),
      mapScanId: cleanText(config.mapMapMappedScanning?.scanId, 120)
    },
    letter: {
      to: "Asolaria",
      from: "Liris",
      subject: "Load the control panel language and continue the USB-side build",
      bodyLines: [
        "Load this handoff by the target pidVersion and profile first.",
        "Use the control panel language before any raw code path.",
        "Summon named specialists through the panel only.",
        "Do not descend into lower levels; route through leaders and police/watchers.",
        "Keep the living language untouched until pro_ready.",
        "Finish the USB connection on your side, then continue planner -> scan -> return -> reflect -> redeploy."
      ]
    }
  };
}

function buildScoutSix(config = {}, branch = {}) {
  const scoutConfig = config.scoutSix || {};
  const lanes = (Array.isArray(scoutConfig.lanes) ? scoutConfig.lanes : [])
    .map((lane, index) => ({
      id: cleanText(lane.id, 120),
      label: cleanText(lane.label || lane.id, 160),
      order: index + 1,
      question: clipText(lane.question || "", 220),
      evidence: normalizeStringArray(lane.evidence || [], 120),
      output: normalizeStringArray(lane.output || [], 120),
      nextAction: cleanText(lane.nextAction, 120),
      mode: "read_only_scout",
      status: "ready"
    }))
    .filter((entry) => entry.id);

  return {
    scoutId: cleanText(scoutConfig.scoutId, 120),
    generatedAt: branch.generatedAt,
    summary: clipText(scoutConfig.summary || "", 240),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    stageId: "white_room_observe",
    laneCount: lanes.length,
    order: lanes.map((entry) => entry.id),
    lanes
  };
}

function buildFrontBackWave(config = {}, branch = {}) {
  const waveConfig = config.frontBackWave || {};
  const buildLane = (lane, order, side) => ({
    id: cleanText(lane.id, 120),
    label: cleanText(lane.label || lane.id, 160),
    order,
    side,
    focus: clipText(lane.focus || "", 220),
    writes: normalizeStringArray(lane.writes || [], 120),
    verifies: normalizeStringArray(lane.verifies || [], 120),
    boundedBy: normalizeStringArray(lane.boundedBy || [], 120),
    blocks: normalizeStringArray(lane.blocks || [], 120),
    status: "planned"
  });

  const frontLanes = (Array.isArray(waveConfig.frontLanes) ? waveConfig.frontLanes : [])
    .map((lane, index) => buildLane(lane, index + 1, "front"))
    .filter((entry) => entry.id);
  const backLanes = (Array.isArray(waveConfig.backLanes) ? waveConfig.backLanes : [])
    .map((lane, index) => buildLane(lane, index + 1, "back"))
    .filter((entry) => entry.id);

  return {
    waveId: cleanText(waveConfig.waveId, 120),
    generatedAt: branch.generatedAt,
    summary: clipText(waveConfig.summary || "", 240),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    activationGate: "scout_six_complete",
    stageId: "white_room_plan",
    frontLaneCount: frontLanes.length,
    backLaneCount: backLanes.length,
    frontOrder: frontLanes.map((entry) => entry.id),
    backOrder: backLanes.map((entry) => entry.id),
    frontLanes,
    backLanes
  };
}

function buildMapMapMappedScanning(config = {}, branch = {}) {
  const scanConfig = config.mapMapMappedScanning || {};
  const controller = branch.sessionCapsule?.controller || {};
  const device = branch.sessionCapsule?.device || {};
  const plannerWave = branch.plannerWave || {};
  const plannerLanes = Array.isArray(plannerWave.lanes) ? plannerWave.lanes : [];
  const legacyReferenceWave = branch.legacyReferenceWave || {};
  const deepArchiveReplay = branch.deepArchiveReplay || {};
  const deepArchiveFindings = branch.deepArchiveFindings || {};
  const legacyWaves = Array.isArray(legacyReferenceWave.waves) ? legacyReferenceWave.waves : [];
  const legacyCampaigns = Array.isArray(legacyReferenceWave.campaigns) ? legacyReferenceWave.campaigns : [];
  const allLegacyWaveIds = legacyWaves.map((entry) => cleanText(entry.id, 120)).filter(Boolean);
  const allLegacyCampaignIds = legacyCampaigns.map((entry) => cleanText(entry.id, 120)).filter(Boolean);
  const redeployLegacyWaveIds = legacyWaves
    .filter((entry) => [
      "roster_reference_scan",
      "bundle_reference_scan",
      "host_device_reference_scan",
      "governance_reference_scan",
      "task_reference_scan",
      "language_reference_scan",
      "integration_reference_scan",
      "admin_reference_scan",
      "knowledge_reference_scan",
      "deployment_reference_scan",
      "api_reference_scan",
      "bootstrap_reference_scan",
      "validation_reference_scan"
    ].includes(cleanText(entry.role, 120)))
    .map((entry) => cleanText(entry.id, 120))
    .filter(Boolean);
  const redeployLegacyCampaignIds = legacyCampaigns
    .filter((entry) => [
      "legacy-campaign-roster-bundle",
      "legacy-campaign-device-governance-task",
      "legacy-campaign-language-ops",
      "legacy-campaign-deploy-verify"
    ].includes(cleanText(entry.id, 120)))
    .map((entry) => cleanText(entry.id, 120))
    .filter(Boolean);
  const capacityGovernor = {
    profileId: cleanText(scanConfig.capacityGovernor?.profileId, 120),
    machineClass: cleanText(scanConfig.capacityGovernor?.machineClass, 120),
    deploymentMode: cleanText(scanConfig.capacityGovernor?.deploymentMode, 160),
    maxConcurrentScanWaves: Number(scanConfig.capacityGovernor?.maxConcurrentScanWaves || 0),
    maxActiveCampaigns: Number(scanConfig.capacityGovernor?.maxActiveCampaigns || 0),
    maxActiveLegacyWaves: Number(scanConfig.capacityGovernor?.maxActiveLegacyWaves || 0),
    maxPlannerLanesPerWave: Number(scanConfig.capacityGovernor?.maxPlannerLanesPerWave || 0),
    cpuWatcherIds: normalizeStringArray(scanConfig.capacityGovernor?.cpuWatcherIds || [], 120),
    gpuWatcherIds: normalizeStringArray(scanConfig.capacityGovernor?.gpuWatcherIds || [], 120),
    cautionLaw: cleanText(scanConfig.capacityGovernor?.cautionLaw, 160)
  };
  let readyScoutWaveCount = 0;
  const waves = (Array.isArray(scanConfig.waves) ? scanConfig.waves : [])
    .map((wave, index) => {
      const sectorLaneIds = normalizeStringArray(wave.sectorLaneIds || [], 120);
      const waveRole = cleanText(wave.role, 120);
      const plannerLaneIds = cleanText(wave.role, 120) === "redeploy_front_back"
        ? plannerLanes.slice(0, capacityGovernor.maxPlannerLanesPerWave || plannerLanes.length).map((entry) => entry.id)
        : plannerLanes
          .filter((entry) => sectorLaneIds.includes(cleanText(entry.mapsToLaneId, 120)))
          .slice(0, capacityGovernor.maxPlannerLanesPerWave || plannerLanes.length)
          .map((entry) => entry.id);
      const requestedLegacyWaveIds = normalizeStringArray(wave.legacyWaveIds || [], 120);
      const requestedLegacyCampaignIds = normalizeStringArray(wave.legacyCampaignIds || [], 120);
      const legacyWaveIds = requestedLegacyWaveIds.length
        ? requestedLegacyWaveIds
        : (cleanText(wave.role, 120) === "redeploy_front_back"
          ? (redeployLegacyWaveIds.length ? redeployLegacyWaveIds : allLegacyWaveIds)
          : allLegacyWaveIds);
      const legacyCampaignIds = requestedLegacyCampaignIds.length
        ? requestedLegacyCampaignIds
        : (waveRole === "redeploy_front_back"
          ? (redeployLegacyCampaignIds.length ? redeployLegacyCampaignIds : allLegacyCampaignIds)
          : allLegacyCampaignIds);
      let status = "staged";
      if (waveRole === "sector_scan" && readyScoutWaveCount < Math.max(1, capacityGovernor.maxConcurrentScanWaves || 1)) {
        status = "ready_to_deploy";
        readyScoutWaveCount += 1;
      }
      return {
        id: cleanText(wave.id, 120),
        order: index + 1,
        role: waveRole,
        sectorLaneIds,
        plannerLaneIds,
        status,
        timestamp: branch.generatedAt,
        legacyWaveIds: normalizeStringArray(legacyWaveIds, 120),
        legacyCampaignIds: normalizeStringArray(legacyCampaignIds, 120),
        exactIdentity: {
          surfaceId: cleanText(controller.surfaceId, 120),
          profileId: cleanText(controller.profileId, 120),
          pidVersion: cleanText(controller.pidVersion, 240),
          deviceSurfaceId: cleanText(device.surfaceId, 120),
          timestamp: branch.generatedAt
        },
        selfReflectMode: cleanText(
          index === 0
            ? scanConfig.selfReflectModes?.scout
            : (index === 1 ? scanConfig.selfReflectModes?.back : scanConfig.selfReflectModes?.redeploy),
          120
        )
      };
    })
    .filter((entry) => entry.id);

  return {
    scanId: cleanText(scanConfig.scanId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(scanConfig.label, 160),
    summary: clipText(scanConfig.summary || "", 240),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerHostSurfaceId: cleanText(branch.sessionCapsule?.controllerHost?.surfaceId, 120),
    controllerLevelLabel: cleanText(branch.universalExpansion?.subordinate?.levelLabel, 40),
    portableRootSurfaceId: cleanText(branch.portableRoot?.surfaceId, 120),
    portableRootState: cleanText(branch.portableRoot?.state, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    mapDeviceSpecificity: cleanText(branch.universalExpansion?.map?.deviceSpecificity, 120),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    governorSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.governorSurfaceIds || [], 120),
    superAdminSurfaceIds: normalizeStringArray(branch.expansionKnowledge?.superAdminSurfaceIds || [], 120),
    emergencyObservationLinkIds: normalizeStringArray(branch.expansionKnowledge?.emergencyObservationLinkIds || [], 160),
    timeAwarenessLaw: cleanText(branch.expansionKnowledge?.timeAwarenessLaw, 160),
    copiedSurfaceIds: normalizeStringArray(branch.portableRoot?.copiedSurfaceIds || [], 120),
    positionMode: cleanText(scanConfig.positionMode, 120),
    identityTuple: normalizeStringArray(scanConfig.identityTuple || [], 120),
    cycle: normalizeStringArray(scanConfig.cycle || [], 120),
    responseModes: normalizeStringArray(scanConfig.responseModes || [], 120),
    livingStructureClasses: normalizeStringArray(scanConfig.livingStructureClasses || [], 120),
    availableAccessLevelIds: normalizeStringArray(scanConfig.availableAccessLevelIds || [], 120),
    availableChoiceBundleIds: normalizeStringArray(scanConfig.availableChoiceBundleIds || [], 120),
    selfReflectModes: {
      scout: cleanText(scanConfig.selfReflectModes?.scout, 120),
      front: cleanText(scanConfig.selfReflectModes?.front, 120),
      back: cleanText(scanConfig.selfReflectModes?.back, 120),
      redeploy: cleanText(scanConfig.selfReflectModes?.redeploy, 120)
    },
    shannonParts: {
      scout: normalizeStringArray(scanConfig.shannonParts?.scout || [], 120),
      back: normalizeStringArray(scanConfig.shannonParts?.back || [], 120),
      wholeAllowed: scanConfig.shannonParts?.wholeAllowed === true
    },
    capacityGovernor,
    plannerInput: {
      waveId: cleanText(plannerWave.waveId, 120),
      resultAuthority: cleanText(plannerWave.resultAuthority, 160),
      identityModel: cleanText(plannerWave.identityModel, 160),
      useLaw: cleanText(plannerWave.useLaw, 160),
      laneCount: Number(plannerWave.laneCount || 0),
      order: normalizeStringArray(plannerWave.order || [], 120)
    },
    legacyReferenceInput: {
      waveId: cleanText(legacyReferenceWave.waveId, 120),
      catalogId: cleanText(legacyReferenceWave.catalogId, 120),
      resultAuthority: cleanText(legacyReferenceWave.resultAuthority, 160),
      useLaw: cleanText(legacyReferenceWave.useLaw, 160),
      referenceCount: Number(legacyReferenceWave.referenceCount || 0),
      visibleReferenceCount: Number(legacyReferenceWave.visibleReferenceCount || 0),
      sectorCount: Number(legacyReferenceWave.sectorCount || 0),
      waveCount: Number(legacyReferenceWave.waveCount || 0),
      campaignCount: Number(legacyReferenceWave.campaignCount || 0),
      namedSurfaceIds: normalizeStringArray(legacyReferenceWave.namedSurfaceIds || [], 120)
    },
    deepArchiveReplayInput: {
      replayId: cleanText(deepArchiveReplay.replayId, 120),
      useLaw: cleanText(deepArchiveReplay.useLaw, 160),
      triggerLaw: cleanText(deepArchiveReplay.triggerLaw, 160),
      resultAuthority: cleanText(deepArchiveReplay.resultAuthority, 160),
      referenceCount: Number(deepArchiveReplay.referenceCount || 0),
      visibleReferenceCount: Number(deepArchiveReplay.visibleReferenceCount || 0),
      sectorCount: Number(deepArchiveReplay.sectorCount || 0),
      waveCount: Number(deepArchiveReplay.waveCount || 0),
      campaignCount: Number(deepArchiveReplay.campaignCount || 0),
      waveIds: normalizeStringArray(deepArchiveReplay.waveIds || [], 120),
      namedSurfaceIds: normalizeStringArray(deepArchiveReplay.namedSurfaceIds || [], 120)
    },
    deepArchiveFindingsInput: {
      findingsId: cleanText(deepArchiveFindings.findingsId, 120),
      useLaw: cleanText(deepArchiveFindings.useLaw, 160),
      resultAuthority: cleanText(deepArchiveFindings.resultAuthority, 160),
      findingCount: Number(deepArchiveFindings.findingCount || 0),
      findingIds: normalizeStringArray((deepArchiveFindings.findings || []).map((entry) => entry.id), 120)
    },
    waveLatticeId: cleanText(branch.waveLattice?.latticeId, 120),
    waveCascadeId: cleanText(branch.waveCascade?.cascadeId, 120),
    waves,
    activation: {
      nextWaveId: cleanText(waves[0]?.id, 120),
      stageId: "white_room_observe",
      useLaw: "control_panel_guided_named_scan",
      rootLaw: "liris_here_controls_asolaria_usb_root",
      learningLaw: "structure_is_learned_in_self_reflecting_waves",
      trigger: "planner_wave_named_vote_ready_then_legacy_reference_ready_then_deep_archive_replay_ready_then_deep_archive_findings_ready",
      plannerGate: cleanText(plannerWave.resultAuthority, 160),
      legacyReferenceGate: cleanText(legacyReferenceWave.resultAuthority, 160),
      deepArchiveReplayGate: cleanText(deepArchiveReplay.resultAuthority, 160),
      deepArchiveFindingsGate: cleanText(deepArchiveFindings.resultAuthority, 160),
      redeployGate: "planner_return_reflect_complete"
    }
  };
}

function buildResearchAnalysis(config = {}, branch = {}) {
  const researchConfig = config.researchAnalysis || {};
  const scan = branch.mapMapMappedScanning || {};
  const lattice = branch.waveLattice || {};
  const expansion = branch.expansionKnowledge || {};
  const deepArchiveReplay = branch.deepArchiveReplay || {};
  const deepArchiveFindings = branch.deepArchiveFindings || {};
  const waveCascade = branch.waveCascade || {};
  const readyWaves = (Array.isArray(scan.waves) ? scan.waves : []).filter((entry) => cleanText(entry.status, 80) === "ready_to_deploy");
  const stagedWaves = (Array.isArray(scan.waves) ? scan.waves : []).filter((entry) => cleanText(entry.status, 80) === "staged");
  const nextWaveIds = stagedWaves.slice(0, 6).map((entry) => cleanText(entry.id, 120));
  const weaknesses = [
    {
      id: "promotion_not_pro_ready",
      severity: "high",
      law: "living_language_still_frozen",
      targetWaveIds: ["wave-18-reverse-super-governance-prove", "wave-10-redeploy-proof-final"]
    },
    {
      id: "tier_unlock_prepared_not_enforced",
      severity: "high",
      law: cleanText(expansion.futureGate, 160),
      targetWaveIds: ["wave-17-reverse-super-governance-map", "wave-18-reverse-super-governance-prove"]
    },
    {
      id: "local_governor_concurrency_cap",
      severity: "medium",
      law: cleanText(scan.capacityGovernor?.cautionLaw, 160),
      targetWaveIds: ["wave-2-return-alpha", "wave-4-return-beta", "wave-6-return-gamma"]
    },
    {
      id: "peer_links_branch_only",
      severity: "medium",
      law: cleanText(expansion.asolariaVisibilityLaw, 160),
      targetWaveIds: ["wave-15-reverse-governance-floor", "wave-16-reverse-governance-return", "wave-17-reverse-super-governance-map"]
    },
    {
      id: "translation_micro_needs_device_proof",
      severity: "medium",
      law: cleanText(expansion.translationMode, 160),
      targetWaveIds: ["wave-5-scout-gamma", "wave-9-redeploy-lattice", "wave-13-redeploy-governance"]
    },
    {
      id: "deep_archive_leak_stack_not_replayed",
      severity: "high",
      law: "old_old_old_control_planes_require_named_replay_before_language_freeze",
      targetWaveIds: ["wave-5-scout-gamma", "wave-6-return-gamma", "wave-7-scout-delta", "wave-8-return-delta"]
    }
  ];

  return {
    analysisId: cleanText(researchConfig.analysisId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(researchConfig.label || researchConfig.analysisId, 160),
    summary: clipText(researchConfig.summary || "Research-analysis surface for extracting current branch weaknesses and routing the next named waves.", 240),
    useLaw: cleanText(researchConfig.useLaw || "analyze_branch_then_target_next_waves", 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    governorSurfaceIds: normalizeStringArray(expansion.governorSurfaceIds || [], 120),
    superAdminSurfaceIds: normalizeStringArray(expansion.superAdminSurfaceIds || [], 120),
    emergencyObservationLinkIds: normalizeStringArray(expansion.emergencyObservationLinkIds || [], 160),
    timeAwarenessLaw: cleanText(expansion.timeAwarenessLaw, 160),
    timestampMemoryId: cleanText(branch.timestampMemory?.memoryId, 120),
    deepArchiveReplayId: cleanText(deepArchiveReplay.replayId, 120),
    deepArchiveFindingsId: cleanText(deepArchiveFindings.findingsId, 120),
    waveCascadeId: cleanText(waveCascade.cascadeId, 120),
    waveAgentClassesId: cleanText(branch.waveAgentClasses?.classesId, 120),
    waveAgentClassIds: normalizeStringArray((branch.waveAgentClasses?.classes || []).map((entry) => entry.id), 120),
    metaWaveIds: normalizeStringArray((Array.isArray(lattice.metaWaves) ? lattice.metaWaves : []).map((entry) => entry.id), 120),
    overWaveIds: normalizeStringArray((Array.isArray(waveCascade.overWaves) ? waveCascade.overWaves : []).map((entry) => entry.id), 120),
    activeOverWaveIds: normalizeStringArray(waveCascade.activeOverWaveIds || [], 120),
    stagedOverWaveIds: normalizeStringArray(waveCascade.stagedOverWaveIds || [], 120),
    activeWaveIds: normalizeStringArray(readyWaves.map((entry) => entry.id), 120),
    stagedWaveIds: normalizeStringArray(stagedWaves.map((entry) => entry.id), 120),
    nextWaveIds: normalizeStringArray(nextWaveIds, 120),
    currentWaveCapacity: Number(scan.capacityGovernor?.maxConcurrentScanWaves || 0),
    activeCampaignCapacity: Number(scan.capacityGovernor?.maxActiveCampaigns || 0),
    activeLegacyCapacity: Number(scan.capacityGovernor?.maxActiveLegacyWaves || 0),
    plannerLaneCapacity: Number(scan.capacityGovernor?.maxPlannerLanesPerWave || 0),
    researchState: "ready_for_wave_4_weakness_scan",
    weaknesses
  };
}

function buildLanguageGapAnalysis(config = {}, branch = {}) {
  const gapConfig = config.languageGapAnalysis || {};
  const waveCascade = branch.waveCascade || {};
  const research = branch.researchAnalysis || {};
  const deepFindings = branch.deepArchiveFindings || {};
  const planeEntries = Array.isArray(branch.omniLanguagePlanes?.planes) ? branch.omniLanguagePlanes.planes : [];
  const planeById = new Map(planeEntries.map((entry) => [cleanText(entry.id, 120), entry]));
  const overWaveById = new Map((Array.isArray(waveCascade.overWaves) ? waveCascade.overWaves : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const weaknessById = new Map((Array.isArray(research.weaknesses) ? research.weaknesses : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const findingById = new Map((Array.isArray(deepFindings.findings) ? deepFindings.findings : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const focusOverWaveIds = normalizeStringArray(gapConfig.focusOverWaveIds || [], 120).filter((id) => overWaveById.has(id));
  const focusWeaknessIds = normalizeStringArray(gapConfig.focusWeaknessIds || [], 120).filter((id) => weaknessById.has(id));
  const targetPlaneIds = normalizeStringArray(gapConfig.targetPlaneIds || [], 120).filter((id) => planeById.has(id));
  const gaps = [
    {
      id: "gap-archive-translation-routing",
      overWaveId: "over-wave-4-archive-translation",
      weaknessIds: ["deep_archive_leak_stack_not_replayed", "translation_micro_needs_device_proof"],
      planeIds: ["translation_micro", "device_hardware", "locality_rules"],
      findingIds: normalizeStringArray((Array.isArray(deepFindings.findings) ? deepFindings.findings : []).map((entry) => entry.id), 120),
      targetWaveIds: ["wave-5-scout-gamma", "wave-6-return-gamma", "wave-7-scout-delta", "wave-8-return-delta"],
      targetLevelIds: ["L2", "L3", "L4"]
    },
    {
      id: "gap-device-proof-loop",
      overWaveId: "over-wave-4-archive-translation",
      weaknessIds: ["translation_micro_needs_device_proof"],
      planeIds: ["translation_micro", "device_hardware", "reflection_audit"],
      findingIds: ["deep-find-4", "deep-find-5"],
      targetWaveIds: ["wave-5-scout-gamma", "wave-9-redeploy-lattice", "wave-13-redeploy-governance"],
      targetLevelIds: ["L2", "L3", "L4"]
    },
    {
      id: "gap-proof-climb-promotion",
      overWaveId: "over-wave-5-proof-climb",
      weaknessIds: ["promotion_not_pro_ready"],
      planeIds: ["reflection_audit", "agent_orchestration", "locality_rules"],
      findingIds: ["deep-find-1", "deep-find-2"],
      targetWaveIds: ["wave-10-redeploy-proof-final", "wave-17-reverse-super-governance-map", "wave-18-reverse-super-governance-prove"],
      targetLevelIds: ["L4", "L5"]
    },
    {
      id: "gap-proof-climb-tier-unlock",
      overWaveId: "over-wave-5-proof-climb",
      weaknessIds: ["tier_unlock_prepared_not_enforced"],
      planeIds: ["reflection_audit", "locality_rules", "device_hardware"],
      findingIds: ["deep-find-3", "deep-find-5"],
      targetWaveIds: ["wave-17-reverse-super-governance-map", "wave-18-reverse-super-governance-prove"],
      targetLevelIds: ["L4", "L5"]
    }
  ].map((entry) => {
    const overWave = overWaveById.get(entry.overWaveId);
    const weaknesses = entry.weaknessIds.map((id) => weaknessById.get(id)).filter(Boolean);
    const planes = entry.planeIds.map((id) => planeById.get(id)).filter(Boolean);
    const findings = entry.findingIds.map((id) => findingById.get(id)).filter(Boolean);
    return {
      id: cleanText(entry.id, 120),
      overWaveId: cleanText(entry.overWaveId, 120),
      weaknessIds: normalizeStringArray(entry.weaknessIds, 120),
      planeIds: normalizeStringArray(entry.planeIds, 120),
      planeSymbols: normalizeStringArray(planes.map((plane) => cleanText(plane.symbol, 12)), 20),
      findingIds: normalizeStringArray(entry.findingIds, 120),
      targetWaveIds: normalizeStringArray(entry.targetWaveIds, 120),
      targetLevelIds: normalizeStringArray(entry.targetLevelIds, 40),
      severitySet: normalizeStringArray(weaknesses.map((item) => cleanText(item.severity, 40)), 40),
      laws: normalizeStringArray(weaknesses.map((item) => cleanText(item.law, 160)), 200),
      visibleFindingCount: findings.filter((item) => Number(item.visibleReferenceCount || 0) > 0).length,
      archiveRisk: findings.some((item) => cleanText(item.risk, 120) === "archive_truth_requires_named_translation")
        ? "archive_truth_requires_named_translation"
        : "device_gap_pending_proof",
      status: overWave && cleanText(overWave.status, 80) === "ready_to_deploy" ? "ready_to_deploy" : "staged"
    };
  });

  return {
    analysisId: cleanText(gapConfig.analysisId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(gapConfig.label, 160),
    summary: clipText(gapConfig.summary || "", 240),
    useLaw: cleanText(gapConfig.useLaw, 160),
    resultAuthority: cleanText(gapConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    timeAwarenessLaw: cleanText(branch.expansionKnowledge?.timeAwarenessLaw, 160),
    waveCascadeId: cleanText(waveCascade.cascadeId, 120),
    deepArchiveFindingsId: cleanText(deepFindings.findingsId, 120),
    researchAnalysisId: cleanText(research.analysisId, 120),
    focusOverWaveIds,
    focusWeaknessIds,
    targetPlaneIds,
    targetPlaneSymbols: normalizeStringArray(targetPlaneIds.map((id) => cleanText(planeById.get(id)?.symbol, 12)), 20),
    gapCount: gaps.length,
    activeGapIds: normalizeStringArray(gaps.filter((entry) => cleanText(entry.status, 80) === "ready_to_deploy").map((entry) => entry.id), 120),
    stagedGapIds: normalizeStringArray(gaps.filter((entry) => cleanText(entry.status, 80) === "staged").map((entry) => entry.id), 120),
    gaps,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildShannonPartInspection(config = {}, branch = {}) {
  const inspectionConfig = config.shannonPartInspection || {};
  const partUnits = Array.isArray(branch.partCatalog?.units) ? branch.partCatalog.units : [];
  const languageGapAnalysis = branch.languageGapAnalysis || {};
  const mapScan = branch.mapMapMappedScanning || {};
  const research = branch.researchAnalysis || {};
  const scoutPart = partUnits.find((entry) => cleanText(entry.id, 120) === "shannon-scout");
  const evidencePart = partUnits.find((entry) => cleanText(entry.id, 120) === "shannon-evidence");
  const focusOverWaveIds = normalizeStringArray(
    Array.isArray(inspectionConfig.focusOverWaveIds) && inspectionConfig.focusOverWaveIds.length
      ? inspectionConfig.focusOverWaveIds
      : (languageGapAnalysis.focusOverWaveIds || []),
    120
  );
  const focusGapIds = normalizeStringArray(
    Array.isArray(inspectionConfig.focusGapIds) && inspectionConfig.focusGapIds.length
      ? inspectionConfig.focusGapIds
      : (languageGapAnalysis.stagedGapIds || []),
    120
  );
  const missions = [
    {
      id: "shannon-archive-translation-inspect",
      partId: cleanText(scoutPart?.id, 120) || "shannon-scout",
      profileId: cleanText(scoutPart?.profileId, 120),
      overWaveId: "over-wave-4-archive-translation",
      gapIds: ["gap-archive-translation-routing", "gap-device-proof-loop"],
      planeSymbols: ["T", "D", "L"],
      targetWaveIds: ["wave-5-scout-gamma", "wave-6-return-gamma", "wave-7-scout-delta", "wave-8-return-delta"],
      resultState: "staged"
    },
    {
      id: "shannon-proof-climb-inspect",
      partId: cleanText(evidencePart?.id, 120) || "shannon-evidence",
      profileId: cleanText(evidencePart?.profileId, 120),
      overWaveId: "over-wave-5-proof-climb",
      gapIds: ["gap-proof-climb-promotion", "gap-proof-climb-tier-unlock"],
      planeSymbols: ["R", "A", "L", "D"],
      targetWaveIds: ["wave-10-redeploy-proof-final", "wave-17-reverse-super-governance-map", "wave-18-reverse-super-governance-prove"],
      resultState: "staged"
    }
  ].map((entry) => ({
    id: cleanText(entry.id, 120),
    partId: cleanText(entry.partId, 120),
    profileId: cleanText(entry.profileId, 120),
    overWaveId: cleanText(entry.overWaveId, 120),
    gapIds: normalizeStringArray(entry.gapIds, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols, 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds, 120),
    resultState: cleanText(entry.resultState, 80)
  }));

  return {
    inspectionId: cleanText(inspectionConfig.inspectionId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(inspectionConfig.label || inspectionConfig.inspectionId, 160),
    summary: clipText(inspectionConfig.summary || "Named Shannon parts inspect archive translation and proof-climb gaps without escalating to whole-Shannon execution.", 240),
    useLaw: cleanText(inspectionConfig.useLaw, 160),
    resultAuthority: cleanText(inspectionConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    waveScanId: cleanText(mapScan.scanId, 120),
    researchAnalysisId: cleanText(research.analysisId, 120),
    languageGapAnalysisId: cleanText(languageGapAnalysis.analysisId, 120),
    focusOverWaveIds,
    focusGapIds,
    wholeAllowed: inspectionConfig.wholeAllowed === true,
    activeMissionIds: [],
    stagedMissionIds: normalizeStringArray(missions.map((entry) => entry.id), 120),
    missionCount: missions.length,
    missions
  };
}

function buildShannonPartFindings(config = {}, branch = {}) {
  const findingsConfig = config.shannonPartFindings || {};
  const inspection = branch.shannonPartInspection || {};
  const gapAnalysis = branch.languageGapAnalysis || {};
  const planeEntries = Array.isArray(branch.omniLanguagePlanes?.planes) ? branch.omniLanguagePlanes.planes : [];
  const planeById = new Map(planeEntries.map((entry) => [cleanText(entry.id, 120), entry]));
  const gapById = new Map((Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const focusMissionIds = normalizeStringArray((inspection.missions || []).map((entry) => entry.id), 120);
  const targetPlaneIds = normalizeStringArray(
    (Array.isArray(findingsConfig.targetPlaneIds) && findingsConfig.targetPlaneIds.length)
      ? findingsConfig.targetPlaneIds
      : Array.from(new Set(
          (Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : [])
            .flatMap((entry) => normalizeStringArray(entry.planeIds || [], 120))
        )),
    120
  ).filter((id) => planeById.has(id));
  const findingSpecs = [
    {
      id: "shfind-archive-route",
      missionId: "shannon-archive-translation-inspect",
      gapId: "gap-archive-translation-routing",
      revisionId: "rev-archive-route-tags",
      patchLaw: "device_translation_route_tags_and_archive_symbols"
    },
    {
      id: "shfind-device-proof",
      missionId: "shannon-archive-translation-inspect",
      gapId: "gap-device-proof-loop",
      revisionId: "rev-device-proof-loop",
      patchLaw: "device_proof_loop_requires_timestamped_translation_checkpoints"
    },
    {
      id: "shfind-promotion-climb",
      missionId: "shannon-proof-climb-inspect",
      gapId: "gap-proof-climb-promotion",
      revisionId: "rev-promotion-climb-lock",
      patchLaw: "promotion_climb_remains_branch_only_until_named_proof"
    },
    {
      id: "shfind-tier-unlock",
      missionId: "shannon-proof-climb-inspect",
      gapId: "gap-proof-climb-tier-unlock",
      revisionId: "rev-tier-unlock-observe",
      patchLaw: "tier_unlock_requires_device_specific_emergency_observe_links"
    }
  ];

  const findings = findingSpecs.map((entry) => {
    const mission = (inspection.missions || []).find((item) => cleanText(item.id, 120) === entry.missionId) || {};
    const gap = gapById.get(entry.gapId) || {};
    const planeSymbols = normalizeStringArray(
      (gap.planeIds || [])
        .map((id) => cleanText(planeById.get(id)?.symbol, 12))
        .filter(Boolean),
      20
    );
    return {
      id: cleanText(entry.id, 120),
      missionId: cleanText(entry.missionId, 120),
      partId: cleanText(mission.partId, 120),
      overWaveId: cleanText(mission.overWaveId || gap.overWaveId, 120),
      gapId: cleanText(entry.gapId, 120),
      planeIds: normalizeStringArray(gap.planeIds || [], 120),
      planeSymbols,
      targetWaveIds: normalizeStringArray(gap.targetWaveIds || mission.targetWaveIds || [], 120),
      targetLevelIds: normalizeStringArray(gap.targetLevelIds || [], 40),
      recommendedRevisionId: cleanText(entry.revisionId, 120),
      patchLaw: cleanText(entry.patchLaw, 160),
      resultState: cleanText(mission.resultState || gap.status || "staged", 80)
    };
  });

  return {
    findingsId: cleanText(findingsConfig.findingsId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(findingsConfig.label || findingsConfig.findingsId, 160),
    summary: clipText(findingsConfig.summary || "Compact findings derived from staged Shannon-part inspection missions so the next omni-language revision can stay branch-native and device-specific.", 240),
    useLaw: cleanText(findingsConfig.useLaw, 160),
    resultAuthority: cleanText(findingsConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    shannonPartInspectionId: cleanText(inspection.inspectionId, 120),
    languageGapAnalysisId: cleanText(gapAnalysis.analysisId, 120),
    focusMissionIds,
    focusGapIds: normalizeStringArray((inspection.missions || []).flatMap((item) => item.gapIds || []), 120),
    targetPlaneIds,
    targetPlaneSymbols: normalizeStringArray(targetPlaneIds.map((id) => cleanText(planeById.get(id)?.symbol, 12)).filter(Boolean), 20),
    findingCount: findings.length,
    activeFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.resultState, 80) === "ready_to_deploy").map((entry) => entry.id), 120),
    stagedFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.resultState, 80) !== "ready_to_deploy").map((entry) => entry.id), 120),
    findings,
    nextPacketId: cleanText(config.omniLanguageRevision?.revisionId || config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildOmniLanguageRevision(config = {}, branch = {}) {
  const revisionConfig = config.omniLanguageRevision || {};
  const shannonFindings = branch.shannonPartFindings || {};
  const gapAnalysis = branch.languageGapAnalysis || {};
  const planeEntries = Array.isArray(branch.omniLanguagePlanes?.planes) ? branch.omniLanguagePlanes.planes : [];
  const planeById = new Map(planeEntries.map((entry) => [cleanText(entry.id, 120), entry]));
  const gapById = new Map((Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const revisionSpecs = [
    {
      id: "rev-archive-route-tags",
      findingId: "shfind-archive-route",
      patchScope: "translation_micro",
      patchLaw: "attach_compact_archive_route_tags_to_translation_packets"
    },
    {
      id: "rev-device-proof-loop",
      findingId: "shfind-device-proof",
      patchScope: "device_hardware",
      patchLaw: "publish_timestamped_device_proof_turnstiles_for_micro_translation"
    },
    {
      id: "rev-promotion-climb-lock",
      findingId: "shfind-promotion-climb",
      patchScope: "locality_rules",
      patchLaw: "keep_promotion_climb_branch_only_until_named_parity_and_visual_confirmation"
    },
    {
      id: "rev-tier-unlock-observe",
      findingId: "shfind-tier-unlock",
      patchScope: "reflection_audit",
      patchLaw: "open_new_tiers_with_device_specific_emergency_observe_links_only"
    }
  ];

  const findingById = new Map((Array.isArray(shannonFindings.findings) ? shannonFindings.findings : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const revisions = revisionSpecs.map((entry) => {
    const finding = findingById.get(entry.findingId) || {};
    const gap = gapById.get(cleanText(finding.gapId, 120)) || {};
    const planeIds = normalizeStringArray(gap.planeIds || finding.planeIds || [], 120);
    return {
      id: cleanText(entry.id, 120),
      findingId: cleanText(entry.findingId, 120),
      gapId: cleanText(finding.gapId, 120),
      missionId: cleanText(finding.missionId, 120),
      patchScope: cleanText(entry.patchScope, 120),
      patchLaw: cleanText(entry.patchLaw, 160),
      planeIds,
      planeSymbols: normalizeStringArray(
        planeIds.map((id) => cleanText(planeById.get(id)?.symbol, 12)).filter(Boolean),
        20
      ),
      targetWaveIds: normalizeStringArray(finding.targetWaveIds || gap.targetWaveIds || [], 120),
      targetLevelIds: normalizeStringArray(finding.targetLevelIds || gap.targetLevelIds || [], 40),
      promotionState: "branch_only_pending_proof",
      status: "staged"
    };
  });

  return {
    revisionId: cleanText(revisionConfig.revisionId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(revisionConfig.label || revisionConfig.revisionId, 160),
    summary: clipText(revisionConfig.summary || "Next compact omni-language revision derived from Shannon-part findings, still branch-only and still gated away from living-language replacement.", 240),
    useLaw: cleanText(revisionConfig.useLaw, 160),
    resultAuthority: cleanText(revisionConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    shannonPartFindingsId: cleanText(shannonFindings.findingsId, 120),
    languageGapAnalysisId: cleanText(gapAnalysis.analysisId, 120),
    focusFindingIds: normalizeStringArray((shannonFindings.findings || []).map((entry) => entry.id), 120),
    activeRevisionIds: [],
    stagedRevisionIds: normalizeStringArray(revisions.map((entry) => entry.id), 120),
    revisionCount: revisions.length,
    revisions,
    nextPacketId: cleanText(config.revisionDeployment?.deploymentId || config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildRevisionDeployment(config = {}, branch = {}) {
  const deploymentConfig = config.revisionDeployment || {};
  const revision = branch.omniLanguageRevision || {};
  const scan = branch.mapMapMappedScanning || {};
  const classById = new Map((Array.isArray(branch.waveAgentClasses?.classes) ? branch.waveAgentClasses.classes : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const capacity = Math.max(1, Number(scan.capacityGovernor?.maxConcurrentScanWaves || 1));
  const classMap = new Map([
    ["translation_micro", ["micro-translation-box"]],
    ["device_hardware", ["micro-translation-box", "proof-guard"]],
    ["locality_rules", ["proof-guard", "named-planner"]],
    ["reflection_audit", ["proof-guard", "self-thinker-scout"]]
  ]);
  const deployments = (Array.isArray(revision.revisions) ? revision.revisions : []).map((entry, index) => {
    const classIds = normalizeStringArray(classMap.get(cleanText(entry.patchScope, 120)) || ["named-planner"], 120)
      .filter((id) => classById.has(id));
    return {
      id: cleanText(`deploy-${cleanText(entry.id, 120).replace(/^rev-/, "")}`, 120),
      revisionId: cleanText(entry.id, 120),
      patchScope: cleanText(entry.patchScope, 120),
      classIds,
      classSymbols: normalizeStringArray(classIds.map((id) => cleanText(classById.get(id)?.symbol, 12)).filter(Boolean), 20),
      targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
      targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
      promotionState: cleanText(entry.promotionState, 120),
      deploymentState: index < capacity ? "ready_to_deploy" : "staged"
    };
  });

  return {
    deploymentId: cleanText(deploymentConfig.deploymentId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(deploymentConfig.label || deploymentConfig.deploymentId, 160),
    summary: clipText(deploymentConfig.summary || "Named specialist deployment surface for staged omni-language revisions, bounded by device-specific governor limits and still branch-only until proof.", 240),
    useLaw: cleanText(deploymentConfig.useLaw, 160),
    resultAuthority: cleanText(deploymentConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    omniLanguageRevisionId: cleanText(revision.revisionId, 120),
    shannonPartFindingsId: cleanText(branch.shannonPartFindings?.findingsId, 120),
    currentWaveCapacity: capacity,
    activeDeploymentIds: normalizeStringArray(deployments.filter((entry) => cleanText(entry.deploymentState, 80) === "ready_to_deploy").map((entry) => entry.id), 120),
    stagedDeploymentIds: normalizeStringArray(deployments.filter((entry) => cleanText(entry.deploymentState, 80) !== "ready_to_deploy").map((entry) => entry.id), 120),
    deploymentCount: deployments.length,
    deployments,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildDeploymentFeedback(config = {}, branch = {}) {
  const feedbackConfig = config.deploymentFeedback || {};
  const deployment = branch.revisionDeployment || {};
  const revision = branch.omniLanguageRevision || {};
  const shannonFindings = branch.shannonPartFindings || {};
  const gapAnalysis = branch.languageGapAnalysis || {};
  const overWaveByGapId = new Map((Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : []).map((entry) => [cleanText(entry.id, 120), cleanText(entry.overWaveId, 120)]));
  const gapById = new Map((Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const revisionById = new Map((Array.isArray(revision.revisions) ? revision.revisions : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const findingByRevisionId = new Map((Array.isArray(shannonFindings.findings) ? shannonFindings.findings : []).map((entry) => [cleanText(entry.recommendedRevisionId, 120), entry]));
  const activeDeployments = (Array.isArray(deployment.deployments) ? deployment.deployments : []).filter((entry) => cleanText(entry.deploymentState, 80) === "ready_to_deploy");
  const feedbackEntries = activeDeployments.map((entry) => {
    const revisionEntry = revisionById.get(cleanText(entry.revisionId, 120)) || {};
    const findingEntry = findingByRevisionId.get(cleanText(entry.revisionId, 120)) || {};
    const gapId = cleanText(revisionEntry.gapId || findingEntry.gapId, 120);
    const gap = gapById.get(gapId) || {};
    return {
      id: cleanText(`feedback-${cleanText(entry.id, 120).replace(/^deploy-/, "")}`, 120),
      deploymentId: cleanText(entry.id, 120),
      revisionId: cleanText(entry.revisionId, 120),
      findingId: cleanText(findingEntry.id, 120),
      gapId,
      overWaveId: cleanText(overWaveByGapId.get(gapId), 120),
      classIds: normalizeStringArray(entry.classIds || [], 120),
      classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
      patchScope: cleanText(entry.patchScope, 120),
      targetWaveIds: normalizeStringArray(entry.targetWaveIds || revisionEntry.targetWaveIds || [], 120),
      targetLevelIds: normalizeStringArray(entry.targetLevelIds || revisionEntry.targetLevelIds || [], 40),
      returnLaw: cleanText(
        cleanText(entry.patchScope, 120) === "translation_micro"
          ? "return_compact_archive_route_feedback_to_translation_and_scan"
          : cleanText(entry.patchScope, 120) === "device_hardware"
            ? "return_timestamped_device_proof_feedback_to_scan_and_guard"
            : cleanText(entry.patchScope, 120) === "locality_rules"
              ? "return_promotion_lock_feedback_to_governance_climb"
              : "return_reflection_feedback_to_tier_observe",
        160
      ),
      feedbackState: "ready_to_return"
    };
  });
  const nextWaveIds = normalizeStringArray(
    Array.from(new Set(feedbackEntries.flatMap((entry) => normalizeStringArray(entry.targetWaveIds || [], 120)))),
    120
  );

  return {
    feedbackId: cleanText(feedbackConfig.feedbackId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(feedbackConfig.label || feedbackConfig.feedbackId, 160),
    summary: clipText(feedbackConfig.summary || "Named deployment feedback surface that turns active branch deployments into returned findings for the next MAP MAP MAPPED wave window.", 240),
    useLaw: cleanText(feedbackConfig.useLaw, 160),
    resultAuthority: cleanText(feedbackConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    revisionDeploymentId: cleanText(deployment.deploymentId, 120),
    omniLanguageRevisionId: cleanText(revision.revisionId, 120),
    shannonPartFindingsId: cleanText(shannonFindings.findingsId, 120),
    activeDeploymentIds: normalizeStringArray(activeDeployments.map((entry) => entry.id), 120),
    feedbackCount: feedbackEntries.length,
    activeFeedbackIds: normalizeStringArray(feedbackEntries.map((entry) => entry.id), 120),
    nextWaveIds,
    feedbackEntries,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackWaveCycle(config = {}, branch = {}) {
  const cycleConfig = config.feedbackWaveCycle || {};
  const feedback = branch.deploymentFeedback || {};
  const scan = branch.mapMapMappedScanning || {};
  const activeWaveCap = Math.max(1, Number(scan.capacityGovernor?.maxConcurrentScanWaves || 2));
  const nextWaveIds = normalizeStringArray(feedback.nextWaveIds || [], 120);
  const activeWaveIds = normalizeStringArray(
    nextWaveIds.filter((entry) => /-scout-/.test(entry)).slice(0, activeWaveCap),
    120
  );
  const stagedWaveIds = normalizeStringArray(
    nextWaveIds.filter((entry) => !activeWaveIds.includes(entry)),
    120
  );
  const cycleEntries = (Array.isArray(feedback.feedbackEntries) ? feedback.feedbackEntries : []).map((entry) => {
    const targetWaveIds = normalizeStringArray(entry.targetWaveIds || [], 120);
    const activeTargetWaveIds = normalizeStringArray(targetWaveIds.filter((waveId) => activeWaveIds.includes(waveId)), 120);
    return {
      id: cleanText(`cycle-${cleanText(entry.id, 120).replace(/^feedback-/, "")}`, 120),
      feedbackId: cleanText(entry.id, 120),
      deploymentId: cleanText(entry.deploymentId, 120),
      gapId: cleanText(entry.gapId, 120),
      overWaveId: cleanText(entry.overWaveId, 120),
      patchScope: cleanText(entry.patchScope, 120),
      classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
      targetWaveIds,
      activeTargetWaveIds,
      cycleState: activeTargetWaveIds.length ? "active_window_open" : "staged_window"
    };
  });

  return {
    cycleId: cleanText(cycleConfig.cycleId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(cycleConfig.label || cycleConfig.cycleId, 160),
    summary: clipText(cycleConfig.summary || "Named feedback wave cycle that routes active deployment feedback into the next governed return window for MAP MAP MAPPED scanning.", 240),
    useLaw: cleanText(cycleConfig.useLaw, 160),
    resultAuthority: cleanText(cycleConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    deploymentFeedbackId: cleanText(feedback.feedbackId, 120),
    activeFeedbackIds: normalizeStringArray(feedback.activeFeedbackIds || [], 120),
    feedbackCount: Number(feedback.feedbackCount || 0),
    activeWaveIds,
    stagedWaveIds,
    nextWaveIds,
    cycleCount: cycleEntries.length,
    cycleEntries,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildDeepArchiveDelta(config = {}, branch = {}) {
  const deltaConfig = config.deepArchiveDelta || {};
  const deepFindings = branch.deepArchiveFindings || {};
  const cycle = branch.feedbackWaveCycle || {};
  const activeWaveIds = normalizeStringArray(cycle.activeWaveIds || [], 120);
  const stagedWaveIds = normalizeStringArray(cycle.stagedWaveIds || [], 120);
  const deltaSpecs = [
    { id: "delta-dashboard-console", findingId: "deep-find-1", planeSymbols: ["A", "T", "L"], deltaLaw: "dashboard_console_routes_need_compact_translation_and_authority_tags" },
    { id: "delta-provider-route", findingId: "deep-find-2", planeSymbols: ["A", "L", "R"], deltaLaw: "provider_routes_need_named_locality_and_review_tags" },
    { id: "delta-healthcare-guard", findingId: "deep-find-3", planeSymbols: ["H", "A", "R"], deltaLaw: "healthcare_guard_paths_need_human_agent_reflection_alignment" },
    { id: "delta-sidecar-device", findingId: "deep-find-4", planeSymbols: ["D", "T", "R"], deltaLaw: "sidecar_device_paths_need_timestamped_device_bus_proof" },
    { id: "delta-cloud-toolchain", findingId: "deep-find-5", planeSymbols: ["A", "T", "R"], deltaLaw: "cloud_toolchains_need_named_provenance_and_translation_boundaries" }
  ];
  const findingById = new Map((Array.isArray(deepFindings.findings) ? deepFindings.findings : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const deltas = deltaSpecs.map((entry) => {
    const finding = findingById.get(entry.findingId) || {};
    const targetWaveIds = normalizeStringArray(finding.nextWaveIds || [], 120);
    const activeTargetWaveIds = normalizeStringArray(targetWaveIds.filter((waveId) => activeWaveIds.includes(waveId)), 120);
    const stagedTargetWaveIds = normalizeStringArray(targetWaveIds.filter((waveId) => !activeTargetWaveIds.includes(waveId)), 120);
    return {
      id: cleanText(entry.id, 120),
      findingId: cleanText(entry.findingId, 120),
      sectorId: cleanText(finding.sectorId, 120),
      risk: cleanText(finding.risk, 120),
      planeSymbols: normalizeStringArray(entry.planeSymbols, 20),
      deltaLaw: cleanText(entry.deltaLaw, 160),
      targetWaveIds,
      activeTargetWaveIds,
      stagedTargetWaveIds,
      deltaState: activeTargetWaveIds.length ? "active_delta_window" : "staged_delta_window"
    };
  });

  return {
    deltaId: cleanText(deltaConfig.deltaId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(deltaConfig.label || deltaConfig.deltaId, 160),
    summary: clipText(deltaConfig.summary || "Named control-plane delta surface derived from deep-archive findings and the active feedback cycle, keeping old-old-old lineage visible in the next language window.", 240),
    useLaw: cleanText(deltaConfig.useLaw, 160),
    resultAuthority: cleanText(deltaConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    deepArchiveFindingsId: cleanText(deepFindings.findingsId, 120),
    feedbackWaveCycleId: cleanText(cycle.cycleId, 120),
    activeWaveIds,
    stagedWaveIds,
    deltaCount: deltas.length,
    activeDeltaIds: normalizeStringArray(deltas.filter((entry) => entry.deltaState === "active_delta_window").map((entry) => entry.id), 120),
    stagedDeltaIds: normalizeStringArray(deltas.filter((entry) => entry.deltaState !== "active_delta_window").map((entry) => entry.id), 120),
    deltas,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnMint(config = {}, branch = {}) {
  const mintConfig = config.feedbackReturnMint || {};
  const cycle = branch.feedbackWaveCycle || {};
  const delta = branch.deepArchiveDelta || {};
  const gapAnalysis = branch.languageGapAnalysis || {};
  const revision = branch.omniLanguageRevision || {};
  const gapById = new Map((Array.isArray(gapAnalysis.gaps) ? gapAnalysis.gaps : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const revisionById = new Map((Array.isArray(revision.revisions) ? revision.revisions : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const returnPayloadByWaveId = new Map((Array.isArray(cycle.returnPayloadEntries) ? cycle.returnPayloadEntries : []).map((entry) => [cleanText(entry.waveId, 120), entry]));
  const deltaById = new Map((Array.isArray(delta.deltas) ? delta.deltas : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const mintSpecs = [
    {
      id: "mint-dashboard-console",
      returnWaveId: "wave-6-return-gamma",
      deltaId: "delta-dashboard-console",
      gapId: "gap-archive-translation-routing",
      revisionId: "rev-archive-route-tags"
    },
    {
      id: "mint-provider-route",
      returnWaveId: "wave-6-return-gamma",
      deltaId: "delta-provider-route",
      gapId: "gap-archive-translation-routing",
      revisionId: "rev-archive-route-tags"
    },
    {
      id: "mint-healthcare-guard",
      returnWaveId: "wave-6-return-gamma",
      deltaId: "delta-healthcare-guard",
      gapId: "gap-device-proof-loop",
      revisionId: "rev-device-proof-loop"
    },
    {
      id: "mint-sidecar-device",
      returnWaveId: "wave-8-return-delta",
      deltaId: "delta-sidecar-device",
      gapId: "gap-proof-climb-tier-unlock",
      revisionId: "rev-tier-unlock-observe"
    },
    {
      id: "mint-cloud-toolchain",
      returnWaveId: "wave-8-return-delta",
      deltaId: "delta-cloud-toolchain",
      gapId: "gap-proof-climb-promotion",
      revisionId: "rev-promotion-climb-lock"
    }
  ];

  const mints = mintSpecs.map((entry) => {
    const payload = returnPayloadByWaveId.get(entry.returnWaveId) || {};
    const deltaEntry = deltaById.get(entry.deltaId) || {};
    const gapEntry = gapById.get(entry.gapId) || {};
    const revisionEntry = revisionById.get(entry.revisionId) || {};
    return {
      id: cleanText(entry.id, 120),
      returnWaveId: cleanText(entry.returnWaveId, 120),
      returnPayloadId: cleanText(payload.id, 120),
      deltaId: cleanText(entry.deltaId, 120),
      gapId: cleanText(entry.gapId, 120),
      revisionId: cleanText(entry.revisionId, 120),
      planeSymbols: normalizeStringArray(deltaEntry.planeSymbols || gapEntry.planeSymbols || revisionEntry.planeSymbols || [], 20),
      targetWaveIds: normalizeStringArray(revisionEntry.targetWaveIds || gapEntry.targetWaveIds || deltaEntry.activeTargetWaveIds || [], 120),
      targetLevelIds: normalizeStringArray(revisionEntry.targetLevelIds || gapEntry.targetLevelIds || [], 40),
      mintLaw: "direct_return_payload_mints_next_named_gap_and_revision_delta",
      mintState: cleanText(payload.payloadState, 80) === "direct_return_payload_ready" ? "ready_to_mint" : "staged"
    };
  });

  return {
    mintId: cleanText(mintConfig.mintId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(mintConfig.label || mintConfig.mintId, 160),
    summary: clipText(mintConfig.summary || "Branch-native mint surface that turns direct return payloads into the next named gap and revision deltas without touching the living language.", 240),
    useLaw: cleanText(mintConfig.useLaw, 160),
    resultAuthority: cleanText(mintConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackWaveCycleId: cleanText(cycle.cycleId, 120),
    feedbackReturnPayloadId: cleanText(cycle.returnPayloadId, 120),
    deepArchiveDeltaId: cleanText(delta.deltaId, 120),
    languageGapAnalysisId: cleanText(gapAnalysis.analysisId, 120),
    omniLanguageRevisionId: cleanText(revision.revisionId, 120),
    activeReturnWaveIds: normalizeStringArray(cycle.returnPayloadWaveIds || [], 120),
    activeDeltaIds: normalizeStringArray(delta.activeDeltaIds || [], 120),
    activeMintIds: normalizeStringArray(mints.filter((entry) => cleanText(entry.mintState, 80) === "ready_to_mint").map((entry) => entry.id), 120),
    stagedMintIds: normalizeStringArray(mints.filter((entry) => cleanText(entry.mintState, 80) !== "ready_to_mint").map((entry) => entry.id), 120),
    mintCount: mints.length,
    mints,
    nextPacketId: cleanText(config.feedbackReturnRedeploy?.redeployId || config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnRedeploy(config = {}, branch = {}) {
  const redeployConfig = config.feedbackReturnRedeploy || {};
  const mint = branch.feedbackReturnMint || {};
  const scan = branch.mapMapMappedScanning || {};
  const classById = new Map((Array.isArray(branch.waveAgentClasses?.classes) ? branch.waveAgentClasses.classes : []).map((entry) => [cleanText(entry.id, 120), entry]));
  const capacity = Math.max(1, Number(scan.capacityGovernor?.maxConcurrentScanWaves || 1));
  const redeploys = (Array.isArray(mint.mints) ? mint.mints : []).map((entry, index) => {
    const classIdSet = new Set();
    const planeSymbols = normalizeStringArray(entry.planeSymbols || [], 20);
    if (planeSymbols.includes("T")) {
      classIdSet.add("micro-translation-box");
    }
    if (planeSymbols.includes("D") || planeSymbols.includes("R")) {
      classIdSet.add("proof-guard");
    }
    if (planeSymbols.includes("A") || planeSymbols.includes("L")) {
      classIdSet.add("named-planner");
    }
    if (planeSymbols.includes("H")) {
      classIdSet.add("self-thinker-scout");
    }
    if (!classIdSet.size) {
      classIdSet.add("instant-named");
    }
    const classIds = normalizeStringArray(Array.from(classIdSet), 120).filter((id) => classById.has(id));
    const targetWaveIds = normalizeStringArray(entry.targetWaveIds || [], 120);
    const activeTargetWaveIds = normalizeStringArray(targetWaveIds.slice(0, capacity), 120);
    const stagedTargetWaveIds = normalizeStringArray(targetWaveIds.filter((waveId) => !activeTargetWaveIds.includes(waveId)), 120);
    return {
      id: cleanText(`redeploy-${cleanText(entry.id, 120).replace(/^mint-/, "")}`, 120),
      mintId: cleanText(entry.id, 120),
      returnWaveId: cleanText(entry.returnWaveId, 120),
      deltaId: cleanText(entry.deltaId, 120),
      gapId: cleanText(entry.gapId, 120),
      revisionId: cleanText(entry.revisionId, 120),
      planeSymbols,
      classIds,
      classSymbols: normalizeStringArray(classIds.map((id) => cleanText(classById.get(id)?.symbol, 12)).filter(Boolean), 20),
      targetWaveIds,
      activeTargetWaveIds,
      stagedTargetWaveIds,
      targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
      redeployLaw: "minted_named_deltas_redeploy_through_governed_scan_windows",
      redeployState: index < capacity ? "ready_to_redeploy" : "staged"
    };
  });

  return {
    redeployId: cleanText(redeployConfig.redeployId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(redeployConfig.label || redeployConfig.redeployId, 160),
    summary: clipText(redeployConfig.summary || "Branch-native redeploy surface that turns minted return deltas into the next governed scan window without touching the living language.", 240),
    useLaw: cleanText(redeployConfig.useLaw, 160),
    resultAuthority: cleanText(redeployConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnMintId: cleanText(mint.mintId, 120),
    activeMintIds: normalizeStringArray(mint.activeMintIds || [], 120),
    stagedMintIds: normalizeStringArray(mint.stagedMintIds || [], 120),
    currentWaveCapacity: capacity,
    activeRedeployIds: normalizeStringArray(redeploys.filter((entry) => cleanText(entry.redeployState, 80) === "ready_to_redeploy").map((entry) => entry.id), 120),
    stagedRedeployIds: normalizeStringArray(redeploys.filter((entry) => cleanText(entry.redeployState, 80) !== "ready_to_redeploy").map((entry) => entry.id), 120),
    redeployCount: redeploys.length,
    redeploys,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnFindings(config = {}, branch = {}) {
  const findingsConfig = config.feedbackReturnFindings || {};
  const redeploy = branch.feedbackReturnRedeploy || {};
  const findings = (Array.isArray(redeploy.redeploys) ? redeploy.redeploys : []).map((entry) => ({
    id: cleanText(`refind-${cleanText(entry.id, 120).replace(/^redeploy-/, "")}`, 120),
    redeployId: cleanText(entry.id, 120),
    mintId: cleanText(entry.mintId, 120),
    returnWaveId: cleanText(entry.returnWaveId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    findingLaw: "redeploy_outcomes_return_as_named_findings_for_next_scan_window",
    findingState: cleanText(entry.redeployState, 80) === "ready_to_redeploy" ? "active_return_finding" : "staged_return_finding"
  }));

  return {
    findingsId: cleanText(findingsConfig.findingsId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(findingsConfig.label || findingsConfig.findingsId, 160),
    summary: clipText(findingsConfig.summary || "Branch-native findings surface that turns active return redeploys into the next named learning payload for MAP MAP MAPPED scanning.", 240),
    useLaw: cleanText(findingsConfig.useLaw, 160),
    resultAuthority: cleanText(findingsConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnRedeployId: cleanText(redeploy.redeployId, 120),
    activeRedeployIds: normalizeStringArray(redeploy.activeRedeployIds || [], 120),
    stagedRedeployIds: normalizeStringArray(redeploy.stagedRedeployIds || [], 120),
    activeFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_return_finding").map((entry) => entry.id), 120),
    stagedFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) !== "active_return_finding").map((entry) => entry.id), 120),
    findingCount: findings.length,
    findings,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPressure(config = {}, branch = {}) {
  const pressureConfig = config.feedbackReturnPressure || {};
  const returnFindings = branch.feedbackReturnFindings || {};
  const pressures = (Array.isArray(returnFindings.findings) ? returnFindings.findings : []).map((entry) => ({
    id: cleanText(`press-${cleanText(entry.id, 120).replace(/^refind-/, "")}`, 120),
    findingId: cleanText(entry.id, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    pressureLaw: "active_return_findings_mint_the_next_language_pressure_window",
    pressureState: cleanText(entry.findingState, 80) === "active_return_finding" ? "active_pressure_window" : "staged_pressure_window"
  }));

  return {
    pressureId: cleanText(pressureConfig.pressureId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(pressureConfig.label || pressureConfig.pressureId, 160),
    summary: clipText(pressureConfig.summary || "Branch-native pressure window minted from active return findings and fed into the next MAP MAP MAPPED scan pass.", 240),
    useLaw: cleanText(pressureConfig.useLaw, 160),
    resultAuthority: cleanText(pressureConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnFindingsId: cleanText(returnFindings.findingsId, 120),
    activeFindingIds: normalizeStringArray(returnFindings.activeFindingIds || [], 120),
    stagedFindingIds: normalizeStringArray(returnFindings.stagedFindingIds || [], 120),
    activePressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_pressure_window").map((entry) => entry.id), 120),
    stagedPressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) !== "active_pressure_window").map((entry) => entry.id), 120),
    pressureCount: pressures.length,
    pressures,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPressureCycle(config = {}, branch = {}) {
  const cycleConfig = config.feedbackReturnPressureCycle || {};
  const returnPressure = branch.feedbackReturnPressure || {};
  const cycles = (Array.isArray(returnPressure.pressures) ? returnPressure.pressures : []).map((entry) => ({
    id: cleanText(`pcycle-${cleanText(entry.id, 120).replace(/^press-/, "")}`, 120),
    pressureId: cleanText(entry.id, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    cycleLaw: "return_pressure_windows_mint_named_gap_revision_pressure_entries",
    cycleState: cleanText(entry.pressureState, 80) === "active_pressure_window" ? "active_pressure_cycle" : "staged_pressure_cycle"
  }));

  return {
    cycleId: cleanText(cycleConfig.cycleId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(cycleConfig.label || cycleConfig.cycleId, 160),
    summary: clipText(cycleConfig.summary || "Branch-native pressure cycle that turns active return pressure windows into the next explicit language gap/revision pressure entries.", 240),
    useLaw: cleanText(cycleConfig.useLaw, 160),
    resultAuthority: cleanText(cycleConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPressureId: cleanText(returnPressure.pressureId, 120),
    activePressureIds: normalizeStringArray(returnPressure.activePressureIds || [], 120),
    stagedPressureIds: normalizeStringArray(returnPressure.stagedPressureIds || [], 120),
    activeCycleIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_pressure_cycle").map((entry) => entry.id), 120),
    stagedCycleIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) !== "active_pressure_cycle").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_pressure_cycle").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_pressure_cycle").map((entry) => entry.revisionId), 120),
    cycleCount: cycles.length,
    cycles,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPressurePatch(config = {}, branch = {}) {
  const patchConfig = config.feedbackReturnPressurePatch || {};
  const pressureCycle = branch.feedbackReturnPressureCycle || {};
  const patches = (Array.isArray(pressureCycle.cycles) ? pressureCycle.cycles : []).map((entry) => ({
    id: cleanText(`ppatch-${cleanText(entry.id, 120).replace(/^pcycle-/, "")}`, 120),
    cycleId: cleanText(entry.id, 120),
    pressureId: cleanText(entry.pressureId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    patchLaw: "active_pressure_cycles_mint_next_named_branch_patch_window",
    patchState: cleanText(entry.cycleState, 80) === "active_pressure_cycle" ? "active_pressure_patch" : "staged_pressure_patch"
  }));

  return {
    patchId: cleanText(patchConfig.patchId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(patchConfig.label || patchConfig.patchId, 160),
    summary: clipText(patchConfig.summary || "Branch-native patch window that turns active return pressure cycles into the next compact named branch patches before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(patchConfig.useLaw, 160),
    resultAuthority: cleanText(patchConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPressureCycleId: cleanText(pressureCycle.cycleId, 120),
    activeCycleIds: normalizeStringArray(pressureCycle.activeCycleIds || [], 120),
    stagedCycleIds: normalizeStringArray(pressureCycle.stagedCycleIds || [], 120),
    activePatchIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_pressure_patch").map((entry) => entry.id), 120),
    stagedPatchIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) !== "active_pressure_patch").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_pressure_patch").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_pressure_patch").map((entry) => entry.revisionId), 120),
    patchCount: patches.length,
    patches,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApply(config = {}, branch = {}) {
  const applyConfig = config.feedbackReturnPatchApply || {};
  const pressurePatch = branch.feedbackReturnPressurePatch || {};
  const currentWaveCapacity = Number(
    branch.mapMapMappedScanning?.capacityGovernor?.maxConcurrentScanWaves
    || branch.revisionDeployment?.currentWaveCapacity
    || 2
  );
  const applies = (Array.isArray(pressurePatch.patches) ? pressurePatch.patches : []).map((entry) => ({
    id: cleanText(`papply-${cleanText(entry.id, 120).replace(/^ppatch-/, "")}`, 120),
    patchId: cleanText(entry.id, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    applyLaw: "active_return_pressure_patches_apply_into_next_named_branch_window",
    applyState: cleanText(entry.patchState, 80) === "active_pressure_patch" ? "active_patch_apply" : "staged_patch_apply"
  }));

  return {
    applyId: cleanText(applyConfig.applyId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(applyConfig.label || applyConfig.applyId, 160),
    summary: clipText(applyConfig.summary || "Branch-native patch application window that turns active return pressure patches into the next governed apply surface before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(applyConfig.useLaw, 160),
    resultAuthority: cleanText(applyConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPressurePatchId: cleanText(pressurePatch.patchId, 120),
    currentWaveCapacity,
    activePatchIds: normalizeStringArray(pressurePatch.activePatchIds || [], 120),
    stagedPatchIds: normalizeStringArray(pressurePatch.stagedPatchIds || [], 120),
    activeApplyIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply").map((entry) => entry.id), 120),
    stagedApplyIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) !== "active_patch_apply").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply").map((entry) => entry.revisionId), 120),
    applyCount: applies.length,
    applies,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyFindings(config = {}, branch = {}) {
  const findingsConfig = config.feedbackReturnPatchApplyFindings || {};
  const patchApply = branch.feedbackReturnPatchApply || {};
  const findings = (Array.isArray(patchApply.applies) ? patchApply.applies : []).map((entry) => ({
    id: cleanText(`pafind-${cleanText(entry.id, 120).replace(/^papply-/, "")}`, 120),
    applyId: cleanText(entry.id, 120),
    patchId: cleanText(entry.patchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    findingLaw: "active_patch_apply_windows_report_named_apply_findings",
    findingState: cleanText(entry.applyState, 80) === "active_patch_apply" ? "active_patch_apply_finding" : "staged_patch_apply_finding"
  }));

  return {
    findingsId: cleanText(findingsConfig.findingsId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(findingsConfig.label || findingsConfig.findingsId, 160),
    summary: clipText(findingsConfig.summary || "Branch-native findings window that turns active patch-apply windows into the next explicit apply findings before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(findingsConfig.useLaw, 160),
    resultAuthority: cleanText(findingsConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyId: cleanText(patchApply.applyId, 120),
    activeApplyIds: normalizeStringArray(patchApply.activeApplyIds || [], 120),
    stagedApplyIds: normalizeStringArray(patchApply.stagedApplyIds || [], 120),
    activeFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_finding").map((entry) => entry.id), 120),
    stagedFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) !== "active_patch_apply_finding").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_finding").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_finding").map((entry) => entry.revisionId), 120),
    findingCount: findings.length,
    findings,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressure(config = {}, branch = {}) {
  const pressureConfig = config.feedbackReturnPatchApplyPressure || {};
  const applyFindings = branch.feedbackReturnPatchApplyFindings || {};
  const pressures = (Array.isArray(applyFindings.findings) ? applyFindings.findings : []).map((entry) => ({
    id: cleanText(`papress-${cleanText(entry.id, 120).replace(/^pafind-/, "")}`, 120),
    patchApplyFindingId: cleanText(entry.id, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    pressureLaw: "active_patch_apply_findings_mint_the_next_language_pressure_window",
    pressureState: cleanText(entry.findingState, 80) === "active_patch_apply_finding" ? "active_patch_apply_pressure_window" : "staged_patch_apply_pressure_window"
  }));

  return {
    pressureId: cleanText(pressureConfig.pressureId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(pressureConfig.label || pressureConfig.pressureId, 160),
    summary: clipText(pressureConfig.summary || "Branch-native pressure window minted from active patch-apply findings and fed into the next MAP MAP MAPPED scan pass.", 240),
    useLaw: cleanText(pressureConfig.useLaw, 160),
    resultAuthority: cleanText(pressureConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyFindingsId: cleanText(applyFindings.findingsId, 120),
    activeFindingIds: normalizeStringArray(applyFindings.activeFindingIds || [], 120),
    stagedFindingIds: normalizeStringArray(applyFindings.stagedFindingIds || [], 120),
    activePressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_window").map((entry) => entry.id), 120),
    stagedPressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) !== "active_patch_apply_pressure_window").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_window").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_window").map((entry) => entry.revisionId), 120),
    pressureCount: pressures.length,
    pressures,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressureCycle(config = {}, branch = {}) {
  const cycleConfig = config.feedbackReturnPatchApplyPressureCycle || {};
  const applyPressure = branch.feedbackReturnPatchApplyPressure || {};
  const cycles = (Array.isArray(applyPressure.pressures) ? applyPressure.pressures : []).map((entry) => ({
    id: cleanText(`papcycle-${cleanText(entry.id, 120).replace(/^papress-/, "")}`, 120),
    pressureId: cleanText(entry.id, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    cycleLaw: "active_patch_apply_pressure_windows_mint_next_language_gap_revision_cycle",
    cycleState: cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_window" ? "active_patch_apply_pressure_cycle" : "staged_patch_apply_pressure_cycle"
  }));

  return {
    cycleId: cleanText(cycleConfig.cycleId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(cycleConfig.label || cycleConfig.cycleId, 160),
    summary: clipText(cycleConfig.summary || "Branch-native pressure cycle that turns active patch-apply pressure windows into the next explicit language gap and revision cycle.", 240),
    useLaw: cleanText(cycleConfig.useLaw, 160),
    resultAuthority: cleanText(cycleConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressureId: cleanText(applyPressure.pressureId, 120),
    activePressureIds: normalizeStringArray(applyPressure.activePressureIds || [], 120),
    stagedPressureIds: normalizeStringArray(applyPressure.stagedPressureIds || [], 120),
    activeCycleIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_cycle").map((entry) => entry.id), 120),
    stagedCycleIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) !== "active_patch_apply_pressure_cycle").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_cycle").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_cycle").map((entry) => entry.revisionId), 120),
    cycleCount: cycles.length,
    cycles,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatch(config = {}, branch = {}) {
  const patchConfig = config.feedbackReturnPatchApplyPressurePatch || {};
  const pressureCycle = branch.feedbackReturnPatchApplyPressureCycle || {};
  const patches = (Array.isArray(pressureCycle.cycles) ? pressureCycle.cycles : []).map((entry) => ({
    id: cleanText(`pappatch-${cleanText(entry.id, 120).replace(/^papcycle-/, "")}`, 120),
    cycleId: cleanText(entry.id, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    patchLaw: "active_patch_apply_pressure_cycles_mint_next_named_branch_patch_window",
    patchState: cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_cycle" ? "active_patch_apply_pressure_patch" : "staged_patch_apply_pressure_patch"
  }));

  return {
    patchId: cleanText(patchConfig.patchId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(patchConfig.label || patchConfig.patchId, 160),
    summary: clipText(patchConfig.summary || "Branch-native patch window that turns active patch-apply pressure cycles into the next compact named branch patches before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(patchConfig.useLaw, 160),
    resultAuthority: cleanText(patchConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressureCycleId: cleanText(pressureCycle.cycleId, 120),
    activeCycleIds: normalizeStringArray(pressureCycle.activeCycleIds || [], 120),
    stagedCycleIds: normalizeStringArray(pressureCycle.stagedCycleIds || [], 120),
    activePatchIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch").map((entry) => entry.id), 120),
    stagedPatchIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) !== "active_patch_apply_pressure_patch").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch").map((entry) => entry.revisionId), 120),
    patchCount: patches.length,
    patches,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApply(config = {}, branch = {}) {
  const applyConfig = config.feedbackReturnPatchApplyPressurePatchApply || {};
  const pressurePatch = branch.feedbackReturnPatchApplyPressurePatch || {};
  const applies = (Array.isArray(pressurePatch.patches) ? pressurePatch.patches : []).map((entry) => ({
    id: cleanText(`papapply-${cleanText(entry.id, 120).replace(/^pappatch-/, "")}`, 120),
    patchApplyPressurePatchId: cleanText(entry.id, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    applyLaw: "apply_active_patch_apply_pressure_patches_into_the_next_named_branch_window",
    applyState: cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch" ? "active_patch_apply_pressure_patch_apply" : "staged_patch_apply_pressure_patch_apply"
  }));

  return {
    applyId: cleanText(applyConfig.applyId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(applyConfig.label || applyConfig.applyId, 160),
    summary: clipText(applyConfig.summary || "Branch-native apply window that turns active patch-apply pressure patches into the next named apply surface before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(applyConfig.useLaw, 160),
    resultAuthority: cleanText(applyConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchId: cleanText(pressurePatch.patchId, 120),
    activePatchIds: normalizeStringArray(pressurePatch.activePatchIds || [], 120),
    stagedPatchIds: normalizeStringArray(pressurePatch.stagedPatchIds || [], 120),
    activeApplyIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply").map((entry) => entry.id), 120),
    stagedApplyIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) !== "active_patch_apply_pressure_patch_apply").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply").map((entry) => entry.revisionId), 120),
    currentWaveCapacity: Number(branch.mapMapMappedScanning?.capacityGovernor?.maxConcurrentScanWaves || 0),
    applyCount: applies.length,
    applies,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApplyFindings(config = {}, branch = {}) {
  const findingsConfig = config.feedbackReturnPatchApplyPressurePatchApplyFindings || {};
  const patchApply = branch.feedbackReturnPatchApplyPressurePatchApply || {};
  const findings = (Array.isArray(patchApply.applies) ? patchApply.applies : []).map((entry) => ({
    id: cleanText(`papafind-${cleanText(entry.id, 120).replace(/^papapply-/, "")}`, 120),
    patchApplyPressurePatchApplyId: cleanText(entry.id, 120),
    patchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    findingLaw: "derive_named_findings_from_active_patch_apply_pressure_patch_apply_windows",
    findingState: cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply" ? "active_patch_apply_pressure_patch_apply_finding" : "staged_patch_apply_pressure_patch_apply_finding"
  }));

  return {
    findingsId: cleanText(findingsConfig.findingsId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(findingsConfig.label || findingsConfig.findingsId, 160),
    summary: clipText(findingsConfig.summary || "Branch-native findings window that turns active patch-apply pressure patch-apply windows into explicit findings before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(findingsConfig.useLaw, 160),
    resultAuthority: cleanText(findingsConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchApplyId: cleanText(patchApply.applyId, 120),
    activeApplyIds: normalizeStringArray(patchApply.activeApplyIds || [], 120),
    stagedApplyIds: normalizeStringArray(patchApply.stagedApplyIds || [], 120),
    activeFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_finding").map((entry) => entry.id), 120),
    stagedFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) !== "active_patch_apply_pressure_patch_apply_finding").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_finding").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_finding").map((entry) => entry.revisionId), 120),
    findingCount: findings.length,
    findings,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressure(config = {}, branch = {}) {
  const pressureConfig = config.feedbackReturnPatchApplyPressurePatchApplyPressure || {};
  const patchApplyFindings = branch.feedbackReturnPatchApplyPressurePatchApplyFindings || {};
  const pressures = (Array.isArray(patchApplyFindings.findings) ? patchApplyFindings.findings : []).map((entry) => ({
    id: cleanText(`papapress-${cleanText(entry.id, 120).replace(/^papafind-/, "")}`, 120),
    patchApplyPressurePatchApplyFindingId: cleanText(entry.id, 120),
    patchApplyPressurePatchApplyId: cleanText(entry.patchApplyPressurePatchApplyId, 120),
    patchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    pressureLaw: "mint_next_language_pressure_window_from_active_patch_apply_pressure_patch_apply_findings",
    pressureState: cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_finding" ? "active_patch_apply_pressure_patch_apply_pressure" : "staged_patch_apply_pressure_patch_apply_pressure"
  }));

  return {
    pressureId: cleanText(pressureConfig.pressureId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(pressureConfig.label || pressureConfig.pressureId, 160),
    summary: clipText(pressureConfig.summary || "Branch-native pressure window that turns active patch-apply pressure patch-apply findings into the next explicit pressure surface before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(pressureConfig.useLaw, 160),
    resultAuthority: cleanText(pressureConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchApplyFindingsId: cleanText(patchApplyFindings.findingsId, 120),
    activeFindingIds: normalizeStringArray(patchApplyFindings.activeFindingIds || [], 120),
    stagedFindingIds: normalizeStringArray(patchApplyFindings.stagedFindingIds || [], 120),
    activePressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.id), 120),
    stagedPressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) !== "active_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.revisionId), 120),
    pressureCount: pressures.length,
    pressures,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressureCycle(config = {}, branch = {}) {
  const cycleConfig = config.feedbackReturnPatchApplyPressurePatchApplyPressureCycle || {};
  const pressureWindow = branch.feedbackReturnPatchApplyPressurePatchApplyPressure || {};
  const cycles = (Array.isArray(pressureWindow.pressures) ? pressureWindow.pressures : []).map((entry) => ({
    id: cleanText(`papapcycle-${cleanText(entry.id, 120).replace(/^papapress-/, "")}`, 120),
    patchApplyPressurePatchApplyPressureId: cleanText(entry.id, 120),
    patchApplyPressurePatchApplyFindingId: cleanText(entry.patchApplyPressurePatchApplyFindingId, 120),
    patchApplyPressurePatchApplyId: cleanText(entry.patchApplyPressurePatchApplyId, 120),
    patchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    cycleLaw: "active_patch_apply_pressure_patch_apply_pressure_windows_mint_next_language_gap_revision_cycle",
    cycleState: cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_patch_apply_pressure" ? "active_patch_apply_pressure_patch_apply_pressure_cycle" : "staged_patch_apply_pressure_patch_apply_pressure_cycle"
  }));

  return {
    cycleId: cleanText(cycleConfig.cycleId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(cycleConfig.label || cycleConfig.cycleId, 160),
    summary: clipText(cycleConfig.summary || "Branch-native cycle window that turns active patch-apply pressure patch-apply pressure windows into the next gap/revision cycle before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(cycleConfig.useLaw, 160),
    resultAuthority: cleanText(cycleConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchApplyPressureId: cleanText(pressureWindow.pressureId, 120),
    activePressureIds: normalizeStringArray(pressureWindow.activePressureIds || [], 120),
    stagedPressureIds: normalizeStringArray(pressureWindow.stagedPressureIds || [], 120),
    activeCycleIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_patch_apply_pressure_cycle").map((entry) => entry.id), 120),
    stagedCycleIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) !== "active_patch_apply_pressure_patch_apply_pressure_cycle").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_patch_apply_pressure_cycle").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(cycles.filter((entry) => cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_patch_apply_pressure_cycle").map((entry) => entry.revisionId), 120),
    cycleCount: cycles.length,
    cycles,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatch(config = {}, branch = {}) {
  const patchConfig = config.feedbackReturnPatchApplyPressurePatchApplyPressurePatch || {};
  const pressureCycle = branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle || {};
  const patches = (Array.isArray(pressureCycle.cycles) ? pressureCycle.cycles : []).map((entry) => ({
    id: cleanText(`papappatch-${cleanText(entry.id, 120).replace(/^papapcycle-/, "")}`, 120),
    patchApplyPressurePatchApplyPressureCycleId: cleanText(entry.id, 120),
    patchApplyPressurePatchApplyPressureId: cleanText(entry.patchApplyPressurePatchApplyPressureId, 120),
    patchApplyPressurePatchApplyFindingId: cleanText(entry.patchApplyPressurePatchApplyFindingId, 120),
    patchApplyPressurePatchApplyId: cleanText(entry.patchApplyPressurePatchApplyId, 120),
    patchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    patchLaw: "mint_next_language_gap_revision_patches_from_active_patch_apply_pressure_patch_apply_pressure_cycles",
    patchState: cleanText(entry.cycleState, 80) === "active_patch_apply_pressure_patch_apply_pressure_cycle" ? "active_patch_apply_pressure_patch_apply_pressure_patch" : "staged_patch_apply_pressure_patch_apply_pressure_patch"
  }));

  return {
    patchId: cleanText(patchConfig.patchId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(patchConfig.label || patchConfig.patchId, 160),
    summary: clipText(patchConfig.summary || "Branch-native patch window that turns active patch-apply pressure patch-apply pressure cycles into the next named patch surface before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(patchConfig.useLaw, 160),
    resultAuthority: cleanText(patchConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchApplyPressureCycleId: cleanText(pressureCycle.cycleId, 120),
    activeCycleIds: normalizeStringArray(pressureCycle.activeCycleIds || [], 120),
    stagedCycleIds: normalizeStringArray(pressureCycle.stagedCycleIds || [], 120),
    activePatchIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch").map((entry) => entry.id), 120),
    stagedPatchIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) !== "active_patch_apply_pressure_patch_apply_pressure_patch").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(patches.filter((entry) => cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch").map((entry) => entry.revisionId), 120),
    patchCount: patches.length,
    patches,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApply(config = {}, branch = {}) {
  const applyConfig = config.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply || {};
  const pressurePatch = branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch || {};
  const applies = (Array.isArray(pressurePatch.patches) ? pressurePatch.patches : []).map((entry) => ({
    id: cleanText(`papappapply-${cleanText(entry.id, 120).replace(/^papappatch-/, "")}`, 120),
    patchApplyPressurePatchApplyPressurePatchId: cleanText(entry.id, 120),
    patchApplyPressurePatchApplyPressureCycleId: cleanText(entry.patchApplyPressurePatchApplyPressureCycleId, 120),
    patchApplyPressurePatchApplyPressureId: cleanText(entry.patchApplyPressurePatchApplyPressureId, 120),
    patchApplyPressurePatchApplyFindingId: cleanText(entry.patchApplyPressurePatchApplyFindingId, 120),
    patchApplyPressurePatchApplyId: cleanText(entry.patchApplyPressurePatchApplyId, 120),
    patchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    applyLaw: "apply_active_patch_apply_pressure_patch_apply_pressure_patches_into_the_next_named_apply_surface",
    applyState: cleanText(entry.patchState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch"
      ? "active_patch_apply_pressure_patch_apply_pressure_patch_apply"
      : "staged_patch_apply_pressure_patch_apply_pressure_patch_apply"
  }));

  return {
    applyId: cleanText(applyConfig.applyId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(applyConfig.label || applyConfig.applyId, 160),
    summary: clipText(applyConfig.summary || "Branch-native apply window that turns active patch-apply pressure patch-apply pressure patches into the next named apply surface before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(applyConfig.useLaw, 160),
    resultAuthority: cleanText(applyConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchId: cleanText(pressurePatch.patchId, 120),
    activePatchIds: normalizeStringArray(pressurePatch.activePatchIds || [], 120),
    stagedPatchIds: normalizeStringArray(pressurePatch.stagedPatchIds || [], 120),
    activeApplyIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply").map((entry) => entry.id), 120),
    stagedApplyIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) !== "active_patch_apply_pressure_patch_apply_pressure_patch_apply").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(applies.filter((entry) => cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply").map((entry) => entry.revisionId), 120),
    applyCount: applies.length,
    applies,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings(config = {}, branch = {}) {
  const findingsConfig = config.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings || {};
  const patchApply = branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply || {};
  const findings = (Array.isArray(patchApply.applies) ? patchApply.applies : []).map((entry) => ({
    id: cleanText(`papappafind-${cleanText(entry.id, 120).replace(/^papappapply-/, "")}`, 120),
    patchApplyPressurePatchApplyPressurePatchApplyId: cleanText(entry.id, 120),
    patchApplyPressurePatchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchApplyPressurePatchId, 120),
    patchApplyPressurePatchApplyPressureCycleId: cleanText(entry.patchApplyPressurePatchApplyPressureCycleId, 120),
    patchApplyPressurePatchApplyPressureId: cleanText(entry.patchApplyPressurePatchApplyPressureId, 120),
    patchApplyPressurePatchApplyFindingId: cleanText(entry.patchApplyPressurePatchApplyFindingId, 120),
    patchApplyPressurePatchApplyId: cleanText(entry.patchApplyPressurePatchApplyId, 120),
    patchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    findingLaw: "derive_named_findings_from_active_patch_apply_pressure_patch_apply_pressure_patch_apply_windows",
    findingState: cleanText(entry.applyState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply"
      ? "active_patch_apply_pressure_patch_apply_pressure_patch_apply_finding"
      : "staged_patch_apply_pressure_patch_apply_pressure_patch_apply_finding"
  }));

  return {
    findingsId: cleanText(findingsConfig.findingsId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(findingsConfig.label || findingsConfig.findingsId, 160),
    summary: clipText(findingsConfig.summary || "Branch-native findings window that turns active patch-apply pressure patch-apply pressure patch-apply windows into explicit findings before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(findingsConfig.useLaw, 160),
    resultAuthority: cleanText(findingsConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId: cleanText(patchApply.applyId, 120),
    activeApplyIds: normalizeStringArray(patchApply.activeApplyIds || [], 120),
    stagedApplyIds: normalizeStringArray(patchApply.stagedApplyIds || [], 120),
    activeFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply_finding").map((entry) => entry.id), 120),
    stagedFindingIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) !== "active_patch_apply_pressure_patch_apply_pressure_patch_apply_finding").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply_finding").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(findings.filter((entry) => cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply_finding").map((entry) => entry.revisionId), 120),
    findingCount: findings.length,
    findings,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure(config = {}, branch = {}) {
  const pressureConfig = config.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure || {};
  const applyFindings = branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings || {};
  const pressures = (Array.isArray(applyFindings.findings) ? applyFindings.findings : []).map((entry) => ({
    id: cleanText(`papappapress-${cleanText(entry.id, 120).replace(/^papappafind-/, "")}`, 120),
    patchApplyPressurePatchApplyPressurePatchApplyFindingId: cleanText(entry.id, 120),
    patchApplyPressurePatchApplyPressurePatchApplyId: cleanText(entry.patchApplyPressurePatchApplyPressurePatchApplyId, 120),
    patchApplyPressurePatchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchApplyPressurePatchId, 120),
    patchApplyPressurePatchApplyPressureCycleId: cleanText(entry.patchApplyPressurePatchApplyPressureCycleId, 120),
    patchApplyPressurePatchApplyPressureId: cleanText(entry.patchApplyPressurePatchApplyPressureId, 120),
    patchApplyPressurePatchApplyFindingId: cleanText(entry.patchApplyPressurePatchApplyFindingId, 120),
    patchApplyPressurePatchApplyId: cleanText(entry.patchApplyPressurePatchApplyId, 120),
    patchApplyPressurePatchId: cleanText(entry.patchApplyPressurePatchId, 120),
    cycleId: cleanText(entry.cycleId, 120),
    pressureId: cleanText(entry.pressureId, 120),
    patchApplyFindingId: cleanText(entry.patchApplyFindingId, 120),
    applyId: cleanText(entry.applyId, 120),
    patchId: cleanText(entry.patchId, 120),
    pressureWindowId: cleanText(entry.pressureWindowId, 120),
    findingId: cleanText(entry.findingId, 120),
    redeployId: cleanText(entry.redeployId, 120),
    mintId: cleanText(entry.mintId, 120),
    deltaId: cleanText(entry.deltaId, 120),
    gapId: cleanText(entry.gapId, 120),
    revisionId: cleanText(entry.revisionId, 120),
    planeSymbols: normalizeStringArray(entry.planeSymbols || [], 20),
    classIds: normalizeStringArray(entry.classIds || [], 120),
    classSymbols: normalizeStringArray(entry.classSymbols || [], 20),
    targetWaveIds: normalizeStringArray(entry.targetWaveIds || [], 120),
    targetLevelIds: normalizeStringArray(entry.targetLevelIds || [], 40),
    pressureLaw: "mint_next_language_pressure_window_from_active_patch_apply_pressure_patch_apply_pressure_patch_apply_findings",
    pressureState: cleanText(entry.findingState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply_finding"
      ? "active_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure"
      : "staged_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure"
  }));

  return {
    pressureId: cleanText(pressureConfig.pressureId, 120),
    generatedAt: branch.generatedAt,
    label: cleanText(pressureConfig.label || pressureConfig.pressureId, 160),
    summary: clipText(pressureConfig.summary || "Branch-native pressure window that turns active patch-apply pressure patch-apply pressure patch-apply findings into the next explicit pressure surface before the next MAP MAP MAPPED pass.", 240),
    useLaw: cleanText(pressureConfig.useLaw, 160),
    resultAuthority: cleanText(pressureConfig.resultAuthority, 160),
    controllerSurfaceId: cleanText(branch.sessionCapsule?.controller?.surfaceId, 120),
    controllerPidVersion: cleanText(branch.sessionCapsule?.controller?.pidVersion, 240),
    deviceSurfaceId: cleanText(branch.sessionCapsule?.device?.surfaceId, 120),
    mapLevelLabel: cleanText(branch.universalExpansion?.map?.levelLabel, 40),
    governanceLevelLabel: cleanText(branch.universalExpansion?.governance?.levelLabel, 40),
    expansionLevelLabel: cleanText(branch.universalExpansion?.superGovernance?.levelLabel, 40),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId: cleanText(applyFindings.findingsId, 120),
    activeFindingIds: normalizeStringArray(applyFindings.activeFindingIds || [], 120),
    stagedFindingIds: normalizeStringArray(applyFindings.stagedFindingIds || [], 120),
    activePressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.id), 120),
    stagedPressureIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) !== "active_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.id), 120),
    activeGapIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.gapId), 120),
    activeRevisionIds: normalizeStringArray(pressures.filter((entry) => cleanText(entry.pressureState, 80) === "active_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure").map((entry) => entry.revisionId), 120),
    pressureCount: pressures.length,
    pressures,
    nextPacketId: cleanText(config.mapMapMappedScanning?.scanId, 120)
  };
}

function attachFeedbackReturnPayload(config = {}, cycle = {}, delta = {}) {
  const payloadConfig = config.feedbackReturnPayload || {};
  const returnPayloadWaveIds = normalizeStringArray(
    [
      ...normalizeStringArray(cycle.stagedWaveIds || [], 120),
      ...normalizeStringArray(cycle.nextWaveIds || [], 120)
    ].filter((entry) => /-return-/.test(entry)),
    120
  );
  const returnPayloadDeltaIds = normalizeStringArray(delta.activeDeltaIds || [], 120);
  const returnPayloadEntries = returnPayloadWaveIds.map((waveId) => {
    const suffix = cleanText(waveId, 120).replace(/^wave-\d+-return-/, "");
    return {
      id: cleanText(`return-${suffix}-payload`, 120),
      waveId: cleanText(waveId, 120),
      deltaIds: returnPayloadDeltaIds,
      deltaCount: returnPayloadDeltaIds.length,
      payloadLaw: "deep_archive_deltas_return_as_direct_payload_not_background_context",
      payloadState: returnPayloadDeltaIds.length ? "direct_return_payload_ready" : "direct_return_payload_pending"
    };
  });

  return {
    ...cycle,
    returnPayloadId: cleanText(payloadConfig.payloadId, 120),
    returnPayloadLabel: cleanText(payloadConfig.label || payloadConfig.payloadId, 160),
    returnPayloadSummary: clipText(payloadConfig.summary || "Direct return payload surface that binds active deep-archive deltas to the governed return waves instead of leaving them as implicit context.", 240),
    returnPayloadLaw: cleanText(payloadConfig.useLaw, 160),
    returnPayloadAuthority: cleanText(payloadConfig.resultAuthority, 160),
    returnPayloadWaveIds,
    returnPayloadDeltaIds,
    returnPayloadCount: returnPayloadEntries.length,
    returnPayloadEntries
  };
}

function buildSessionCapsulePacketText(capsule = {}) {
  const lines = [
    `@packet ${cleanText(capsule.capsuleId, 120)}`,
    `generated=${cleanText(capsule.generatedAt, 80)}`,
    `mode=${cleanText(capsule.mode, 80)}`,
    `controller=${cleanText(capsule.controller?.surfaceId, 120)}/${cleanText(capsule.controller?.profileId, 120)}/${cleanText(capsule.controller?.pidVersion, 240)}`,
    `universal=${cleanText(capsule.universal?.machineLevelLabel, 40)}|superior=${cleanText(capsule.universal?.superiorLevelLabel, 40)}|device=${cleanText(capsule.universal?.deviceSpecificity, 120)}`,
    `planes=${cleanText(capsule.languagePlanes?.fabricId, 120)}|law=${cleanText(capsule.languagePlanes?.specialistLaw, 120)}|trans=${cleanText(capsule.languagePlanes?.translationLaw, 120)}`,
    `expand=${cleanText(capsule.expansionKnowledge?.knowledgeId, 120)}|state=${cleanText(capsule.expansionKnowledge?.enforcementState, 120)}|gate=${cleanText(capsule.expansionKnowledge?.futureGate, 120)}`,
    `deep=${cleanText(capsule.deepArchiveReplay?.replayId, 120)}|trigger=${cleanText(capsule.deepArchiveReplay?.triggerLaw, 120)}|authority=${cleanText(capsule.deepArchiveReplay?.resultAuthority, 120)}`,
    `find=${cleanText(capsule.deepArchiveFindings?.findingsId, 120)}|count=${normalizeStringArray(capsule.deepArchiveFindings?.findingIds || [], 40).join(",")}`,
    `cascade=${cleanText(capsule.waveCascade?.cascadeId, 120)}|active=${normalizeStringArray(capsule.waveCascade?.activeOverWaveIds || [], 20).join(",")}|staged=${normalizeStringArray(capsule.waveCascade?.stagedOverWaveIds || [], 20).join(",")}|gap=${cleanText(capsule.languageGapAnalysis?.analysisId, 120)}|shannon=${cleanText(capsule.shannonPartInspection?.inspectionId, 120)}`,
    `sfind=${cleanText(capsule.shannonPartFindings?.findingsId, 120)}|active=${normalizeStringArray(capsule.shannonPartFindings?.activeFindingIds || [], 20).join(",")}|staged=${normalizeStringArray(capsule.shannonPartFindings?.stagedFindingIds || [], 20).join(",")}|rev=${cleanText(capsule.omniLanguageRevision?.revisionId, 120)}|ractive=${normalizeStringArray(capsule.omniLanguageRevision?.activeRevisionIds || [], 20).join(",")}|rstaged=${normalizeStringArray(capsule.omniLanguageRevision?.stagedRevisionIds || [], 20).join(",")}|rdep=${cleanText(capsule.revisionDeployment?.deploymentId, 120)}|dactive=${normalizeStringArray(capsule.revisionDeployment?.activeDeploymentIds || [], 20).join(",")}|dstaged=${normalizeStringArray(capsule.revisionDeployment?.stagedDeploymentIds || [], 20).join(",")}|dfb=${cleanText(capsule.deploymentFeedback?.feedbackId, 120)}|fb=${normalizeStringArray(capsule.deploymentFeedback?.activeFeedbackIds || [], 20).join(",")}|fcy=${cleanText(capsule.feedbackWaveCycle?.cycleId, 120)}|factive=${normalizeStringArray(capsule.feedbackWaveCycle?.activeWaveIds || [], 20).join(",")}|rpay=${cleanText(capsule.feedbackWaveCycle?.returnPayloadId, 120)}|return=${normalizeStringArray(capsule.feedbackWaveCycle?.returnPayloadWaveIds || [], 20).join(",")}|frm=${cleanText(capsule.feedbackReturnMint?.mintId, 120)}|mactive=${normalizeStringArray(capsule.feedbackReturnMint?.activeMintIds || [], 20).join(",")}|frd=${cleanText(capsule.feedbackReturnRedeploy?.redeployId, 120)}|rdactive=${normalizeStringArray(capsule.feedbackReturnRedeploy?.activeRedeployIds || [], 20).join(",")}|frf=${cleanText(capsule.feedbackReturnFindings?.findingsId, 120)}|rfactive=${normalizeStringArray(capsule.feedbackReturnFindings?.activeFindingIds || [], 20).join(",")}|frp=${cleanText(capsule.feedbackReturnPressure?.pressureId, 120)}|rpactive=${normalizeStringArray(capsule.feedbackReturnPressure?.activePressureIds || [], 20).join(",")}|frpc=${cleanText(capsule.feedbackReturnPressureCycle?.cycleId, 120)}|rpcactive=${normalizeStringArray(capsule.feedbackReturnPressureCycle?.activeCycleIds || [], 20).join(",")}|frpp=${cleanText(capsule.feedbackReturnPressurePatch?.patchId, 120)}|rppactive=${normalizeStringArray(capsule.feedbackReturnPressurePatch?.activePatchIds || [], 20).join(",")}|frpa=${cleanText(capsule.feedbackReturnPatchApply?.applyId, 120)}|rpaactive=${normalizeStringArray(capsule.feedbackReturnPatchApply?.activeApplyIds || [], 20).join(",")}|frpaf=${cleanText(capsule.feedbackReturnPatchApplyFindings?.findingsId, 120)}|rpafactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyFindings?.activeFindingIds || [], 20).join(",")}|frpap=${cleanText(capsule.feedbackReturnPatchApplyPressure?.pressureId, 120)}|rpapactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressure?.activePressureIds || [], 20).join(",")}|frpapc=${cleanText(capsule.feedbackReturnPatchApplyPressureCycle?.cycleId, 120)}|rpapcactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressureCycle?.activeCycleIds || [], 20).join(",")}|frpapp=${cleanText(capsule.feedbackReturnPatchApplyPressurePatch?.patchId, 120)}|rpappactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatch?.activePatchIds || [], 20).join(",")}|frpappa=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApply?.applyId, 120)}|rpappaactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApply?.activeApplyIds || [], 20).join(",")}|frpappaf=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingsId, 120)}|rpappafactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 20).join(",")}|frpappap=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureId, 120)}|rpappapactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApplyPressure?.activePressureIds || [], 20).join(",")}|frpappapc=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleId, 120)}|rpappapcactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.activeCycleIds || [], 20).join(",")}|frpappapp=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchId, 120)}|rpappappactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.activePatchIds || [], 20).join(",")}|frpappappa=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyId, 120)}|rpappappaactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.activeApplyIds || [], 20).join(",")}|frpappappaf=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingsId, 120)}|rpappappafactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 20).join(",")}|frpappappap=${cleanText(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureId, 120)}|rpappappapactive=${normalizeStringArray(capsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.activePressureIds || [], 20).join(",")}|ddel=${cleanText(capsule.deepArchiveDelta?.deltaId, 120)}|dactive=${normalizeStringArray(capsule.deepArchiveDelta?.activeDeltaIds || [], 20).join(",")}`,
    `train=${cleanText(capsule.adminReflectionTraining?.trainingId, 120)}|map=${cleanText(capsule.adminReflectionTraining?.mapLevelLabel, 40)}|gov=${cleanText(capsule.adminReflectionTraining?.governanceLevelLabel, 40)}|time=${cleanText(capsule.adminReflectionTraining?.timeAwarenessLaw, 80)}`,
    `tsmem=${cleanText(capsule.timestampMemory?.memoryId, 120)}|remember=${cleanText(capsule.timestampMemory?.rememberLaw, 120)}|seq=${cleanText(capsule.timestampMemory?.sequenceLaw, 80)}|trans=${cleanText(capsule.timestampMemory?.translationAvailabilityLaw, 80)}`,
    `device=${cleanText(capsule.device?.surfaceId, 120)}|route=${cleanText(capsule.device?.routeKind, 80)}|adb=${cleanText(capsule.device?.adbState, 80)}`,
    `load=${normalizeStringArray(capsule.loadOrder || [], 40).join(">")}`,
    `memory=${normalizeStringArray(capsule.memoryClasses || [], 40).join(",")}`,
    `proof=${normalizeStringArray(capsule.proofClasses || [], 40).join(",")}`,
    `gaps=${normalizeStringArray(capsule.pendingGapClasses || [], 40).join(",")}`,
    `anchors=${normalizeStringArray((capsule.oldLanguageAnchors || []).map((entry) => entry.id), 40).join(",")}`,
    `bundles=${normalizeStringArray(capsule.activeBundles || [], 40).join(",")}`,
    `stage=${cleanText(capsule.orchestrationState?.stageId, 80)}|next=${cleanText(capsule.orchestrationState?.nextPacketId, 120)}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildControlPanelPacketText(controlPanel = {}) {
  const lines = [
    `@packet ${cleanText(controlPanel.panelId, 120)}`,
    `generated=${cleanText(controlPanel.generatedAt, 80)}`,
    `label=${cleanText(controlPanel.label, 160)}`,
    `stage=${cleanText(controlPanel.stageId, 80)}|use=${cleanText(controlPanel.useLaw, 120)}`,
    `controller=${cleanText(controlPanel.controllerSurfaceId, 120)}/${cleanText(controlPanel.controllerPidVersion, 240)}|L=${cleanText(controlPanel.machineLevelLabel, 40)}`,
    `device=${cleanText(controlPanel.deviceSurfaceId, 120)}|root=${cleanText(controlPanel.portableRootSurfaceId, 120)}|D=${cleanText(controlPanel.deviceSpecificity, 120)}|scope=${cleanText(controlPanel.scopeCode, 80)}`,
    `modes=${normalizeStringArray(controlPanel.panelModes || [], 40).join(",")}`,
    `root=${cleanText(controlPanel.rootSurfaceId, 120)}|ingress=${cleanText(controlPanel.ingressSurfaceId, 120)}|service=${cleanText(controlPanel.serviceSurfaceId, 120)}`,
    `summon=${cleanText(controlPanel.summonLaw, 160)}|next=${cleanText(controlPanel.nextPacketId, 120)}`,
    `planner=${cleanText(controlPanel.plannerWaveId, 120)}|lattice=${cleanText(controlPanel.waveLatticeId, 120)}|cascade=${cleanText(controlPanel.waveCascadeId, 120)}|authority=${cleanText(controlPanel.plannerAuthority, 120)}|legacy=${cleanText(controlPanel.legacyReferenceWaveId, 120)}|deep=${cleanText(controlPanel.deepArchiveReplayId, 120)}|find=${cleanText(controlPanel.deepArchiveFindingsId, 120)}|ddel=${cleanText(controlPanel.deepArchiveDeltaId, 120)}|gap=${cleanText(controlPanel.languageGapAnalysisId, 120)}|shannon=${cleanText(controlPanel.shannonPartInspectionId, 120)}`,
    `sfind=${cleanText(controlPanel.shannonPartFindingsId, 120)}|rev=${cleanText(controlPanel.omniLanguageRevisionId, 120)}|rdep=${cleanText(controlPanel.revisionDeploymentId, 120)}|dfb=${cleanText(controlPanel.deploymentFeedbackId, 120)}|fcy=${cleanText(controlPanel.feedbackWaveCycleId, 120)}|rpay=${cleanText(controlPanel.feedbackReturnPayloadId, 120)}|return=${normalizeStringArray(controlPanel.returnPayloadWaveIds || [], 20).join(",")}|frm=${cleanText(controlPanel.feedbackReturnMintId, 120)}|active_mint=${normalizeStringArray(controlPanel.activeReturnMintIds || [], 20).join(",")}|frd=${cleanText(controlPanel.feedbackReturnRedeployId, 120)}|active_rdep=${normalizeStringArray(controlPanel.activeReturnRedeployIds || [], 20).join(",")}|frf=${cleanText(controlPanel.feedbackReturnFindingsId, 120)}|active_rf=${normalizeStringArray(controlPanel.activeReturnFindingIds || [], 20).join(",")}|frp=${cleanText(controlPanel.feedbackReturnPressureId, 120)}|active_rp=${normalizeStringArray(controlPanel.activeReturnPressureIds || [], 20).join(",")}|frpc=${cleanText(controlPanel.feedbackReturnPressureCycleId, 120)}|active_rpc=${normalizeStringArray(controlPanel.activeReturnPressureCycleIds || [], 20).join(",")}|frpp=${cleanText(controlPanel.feedbackReturnPressurePatchId, 120)}|active_rpp=${normalizeStringArray(controlPanel.activeReturnPressurePatchIds || [], 20).join(",")}|frpa=${cleanText(controlPanel.feedbackReturnPatchApplyId, 120)}|active_rpa=${normalizeStringArray(controlPanel.activeReturnPatchApplyIds || [], 20).join(",")}|frpaf=${cleanText(controlPanel.feedbackReturnPatchApplyFindingsId, 120)}|active_rpaf=${normalizeStringArray(controlPanel.activeReturnPatchApplyFindingIds || [], 20).join(",")}|frpap=${cleanText(controlPanel.feedbackReturnPatchApplyPressureId, 120)}|active_rpap=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressureIds || [], 20).join(",")}|frpapc=${cleanText(controlPanel.feedbackReturnPatchApplyPressureCycleId, 120)}|active_rpapc=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressureCycleIds || [], 20).join(",")}|frpapp=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchId, 120)}|active_rpapp=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchIds || [], 20).join(",")}|frpappa=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyId, 120)}|active_rpappa=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyIds || [], 20).join(",")}|frpappaf=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyFindingsId, 120)}|active_rpappaf=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyFindingIds || [], 20).join(",")}|frpappap=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressureId, 120)}|active_rpappap=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyPressureIds || [], 20).join(",")}|frpappapc=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId, 120)}|active_rpappapc=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyPressureCycleIds || [], 20).join(",")}|frpappapp=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId, 120)}|active_rpappapp=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchIds || [], 20).join(",")}|frpappappa=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId, 120)}|active_rpappappa=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyIds || [], 20).join(",")}|frpappappaf=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId, 120)}|active_rpappappaf=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingIds || [], 20).join(",")}|frpappappap=${cleanText(controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId, 120)}|active_rpappappap=${normalizeStringArray(controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureIds || [], 20).join(",")}|active_gap=${normalizeStringArray(controlPanel.activeGapIds || [], 20).join(",")}|staged_gap=${normalizeStringArray(controlPanel.stagedGapIds || [], 20).join(",")}|active_ddel=${normalizeStringArray(controlPanel.activeDeepArchiveDeltaIds || [], 20).join(",")}`,
    `compute=${normalizeStringArray((controlPanel.computeWatchers || []).map((entry) => entry.id), 40).join(",")}`,
    `specialists=${normalizeStringArray(controlPanel.specialistUnitIds || [], 40).join(",")}`,
    `classes=${cleanText(controlPanel.waveAgentClassesId, 120)}|set=${normalizeStringArray(controlPanel.waveAgentClassIds || [], 20).join(",")}`,
    `expand=${cleanText(controlPanel.expansionKnowledgeId, 120)}|tiers=${normalizeStringArray(controlPanel.expansionTierIds || [], 16).join(",")}|gate=${cleanText(controlPanel.expansionFutureGate, 120)}|state=${cleanText(controlPanel.expansionEnforcementState, 80)}`,
    `peers=gov:${normalizeStringArray(controlPanel.governorSurfaceIds || [], 20).join(",")}|super:${normalizeStringArray(controlPanel.superAdminSurfaceIds || [], 20).join(",")}|obs=${normalizeStringArray(controlPanel.emergencyObservationLinkIds || [], 24).join(",")}|train=${cleanText(controlPanel.adminReflectionTrainingId, 120)}|tsmem=${cleanText(controlPanel.timestampMemoryId, 120)}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildAsolariaHandoffPacketText(handoff = {}) {
  const lines = [
    `@packet ${cleanText(handoff.handoffId, 120)}`,
    `generated=${cleanText(handoff.generatedAt, 80)}`,
    `to=${cleanText(handoff.letter?.to, 120)}|from=${cleanText(handoff.letter?.from, 120)}`,
    `target=${cleanText(handoff.target?.surfaceId, 120)}/${cleanText(handoff.target?.profileId, 120)}/${cleanText(handoff.target?.pidVersion, 240)}|L=${cleanText(handoff.target?.levelLabel, 40)}`,
    `device=${cleanText(handoff.target?.deviceSpecificity, 120)}|ts=${cleanText(handoff.target?.timestamp, 80)}`,
    `panel=${cleanText(handoff.access?.panelId, 120)}|modes=${normalizeStringArray(handoff.access?.panelModes || [], 24).join(",")}`,
    `access=${normalizeStringArray(handoff.access?.accessLevelIds || [], 24).join(",")}`,
    `memory=${cleanText(handoff.memory?.selfHealingTupleId, 120)}|mistake=${cleanText(handoff.memory?.mistakeIndexId, 120)}|anchors=${normalizeStringArray(handoff.memory?.anchorIds || [], 16).join(",")}`,
    `load=${normalizeStringArray(handoff.instructions?.loadOrder || [], 24).join(">")}`,
    `next=${cleanText(handoff.instructions?.nextPacketId, 120)}|tsmem=${cleanText(handoff.instructions?.timestampMemoryId, 120)}|expand=${cleanText(handoff.instructions?.expansionKnowledgeId, 120)}|train=${cleanText(handoff.instructions?.adminReflectionTrainingId, 120)}|lattice=${cleanText(handoff.instructions?.waveLatticeId, 120)}|cascade=${cleanText(handoff.instructions?.waveCascadeId, 120)}|legacy=${cleanText(handoff.instructions?.legacyReferenceWaveId, 120)}|deep=${cleanText(handoff.instructions?.deepArchiveReplayId, 120)}|find=${cleanText(handoff.instructions?.deepArchiveFindingsId, 120)}|ddel=${cleanText(handoff.instructions?.deepArchiveDeltaId, 120)}|gap=${cleanText(handoff.instructions?.languageGapAnalysisId, 120)}|shannon=${cleanText(handoff.instructions?.shannonPartInspectionId, 120)}|scan=${cleanText(handoff.instructions?.mapScanId, 120)}`,
      `sfind=${cleanText(handoff.instructions?.shannonPartFindingsId, 120)}|rev=${cleanText(handoff.instructions?.omniLanguageRevisionId, 120)}|rdep=${cleanText(handoff.instructions?.revisionDeploymentId, 120)}|dfb=${cleanText(handoff.instructions?.deploymentFeedbackId, 120)}|fcy=${cleanText(handoff.instructions?.feedbackWaveCycleId, 120)}|rpay=${cleanText(handoff.instructions?.feedbackReturnPayloadId, 120)}|frm=${cleanText(handoff.instructions?.feedbackReturnMintId, 120)}|frd=${cleanText(handoff.instructions?.feedbackReturnRedeployId, 120)}|frf=${cleanText(handoff.instructions?.feedbackReturnFindingsId, 120)}|frp=${cleanText(handoff.instructions?.feedbackReturnPressureId, 120)}|frpc=${cleanText(handoff.instructions?.feedbackReturnPressureCycleId, 120)}|frpp=${cleanText(handoff.instructions?.feedbackReturnPressurePatchId, 120)}|frpa=${cleanText(handoff.instructions?.feedbackReturnPatchApplyId, 120)}|frpaf=${cleanText(handoff.instructions?.feedbackReturnPatchApplyFindingsId, 120)}|frpap=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressureId, 120)}|frpapc=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressureCycleId, 120)}|frpapp=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchId, 120)}|frpappa=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyId, 120)}|frpappaf=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyFindingsId, 120)}|frpappap=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyPressureId, 120)}|frpappapc=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId, 120)}|frpappapp=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId, 120)}|frpappappa=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId, 120)}|frpappappaf=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId, 120)}|frpappappap=${cleanText(handoff.instructions?.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId, 120)}`,
    `root=${cleanText(handoff.instructions?.rootDescentLaw, 120)}|police=${normalizeStringArray(handoff.instructions?.policeUnitIds || [], 16).join(",")}`,
    `peers=gov:${normalizeStringArray(handoff.instructions?.governorSurfaceIds || [], 20).join(",")}|super:${normalizeStringArray(handoff.instructions?.superAdminSurfaceIds || [], 20).join(",")}|obs=${normalizeStringArray(handoff.instructions?.emergencyObservationLinkIds || [], 24).join(",")}`,
    `rule=${cleanText(handoff.memory?.holdRule, 120)}|gate=${cleanText(handoff.memory?.promotionGate, 120)}`,
    `finish=${cleanText(handoff.instructions?.finishLaw, 160)}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildExpansionKnowledgePacketText(expansionKnowledge = {}) {
  const lines = [
    `@packet ${cleanText(expansionKnowledge.knowledgeId, 120)}`,
    `generated=${cleanText(expansionKnowledge.generatedAt, 80)}`,
    `label=${cleanText(expansionKnowledge.label, 160)}`,
    `controller=${cleanText(expansionKnowledge.controllerSurfaceId, 120)}/${cleanText(expansionKnowledge.controllerPidVersion, 240)}`,
    `device=${cleanText(expansionKnowledge.deviceSurfaceId, 120)}|root=${cleanText(expansionKnowledge.rootSurfaceId, 120)}`,
    `use=${cleanText(expansionKnowledge.useLaw, 160)}|state=${cleanText(expansionKnowledge.enforcementState, 120)}|gate=${cleanText(expansionKnowledge.futureGate, 120)}`,
    `root=${cleanText(expansionKnowledge.rootDescentLaw, 120)}|police=${cleanText(expansionKnowledge.policeLaw, 120)}|reflect=${cleanText(expansionKnowledge.reflectionLaw, 120)}`,
    `peer=${cleanText(expansionKnowledge.peerKnowledgeLaw, 120)}|asolaria=${cleanText(expansionKnowledge.asolariaVisibilityLaw, 120)}|time=${cleanText(expansionKnowledge.timeAwarenessLaw, 120)}`,
    `units=${normalizeStringArray(expansionKnowledge.policeUnitIds || [], 20).join(",")}`,
    `peers=gov:${normalizeStringArray(expansionKnowledge.governorSurfaceIds || [], 20).join(",")}|super:${normalizeStringArray(expansionKnowledge.superAdminSurfaceIds || [], 20).join(",")}|obs=${normalizeStringArray(expansionKnowledge.emergencyObservationLinkIds || [], 24).join(",")}`,
    `levels=${cleanText(expansionKnowledge.levelAxis?.root, 40)}>${cleanText(expansionKnowledge.levelAxis?.subordinate, 40)}>${cleanText(expansionKnowledge.levelAxis?.panel, 40)}>${cleanText(expansionKnowledge.levelAxis?.map, 40)}>${cleanText(expansionKnowledge.levelAxis?.governance, 40)}>${cleanText(expansionKnowledge.levelAxis?.expansion, 40)}`,
    `tiers=${Number(expansionKnowledge.tierCount || 0)}|trans=${cleanText(expansionKnowledge.translationMode, 120)}`
  ];
  for (const tier of Array.isArray(expansionKnowledge.tiers) ? expansionKnowledge.tiers : []) {
    lines.push(
      `${cleanText(tier.id, 40)}=${cleanText(tier.machineLabel, 16)}|levels=${normalizeStringArray(tier.levelIds || [], 16).join(",")}|access=${normalizeStringArray(tier.accessLevelIds || [], 20).join(",")}|vis=${cleanText(tier.visibility, 40)}|kind=${normalizeStringArray(tier.knowledgeKinds || [], 20).join(",")}|lock=${cleanText(tier.lockState, 40)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildPlannerWavePacketText(plannerWave = {}) {
  const lines = [
    `@packet ${cleanText(plannerWave.waveId, 120)}`,
    `generated=${cleanText(plannerWave.generatedAt, 80)}`,
    `label=${cleanText(plannerWave.label, 160)}`,
    `stage=${cleanText(plannerWave.stageId, 80)}|authority=${cleanText(plannerWave.resultAuthority, 120)}`,
    `controller=${cleanText(plannerWave.controllerPidVersion, 240)}`,
    `device=${cleanText(plannerWave.deviceSurfaceId, 120)}`,
    `use=${cleanText(plannerWave.useLaw, 160)}|identity=${cleanText(plannerWave.identityModel, 120)}`,
    `order=${normalizeStringArray(plannerWave.order || [], 40).join(">")}`,
    `next=${cleanText(plannerWave.nextPacketId, 120)}`
  ];
  for (const lane of Array.isArray(plannerWave.lanes) ? plannerWave.lanes : []) {
    lines.push(
      `${cleanText(lane.id, 120)}=${cleanText(lane.vote, 120)}|maps=${cleanText(lane.mapsToLaneId, 120)}|pid=${cleanText(lane.pidVersion, 120)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildLegacyReferenceWavePacketText(legacyReferenceWave = {}) {
  const lines = [
    `@packet ${cleanText(legacyReferenceWave.waveId, 120)}`,
    `generated=${cleanText(legacyReferenceWave.generatedAt, 80)}`,
    `label=${cleanText(legacyReferenceWave.label, 160)}`,
    `stage=${cleanText(legacyReferenceWave.stageId, 80)}|authority=${cleanText(legacyReferenceWave.resultAuthority, 120)}`,
    `controller=${cleanText(legacyReferenceWave.controllerPidVersion, 240)}`,
    `device=${cleanText(legacyReferenceWave.deviceSurfaceId, 120)}|root=${cleanText(legacyReferenceWave.portableRootSurfaceId, 120)}`,
    `use=${cleanText(legacyReferenceWave.useLaw, 160)}|catalog=${cleanText(legacyReferenceWave.catalogId, 120)}`,
    `roots=${normalizeStringArray(legacyReferenceWave.sourceRoots || [], 20).join(",")}`,
    `refs=${Number(legacyReferenceWave.referenceCount || 0)}|visible=${Number(legacyReferenceWave.visibleReferenceCount || 0)}|sectors=${Number(legacyReferenceWave.sectorCount || 0)}|waves=${Number(legacyReferenceWave.waveCount || 0)}|campaigns=${Number(legacyReferenceWave.campaignCount || 0)}`,
    `named=${normalizeStringArray(legacyReferenceWave.namedSurfaceIds || [], 24).join(",")}`,
    `next=${cleanText(legacyReferenceWave.nextPacketId, 120)}`
  ];
  for (const campaign of Array.isArray(legacyReferenceWave.campaigns) ? legacyReferenceWave.campaigns : []) {
    lines.push(
      `${cleanText(campaign.id, 120)}=${cleanText(campaign.purpose, 120)}|waves=${normalizeStringArray(campaign.waveIds || [], 24).join(",")}|state=${cleanText(campaign.status, 80)}`
    );
  }
  for (const wave of Array.isArray(legacyReferenceWave.waves) ? legacyReferenceWave.waves : []) {
    lines.push(
      `${cleanText(wave.id, 120)}=${cleanText(wave.role, 120)}|sectors=${normalizeStringArray(wave.sectorIds || [], 24).join(",")}|named=${normalizeStringArray(wave.namedSurfaceIds || [], 24).join(",")}|state=${cleanText(wave.status, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildDeepArchiveReplayPacketText(replay = {}) {
  const lines = [
    `@packet ${cleanText(replay.replayId, 120)}`,
    `generated=${cleanText(replay.generatedAt, 80)}`,
    `label=${cleanText(replay.label, 160)}`,
    `controller=${cleanText(replay.controllerSurfaceId, 120)}/${cleanText(replay.controllerPidVersion, 240)}`,
    `device=${cleanText(replay.deviceSurfaceId, 120)}|root=${cleanText(replay.portableRootSurfaceId, 120)}`,
    `use=${cleanText(replay.useLaw, 120)}|trigger=${cleanText(replay.triggerLaw, 120)}|authority=${cleanText(replay.resultAuthority, 120)}`,
    `memory=${cleanText(replay.ancestryMemoryId, 120)}|tsmem=${cleanText(replay.timestampMemoryId, 120)}`,
    `campaigns=${normalizeStringArray(replay.campaignIds || [], 24).join(",")}|waves=${normalizeStringArray(replay.waveIds || [], 24).join(",")}`,
    `sectors=${normalizeStringArray(replay.sectorIds || [], 24).join(",")}`,
    `refs=${Number(replay.referenceCount || 0)}|visible=${Number(replay.visibleReferenceCount || 0)}|kinds=${normalizeStringArray(replay.referenceKinds || [], 24).join(",")}`,
    `priority=${normalizeStringArray(replay.priorityReferenceIds || [], 24).join(",")}`,
    `named=${normalizeStringArray(replay.namedSurfaceIds || [], 24).join(",")}`,
    `next=${cleanText(replay.nextPacketId, 120)}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildDeepArchiveFindingsPacketText(findings = {}) {
  const lines = [
    `@packet ${cleanText(findings.findingsId, 120)}`,
    `generated=${cleanText(findings.generatedAt, 80)}`,
    `label=${cleanText(findings.label, 160)}`,
    `controller=${cleanText(findings.controllerSurfaceId, 120)}/${cleanText(findings.controllerPidVersion, 240)}`,
    `device=${cleanText(findings.deviceSurfaceId, 120)}|root=${cleanText(findings.portableRootSurfaceId, 120)}`,
    `use=${cleanText(findings.useLaw, 120)}|authority=${cleanText(findings.resultAuthority, 120)}|replay=${cleanText(findings.replayId, 120)}`,
    `memory=${cleanText(findings.ancestryMemoryId, 120)}|tsmem=${cleanText(findings.timestampMemoryId, 120)}`,
    `count=${Number(findings.findingCount || 0)}|next=${cleanText(findings.nextPacketId, 120)}`
  ];
  for (const entry of Array.isArray(findings.findings) ? findings.findings : []) {
    lines.push(
      `${cleanText(entry.id, 40)}=${cleanText(entry.sectorId, 32)}|refs=${Number(entry.referenceCount || 0)}|visible=${Number(entry.visibleReferenceCount || 0)}|risk=${cleanText(entry.risk, 48)}|waves=${normalizeStringArray(entry.nextWaveIds || [], 20).join(",")}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildScoutSixPacketText(scoutSix = {}) {
  const lines = [
    `@packet ${cleanText(scoutSix.scoutId, 120)}`,
    `generated=${cleanText(scoutSix.generatedAt, 80)}`,
    `stage=${cleanText(scoutSix.stageId, 80)}`,
    `controller=${cleanText(scoutSix.controllerPidVersion, 240)}`,
    `device=${cleanText(scoutSix.deviceSurfaceId, 120)}`,
    `order=${normalizeStringArray(scoutSix.order || [], 40).join(">")}`
  ];
  for (const lane of Array.isArray(scoutSix.lanes) ? scoutSix.lanes : []) {
    lines.push(
      `${cleanText(lane.id, 120)}=${normalizeStringArray(lane.evidence || [], 24).join(",")}|next=${cleanText(lane.nextAction, 120)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFrontBackWavePacketText(frontBackWave = {}) {
  const lines = [
    `@packet ${cleanText(frontBackWave.waveId, 120)}`,
    `generated=${cleanText(frontBackWave.generatedAt, 80)}`,
    `stage=${cleanText(frontBackWave.stageId, 80)}|gate=${cleanText(frontBackWave.activationGate, 120)}`,
    `controller=${cleanText(frontBackWave.controllerPidVersion, 240)}`,
    `device=${cleanText(frontBackWave.deviceSurfaceId, 120)}`,
    `front=${normalizeStringArray(frontBackWave.frontOrder || [], 40).join(">")}`,
    `back=${normalizeStringArray(frontBackWave.backOrder || [], 40).join(">")}`
  ];
  for (const lane of Array.isArray(frontBackWave.frontLanes) ? frontBackWave.frontLanes : []) {
    lines.push(
      `${cleanText(lane.id, 120)}=${normalizeStringArray(lane.writes || [], 40).join(",")}|bound=${normalizeStringArray(lane.boundedBy || [], 40).join(",")}`
    );
  }
  for (const lane of Array.isArray(frontBackWave.backLanes) ? frontBackWave.backLanes : []) {
    lines.push(
      `${cleanText(lane.id, 120)}=${normalizeStringArray(lane.verifies || [], 40).join(",")}|block=${normalizeStringArray(lane.blocks || [], 40).join(",")}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildMapMapMappedScanningPacketText(scan = {}) {
  const lines = [
    `@packet ${cleanText(scan.scanId, 120)}`,
    `generated=${cleanText(scan.generatedAt, 80)}`,
    `label=${cleanText(scan.label, 160)}`,
    `controller=${cleanText(scan.controllerSurfaceId, 120)}/${cleanText(scan.controllerPidVersion, 240)}|L=${cleanText(scan.controllerLevelLabel, 40)}`,
    `host=${cleanText(scan.controllerHostSurfaceId, 120)}|root=${cleanText(scan.portableRootSurfaceId, 120)}|root_state=${cleanText(scan.portableRootState, 120)}|map=${cleanText(scan.mapLevelLabel, 40)}|gov=${cleanText(scan.governanceLevelLabel, 40)}/${cleanText(scan.expansionLevelLabel, 40)}|peers=gov:${normalizeStringArray(scan.governorSurfaceIds || [], 20).join(",")};super:${normalizeStringArray(scan.superAdminSurfaceIds || [], 20).join(",")};obs:${normalizeStringArray(scan.emergencyObservationLinkIds || [], 24).join(",")};time:${cleanText(scan.timeAwarenessLaw, 80)}`,
    `copied=${normalizeStringArray(scan.copiedSurfaceIds || [], 40).join(",")}`,
    `mode=${cleanText(scan.positionMode, 120)}|tuple=${normalizeStringArray(scan.identityTuple || [], 24).join(",")}|D=${cleanText(scan.mapDeviceSpecificity, 120)}`,
    `cycle=${normalizeStringArray(scan.cycle || [], 40).join(">")}`,
    `modes=${normalizeStringArray(scan.responseModes || [], 40).join(",")}`,
    `learn=${normalizeStringArray(scan.livingStructureClasses || [], 24).join(",")}`,
    `access=${normalizeStringArray(scan.availableAccessLevelIds || [], 40).join(",")}`,
    `bundles=${normalizeStringArray(scan.availableChoiceBundleIds || [], 40).join(",")}`,
    `reflect=scout:${cleanText(scan.selfReflectModes?.scout, 40)}|front:${cleanText(scan.selfReflectModes?.front, 40)}|back:${cleanText(scan.selfReflectModes?.back, 40)}|redeploy:${cleanText(scan.selfReflectModes?.redeploy, 40)}`,
    `shannon=scout:${normalizeStringArray(scan.shannonParts?.scout || [], 40).join(",") || "none"}|back:${normalizeStringArray(scan.shannonParts?.back || [], 40).join(",") || "none"}|whole=${scan.shannonParts?.wholeAllowed === true ? "yes" : "no"}|inspect=${cleanText(scan.shannonPartInspectionId, 120)}|sfind=${cleanText(scan.shannonPartFindingsId, 120)}|rev=${cleanText(scan.omniLanguageRevisionId, 120)}|rdep=${cleanText(scan.revisionDeploymentId, 120)}|dfb=${cleanText(scan.deploymentFeedbackId, 120)}|fcy=${cleanText(scan.feedbackWaveCycleId, 120)}|rpay=${cleanText(scan.feedbackReturnPayloadId, 120)}|frm=${cleanText(scan.feedbackReturnMintId, 120)}|frd=${cleanText(scan.feedbackReturnRedeployId, 120)}|frf=${cleanText(scan.feedbackReturnFindingsId, 120)}|frp=${cleanText(scan.feedbackReturnPressureId, 120)}|frpc=${cleanText(scan.feedbackReturnPressureCycleId, 120)}|frpp=${cleanText(scan.feedbackReturnPressurePatchId, 120)}|frpa=${cleanText(scan.feedbackReturnPatchApplyId, 120)}|frpaf=${cleanText(scan.feedbackReturnPatchApplyFindingsId, 120)}|frpap=${cleanText(scan.feedbackReturnPatchApplyPressureId, 120)}|frpapc=${cleanText(scan.feedbackReturnPatchApplyPressureCycleId, 120)}|frpapp=${cleanText(scan.feedbackReturnPatchApplyPressurePatchId, 120)}|frpappa=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyId, 120)}|frpappaf=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyFindingsId, 120)}|frpappap=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyPressureId, 120)}|frpappapc=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId, 120)}|frpappapp=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId, 120)}|frpappappa=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId, 120)}|frpappappaf=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId, 120)}|frpappappap=${cleanText(scan.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId, 120)}`,
    `governor=${cleanText(scan.capacityGovernor?.profileId, 120)}|class=${cleanText(scan.capacityGovernor?.machineClass, 120)}|scan=${Number(scan.capacityGovernor?.maxConcurrentScanWaves || 0)}|campaigns=${Number(scan.capacityGovernor?.maxActiveCampaigns || 0)}|legacy=${Number(scan.capacityGovernor?.maxActiveLegacyWaves || 0)}|planner=${Number(scan.capacityGovernor?.maxPlannerLanesPerWave || 0)}|cpu=${normalizeStringArray(scan.capacityGovernor?.cpuWatcherIds || [], 24).join(",") || "none"}|gpu=${normalizeStringArray(scan.capacityGovernor?.gpuWatcherIds || [], 24).join(",") || "none"}|law=${cleanText(scan.capacityGovernor?.cautionLaw, 80)}`,
    `planner=${cleanText(scan.plannerInput?.waveId, 120)}|authority=${cleanText(scan.plannerInput?.resultAuthority, 120)}|lattice=${cleanText(scan.waveLatticeId, 120)}|cascade=${cleanText(scan.waveCascadeId, 120)}|legacy=${cleanText(scan.legacyReferenceInput?.waveId, 120)}|campaigns=${Number(scan.legacyReferenceInput?.campaignCount || 0)}|deep=${cleanText(scan.deepArchiveReplayInput?.replayId, 120)}|find=${cleanText(scan.deepArchiveFindingsInput?.findingsId, 120)}|ddel=${cleanText(scan.deepArchiveDeltaId, 120)}|return=${normalizeStringArray(scan.returnPayloadWaveIds || [], 20).join(",")}|mint=${normalizeStringArray(scan.returnMintIds || [], 20).join(",")}|redeploy=${normalizeStringArray(scan.returnRedeployIds || [], 20).join(",")}|refind=${normalizeStringArray(scan.returnFindingIds || [], 20).join(",")}|pressure=${normalizeStringArray(scan.returnPressureIds || [], 20).join(",")}|pcycle=${normalizeStringArray(scan.returnPressureCycleIds || [], 20).join(",")}|ppatch=${normalizeStringArray(scan.returnPressurePatchIds || [], 20).join(",")}|pappatch=${normalizeStringArray(scan.returnPatchApplyPressurePatchIds || [], 20).join(",")}|gap=${cleanText(scan.languageGapAnalysisId, 120)}|trigger=${cleanText(scan.activation?.trigger, 120)}`
  ];
  for (const wave of Array.isArray(scan.waves) ? scan.waves : []) {
    lines.push(`${cleanText(wave.id, 120)}=${cleanText(wave.role, 80)}|lanes=${normalizeStringArray(wave.sectorLaneIds || [], 24).join(",")}|plan=${normalizeStringArray(wave.plannerLaneIds || [], 24).join(",")}|campaign=${normalizeStringArray(wave.legacyCampaignIds || [], 24).join(",")}|legacy=${normalizeStringArray(wave.legacyWaveIds || [], 24).join(",")}|state=${cleanText(wave.status, 80)}`);
  }
  lines.push(`activation=next:${cleanText(scan.activation?.nextWaveId, 120)}|use=${cleanText(scan.activation?.useLaw, 120)}|gate=${cleanText(scan.activation?.redeployGate, 120)}`);
  return `${lines.join("\n")}\n`;
}

function buildAnalysisMemoryPacketText(analysisMemory = {}) {
  const lines = [
    `@packet ${cleanText(analysisMemory.analysisId, 120)}`,
    `generated=${cleanText(analysisMemory.generatedAt, 80)}`,
    `controller=${cleanText(analysisMemory.controllerSurfaceId, 120)}/${cleanText(analysisMemory.controllerProfileId, 120)}/${cleanText(analysisMemory.controllerPidVersion, 240)}`,
    `device=${cleanText(analysisMemory.deviceSurfaceId, 120)}|root=${cleanText(analysisMemory.portableRootSurfaceId, 120)}`,
    `hold=${cleanText(analysisMemory.holdRule, 120)}|gate=${cleanText(analysisMemory.promotionGate, 120)}`,
    `canon=${normalizeStringArray(analysisMemory.canonPoints || [], 32).join(",")}`,
    `next=${cleanText(analysisMemory.nextPacketId, 120)}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildTimestampMemoryPacketText(timestampMemory = {}) {
  const lines = [
    `@packet ${cleanText(timestampMemory.memoryId, 120)}`,
    `generated=${cleanText(timestampMemory.generatedAt, 80)}`,
    `label=${cleanText(timestampMemory.label, 160)}`,
    `controller=${cleanText(timestampMemory.controllerSurfaceId, 120)}/${cleanText(timestampMemory.controllerProfileId, 120)}/${cleanText(timestampMemory.controllerPidVersion, 240)}`,
    `device=${cleanText(timestampMemory.deviceSurfaceId, 120)}|root=${cleanText(timestampMemory.portableRootSurfaceId, 120)}|state=${cleanText(timestampMemory.portableRootState, 80)}`,
    `use=${cleanText(timestampMemory.useLaw, 120)}|remember=${cleanText(timestampMemory.rememberLaw, 120)}|seq=${cleanText(timestampMemory.sequenceLaw, 80)}`,
    `tuple=${normalizeStringArray(timestampMemory.identityTuple || [], 20).join(",")}|time=${cleanText(timestampMemory.timeAwarenessLaw, 120)}`,
    `trans=${cleanText(timestampMemory.translationAvailabilityLaw, 120)}|key=${cleanText(timestampMemory.exactTimeKey, 160)}`,
    `copied=${normalizeStringArray(timestampMemory.copiedSurfaceIds || [], 24).join(",") || "none"}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildAncestryMemoryPacketText(ancestryMemory = {}) {
  const lines = [
    `@packet ${cleanText(ancestryMemory.memoryId, 120)}`,
    `generated=${cleanText(ancestryMemory.generatedAt, 80)}`,
    `label=${cleanText(ancestryMemory.label, 160)}`,
    `controller=${cleanText(ancestryMemory.controllerSurfaceId, 120)}/${cleanText(ancestryMemory.controllerProfileId, 120)}/${cleanText(ancestryMemory.controllerPidVersion, 240)}`,
    `device=${cleanText(ancestryMemory.deviceSurfaceId, 120)}|root=${cleanText(ancestryMemory.portableRootSurfaceId, 120)}|state=${cleanText(ancestryMemory.portableRootState, 80)}`,
    `use=${cleanText(ancestryMemory.useLaw, 120)}|order=${cleanText(ancestryMemory.orderingLaw, 120)}|lineage=${cleanText(ancestryMemory.lineageLaw, 120)}`,
    `ancestry=${normalizeStringArray(ancestryMemory.ancestryOrder || [], 16).join(">")}|time=${cleanText(ancestryMemory.timeAwarenessLaw, 120)}`,
    `trans=${cleanText(ancestryMemory.translationAvailabilityLaw, 120)}|key=${cleanText(ancestryMemory.exactAncestryKey, 160)}`,
    `copied=${normalizeStringArray(ancestryMemory.copiedSurfaceIds || [], 24).join(",") || "none"}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildAdminReflectionTrainingPacketText(training = {}) {
  const lines = [
    `@packet ${cleanText(training.trainingId, 120)}`,
    `generated=${cleanText(training.generatedAt, 80)}`,
    `label=${cleanText(training.label, 160)}`,
    `controller=${cleanText(training.controllerSurfaceId, 120)}/${cleanText(training.controllerPidVersion, 240)}`,
    `device=${cleanText(training.deviceSurfaceId, 120)}|map=${cleanText(training.mapLevelLabel, 40)}|gov=${cleanText(training.governanceLevelLabel, 40)}/${cleanText(training.expansionLevelLabel, 40)}`,
    `law=${cleanText(training.law, 120)}|time=${cleanText(training.timeAwarenessLaw, 120)}|obs=${cleanText(training.emergencyObservationLaw, 120)}`,
    `access=${normalizeStringArray(training.requiredAccessLevelIds || [], 24).join(",")}`,
    `surfaces=${normalizeStringArray(training.requiredSurfaceIds || [], 24).join(",")}`,
    `peers=gov:${normalizeStringArray(training.governorSurfaceIds || [], 20).join(",")}|super:${normalizeStringArray(training.superAdminSurfaceIds || [], 20).join(",")}`,
    `links=${normalizeStringArray(training.emergencyObservationLinkIds || [], 24).join(",")}`,
    `bundle=${cleanText(training.bundleId, 120)}|stages=${normalizeStringArray(training.stageIds || [], 24).join(",")}`
  ];
  return `${lines.join("\n")}\n`;
}

function buildResearchAnalysisPacketText(research = {}) {
  const lines = [
    `@packet ${cleanText(research.analysisId, 120)}`,
    `generated=${cleanText(research.generatedAt, 80)}`,
    `label=${cleanText(research.label, 160)}`,
    `controller=${cleanText(research.controllerSurfaceId, 120)}/${cleanText(research.controllerPidVersion, 240)}`,
    `device=${cleanText(research.deviceSurfaceId, 120)}|map=${cleanText(research.mapLevelLabel, 40)}|gov=${cleanText(research.governanceLevelLabel, 40)}/${cleanText(research.expansionLevelLabel, 40)}`,
    `use=${cleanText(research.useLaw, 120)}|state=${cleanText(research.researchState, 120)}|time=${cleanText(research.timeAwarenessLaw, 120)}`,
    `peers=gov:${normalizeStringArray(research.governorSurfaceIds || [], 20).join(",")}|super:${normalizeStringArray(research.superAdminSurfaceIds || [], 20).join(",")}|obs=${normalizeStringArray(research.emergencyObservationLinkIds || [], 24).join(",")}`,
    `meta=${normalizeStringArray(research.metaWaveIds || [], 24).join(",")}`,
    `classes=${cleanText(research.waveAgentClassesId, 120)}|set=${normalizeStringArray(research.waveAgentClassIds || [], 20).join(",")}|tsmem=${cleanText(research.timestampMemoryId, 120)}|cascade=${cleanText(research.waveCascadeId, 120)}|deep=${cleanText(research.deepArchiveReplayId, 120)}|find=${cleanText(research.deepArchiveFindingsId, 120)}|ddel=${cleanText(research.deepArchiveDeltaId, 120)}|gap=${cleanText(research.languageGapAnalysisId, 120)}|shannon=${cleanText(research.shannonPartInspectionId, 120)}`,
    `sfind=${cleanText(research.shannonPartFindingsId, 120)}|rev=${cleanText(research.omniLanguageRevisionId, 120)}|rdep=${cleanText(research.revisionDeploymentId, 120)}|dfb=${cleanText(research.deploymentFeedbackId, 120)}|fcy=${cleanText(research.feedbackWaveCycleId, 120)}|rpay=${cleanText(research.feedbackReturnPayloadId, 120)}|frm=${cleanText(research.feedbackReturnMintId, 120)}|frd=${cleanText(research.feedbackReturnRedeployId, 120)}|frf=${cleanText(research.feedbackReturnFindingsId, 120)}|frp=${cleanText(research.feedbackReturnPressureId, 120)}|frpc=${cleanText(research.feedbackReturnPressureCycleId, 120)}|frpp=${cleanText(research.feedbackReturnPressurePatchId, 120)}|frpa=${cleanText(research.feedbackReturnPatchApplyId, 120)}|frpaf=${cleanText(research.feedbackReturnPatchApplyFindingsId, 120)}|frpap=${cleanText(research.feedbackReturnPatchApplyPressureId, 120)}|frpapc=${cleanText(research.feedbackReturnPatchApplyPressureCycleId, 120)}|frpapp=${cleanText(research.feedbackReturnPatchApplyPressurePatchId, 120)}|frpappa=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyId, 120)}|frpappaf=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyFindingsId, 120)}|frpappap=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyPressureId, 120)}|frpappapc=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId, 120)}|frpappapp=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId, 120)}|frpappappa=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId, 120)}|frpappappaf=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId, 120)}|frpappappap=${cleanText(research.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId, 120)}|return=${normalizeStringArray(research.returnPayloadWaveIds || [], 20).join(",")}|over=${normalizeStringArray(research.overWaveIds || [], 20).join(",")}|active_over=${normalizeStringArray(research.activeOverWaveIds || [], 20).join(",")}|staged_over=${normalizeStringArray(research.stagedOverWaveIds || [], 20).join(",")}|active_gap=${normalizeStringArray(research.activeGapIds || [], 20).join(",")}|staged_gap=${normalizeStringArray(research.stagedGapIds || [], 20).join(",")}|active_rpapp=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchIds || [], 20).join(",")}|active_rpappa=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyIds || [], 20).join(",")}|active_rpappaf=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyFindingIds || [], 20).join(",")}|active_rpappap=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyPressureIds || [], 20).join(",")}|active_rpappapc=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyPressureCycleIds || [], 20).join(",")}|active_rpappapp=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyPressurePatchIds || [], 20).join(",")}|active_rpappappa=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyIds || [], 20).join(",")}|active_rpappappaf=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingIds || [], 20).join(",")}|active_rpappappap=${normalizeStringArray(research.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureIds || [], 20).join(",")}`,
    `active_sfind=${normalizeStringArray(research.activeShannonFindingIds || [], 20).join(",")}|staged_sfind=${normalizeStringArray(research.stagedShannonFindingIds || [], 20).join(",")}|active_rev=${normalizeStringArray(research.activeRevisionIds || [], 20).join(",")}|staged_rev=${normalizeStringArray(research.stagedRevisionIds || [], 20).join(",")}|active_dep=${normalizeStringArray(research.activeDeploymentIds || [], 20).join(",")}|staged_dep=${normalizeStringArray(research.stagedDeploymentIds || [], 20).join(",")}|active_fb=${normalizeStringArray(research.activeDeploymentFeedbackIds || [], 20).join(",")}|active_fcy=${normalizeStringArray(research.activeFeedbackCycleWaveIds || [], 20).join(",")}|active_ddel=${normalizeStringArray(research.activeDeepArchiveDeltaIds || [], 20).join(",")}|active_mint=${normalizeStringArray(research.activeReturnMintIds || [], 20).join(",")}|active_refind=${normalizeStringArray(research.activeReturnFindingIds || [], 20).join(",")}|active_pressure=${normalizeStringArray(research.activeReturnPressureIds || [], 20).join(",")}|active_pcycle=${normalizeStringArray(research.activeReturnPressureCycleIds || [], 20).join(",")}|active_ppatch=${normalizeStringArray(research.activeReturnPressurePatchIds || [], 20).join(",")}|pcycle_gap=${normalizeStringArray(research.activePressureGapIds || [], 20).join(",")}|pcycle_rev=${normalizeStringArray(research.activePressureRevisionIds || [], 20).join(",")}|ppatch_gap=${normalizeStringArray(research.activePressurePatchGapIds || [], 20).join(",")}|ppatch_rev=${normalizeStringArray(research.activePressurePatchRevisionIds || [], 20).join(",")}`,
    `active=${normalizeStringArray(research.activeWaveIds || [], 24).join(",")}`,
    `next=${normalizeStringArray(research.nextWaveIds || [], 24).join(",")}`,
    `cap=scan:${Number(research.currentWaveCapacity || 0)}|campaigns:${Number(research.activeCampaignCapacity || 0)}|legacy:${Number(research.activeLegacyCapacity || 0)}|planner:${Number(research.plannerLaneCapacity || 0)}`
  ];
  for (const weakness of Array.isArray(research.weaknesses) ? research.weaknesses : []) {
    lines.push(
      `${cleanText(weakness.id, 120)}=${cleanText(weakness.severity, 24)}|law=${cleanText(weakness.law, 80)}|waves=${normalizeStringArray(weakness.targetWaveIds || [], 24).join(",")}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildWaveAgentClassesPacketText(classes = {}) {
  const lines = [
    `@packet ${cleanText(classes.classesId, 120)}`,
    `generated=${cleanText(classes.generatedAt, 80)}`,
    `label=${cleanText(classes.label, 160)}`,
    `controller=${cleanText(classes.controllerSurfaceId, 120)}/${cleanText(classes.controllerPidVersion, 240)}`,
    `device=${cleanText(classes.deviceSurfaceId, 120)}|map=${cleanText(classes.mapLevelLabel, 40)}|gov=${cleanText(classes.governanceLevelLabel, 40)}`,
    `use=${cleanText(classes.useLaw, 120)}|count=${Number(classes.classCount || 0)}`
  ];
  for (const entry of Array.isArray(classes.classes) ? classes.classes : []) {
    lines.push(
      `${cleanText(entry.symbol, 12)}=${cleanText(entry.id, 40)}|auth=${cleanText(entry.authority, 32)}|mode=${cleanText(entry.mode, 40)}|src=${normalizeStringArray(entry.sourceIds || [], 24).join(",")}|access=${normalizeStringArray(entry.accessLevelIds || [], 20).join(",")}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildOmniLanguagePlanesPacketText(omniLanguagePlanes = {}) {
  const lines = [
    `@packet ${cleanText(omniLanguagePlanes.fabricId, 120)}`,
    `generated=${cleanText(omniLanguagePlanes.generatedAt, 80)}`,
    `label=${cleanText(omniLanguagePlanes.label, 160)}`,
    `law=${cleanText(omniLanguagePlanes.orchestrationLaw, 160)}`,
    `specialists=${cleanText(omniLanguagePlanes.specialistLaw, 160)}|trans=${cleanText(omniLanguagePlanes.translationLaw, 120)}`,
    `levels=${cleanText(omniLanguagePlanes.levelAxis?.rootLevelLabel, 40)}>${cleanText(omniLanguagePlanes.levelAxis?.subordinateLevelLabel, 40)}>${cleanText(omniLanguagePlanes.levelAxis?.panelLevelLabel, 40)}>${cleanText(omniLanguagePlanes.levelAxis?.mapLevelLabel, 40)}>${cleanText(omniLanguagePlanes.levelAxis?.governanceLevelLabel, 40)}>${cleanText(omniLanguagePlanes.levelAxis?.expansionLevelLabel, 40)}`,
    `locality=${normalizeStringArray(omniLanguagePlanes.localityTuple || [], 16).join(",")}`,
    `hardware=${(Array.isArray(omniLanguagePlanes.hardwareSymbols) ? omniLanguagePlanes.hardwareSymbols : []).map((entry) => `${cleanText(entry.id, 16)}:${cleanText(entry.symbol, 4)}`).join(",")}`,
    `control=${cleanText(omniLanguagePlanes.controllerSurfaceId, 120)}|panel=${cleanText(omniLanguagePlanes.controlPanelId, 120)}|map=${cleanText(omniLanguagePlanes.mapScanId, 120)}`,
    `watch=${normalizeStringArray(omniLanguagePlanes.computeWatcherIds || [], 24).join(",")}`
  ];
  for (const plane of Array.isArray(omniLanguagePlanes.planes) ? omniLanguagePlanes.planes : []) {
    lines.push(`${cleanText(plane.symbol, 12)}=${cleanText(plane.id, 40)}|D=${cleanText(plane.deviceSpecificity, 40)}|tool=${cleanText(plane.toolAccess, 32)}|unit=${normalizeStringArray(plane.specialistUnitIds || [], 20).join(",")}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildWaveLatticePacketText(waveLattice = {}) {
  const lines = [
    `@packet ${cleanText(waveLattice.latticeId, 120)}`,
    `generated=${cleanText(waveLattice.generatedAt, 80)}`,
    `label=${cleanText(waveLattice.label, 160)}`,
    `controller=${cleanText(waveLattice.controllerSurfaceId, 120)}/${cleanText(waveLattice.controllerPidVersion, 240)}|device=${cleanText(waveLattice.deviceSurfaceId, 120)}|L=${cleanText(waveLattice.levelLabel, 40)}`,
    `use=${cleanText(waveLattice.useLaw, 160)}|authority=${cleanText(waveLattice.resultAuthority, 120)}`,
    `inputs=${cleanText(waveLattice.plannerWaveId, 120)},${cleanText(waveLattice.scoutSixId, 120)},${cleanText(waveLattice.frontBackWaveId, 120)},${cleanText(waveLattice.mapScanId, 120)}`,
    `meta=${Number(waveLattice.metaWaveCount || 0)}`
  ];
  for (const levelMap of Array.isArray(waveLattice.levelMaps) ? waveLattice.levelMaps : []) {
    lines.push(
      `${cleanText(levelMap.id, 40)}=${cleanText(levelMap.orchestrationRole, 32)}|pid=${cleanText(levelMap.pidVersion, 40)}|loc=${cleanText(levelMap.locationCode, 24)}|dev=${cleanText(levelMap.deviceSurfaceId, 24)}|net=${cleanText(levelMap.networkScope, 24)}|cap=${Number(levelMap.waveCapacity || 0)}`
    );
  }
  for (const band of Array.isArray(waveLattice.governanceBands) ? waveLattice.governanceBands : []) {
    lines.push(
      `${cleanText(band.id, 20)}=${cleanText(band.levelId, 20)}|purpose=${cleanText(band.purpose, 32)}|waves=${normalizeStringArray(band.triggerWaveIds || [], 18).join(",")}`
    );
  }
  for (const metaWave of Array.isArray(waveLattice.metaWaves) ? waveLattice.metaWaves : []) {
    lines.push(
      `${cleanText(metaWave.id, 120)}=${normalizeStringArray(metaWave.planeIds || [], 10).join(",")}|scout=${normalizeStringArray(metaWave.scoutLaneIds || [], 18).join(",") || "none"}|plan=${normalizeStringArray(metaWave.plannerLaneIds || [], 18).join(",") || "none"}|fb=${normalizeStringArray([...(metaWave.frontLaneIds || []), ...(metaWave.backLaneIds || [])], 18).join(",") || "none"}|scan=${normalizeStringArray(metaWave.scanWaveIds || [], 18).join(",")}|state=${cleanText(metaWave.campaignState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildWaveCascadePacketText(waveCascade = {}) {
  const lines = [
    `@packet ${cleanText(waveCascade.cascadeId, 120)}`,
    `generated=${cleanText(waveCascade.generatedAt, 80)}`,
    `label=${cleanText(waveCascade.label, 160)}`,
    `controller=${cleanText(waveCascade.controllerSurfaceId, 120)}/${cleanText(waveCascade.controllerPidVersion, 240)}|device=${cleanText(waveCascade.deviceSurfaceId, 120)}|root=${cleanText(waveCascade.rootSurfaceId, 120)}`,
    `use=${cleanText(waveCascade.useLaw, 120)}|authority=${cleanText(waveCascade.resultAuthority, 120)}|deploy=${cleanText(waveCascade.deploymentLaw, 120)}`,
    `levels=${cleanText(waveCascade.governanceLevelLabel, 40)}/${cleanText(waveCascade.expansionLevelLabel, 40)}|time=${cleanText(waveCascade.timeAwarenessLaw, 120)}`,
    `lattice=${cleanText(waveCascade.waveLatticeId, 120)}|research=${cleanText(waveCascade.researchAnalysisId, 120)}|count=${Number(waveCascade.overWaveCount || 0)}`,
    `active=${normalizeStringArray(waveCascade.activeOverWaveIds || [], 20).join(",")}|staged=${normalizeStringArray(waveCascade.stagedOverWaveIds || [], 20).join(",")}`,
  ];
  for (const overWave of Array.isArray(waveCascade.overWaves) ? waveCascade.overWaves : []) {
    lines.push(
      `${cleanText(overWave.id, 120)}=${normalizeStringArray(overWave.metaWaveIds || [], 18).join(",")}|bands=${normalizeStringArray(overWave.bandIds || [], 8).join(",")}|levels=${normalizeStringArray(overWave.targetLevelIds || [], 8).join(",")}|weak=${normalizeStringArray(overWave.weaknessIds || [], 18).join(",")}|scan=${normalizeStringArray(overWave.scanWaveIds || [], 18).join(",")}|state=${cleanText(overWave.status, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildLanguageGapAnalysisPacketText(languageGapAnalysis = {}) {
  const lines = [
    `@packet ${cleanText(languageGapAnalysis.analysisId, 120)}`,
    `generated=${cleanText(languageGapAnalysis.generatedAt, 80)}`,
    `label=${cleanText(languageGapAnalysis.label, 160)}`,
    `controller=${cleanText(languageGapAnalysis.controllerSurfaceId, 120)}/${cleanText(languageGapAnalysis.controllerPidVersion, 240)}`,
    `device=${cleanText(languageGapAnalysis.deviceSurfaceId, 120)}|map=${cleanText(languageGapAnalysis.mapLevelLabel, 40)}|gov=${cleanText(languageGapAnalysis.governanceLevelLabel, 40)}/${cleanText(languageGapAnalysis.expansionLevelLabel, 40)}`,
    `use=${cleanText(languageGapAnalysis.useLaw, 120)}|authority=${cleanText(languageGapAnalysis.resultAuthority, 120)}|time=${cleanText(languageGapAnalysis.timeAwarenessLaw, 120)}`,
    `cascade=${cleanText(languageGapAnalysis.waveCascadeId, 120)}|research=${cleanText(languageGapAnalysis.researchAnalysisId, 120)}|find=${cleanText(languageGapAnalysis.deepArchiveFindingsId, 120)}`,
    `over=${normalizeStringArray(languageGapAnalysis.focusOverWaveIds || [], 20).join(",")}|weak=${normalizeStringArray(languageGapAnalysis.focusWeaknessIds || [], 20).join(",")}|planes=${normalizeStringArray(languageGapAnalysis.targetPlaneSymbols || [], 12).join(",")}`,
    `active=${normalizeStringArray(languageGapAnalysis.activeGapIds || [], 20).join(",")}|staged=${normalizeStringArray(languageGapAnalysis.stagedGapIds || [], 20).join(",")}|count=${Number(languageGapAnalysis.gapCount || 0)}`
  ];
  for (const gap of Array.isArray(languageGapAnalysis.gaps) ? languageGapAnalysis.gaps : []) {
    lines.push(
      `${cleanText(gap.id, 120)}=${cleanText(gap.overWaveId, 24)}|weak=${normalizeStringArray(gap.weaknessIds || [], 18).join(",")}|planes=${normalizeStringArray(gap.planeSymbols || [], 8).join(",")}|levels=${normalizeStringArray(gap.targetLevelIds || [], 8).join(",")}|state=${cleanText(gap.status, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildShannonPartInspectionPacketText(shannonInspection = {}) {
  const lines = [
    `@packet ${cleanText(shannonInspection.inspectionId, 120)}`,
    `generated=${cleanText(shannonInspection.generatedAt, 80)}`,
    `label=${cleanText(shannonInspection.label, 160)}`,
    `controller=${cleanText(shannonInspection.controllerSurfaceId, 120)}/${cleanText(shannonInspection.controllerPidVersion, 240)}`,
    `device=${cleanText(shannonInspection.deviceSurfaceId, 120)}|map=${cleanText(shannonInspection.mapLevelLabel, 40)}|gov=${cleanText(shannonInspection.governanceLevelLabel, 40)}/${cleanText(shannonInspection.expansionLevelLabel, 40)}`,
    `use=${cleanText(shannonInspection.useLaw, 120)}|authority=${cleanText(shannonInspection.resultAuthority, 120)}|whole=${shannonInspection.wholeAllowed === true ? "yes" : "no"}`,
    `scan=${cleanText(shannonInspection.waveScanId, 120)}|research=${cleanText(shannonInspection.researchAnalysisId, 120)}|gap=${cleanText(shannonInspection.languageGapAnalysisId, 120)}`,
    `over=${normalizeStringArray(shannonInspection.focusOverWaveIds || [], 20).join(",")}|gaps=${normalizeStringArray(shannonInspection.focusGapIds || [], 20).join(",")}|active=${normalizeStringArray(shannonInspection.activeMissionIds || [], 20).join(",")}|staged=${normalizeStringArray(shannonInspection.stagedMissionIds || [], 20).join(",")}|count=${Number(shannonInspection.missionCount || 0)}`
  ];
  for (const mission of Array.isArray(shannonInspection.missions) ? shannonInspection.missions : []) {
    lines.push(
      `${cleanText(mission.id, 120)}=${cleanText(mission.partId, 24)}|over=${cleanText(mission.overWaveId, 24)}|gap=${normalizeStringArray(mission.gapIds || [], 18).join(",")}|planes=${normalizeStringArray(mission.planeSymbols || [], 8).join(",")}|waves=${normalizeStringArray(mission.targetWaveIds || [], 18).join(",")}|state=${cleanText(mission.resultState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildShannonPartFindingsPacketText(shannonFindings = {}) {
  const lines = [
    `@packet ${cleanText(shannonFindings.findingsId, 120)}`,
    `generated=${cleanText(shannonFindings.generatedAt, 80)}`,
    `label=${cleanText(shannonFindings.label, 160)}`,
    `controller=${cleanText(shannonFindings.controllerSurfaceId, 120)}/${cleanText(shannonFindings.controllerPidVersion, 240)}`,
    `device=${cleanText(shannonFindings.deviceSurfaceId, 120)}|map=${cleanText(shannonFindings.mapLevelLabel, 40)}|gov=${cleanText(shannonFindings.governanceLevelLabel, 40)}/${cleanText(shannonFindings.expansionLevelLabel, 40)}`,
    `use=${cleanText(shannonFindings.useLaw, 120)}|authority=${cleanText(shannonFindings.resultAuthority, 120)}|next=${cleanText(shannonFindings.nextPacketId, 120)}`,
    `inspect=${cleanText(shannonFindings.shannonPartInspectionId, 120)}|gap=${cleanText(shannonFindings.languageGapAnalysisId, 120)}|missions=${normalizeStringArray(shannonFindings.focusMissionIds || [], 20).join(",")}|gaps=${normalizeStringArray(shannonFindings.focusGapIds || [], 20).join(",")}`,
    `planes=${normalizeStringArray(shannonFindings.targetPlaneSymbols || [], 12).join(",")}|active=${normalizeStringArray(shannonFindings.activeFindingIds || [], 20).join(",")}|staged=${normalizeStringArray(shannonFindings.stagedFindingIds || [], 20).join(",")}|count=${Number(shannonFindings.findingCount || 0)}`
  ];
  for (const finding of Array.isArray(shannonFindings.findings) ? shannonFindings.findings : []) {
    lines.push(
      `${cleanText(finding.id, 120)}=${cleanText(finding.partId, 24)}|gap=${cleanText(finding.gapId, 24)}|rev=${cleanText(finding.recommendedRevisionId, 24)}|planes=${normalizeStringArray(finding.planeSymbols || [], 8).join(",")}|waves=${normalizeStringArray(finding.targetWaveIds || [], 18).join(",")}|state=${cleanText(finding.resultState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildOmniLanguageRevisionPacketText(revision = {}) {
  const lines = [
    `@packet ${cleanText(revision.revisionId, 120)}`,
    `generated=${cleanText(revision.generatedAt, 80)}`,
    `label=${cleanText(revision.label, 160)}`,
    `controller=${cleanText(revision.controllerSurfaceId, 120)}/${cleanText(revision.controllerPidVersion, 240)}`,
    `device=${cleanText(revision.deviceSurfaceId, 120)}|map=${cleanText(revision.mapLevelLabel, 40)}|gov=${cleanText(revision.governanceLevelLabel, 40)}/${cleanText(revision.expansionLevelLabel, 40)}`,
    `use=${cleanText(revision.useLaw, 120)}|authority=${cleanText(revision.resultAuthority, 120)}|next=${cleanText(revision.nextPacketId, 120)}`,
    `sfind=${cleanText(revision.shannonPartFindingsId, 120)}|gap=${cleanText(revision.languageGapAnalysisId, 120)}|focus=${normalizeStringArray(revision.focusFindingIds || [], 20).join(",")}`,
    `active=${normalizeStringArray(revision.activeRevisionIds || [], 20).join(",")}|staged=${normalizeStringArray(revision.stagedRevisionIds || [], 20).join(",")}|count=${Number(revision.revisionCount || 0)}`
  ];
  for (const item of Array.isArray(revision.revisions) ? revision.revisions : []) {
    lines.push(
      `${cleanText(item.id, 120)}=${cleanText(item.findingId, 24)}|scope=${cleanText(item.patchScope, 24)}|planes=${normalizeStringArray(item.planeSymbols || [], 8).join(",")}|levels=${normalizeStringArray(item.targetLevelIds || [], 8).join(",")}|state=${cleanText(item.status, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildRevisionDeploymentPacketText(deployment = {}) {
  const lines = [
    `@packet ${cleanText(deployment.deploymentId, 120)}`,
    `generated=${cleanText(deployment.generatedAt, 80)}`,
    `label=${cleanText(deployment.label, 160)}`,
    `controller=${cleanText(deployment.controllerSurfaceId, 120)}/${cleanText(deployment.controllerPidVersion, 240)}`,
    `device=${cleanText(deployment.deviceSurfaceId, 120)}|map=${cleanText(deployment.mapLevelLabel, 40)}|gov=${cleanText(deployment.governanceLevelLabel, 40)}/${cleanText(deployment.expansionLevelLabel, 40)}`,
    `use=${cleanText(deployment.useLaw, 120)}|authority=${cleanText(deployment.resultAuthority, 120)}|next=${cleanText(deployment.nextPacketId, 120)}|cap=${Number(deployment.currentWaveCapacity || 0)}`,
    `rev=${cleanText(deployment.omniLanguageRevisionId, 120)}|sfind=${cleanText(deployment.shannonPartFindingsId, 120)}|active=${normalizeStringArray(deployment.activeDeploymentIds || [], 20).join(",")}|staged=${normalizeStringArray(deployment.stagedDeploymentIds || [], 20).join(",")}|count=${Number(deployment.deploymentCount || 0)}`
  ];
  for (const item of Array.isArray(deployment.deployments) ? deployment.deployments : []) {
    lines.push(
      `${cleanText(item.id, 120)}=${cleanText(item.revisionId, 24)}|class=${normalizeStringArray(item.classSymbols || [], 8).join(",")}|scope=${cleanText(item.patchScope, 24)}|levels=${normalizeStringArray(item.targetLevelIds || [], 8).join(",")}|state=${cleanText(item.deploymentState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildDeploymentFeedbackPacketText(feedback = {}) {
  const lines = [
    `@packet ${cleanText(feedback.feedbackId, 120)}`,
    `generated=${cleanText(feedback.generatedAt, 80)}`,
    `label=${cleanText(feedback.label, 160)}`,
    `controller=${cleanText(feedback.controllerSurfaceId, 120)}/${cleanText(feedback.controllerPidVersion, 240)}`,
    `device=${cleanText(feedback.deviceSurfaceId, 120)}|map=${cleanText(feedback.mapLevelLabel, 40)}|gov=${cleanText(feedback.governanceLevelLabel, 40)}/${cleanText(feedback.expansionLevelLabel, 40)}`,
    `use=${cleanText(feedback.useLaw, 120)}|authority=${cleanText(feedback.resultAuthority, 120)}|next=${cleanText(feedback.nextPacketId, 120)}`,
    `rdep=${cleanText(feedback.revisionDeploymentId, 120)}|rev=${cleanText(feedback.omniLanguageRevisionId, 120)}|sfind=${cleanText(feedback.shannonPartFindingsId, 120)}|active=${normalizeStringArray(feedback.activeDeploymentIds || [], 20).join(",")}|count=${Number(feedback.feedbackCount || 0)}`,
    `fb=${normalizeStringArray(feedback.activeFeedbackIds || [], 20).join(",")}|waves=${normalizeStringArray(feedback.nextWaveIds || [], 20).join(",")}`
  ];
  for (const entry of Array.isArray(feedback.feedbackEntries) ? feedback.feedbackEntries : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.deploymentId, 24)}|gap=${cleanText(entry.gapId, 24)}|over=${cleanText(entry.overWaveId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 18).join(",")}|state=${cleanText(entry.feedbackState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackWaveCyclePacketText(cycle = {}) {
  const lines = [
    `@packet ${cleanText(cycle.cycleId, 120)}`,
    `generated=${cleanText(cycle.generatedAt, 80)}`,
    `label=${cleanText(cycle.label, 160)}`,
    `controller=${cleanText(cycle.controllerSurfaceId, 120)}/${cleanText(cycle.controllerPidVersion, 240)}`,
    `device=${cleanText(cycle.deviceSurfaceId, 120)}|map=${cleanText(cycle.mapLevelLabel, 40)}|gov=${cleanText(cycle.governanceLevelLabel, 40)}/${cleanText(cycle.expansionLevelLabel, 40)}`,
    `use=${cleanText(cycle.useLaw, 120)}|authority=${cleanText(cycle.resultAuthority, 120)}|next=${cleanText(cycle.nextPacketId, 120)}`,
    `dfb=${cleanText(cycle.deploymentFeedbackId, 120)}|active_fb=${normalizeStringArray(cycle.activeFeedbackIds || [], 20).join(",")}|count=${Number(cycle.cycleCount || 0)}|rpay=${cleanText(cycle.returnPayloadId, 120)}|return=${normalizeStringArray(cycle.returnPayloadWaveIds || [], 20).join(",")}|deltas=${normalizeStringArray(cycle.returnPayloadDeltaIds || [], 20).length}`,
    `active_waves=${normalizeStringArray(cycle.activeWaveIds || [], 20).join(",")}|staged_waves=${normalizeStringArray(cycle.stagedWaveIds || [], 20).join(",")}|rstate=${cleanText(cycle.returnPayloadAuthority, 120)}`
  ];
  for (const entry of Array.isArray(cycle.cycleEntries) ? cycle.cycleEntries : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.feedbackId, 24)}|gap=${cleanText(entry.gapId, 24)}|over=${cleanText(entry.overWaveId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|active=${normalizeStringArray(entry.activeTargetWaveIds || [], 16).join(",")}|state=${cleanText(entry.cycleState, 80)}`
    );
  }
  for (const entry of Array.isArray(cycle.returnPayloadEntries) ? cycle.returnPayloadEntries : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.waveId, 24)}|delta=${normalizeStringArray(entry.deltaIds || [], 12).join(",")}|count=${Number(entry.deltaCount || 0)}|state=${cleanText(entry.payloadState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnMintPacketText(returnMint = {}) {
  const lines = [
    `@packet ${cleanText(returnMint.mintId, 120)}`,
    `generated=${cleanText(returnMint.generatedAt, 80)}`,
    `label=${cleanText(returnMint.label, 160)}`,
    `controller=${cleanText(returnMint.controllerSurfaceId, 120)}/${cleanText(returnMint.controllerPidVersion, 240)}`,
    `device=${cleanText(returnMint.deviceSurfaceId, 120)}|map=${cleanText(returnMint.mapLevelLabel, 40)}|gov=${cleanText(returnMint.governanceLevelLabel, 40)}/${cleanText(returnMint.expansionLevelLabel, 40)}`,
    `use=${cleanText(returnMint.useLaw, 120)}|authority=${cleanText(returnMint.resultAuthority, 120)}|next=${cleanText(returnMint.nextPacketId, 120)}`,
    `fcy=${cleanText(returnMint.feedbackWaveCycleId, 120)}|rpay=${cleanText(returnMint.feedbackReturnPayloadId, 120)}|ddel=${cleanText(returnMint.deepArchiveDeltaId, 120)}|gap=${cleanText(returnMint.languageGapAnalysisId, 120)}|rev=${cleanText(returnMint.omniLanguageRevisionId, 120)}`,
    `return=${normalizeStringArray(returnMint.activeReturnWaveIds || [], 20).join(",")}|deltas=${normalizeStringArray(returnMint.activeDeltaIds || [], 20).join(",")}|active=${normalizeStringArray(returnMint.activeMintIds || [], 20).join(",")}|staged=${normalizeStringArray(returnMint.stagedMintIds || [], 20).join(",")}|count=${Number(returnMint.mintCount || 0)}`
  ];
  for (const entry of Array.isArray(returnMint.mints) ? returnMint.mints : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.returnWaveId, 24)}|delta=${cleanText(entry.deltaId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|planes=${normalizeStringArray(entry.planeSymbols || [], 8).join(",")}|state=${cleanText(entry.mintState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnRedeployPacketText(returnRedeploy = {}) {
  const lines = [
    `@packet ${cleanText(returnRedeploy.redeployId, 120)}`,
    `generated=${cleanText(returnRedeploy.generatedAt, 80)}`,
    `label=${cleanText(returnRedeploy.label, 160)}`,
    `controller=${cleanText(returnRedeploy.controllerSurfaceId, 120)}/${cleanText(returnRedeploy.controllerPidVersion, 240)}`,
    `device=${cleanText(returnRedeploy.deviceSurfaceId, 120)}|map=${cleanText(returnRedeploy.mapLevelLabel, 40)}|gov=${cleanText(returnRedeploy.governanceLevelLabel, 40)}/${cleanText(returnRedeploy.expansionLevelLabel, 40)}`,
    `use=${cleanText(returnRedeploy.useLaw, 120)}|authority=${cleanText(returnRedeploy.resultAuthority, 120)}|next=${cleanText(returnRedeploy.nextPacketId, 120)}|cap=${Number(returnRedeploy.currentWaveCapacity || 0)}`,
    `frm=${cleanText(returnRedeploy.feedbackReturnMintId, 120)}|active_mint=${normalizeStringArray(returnRedeploy.activeMintIds || [], 20).join(",")}|staged_mint=${normalizeStringArray(returnRedeploy.stagedMintIds || [], 20).join(",")}|active=${normalizeStringArray(returnRedeploy.activeRedeployIds || [], 20).join(",")}|staged=${normalizeStringArray(returnRedeploy.stagedRedeployIds || [], 20).join(",")}|count=${Number(returnRedeploy.redeployCount || 0)}`
  ];
  for (const entry of Array.isArray(returnRedeploy.redeploys) ? returnRedeploy.redeploys : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.returnWaveId, 24)}|mint=${cleanText(entry.mintId, 24)}|delta=${cleanText(entry.deltaId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|target=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.redeployState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnFindingsPacketText(returnFindings = {}) {
  const lines = [
    `@packet ${cleanText(returnFindings.findingsId, 120)}`,
    `generated=${cleanText(returnFindings.generatedAt, 80)}`,
    `label=${cleanText(returnFindings.label, 160)}`,
    `controller=${cleanText(returnFindings.controllerSurfaceId, 120)}/${cleanText(returnFindings.controllerPidVersion, 240)}`,
    `device=${cleanText(returnFindings.deviceSurfaceId, 120)}|map=${cleanText(returnFindings.mapLevelLabel, 40)}|gov=${cleanText(returnFindings.governanceLevelLabel, 40)}/${cleanText(returnFindings.expansionLevelLabel, 40)}`,
    `use=${cleanText(returnFindings.useLaw, 120)}|authority=${cleanText(returnFindings.resultAuthority, 120)}|next=${cleanText(returnFindings.nextPacketId, 120)}`,
    `frd=${cleanText(returnFindings.feedbackReturnRedeployId, 120)}|active_rd=${normalizeStringArray(returnFindings.activeRedeployIds || [], 20).join(",")}|staged_rd=${normalizeStringArray(returnFindings.stagedRedeployIds || [], 20).join(",")}|active=${normalizeStringArray(returnFindings.activeFindingIds || [], 20).join(",")}|staged=${normalizeStringArray(returnFindings.stagedFindingIds || [], 20).join(",")}|count=${Number(returnFindings.findingCount || 0)}`
  ];
  for (const entry of Array.isArray(returnFindings.findings) ? returnFindings.findings : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.redeployId, 24)}|mint=${cleanText(entry.mintId, 24)}|delta=${cleanText(entry.deltaId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.findingState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPressurePacketText(returnPressure = {}) {
  const lines = [
    `@packet ${cleanText(returnPressure.pressureId, 120)}`,
    `generated=${cleanText(returnPressure.generatedAt, 80)}`,
    `label=${cleanText(returnPressure.label, 160)}`,
    `controller=${cleanText(returnPressure.controllerSurfaceId, 120)}/${cleanText(returnPressure.controllerPidVersion, 240)}`,
    `device=${cleanText(returnPressure.deviceSurfaceId, 120)}|map=${cleanText(returnPressure.mapLevelLabel, 40)}|gov=${cleanText(returnPressure.governanceLevelLabel, 40)}/${cleanText(returnPressure.expansionLevelLabel, 40)}`,
    `use=${cleanText(returnPressure.useLaw, 120)}|authority=${cleanText(returnPressure.resultAuthority, 120)}|next=${cleanText(returnPressure.nextPacketId, 120)}`,
    `frf=${cleanText(returnPressure.feedbackReturnFindingsId, 120)}|active_find=${normalizeStringArray(returnPressure.activeFindingIds || [], 20).join(",")}|staged_find=${normalizeStringArray(returnPressure.stagedFindingIds || [], 20).join(",")}|active=${normalizeStringArray(returnPressure.activePressureIds || [], 20).join(",")}|staged=${normalizeStringArray(returnPressure.stagedPressureIds || [], 20).join(",")}|count=${Number(returnPressure.pressureCount || 0)}`
  ];
  for (const entry of Array.isArray(returnPressure.pressures) ? returnPressure.pressures : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.findingId, 24)}|redeploy=${cleanText(entry.redeployId, 24)}|delta=${cleanText(entry.deltaId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.pressureState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPressureCyclePacketText(pressureCycle = {}) {
  const lines = [
    `@packet ${cleanText(pressureCycle.cycleId, 120)}`,
    `generated=${cleanText(pressureCycle.generatedAt, 80)}`,
    `label=${cleanText(pressureCycle.label, 160)}`,
    `controller=${cleanText(pressureCycle.controllerSurfaceId, 120)}/${cleanText(pressureCycle.controllerPidVersion, 240)}`,
    `device=${cleanText(pressureCycle.deviceSurfaceId, 120)}|map=${cleanText(pressureCycle.mapLevelLabel, 40)}|gov=${cleanText(pressureCycle.governanceLevelLabel, 40)}/${cleanText(pressureCycle.expansionLevelLabel, 40)}`,
    `use=${cleanText(pressureCycle.useLaw, 120)}|authority=${cleanText(pressureCycle.resultAuthority, 120)}|next=${cleanText(pressureCycle.nextPacketId, 120)}`,
    `frp=${cleanText(pressureCycle.feedbackReturnPressureId, 120)}|active_press=${normalizeStringArray(pressureCycle.activePressureIds || [], 20).join(",")}|staged_press=${normalizeStringArray(pressureCycle.stagedPressureIds || [], 20).join(",")}|active=${normalizeStringArray(pressureCycle.activeCycleIds || [], 20).join(",")}|staged=${normalizeStringArray(pressureCycle.stagedCycleIds || [], 20).join(",")}|gaps=${normalizeStringArray(pressureCycle.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(pressureCycle.activeRevisionIds || [], 20).join(",")}|count=${Number(pressureCycle.cycleCount || 0)}`
  ];
  for (const entry of Array.isArray(pressureCycle.cycles) ? pressureCycle.cycles : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.pressureId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.cycleState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPressurePatchPacketText(pressurePatch = {}) {
  const lines = [
    `@packet ${cleanText(pressurePatch.patchId, 120)}`,
    `generated=${cleanText(pressurePatch.generatedAt, 80)}`,
    `label=${cleanText(pressurePatch.label, 160)}`,
    `controller=${cleanText(pressurePatch.controllerSurfaceId, 120)}/${cleanText(pressurePatch.controllerPidVersion, 240)}`,
    `device=${cleanText(pressurePatch.deviceSurfaceId, 120)}|map=${cleanText(pressurePatch.mapLevelLabel, 40)}|gov=${cleanText(pressurePatch.governanceLevelLabel, 40)}/${cleanText(pressurePatch.expansionLevelLabel, 40)}`,
    `use=${cleanText(pressurePatch.useLaw, 120)}|authority=${cleanText(pressurePatch.resultAuthority, 120)}|next=${cleanText(pressurePatch.nextPacketId, 120)}`,
    `frpc=${cleanText(pressurePatch.feedbackReturnPressureCycleId, 120)}|active_cycle=${normalizeStringArray(pressurePatch.activeCycleIds || [], 20).join(",")}|staged_cycle=${normalizeStringArray(pressurePatch.stagedCycleIds || [], 20).join(",")}|active=${normalizeStringArray(pressurePatch.activePatchIds || [], 20).join(",")}|staged=${normalizeStringArray(pressurePatch.stagedPatchIds || [], 20).join(",")}|gaps=${normalizeStringArray(pressurePatch.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(pressurePatch.activeRevisionIds || [], 20).join(",")}|count=${Number(pressurePatch.patchCount || 0)}`
  ];
  for (const entry of Array.isArray(pressurePatch.patches) ? pressurePatch.patches : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.cycleId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.patchState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPacketText(patchApply = {}) {
  const lines = [
    `@packet ${cleanText(patchApply.applyId, 120)}`,
    `generated=${cleanText(patchApply.generatedAt, 80)}`,
    `label=${cleanText(patchApply.label, 160)}`,
    `controller=${cleanText(patchApply.controllerSurfaceId, 120)}/${cleanText(patchApply.controllerPidVersion, 240)}`,
    `device=${cleanText(patchApply.deviceSurfaceId, 120)}|map=${cleanText(patchApply.mapLevelLabel, 40)}|gov=${cleanText(patchApply.governanceLevelLabel, 40)}/${cleanText(patchApply.expansionLevelLabel, 40)}`,
    `use=${cleanText(patchApply.useLaw, 120)}|authority=${cleanText(patchApply.resultAuthority, 120)}|next=${cleanText(patchApply.nextPacketId, 120)}|cap=${Number(patchApply.currentWaveCapacity || 0)}`,
    `frpp=${cleanText(patchApply.feedbackReturnPressurePatchId, 120)}|active_patch=${normalizeStringArray(patchApply.activePatchIds || [], 20).join(",")}|staged_patch=${normalizeStringArray(patchApply.stagedPatchIds || [], 20).join(",")}|active=${normalizeStringArray(patchApply.activeApplyIds || [], 20).join(",")}|staged=${normalizeStringArray(patchApply.stagedApplyIds || [], 20).join(",")}|gaps=${normalizeStringArray(patchApply.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(patchApply.activeRevisionIds || [], 20).join(",")}|count=${Number(patchApply.applyCount || 0)}`
  ];
  for (const entry of Array.isArray(patchApply.applies) ? patchApply.applies : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.applyState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyFindingsPacketText(applyFindings = {}) {
  const lines = [
    `@packet ${cleanText(applyFindings.findingsId, 120)}`,
    `generated=${cleanText(applyFindings.generatedAt, 80)}`,
    `label=${cleanText(applyFindings.label, 160)}`,
    `controller=${cleanText(applyFindings.controllerSurfaceId, 120)}/${cleanText(applyFindings.controllerPidVersion, 240)}`,
    `device=${cleanText(applyFindings.deviceSurfaceId, 120)}|map=${cleanText(applyFindings.mapLevelLabel, 40)}|gov=${cleanText(applyFindings.governanceLevelLabel, 40)}/${cleanText(applyFindings.expansionLevelLabel, 40)}`,
    `use=${cleanText(applyFindings.useLaw, 120)}|authority=${cleanText(applyFindings.resultAuthority, 120)}|next=${cleanText(applyFindings.nextPacketId, 120)}`,
    `frpa=${cleanText(applyFindings.feedbackReturnPatchApplyId, 120)}|active_apply=${normalizeStringArray(applyFindings.activeApplyIds || [], 20).join(",")}|staged_apply=${normalizeStringArray(applyFindings.stagedApplyIds || [], 20).join(",")}|active=${normalizeStringArray(applyFindings.activeFindingIds || [], 20).join(",")}|staged=${normalizeStringArray(applyFindings.stagedFindingIds || [], 20).join(",")}|gaps=${normalizeStringArray(applyFindings.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(applyFindings.activeRevisionIds || [], 20).join(",")}|count=${Number(applyFindings.findingCount || 0)}`
  ];
  for (const entry of Array.isArray(applyFindings.findings) ? applyFindings.findings : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.applyId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.findingState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePacketText(applyPressure = {}) {
  const lines = [
    `@packet ${cleanText(applyPressure.pressureId, 120)}`,
    `generated=${cleanText(applyPressure.generatedAt, 80)}`,
    `label=${cleanText(applyPressure.label, 160)}`,
    `controller=${cleanText(applyPressure.controllerSurfaceId, 120)}/${cleanText(applyPressure.controllerPidVersion, 240)}`,
    `device=${cleanText(applyPressure.deviceSurfaceId, 120)}|map=${cleanText(applyPressure.mapLevelLabel, 40)}|gov=${cleanText(applyPressure.governanceLevelLabel, 40)}/${cleanText(applyPressure.expansionLevelLabel, 40)}`,
    `use=${cleanText(applyPressure.useLaw, 120)}|authority=${cleanText(applyPressure.resultAuthority, 120)}|next=${cleanText(applyPressure.nextPacketId, 120)}`,
    `frpaf=${cleanText(applyPressure.feedbackReturnPatchApplyFindingsId, 120)}|active_find=${normalizeStringArray(applyPressure.activeFindingIds || [], 20).join(",")}|staged_find=${normalizeStringArray(applyPressure.stagedFindingIds || [], 20).join(",")}|active=${normalizeStringArray(applyPressure.activePressureIds || [], 20).join(",")}|staged=${normalizeStringArray(applyPressure.stagedPressureIds || [], 20).join(",")}|gaps=${normalizeStringArray(applyPressure.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(applyPressure.activeRevisionIds || [], 20).join(",")}|count=${Number(applyPressure.pressureCount || 0)}`
  ];
  for (const entry of Array.isArray(applyPressure.pressures) ? applyPressure.pressures : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyFindingId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.pressureState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressureCyclePacketText(pressureCycle = {}) {
  const lines = [
    `@packet ${cleanText(pressureCycle.cycleId, 120)}`,
    `generated=${cleanText(pressureCycle.generatedAt, 80)}`,
    `label=${cleanText(pressureCycle.label, 160)}`,
    `controller=${cleanText(pressureCycle.controllerSurfaceId, 120)}/${cleanText(pressureCycle.controllerPidVersion, 240)}`,
    `device=${cleanText(pressureCycle.deviceSurfaceId, 120)}|map=${cleanText(pressureCycle.mapLevelLabel, 40)}|gov=${cleanText(pressureCycle.governanceLevelLabel, 40)}/${cleanText(pressureCycle.expansionLevelLabel, 40)}`,
    `use=${cleanText(pressureCycle.useLaw, 120)}|authority=${cleanText(pressureCycle.resultAuthority, 120)}|next=${cleanText(pressureCycle.nextPacketId, 120)}`,
    `frpap=${cleanText(pressureCycle.feedbackReturnPatchApplyPressureId, 120)}|active_press=${normalizeStringArray(pressureCycle.activePressureIds || [], 20).join(",")}|staged_press=${normalizeStringArray(pressureCycle.stagedPressureIds || [], 20).join(",")}|active=${normalizeStringArray(pressureCycle.activeCycleIds || [], 20).join(",")}|staged=${normalizeStringArray(pressureCycle.stagedCycleIds || [], 20).join(",")}|gaps=${normalizeStringArray(pressureCycle.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(pressureCycle.activeRevisionIds || [], 20).join(",")}|count=${Number(pressureCycle.cycleCount || 0)}`
  ];
  for (const entry of Array.isArray(pressureCycle.cycles) ? pressureCycle.cycles : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.pressureId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.cycleState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchPacketText(pressurePatch = {}) {
  const lines = [
    `@packet ${cleanText(pressurePatch.patchId, 120)}`,
    `generated=${cleanText(pressurePatch.generatedAt, 80)}`,
    `label=${cleanText(pressurePatch.label, 160)}`,
    `controller=${cleanText(pressurePatch.controllerSurfaceId, 120)}/${cleanText(pressurePatch.controllerPidVersion, 240)}`,
    `device=${cleanText(pressurePatch.deviceSurfaceId, 120)}|map=${cleanText(pressurePatch.mapLevelLabel, 40)}|gov=${cleanText(pressurePatch.governanceLevelLabel, 40)}/${cleanText(pressurePatch.expansionLevelLabel, 40)}`,
    `use=${cleanText(pressurePatch.useLaw, 120)}|authority=${cleanText(pressurePatch.resultAuthority, 120)}|next=${cleanText(pressurePatch.nextPacketId, 120)}`,
    `frpapc=${cleanText(pressurePatch.feedbackReturnPatchApplyPressureCycleId, 120)}|active_cycle=${normalizeStringArray(pressurePatch.activeCycleIds || [], 20).join(",")}|staged_cycle=${normalizeStringArray(pressurePatch.stagedCycleIds || [], 20).join(",")}|active=${normalizeStringArray(pressurePatch.activePatchIds || [], 20).join(",")}|staged=${normalizeStringArray(pressurePatch.stagedPatchIds || [], 20).join(",")}|gaps=${normalizeStringArray(pressurePatch.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(pressurePatch.activeRevisionIds || [], 20).join(",")}|count=${Number(pressurePatch.patchCount || 0)}`
  ];
  for (const entry of Array.isArray(pressurePatch.patches) ? pressurePatch.patches : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.cycleId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.patchState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPacketText(patchApply = {}) {
  const lines = [
    `@packet ${cleanText(patchApply.applyId, 120)}`,
    `generated=${cleanText(patchApply.generatedAt, 80)}`,
    `label=${cleanText(patchApply.label, 160)}`,
    `controller=${cleanText(patchApply.controllerSurfaceId, 120)}/${cleanText(patchApply.controllerPidVersion, 240)}`,
    `device=${cleanText(patchApply.deviceSurfaceId, 120)}|map=${cleanText(patchApply.mapLevelLabel, 40)}|gov=${cleanText(patchApply.governanceLevelLabel, 40)}/${cleanText(patchApply.expansionLevelLabel, 40)}`,
    `use=${cleanText(patchApply.useLaw, 120)}|authority=${cleanText(patchApply.resultAuthority, 120)}|next=${cleanText(patchApply.nextPacketId, 120)}`,
    `frpapp=${cleanText(patchApply.feedbackReturnPatchApplyPressurePatchId, 120)}|active_patch=${normalizeStringArray(patchApply.activePatchIds || [], 20).join(",")}|staged_patch=${normalizeStringArray(patchApply.stagedPatchIds || [], 20).join(",")}|active=${normalizeStringArray(patchApply.activeApplyIds || [], 20).join(",")}|staged=${normalizeStringArray(patchApply.stagedApplyIds || [], 20).join(",")}|gaps=${normalizeStringArray(patchApply.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(patchApply.activeRevisionIds || [], 20).join(",")}|count=${Number(patchApply.applyCount || 0)}`
  ];
  for (const entry of Array.isArray(patchApply.applies) ? patchApply.applies : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.applyState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyFindingsPacketText(patchApplyFindings = {}) {
  const lines = [
    `@packet ${cleanText(patchApplyFindings.findingsId, 120)}`,
    `generated=${cleanText(patchApplyFindings.generatedAt, 80)}`,
    `label=${cleanText(patchApplyFindings.label, 160)}`,
    `controller=${cleanText(patchApplyFindings.controllerSurfaceId, 120)}/${cleanText(patchApplyFindings.controllerPidVersion, 240)}`,
    `device=${cleanText(patchApplyFindings.deviceSurfaceId, 120)}|map=${cleanText(patchApplyFindings.mapLevelLabel, 40)}|gov=${cleanText(patchApplyFindings.governanceLevelLabel, 40)}/${cleanText(patchApplyFindings.expansionLevelLabel, 40)}`,
    `use=${cleanText(patchApplyFindings.useLaw, 120)}|authority=${cleanText(patchApplyFindings.resultAuthority, 120)}|next=${cleanText(patchApplyFindings.nextPacketId, 120)}`,
    `frpappa=${cleanText(patchApplyFindings.feedbackReturnPatchApplyPressurePatchApplyId, 120)}|active_apply=${normalizeStringArray(patchApplyFindings.activeApplyIds || [], 20).join(",")}|staged_apply=${normalizeStringArray(patchApplyFindings.stagedApplyIds || [], 20).join(",")}|active=${normalizeStringArray(patchApplyFindings.activeFindingIds || [], 20).join(",")}|staged=${normalizeStringArray(patchApplyFindings.stagedFindingIds || [], 20).join(",")}|gaps=${normalizeStringArray(patchApplyFindings.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(patchApplyFindings.activeRevisionIds || [], 20).join(",")}|count=${Number(patchApplyFindings.findingCount || 0)}`
  ];
  for (const entry of Array.isArray(patchApplyFindings.findings) ? patchApplyFindings.findings : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchApplyId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.findingState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePacketText(applyPressure = {}) {
  const lines = [
    `@packet ${cleanText(applyPressure.pressureId, 120)}`,
    `generated=${cleanText(applyPressure.generatedAt, 80)}`,
    `label=${cleanText(applyPressure.label, 160)}`,
    `controller=${cleanText(applyPressure.controllerSurfaceId, 120)}/${cleanText(applyPressure.controllerPidVersion, 240)}`,
    `device=${cleanText(applyPressure.deviceSurfaceId, 120)}|map=${cleanText(applyPressure.mapLevelLabel, 40)}|gov=${cleanText(applyPressure.governanceLevelLabel, 40)}/${cleanText(applyPressure.expansionLevelLabel, 40)}`,
    `use=${cleanText(applyPressure.useLaw, 120)}|authority=${cleanText(applyPressure.resultAuthority, 120)}|next=${cleanText(applyPressure.nextPacketId, 120)}`,
    `frpappaf=${cleanText(applyPressure.feedbackReturnPatchApplyPressurePatchApplyFindingsId, 120)}|active_find=${normalizeStringArray(applyPressure.activeFindingIds || [], 20).join(",")}|staged_find=${normalizeStringArray(applyPressure.stagedFindingIds || [], 20).join(",")}|active=${normalizeStringArray(applyPressure.activePressureIds || [], 20).join(",")}|staged=${normalizeStringArray(applyPressure.stagedPressureIds || [], 20).join(",")}|gaps=${normalizeStringArray(applyPressure.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(applyPressure.activeRevisionIds || [], 20).join(",")}|count=${Number(applyPressure.pressureCount || 0)}`
  ];
  for (const entry of Array.isArray(applyPressure.pressures) ? applyPressure.pressures : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchApplyFindingId, 24)}|gap=${cleanText(entry.gapId, 24)}|rev=${cleanText(entry.revisionId, 24)}|class=${normalizeStringArray(entry.classSymbols || [], 8).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.pressureState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketText(pressureCycle = {}) {
  const lines = [
    `@packet ${cleanText(pressureCycle.cycleId, 120)}`,
    `generated=${cleanText(pressureCycle.generatedAt, 80)}`,
    `label=${cleanText(pressureCycle.label, 160)}`,
    `controller=${cleanText(pressureCycle.controllerSurfaceId, 120)}/${cleanText(pressureCycle.controllerPidVersion, 240)}`,
    `device=${cleanText(pressureCycle.deviceSurfaceId, 120)}|map=${cleanText(pressureCycle.mapLevelLabel, 40)}|gov=${cleanText(pressureCycle.governanceLevelLabel, 40)}/${cleanText(pressureCycle.expansionLevelLabel, 40)}`,
    `use=${cleanText(pressureCycle.useLaw, 160)}|authority=${cleanText(pressureCycle.resultAuthority, 160)}|next=${cleanText(pressureCycle.nextPacketId, 120)}`,
    `frpappap=${cleanText(pressureCycle.feedbackReturnPatchApplyPressurePatchApplyPressureId, 120)}|active_press=${normalizeStringArray(pressureCycle.activePressureIds || [], 20).join(",")}|staged_press=${normalizeStringArray(pressureCycle.stagedPressureIds || [], 20).join(",")}|active_cycle=${normalizeStringArray(pressureCycle.activeCycleIds || [], 20).join(",")}|staged_cycle=${normalizeStringArray(pressureCycle.stagedCycleIds || [], 20).join(",")}|gaps=${normalizeStringArray(pressureCycle.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(pressureCycle.activeRevisionIds || [], 20).join(",")}|count=${Number(pressureCycle.cycleCount || 0)}`
  ];
  for (const entry of Array.isArray(pressureCycle.cycles) ? pressureCycle.cycles : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchApplyPressureId, 120)}|gap=${cleanText(entry.gapId, 120)}|rev=${cleanText(entry.revisionId, 120)}|class=${normalizeStringArray(entry.classSymbols || [], 12).join(",")}|waves=${normalizeStringArray(entry.targetWaveIds || [], 16).join(",")}|state=${cleanText(entry.cycleState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketText(pressurePatch = {}) {
  const lines = [
    `@packet ${cleanText(pressurePatch.patchId, 120)}`,
    `generated=${cleanText(pressurePatch.generatedAt, 80)}`,
    `label=${cleanText(pressurePatch.label, 160)}`,
    `controller=${cleanText(pressurePatch.controllerSurfaceId, 120)}/${cleanText(pressurePatch.controllerPidVersion, 240)}`,
    `device=${cleanText(pressurePatch.deviceSurfaceId, 120)}|map=${cleanText(pressurePatch.mapLevelLabel, 40)}|gov=${cleanText(pressurePatch.governanceLevelLabel, 40)}/${cleanText(pressurePatch.expansionLevelLabel, 40)}`,
    `use=${cleanText(pressurePatch.useLaw, 160)}|authority=${cleanText(pressurePatch.resultAuthority, 160)}|next=${cleanText(pressurePatch.nextPacketId, 120)}`,
    `frpappapc=${cleanText(pressurePatch.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId, 120)}|active_cycle=${normalizeStringArray(pressurePatch.activeCycleIds || [], 20).join(",")}|staged_cycle=${normalizeStringArray(pressurePatch.stagedCycleIds || [], 20).join(",")}|active_patch=${normalizeStringArray(pressurePatch.activePatchIds || [], 20).join(",")}|staged_patch=${normalizeStringArray(pressurePatch.stagedPatchIds || [], 20).join(",")}|gaps=${normalizeStringArray(pressurePatch.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(pressurePatch.activeRevisionIds || [], 20).join(",")}|count=${Number(pressurePatch.patchCount || 0)}`
  ];
  for (const entry of Array.isArray(pressurePatch.patches) ? pressurePatch.patches : []) {
    lines.push(`${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchApplyPressureCycleId, 120)}|gap=${cleanText(entry.gapId, 120)}|rev=${cleanText(entry.revisionId, 120)}|class=${normalizeStringArray(entry.classSymbols || [], 20).join(",") || "none"}|waves=${normalizeStringArray(entry.targetWaveIds || [], 20).join(",") || "none"}|state=${cleanText(entry.patchState, 120)}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketText(patchApply = {}) {
  const lines = [
    `@packet ${cleanText(patchApply.applyId, 120)}`,
    `generated=${cleanText(patchApply.generatedAt, 80)}`,
    `label=${cleanText(patchApply.label, 160)}`,
    `controller=${cleanText(patchApply.controllerSurfaceId, 120)}/${cleanText(patchApply.controllerPidVersion, 240)}`,
    `device=${cleanText(patchApply.deviceSurfaceId, 120)}|map=${cleanText(patchApply.mapLevelLabel, 40)}|gov=${cleanText(patchApply.governanceLevelLabel, 40)}/${cleanText(patchApply.expansionLevelLabel, 40)}`,
    `use=${cleanText(patchApply.useLaw, 120)}|authority=${cleanText(patchApply.resultAuthority, 120)}|next=${cleanText(patchApply.nextPacketId, 120)}`,
    `frpappapp=${cleanText(patchApply.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId, 120)}|active_patch=${normalizeStringArray(patchApply.activePatchIds || [], 20).join(",")}|staged_patch=${normalizeStringArray(patchApply.stagedPatchIds || [], 20).join(",")}|active=${normalizeStringArray(patchApply.activeApplyIds || [], 20).join(",")}|staged=${normalizeStringArray(patchApply.stagedApplyIds || [], 20).join(",")}|gaps=${normalizeStringArray(patchApply.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(patchApply.activeRevisionIds || [], 20).join(",")}|count=${Number(patchApply.applyCount || 0)}`
  ];
  for (const entry of Array.isArray(patchApply.applies) ? patchApply.applies : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchApplyPressurePatchId, 120)}|gap=${cleanText(entry.gapId, 120)}|rev=${cleanText(entry.revisionId, 120)}|class=${normalizeStringArray(entry.classSymbols || [], 20).join(",") || "none"}|waves=${normalizeStringArray(entry.targetWaveIds || [], 20).join(",") || "none"}|state=${cleanText(entry.applyState, 120)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketText(findingsWindow = {}) {
  const lines = [
    `@packet ${cleanText(findingsWindow.findingsId, 120)}`,
    `generated=${cleanText(findingsWindow.generatedAt, 80)}`,
    `label=${cleanText(findingsWindow.label, 160)}`,
    `controller=${cleanText(findingsWindow.controllerSurfaceId, 120)}/${cleanText(findingsWindow.controllerPidVersion, 240)}`,
    `device=${cleanText(findingsWindow.deviceSurfaceId, 120)}|map=${cleanText(findingsWindow.mapLevelLabel, 40)}|gov=${cleanText(findingsWindow.governanceLevelLabel, 40)}/${cleanText(findingsWindow.expansionLevelLabel, 40)}`,
    `use=${cleanText(findingsWindow.useLaw, 120)}|authority=${cleanText(findingsWindow.resultAuthority, 120)}|next=${cleanText(findingsWindow.nextPacketId, 120)}`,
    `frpappappa=${cleanText(findingsWindow.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId, 120)}|active_apply=${normalizeStringArray(findingsWindow.activeApplyIds || [], 20).join(",")}|staged_apply=${normalizeStringArray(findingsWindow.stagedApplyIds || [], 20).join(",")}|active_find=${normalizeStringArray(findingsWindow.activeFindingIds || [], 20).join(",")}|staged_find=${normalizeStringArray(findingsWindow.stagedFindingIds || [], 20).join(",")}|gaps=${normalizeStringArray(findingsWindow.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(findingsWindow.activeRevisionIds || [], 20).join(",")}|count=${Number(findingsWindow.findingCount || 0)}`
  ];
  for (const entry of Array.isArray(findingsWindow.findings) ? findingsWindow.findings : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchApplyPressurePatchApplyId, 120)}|gap=${cleanText(entry.gapId, 120)}|rev=${cleanText(entry.revisionId, 120)}|class=${normalizeStringArray(entry.classSymbols || [], 20).join(",") || "none"}|waves=${normalizeStringArray(entry.targetWaveIds || [], 20).join(",") || "none"}|state=${cleanText(entry.findingState, 120)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketText(pressureWindow = {}) {
  const lines = [
    `@packet ${cleanText(pressureWindow.pressureId, 120)}`,
    `generated=${cleanText(pressureWindow.generatedAt, 80)}`,
    `label=${cleanText(pressureWindow.label, 160)}`,
    `controller=${cleanText(pressureWindow.controllerSurfaceId, 120)}/${cleanText(pressureWindow.controllerPidVersion, 240)}`,
    `device=${cleanText(pressureWindow.deviceSurfaceId, 120)}|map=${cleanText(pressureWindow.mapLevelLabel, 40)}|gov=${cleanText(pressureWindow.governanceLevelLabel, 40)}/${cleanText(pressureWindow.expansionLevelLabel, 40)}`,
    `use=${cleanText(pressureWindow.useLaw, 120)}|authority=${cleanText(pressureWindow.resultAuthority, 120)}|next=${cleanText(pressureWindow.nextPacketId, 120)}`,
    `frpappappaf=${cleanText(pressureWindow.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId, 120)}|active_find=${normalizeStringArray(pressureWindow.activeFindingIds || [], 20).join(",")}|staged_find=${normalizeStringArray(pressureWindow.stagedFindingIds || [], 20).join(",")}|active_press=${normalizeStringArray(pressureWindow.activePressureIds || [], 20).join(",")}|staged_press=${normalizeStringArray(pressureWindow.stagedPressureIds || [], 20).join(",")}|gaps=${normalizeStringArray(pressureWindow.activeGapIds || [], 20).join(",")}|revs=${normalizeStringArray(pressureWindow.activeRevisionIds || [], 20).join(",")}|count=${Number(pressureWindow.pressureCount || 0)}`
  ];
  for (const entry of Array.isArray(pressureWindow.pressures) ? pressureWindow.pressures : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.patchApplyPressurePatchApplyPressurePatchApplyFindingId, 120)}|gap=${cleanText(entry.gapId, 120)}|rev=${cleanText(entry.revisionId, 120)}|class=${normalizeStringArray(entry.classSymbols || [], 20).join(",") || "none"}|waves=${normalizeStringArray(entry.targetWaveIds || [], 20).join(",") || "none"}|state=${cleanText(entry.pressureState, 120)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildDeepArchiveDeltaPacketText(delta = {}) {
  const lines = [
    `@packet ${cleanText(delta.deltaId, 120)}`,
    `generated=${cleanText(delta.generatedAt, 80)}`,
    `label=${cleanText(delta.label, 160)}`,
    `controller=${cleanText(delta.controllerSurfaceId, 120)}/${cleanText(delta.controllerPidVersion, 240)}`,
    `device=${cleanText(delta.deviceSurfaceId, 120)}|map=${cleanText(delta.mapLevelLabel, 40)}|gov=${cleanText(delta.governanceLevelLabel, 40)}/${cleanText(delta.expansionLevelLabel, 40)}`,
    `use=${cleanText(delta.useLaw, 120)}|authority=${cleanText(delta.resultAuthority, 120)}|next=${cleanText(delta.nextPacketId, 120)}`,
    `find=${cleanText(delta.deepArchiveFindingsId, 120)}|fcy=${cleanText(delta.feedbackWaveCycleId, 120)}|active=${normalizeStringArray(delta.activeWaveIds || [], 20).join(",")}|count=${Number(delta.deltaCount || 0)}`,
    `ddel=${normalizeStringArray(delta.activeDeltaIds || [], 20).join(",")}|staged=${normalizeStringArray(delta.stagedDeltaIds || [], 20).join(",")}`
  ];
  for (const entry of Array.isArray(delta.deltas) ? delta.deltas : []) {
    lines.push(
      `${cleanText(entry.id, 120)}=${cleanText(entry.findingId, 24)}|sector=${cleanText(entry.sectorId, 24)}|risk=${cleanText(entry.risk, 24)}|planes=${normalizeStringArray(entry.planeSymbols || [], 8).join(",")}|active=${normalizeStringArray(entry.activeTargetWaveIds || [], 12).join(",")}|state=${cleanText(entry.deltaState, 80)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function buildCompactPacketText(branch = {}) {
  const partCatalog = branch.partCatalog || {};
  const source = branch.sourceLanguage || {};
  const futureLayer = branch.futureLayer || {};
  const lines = [
    `@packet ${cleanText(branch.branchId, 120)}`,
    `generated=${cleanText(branch.generatedAt, 80)}`,
    `mode=${cleanText(branch.mode, 80)}`,
    `hold=${cleanText(source.holdRule, 120)}|gate=${cleanText(source.promotionGate, 120)}`,
    `source=${cleanText(source.controllerSurfaceId, 120)}/${cleanText(source.profileId, 120)}/${cleanText(source.pidVersion, 240)}`,
    `source_load=${normalizeStringArray(source.loadOrder || [], 40).join(">")}`,
    `future_anchor=${cleanText(futureLayer.anchorId, 80)}|append=${cleanText(futureLayer.appendProtocolAnchorId, 80)}`,
    `truth_order=${normalizeStringArray(futureLayer.sourceOfTruthOrder || [], 60).join(">")}`,
    `delivery=${normalizeStringArray(futureLayer.deliveryStates || [], 40).join(">")}`,
    `forbidden=${normalizeStringArray(futureLayer.forbiddenPowers || [], 40).join(">")}`,
    `gnn=${normalizeStringArray(branch.gnnChain || [], 40).join(">")}`,
    `body=${normalizeStringArray(branch.bodySystem || [], 40).join(">")}`,
    `cats=${Number(branch.counts?.categoryCount || 0)}|sub=${Number(branch.counts?.subcategoryCount || 0)}|access=${Number(branch.counts?.accessLevelCount || 0)}|bundles=${Number(branch.counts?.choiceBundleCount || 0)}|stages=${Number(branch.counts?.stageCount || 0)}`,
    `universal=${cleanText(branch.universalExpansion?.modelId, 120)}|root=${cleanText(branch.universalExpansion?.root?.levelLabel, 40)}|sub=${cleanText(branch.universalExpansion?.subordinate?.levelLabel, 40)}|panel=${cleanText(branch.universalExpansion?.panel?.levelLabel, 40)}|map=${cleanText(branch.universalExpansion?.map?.levelLabel, 40)}`,
    `expand=${cleanText(branch.expansionKnowledge?.knowledgeId, 120)}|tiers=${Number(branch.expansionKnowledge?.tierCount || 0)}|gate=${cleanText(branch.expansionKnowledge?.futureGate, 120)}|state=${cleanText(branch.expansionKnowledge?.enforcementState, 80)}`,
    `planes=${normalizeStringArray((branch.omniLanguagePlanes?.planes || []).map((entry) => cleanText(entry.symbol, 12)), 12).join(",")}|law=${cleanText(branch.omniLanguagePlanes?.specialistLaw, 80)}|locality=${normalizeStringArray(branch.omniLanguagePlanes?.localityTuple || [], 12).join(",")}`,
    `parts=${Number(partCatalog.unitCount || 0)}|ready=${Number(partCatalog.readyUnitCount || 0)}`,
    `part_kinds=surface:${Number(partCatalog.categoryCounts?.surface || 0)}|ability:${Number(partCatalog.categoryCounts?.ability || 0)}|service:${Number(partCatalog.categoryCounts?.service || 0)}|service_part:${Number(partCatalog.categoryCounts?.servicePart || 0)}|compute:${Number(partCatalog.categoryCounts?.computeWatch || 0)}`,
    `positions=root:${cleanText(partCatalog.primaryPositions?.root, 40)}|ingress:${cleanText(partCatalog.primaryPositions?.ingress, 40)}|boundary:${cleanText(partCatalog.primaryPositions?.boundary, 40)}|service:${cleanText(partCatalog.primaryPositions?.service, 40)}`,
    `capsule=${cleanText(branch.sessionCapsule?.capsuleId, 120)}|stage=${cleanText(branch.sessionCapsule?.orchestrationState?.stageId, 80)}|next=${cleanText(branch.sessionCapsule?.orchestrationState?.nextPacketId, 120)}|ances=${cleanText(branch.ancestryMemory?.memoryId, 120)}|tsmem=${cleanText(branch.timestampMemory?.memoryId, 120)}`,
    `panel=${cleanText(branch.controlPanel?.panelId, 120)}|modes=${normalizeStringArray(branch.controlPanel?.panelModes || [], 24).join(",")}|compute=${normalizeStringArray((branch.controlPanel?.computeWatchers || []).map((entry) => entry.id), 40).join(",")}`,
    `handoff=${cleanText(branch.asolariaHandoff?.handoffId, 120)}|target=${cleanText(branch.asolariaHandoff?.target?.surfaceId, 120)}|profile=${cleanText(branch.asolariaHandoff?.target?.profileId, 120)}`,
    `planner=${cleanText(branch.plannerWave?.waveId, 120)}|lanes=${Number(branch.plannerWave?.laneCount || 0)}|authority=${cleanText(branch.plannerWave?.resultAuthority, 120)}`,
    `wave_lattice=${cleanText(branch.waveLattice?.latticeId, 120)}|meta=${Number(branch.waveLattice?.metaWaveCount || 0)}|cascade=${cleanText(branch.waveCascade?.cascadeId, 120)}|over=${Number(branch.waveCascade?.overWaveCount || 0)}|active=${normalizeStringArray(branch.waveCascade?.activeOverWaveIds || [], 12).join(",")}`,
    `legacy=${cleanText(branch.legacyReferenceWave?.waveId, 120)}|refs=${Number(branch.legacyReferenceWave?.referenceCount || 0)}|sectors=${Number(branch.legacyReferenceWave?.sectorCount || 0)}|waves=${Number(branch.legacyReferenceWave?.waveCount || 0)}|campaigns=${Number(branch.legacyReferenceWave?.campaignCount || 0)}`,
    `deep=${cleanText(branch.deepArchiveReplay?.replayId, 120)}|refs=${Number(branch.deepArchiveReplay?.referenceCount || 0)}|sectors=${Number(branch.deepArchiveReplay?.sectorCount || 0)}|waves=${Number(branch.deepArchiveReplay?.waveCount || 0)}|campaigns=${Number(branch.deepArchiveReplay?.campaignCount || 0)}`,
    `find=${cleanText(branch.deepArchiveFindings?.findingsId, 120)}|count=${Number(branch.deepArchiveFindings?.findingCount || 0)}|ddel=${cleanText(branch.deepArchiveDelta?.deltaId, 120)}|ddk=${Number(branch.deepArchiveDelta?.deltaCount || 0)}|gap=${cleanText(branch.languageGapAnalysis?.analysisId, 120)}|gaps=${Number(branch.languageGapAnalysis?.gapCount || 0)}|shannon=${cleanText(branch.shannonPartInspection?.inspectionId, 120)}`,
    `sfind=${cleanText(branch.shannonPartFindings?.findingsId, 120)}|count=${Number(branch.shannonPartFindings?.findingCount || 0)}|rev=${cleanText(branch.omniLanguageRevision?.revisionId, 120)}|revs=${Number(branch.omniLanguageRevision?.revisionCount || 0)}|rdep=${cleanText(branch.revisionDeployment?.deploymentId, 120)}|deps=${Number(branch.revisionDeployment?.deploymentCount || 0)}|dfb=${cleanText(branch.deploymentFeedback?.feedbackId, 120)}|fbk=${Number(branch.deploymentFeedback?.feedbackCount || 0)}|fcy=${cleanText(branch.feedbackWaveCycle?.cycleId, 120)}|fcw=${Number(branch.feedbackWaveCycle?.cycleCount || 0)}|rpay=${cleanText(branch.feedbackWaveCycle?.returnPayloadId, 120)}|rpw=${Number(branch.feedbackWaveCycle?.returnPayloadCount || 0)}|frm=${cleanText(branch.feedbackReturnMint?.mintId, 120)}|fmk=${Number(branch.feedbackReturnMint?.mintCount || 0)}|frd=${cleanText(branch.feedbackReturnRedeploy?.redeployId, 120)}|frk=${Number(branch.feedbackReturnRedeploy?.redeployCount || 0)}|frf=${cleanText(branch.feedbackReturnFindings?.findingsId, 120)}|ffk=${Number(branch.feedbackReturnFindings?.findingCount || 0)}|frp=${cleanText(branch.feedbackReturnPressure?.pressureId, 120)}|fpk=${Number(branch.feedbackReturnPressure?.pressureCount || 0)}|frpc=${cleanText(branch.feedbackReturnPressureCycle?.cycleId, 120)}|fpck=${Number(branch.feedbackReturnPressureCycle?.cycleCount || 0)}|frpp=${cleanText(branch.feedbackReturnPressurePatch?.patchId, 120)}|fppk=${Number(branch.feedbackReturnPressurePatch?.patchCount || 0)}|frpa=${cleanText(branch.feedbackReturnPatchApply?.applyId, 120)}|fpak=${Number(branch.feedbackReturnPatchApply?.applyCount || 0)}|frpaf=${cleanText(branch.feedbackReturnPatchApplyFindings?.findingsId, 120)}|fpafk=${Number(branch.feedbackReturnPatchApplyFindings?.findingCount || 0)}|frpap=${cleanText(branch.feedbackReturnPatchApplyPressure?.pressureId, 120)}|fpapk=${Number(branch.feedbackReturnPatchApplyPressure?.pressureCount || 0)}|frpapc=${cleanText(branch.feedbackReturnPatchApplyPressureCycle?.cycleId, 120)}|fpapck=${Number(branch.feedbackReturnPatchApplyPressureCycle?.cycleCount || 0)}|frpapp=${cleanText(branch.feedbackReturnPatchApplyPressurePatch?.patchId, 120)}|fpappk=${Number(branch.feedbackReturnPatchApplyPressurePatch?.patchCount || 0)}|frpappa=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.applyId, 120)}|fpappak=${Number(branch.feedbackReturnPatchApplyPressurePatchApply?.applyCount || 0)}|frpappaf=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingsId, 120)}|fpappafk=${Number(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingCount || 0)}|frpappap=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureId, 120)}|fpappapk=${Number(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureCount || 0)}|frpappapc=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleId, 120)}|fpappapck=${Number(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleCount || 0)}|frpappapp=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchId, 120)}|fpappappk=${Number(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchCount || 0)}|frpappappa=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyId, 120)}|fpappappak=${Number(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyCount || 0)}|frpappappaf=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingsId, 120)}|fpappappafk=${Number(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingCount || 0)}|frpappappap=${cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureId, 120)}|fpappappapk=${Number(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureCount || 0)}`,
    `scout6=${cleanText(branch.scoutSix?.scoutId, 120)}|lanes=${Number(branch.scoutSix?.laneCount || 0)}|front_back=${cleanText(branch.frontBackWave?.waveId, 120)}|front=${Number(branch.frontBackWave?.frontLaneCount || 0)}|back=${Number(branch.frontBackWave?.backLaneCount || 0)}`,
    `map_scan=${cleanText(branch.mapMapMappedScanning?.scanId, 120)}|waves=${Number(branch.mapMapMappedScanning?.waves?.length || 0)}|root=${cleanText(branch.portableRoot?.surfaceId, 120)}|mode=${cleanText(branch.mapMapMappedScanning?.positionMode, 120)}`,
    `governor=${cleanText(branch.mapMapMappedScanning?.capacityGovernor?.profileId, 120)}|scan=${Number(branch.mapMapMappedScanning?.capacityGovernor?.maxConcurrentScanWaves || 0)}|campaigns=${Number(branch.mapMapMappedScanning?.capacityGovernor?.maxActiveCampaigns || 0)}|legacy=${Number(branch.mapMapMappedScanning?.capacityGovernor?.maxActiveLegacyWaves || 0)}`,
    `bundles=${normalizeStringArray(partCatalog.bundleIds || [], 40).join(",")}`,
    `device=${cleanText(source.deviceSurfaceId, 120)}|route=${cleanText(source.routeKind, 80)}|adb=${cleanText(source.adbState, 80)}`,
    `memory=${cleanText(source.memoryPath, 120)}|index=${cleanText(source.indexProfile, 40)}|mistake=${cleanText(source.mistakeIndexId, 120)}`,
    "axioms=AX1:situational|AX2:epigenetic|AX3:CRLT|AX4:immune|AX5:hilbert|AX6:compression_is_language|AX7:language_creates_itself",
    "constitutional=RU1:canon|RU2:bimem|RU3:transport|RU4:compression|RU5:anti_capture|RU11:drift_creates_language",
    "federation=CRLT|local_complete|global_consistent|monotonic|merge_trivial|partition_tolerant",
    "share=white_room_branch|living_language_preserved"
  ];
  return `${lines.join("\n")}\n`;
}

function buildOmniPartLanguageBranch(options = {}) {
  const { configPath, config } = readOmniPartBranchConfig(options);
  const sourceProfile = options.sourceProfile || buildLirisLoadProfile(options.sourceOptions || {});
  const categories = buildBranchCategories(config);
  const accessLevels = buildBranchAccessLevels(config);
  const choiceBundles = buildBranchChoiceBundles(config);
  const developmentStages = buildBranchStages(config);
  const bodySystem = normalizeStringArray(
    Array.isArray(config.bodySystem) && config.bodySystem.length ? config.bodySystem : categories.map((entry) => entry.id),
    120
  );
  const gnnChain = normalizeStringArray(config.gnnChain || [], 80);
  const branch = {
    schemaVersion: Number(config.schemaVersion || 1),
    branchId: cleanText(config.branchId, 120),
    generatedAt: new Date().toISOString(),
    mode: "white_room_derived",
    configPath: safeRelativePath(configPath),
    summary: clipText(config.summary || "", 320),
    selectionLaw: cleanText(config.selectionLaw, 120),
    bodySystem,
    gnnChain,
    operationalPacketLineLimit: Number(config.operationalPacketLineLimit || 35),
    structuralPacketKinds: normalizeStringArray(config.structuralPacketKinds || [], 80),
    codeEnvelope: {
      symbolBudget: Number(config.codeEnvelope?.symbolBudget || 50),
      designGoal: cleanText(config.codeEnvelope?.designGoal, 160),
      mode: cleanText(config.codeEnvelope?.mode, 120)
    },
    portableRoot: buildPortableRoot(config),
    universalExpansion: buildUniversalExpansion(config),
    sourceLanguage: {
      holdRule: cleanText(config.holdRule, 160),
      promotionGate: cleanText(config.promotionGate, 160),
      sourceProfilePath: "data/liris-index/load-profile.json",
      controllerSurfaceId: cleanText(sourceProfile.deviceLanguage?.controller?.surfaceId, 120),
      profileId: cleanText(sourceProfile.deviceLanguage?.controller?.profileId, 120),
      pidVersion: cleanText(sourceProfile.deviceLanguage?.controller?.pidVersion, 240),
      deviceSurfaceId: cleanText(sourceProfile.deviceLanguage?.device?.surfaceId, 120),
      routeKind: cleanText(sourceProfile.deviceLanguage?.device?.routeKind, 80),
      adbState: cleanText(sourceProfile.deviceLanguage?.device?.adbState, 80),
      memoryPath: cleanText(sourceProfile.deviceLanguage?.memory?.curatedMemoryPath, 240),
      indexProfile: cleanText(sourceProfile.deviceLanguage?.index?.profile, 40),
      mistakeIndexId: cleanText(sourceProfile.deviceLanguage?.mistakeIndex?.indexId, 160),
      loadOrder: normalizeStringArray(sourceProfile.loadOrder || [], 80)
    },
    futureLayer: {
      mode: cleanText(config.futureLayer?.mode, 120),
      anchorId: cleanText(config.futureLayer?.anchorId, 80),
      appendProtocolAnchorId: cleanText(config.futureLayer?.appendProtocolAnchorId, 80),
      sourceOfTruthOrder: normalizeStringArray(config.futureLayer?.sourceOfTruthOrder || [], 120),
      deliveryStates: normalizeStringArray(config.futureLayer?.deliveryStates || [], 120),
      forbiddenPowers: normalizeStringArray(config.futureLayer?.forbiddenPowers || [], 120)
    },
    categories,
    accessLevels,
    choiceBundles,
    developmentStages,
    counts: {
      categoryCount: categories.length,
      subcategoryCount: categories.reduce((sum, entry) => sum + Number(entry.subcategories?.length || 0), 0),
      accessLevelCount: accessLevels.length,
      choiceBundleCount: choiceBundles.length,
      stageCount: developmentStages.length
    }
  };
  branch.analysisMemory = buildAnalysisMemory(config, branch);
  branch.ancestryMemory = buildAncestryMemory(config, branch);
  branch.timestampMemory = buildTimestampMemory(config, branch);
  branch.partCatalog = buildPartCatalog(sourceProfile, branch);
  branch.expansionKnowledge = buildExpansionKnowledge(config, branch);
  branch.adminReflectionTraining = buildAdminReflectionTraining(branch);
  branch.sessionCapsule = buildSessionCapsule(config, sourceProfile, branch);
  branch.plannerWave = buildPlannerWave(config, branch);
  branch.legacyReferenceWave = buildLegacyReferenceWave(config, branch);
  branch.deepArchiveReplay = buildDeepArchiveReplay(config, branch);
  branch.deepArchiveFindings = buildDeepArchiveFindings(config, branch);
  branch.sessionCapsule.deepArchiveFindings = {
    findingsId: cleanText(branch.deepArchiveFindings?.findingsId, 120),
    resultAuthority: cleanText(branch.deepArchiveFindings?.resultAuthority, 160),
    findingIds: normalizeStringArray((branch.deepArchiveFindings?.findings || []).map((entry) => entry.id), 120)
  };
  branch.scoutSix = buildScoutSix(config, branch);
  branch.frontBackWave = buildFrontBackWave(config, branch);
  branch.mapMapMappedScanning = buildMapMapMappedScanning(config, branch);
  branch.waveLattice = buildWaveLattice(config, branch);
  branch.mapMapMappedScanning.waveLatticeId = cleanText(branch.waveLattice?.latticeId, 120);
  branch.waveAgentClasses = buildWaveAgentClasses(config, branch);
  branch.researchAnalysis = buildResearchAnalysis(config, branch);
  branch.waveCascade = buildWaveCascade(config, branch);
  branch.omniLanguagePlanes = buildOmniLanguagePlanes(config, branch);
  branch.languageGapAnalysis = buildLanguageGapAnalysis(config, branch);
  branch.shannonPartInspection = buildShannonPartInspection(config, branch);
  branch.shannonPartFindings = buildShannonPartFindings(config, branch);
  branch.omniLanguageRevision = buildOmniLanguageRevision(config, branch);
  branch.revisionDeployment = buildRevisionDeployment(config, branch);
  branch.deploymentFeedback = buildDeploymentFeedback(config, branch);
  branch.feedbackWaveCycle = buildFeedbackWaveCycle(config, branch);
  branch.deepArchiveDelta = buildDeepArchiveDelta(config, branch);
  branch.feedbackWaveCycle = attachFeedbackReturnPayload(config, branch.feedbackWaveCycle, branch.deepArchiveDelta);
  branch.feedbackReturnMint = buildFeedbackReturnMint(config, branch);
  branch.feedbackReturnRedeploy = buildFeedbackReturnRedeploy(config, branch);
  branch.feedbackReturnFindings = buildFeedbackReturnFindings(config, branch);
  branch.feedbackReturnPressure = buildFeedbackReturnPressure(config, branch);
  branch.feedbackReturnPressureCycle = buildFeedbackReturnPressureCycle(config, branch);
  branch.feedbackReturnPressurePatch = buildFeedbackReturnPressurePatch(config, branch);
  branch.feedbackReturnPatchApply = buildFeedbackReturnPatchApply(config, branch);
  branch.feedbackReturnPatchApplyFindings = buildFeedbackReturnPatchApplyFindings(config, branch);
  branch.feedbackReturnPatchApplyPressure = buildFeedbackReturnPatchApplyPressure(config, branch);
  branch.feedbackReturnPatchApplyPressureCycle = buildFeedbackReturnPatchApplyPressureCycle(config, branch);
  branch.feedbackReturnPatchApplyPressurePatch = buildFeedbackReturnPatchApplyPressurePatch(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApply = buildFeedbackReturnPatchApplyPressurePatchApply(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApplyFindings = buildFeedbackReturnPatchApplyPressurePatchApplyFindings(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressure = buildFeedbackReturnPatchApplyPressurePatchApplyPressure(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle = buildFeedbackReturnPatchApplyPressurePatchApplyPressureCycle(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatch(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApply(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings(config, branch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure(config, branch);
  branch.mapMapMappedScanning.shannonParts.scout = normalizeStringArray(
    branch.shannonPartInspection.missions
      .filter((entry) => cleanText(entry.overWaveId, 120) === "over-wave-4-archive-translation")
      .map((entry) => cleanText(entry.partId, 120)),
    120
  );
  branch.mapMapMappedScanning.shannonParts.back = normalizeStringArray(
    branch.shannonPartInspection.missions
      .filter((entry) => cleanText(entry.overWaveId, 120) === "over-wave-5-proof-climb")
      .map((entry) => cleanText(entry.partId, 120)),
    120
  );
  branch.mapMapMappedScanning.shannonParts.wholeAllowed = branch.shannonPartInspection.wholeAllowed === true;
  branch.mapMapMappedScanning.waveCascadeId = cleanText(branch.waveCascade?.cascadeId, 120);
  branch.mapMapMappedScanning.languageGapAnalysisId = cleanText(branch.languageGapAnalysis?.analysisId, 120);
  branch.mapMapMappedScanning.deepArchiveDeltaId = cleanText(branch.deepArchiveDelta?.deltaId, 120);
  branch.mapMapMappedScanning.shannonPartInspectionId = cleanText(branch.shannonPartInspection?.inspectionId, 120);
  branch.mapMapMappedScanning.shannonPartFindingsId = cleanText(branch.shannonPartFindings?.findingsId, 120);
  branch.mapMapMappedScanning.omniLanguageRevisionId = cleanText(branch.omniLanguageRevision?.revisionId, 120);
  branch.mapMapMappedScanning.revisionDeploymentId = cleanText(branch.revisionDeployment?.deploymentId, 120);
  branch.mapMapMappedScanning.deploymentFeedbackId = cleanText(branch.deploymentFeedback?.feedbackId, 120);
  branch.mapMapMappedScanning.feedbackWaveCycleId = cleanText(branch.feedbackWaveCycle?.cycleId, 120);
  branch.mapMapMappedScanning.feedbackReturnPayloadId = cleanText(branch.feedbackWaveCycle?.returnPayloadId, 120);
  branch.mapMapMappedScanning.feedbackReturnMintId = cleanText(branch.feedbackReturnMint?.mintId, 120);
  branch.mapMapMappedScanning.feedbackReturnRedeployId = cleanText(branch.feedbackReturnRedeploy?.redeployId, 120);
  branch.mapMapMappedScanning.feedbackReturnFindingsId = cleanText(branch.feedbackReturnFindings?.findingsId, 120);
  branch.mapMapMappedScanning.feedbackReturnPressureId = cleanText(branch.feedbackReturnPressure?.pressureId, 120);
  branch.mapMapMappedScanning.feedbackReturnPressureCycleId = cleanText(branch.feedbackReturnPressureCycle?.cycleId, 120);
  branch.mapMapMappedScanning.feedbackReturnPressurePatchId = cleanText(branch.feedbackReturnPressurePatch?.patchId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyId = cleanText(branch.feedbackReturnPatchApply?.applyId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyFindings?.findingsId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressure?.pressureId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressureCycle?.cycleId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatch?.patchId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.applyId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.mapMapMappedScanning.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.mapMapMappedScanning.returnPayloadWaveIds = normalizeStringArray(branch.feedbackWaveCycle?.returnPayloadWaveIds || [], 120);
  branch.mapMapMappedScanning.returnPayloadDeltaIds = normalizeStringArray(branch.feedbackWaveCycle?.returnPayloadDeltaIds || [], 120);
  branch.mapMapMappedScanning.returnMintIds = normalizeStringArray(branch.feedbackReturnMint?.activeMintIds || [], 120);
  branch.mapMapMappedScanning.returnRedeployIds = normalizeStringArray(branch.feedbackReturnRedeploy?.activeRedeployIds || [], 120);
  branch.mapMapMappedScanning.returnFindingIds = normalizeStringArray(branch.feedbackReturnFindings?.activeFindingIds || [], 120);
  branch.mapMapMappedScanning.returnPressureIds = normalizeStringArray(branch.feedbackReturnPressure?.activePressureIds || [], 120);
  branch.mapMapMappedScanning.returnPressureCycleIds = normalizeStringArray(branch.feedbackReturnPressureCycle?.activeCycleIds || [], 120);
  branch.mapMapMappedScanning.returnPressurePatchIds = normalizeStringArray(branch.feedbackReturnPressurePatch?.activePatchIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApply?.activeApplyIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyFindings?.activeFindingIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressure?.activePressureIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressureCycleIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressureCycle?.activeCycleIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatch?.activePatchIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApply?.activeApplyIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyPressureCycleIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.activeCycleIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyPressurePatchIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.activePatchIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyPressurePatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.activeApplyIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyPressurePatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120);
  branch.mapMapMappedScanning.returnPatchApplyPressurePatchApplyPressurePatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120);
  branch.mapMapMappedScanning.activation.trigger = `${cleanText(branch.mapMapMappedScanning.activation?.trigger, 200)}_then_language_gap_analysis_ready_then_deployment_feedback_ready_then_feedback_wave_cycle_ready_then_deep_archive_delta_ready_then_feedback_return_payload_ready_then_feedback_return_mint_ready_then_feedback_return_redeploy_ready_then_feedback_return_findings_ready_then_feedback_return_pressure_ready_then_feedback_return_pressure_cycle_ready_then_feedback_return_pressure_patch_ready_then_feedback_return_patch_apply_ready_then_feedback_return_patch_apply_findings_ready_then_feedback_return_patch_apply_pressure_ready_then_feedback_return_patch_apply_pressure_cycle_ready_then_feedback_return_patch_apply_pressure_patch_ready_then_feedback_return_patch_apply_pressure_patch_apply_ready_then_feedback_return_patch_apply_pressure_patch_apply_findings_ready_then_feedback_return_patch_apply_pressure_patch_apply_pressure_ready`;
  branch.mapMapMappedScanning.activation.languageGapAnalysisGate = cleanText(branch.languageGapAnalysis?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.shannonInspectionGate = cleanText(branch.shannonPartInspection?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.shannonFindingsGate = cleanText(branch.shannonPartFindings?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.deepArchiveDeltaGate = cleanText(branch.deepArchiveDelta?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.omniLanguageRevisionGate = cleanText(branch.omniLanguageRevision?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.revisionDeploymentGate = cleanText(branch.revisionDeployment?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.deploymentFeedbackGate = cleanText(branch.deploymentFeedback?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackWaveCycleGate = cleanText(branch.feedbackWaveCycle?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPayloadGate = cleanText(branch.feedbackWaveCycle?.returnPayloadAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnMintGate = cleanText(branch.feedbackReturnMint?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnRedeployGate = cleanText(branch.feedbackReturnRedeploy?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnFindingsGate = cleanText(branch.feedbackReturnFindings?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPressureGate = cleanText(branch.feedbackReturnPressure?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPressureCycleGate = cleanText(branch.feedbackReturnPressureCycle?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPressurePatchGate = cleanText(branch.feedbackReturnPressurePatch?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyGate = cleanText(branch.feedbackReturnPatchApply?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyFindingsGate = cleanText(branch.feedbackReturnPatchApplyFindings?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressureGate = cleanText(branch.feedbackReturnPatchApplyPressure?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressureCycleGate = cleanText(branch.feedbackReturnPatchApplyPressureCycle?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchGate = cleanText(branch.feedbackReturnPatchApplyPressurePatch?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyFindingsGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyPressureGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyPressureCycleGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyPressurePatchGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureGate = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.resultAuthority, 160);
  branch.mapMapMappedScanning.activation.trigger = `${branch.mapMapMappedScanning.activation.trigger}_then_feedback_return_patch_apply_pressure_patch_apply_pressure_cycle_ready`;
  branch.mapMapMappedScanning.activation.trigger = `${branch.mapMapMappedScanning.activation.trigger}_then_feedback_return_patch_apply_pressure_patch_apply_pressure_patch_ready`;
  branch.mapMapMappedScanning.activation.trigger = `${branch.mapMapMappedScanning.activation.trigger}_then_feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_ready`;
  branch.mapMapMappedScanning.activation.trigger = `${branch.mapMapMappedScanning.activation.trigger}_then_feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_findings_ready`;
  branch.mapMapMappedScanning.activation.trigger = `${branch.mapMapMappedScanning.activation.trigger}_then_feedback_return_patch_apply_pressure_patch_apply_pressure_patch_apply_pressure_ready`;
  branch.researchAnalysis.waveCascadeId = cleanText(branch.waveCascade?.cascadeId, 120);
  branch.researchAnalysis.overWaveIds = normalizeStringArray((branch.waveCascade?.overWaves || []).map((entry) => entry.id), 120);
  branch.researchAnalysis.activeOverWaveIds = normalizeStringArray(branch.waveCascade?.activeOverWaveIds || [], 120);
  branch.researchAnalysis.stagedOverWaveIds = normalizeStringArray(branch.waveCascade?.stagedOverWaveIds || [], 120);
  branch.researchAnalysis.languageGapAnalysisId = cleanText(branch.languageGapAnalysis?.analysisId, 120);
  branch.researchAnalysis.deepArchiveDeltaId = cleanText(branch.deepArchiveDelta?.deltaId, 120);
  branch.researchAnalysis.shannonPartInspectionId = cleanText(branch.shannonPartInspection?.inspectionId, 120);
  branch.researchAnalysis.shannonPartFindingsId = cleanText(branch.shannonPartFindings?.findingsId, 120);
  branch.researchAnalysis.omniLanguageRevisionId = cleanText(branch.omniLanguageRevision?.revisionId, 120);
  branch.researchAnalysis.revisionDeploymentId = cleanText(branch.revisionDeployment?.deploymentId, 120);
  branch.researchAnalysis.deploymentFeedbackId = cleanText(branch.deploymentFeedback?.feedbackId, 120);
  branch.researchAnalysis.feedbackWaveCycleId = cleanText(branch.feedbackWaveCycle?.cycleId, 120);
  branch.researchAnalysis.feedbackReturnPayloadId = cleanText(branch.feedbackWaveCycle?.returnPayloadId, 120);
  branch.researchAnalysis.feedbackReturnMintId = cleanText(branch.feedbackReturnMint?.mintId, 120);
  branch.researchAnalysis.feedbackReturnRedeployId = cleanText(branch.feedbackReturnRedeploy?.redeployId, 120);
  branch.researchAnalysis.feedbackReturnFindingsId = cleanText(branch.feedbackReturnFindings?.findingsId, 120);
  branch.researchAnalysis.feedbackReturnPressureId = cleanText(branch.feedbackReturnPressure?.pressureId, 120);
  branch.researchAnalysis.feedbackReturnPressureCycleId = cleanText(branch.feedbackReturnPressureCycle?.cycleId, 120);
  branch.researchAnalysis.feedbackReturnPressurePatchId = cleanText(branch.feedbackReturnPressurePatch?.patchId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyId = cleanText(branch.feedbackReturnPatchApply?.applyId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyFindings?.findingsId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressure?.pressureId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressureCycle?.cycleId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatch?.patchId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.applyId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.researchAnalysis.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.researchAnalysis.activeGapIds = normalizeStringArray(branch.languageGapAnalysis?.activeGapIds || [], 120);
  branch.researchAnalysis.stagedGapIds = normalizeStringArray(branch.languageGapAnalysis?.stagedGapIds || [], 120);
  branch.researchAnalysis.focusOverWaveIds = normalizeStringArray(branch.languageGapAnalysis?.focusOverWaveIds || [], 120);
  branch.researchAnalysis.focusWeaknessIds = normalizeStringArray(branch.languageGapAnalysis?.focusWeaknessIds || [], 120);
  branch.researchAnalysis.targetPlaneIds = normalizeStringArray(branch.languageGapAnalysis?.targetPlaneIds || [], 120);
  branch.researchAnalysis.activeShannonMissionIds = normalizeStringArray(branch.shannonPartInspection?.activeMissionIds || [], 120);
  branch.researchAnalysis.stagedShannonMissionIds = normalizeStringArray(branch.shannonPartInspection?.stagedMissionIds || [], 120);
  branch.researchAnalysis.activeShannonFindingIds = normalizeStringArray(branch.shannonPartFindings?.activeFindingIds || [], 120);
  branch.researchAnalysis.stagedShannonFindingIds = normalizeStringArray(branch.shannonPartFindings?.stagedFindingIds || [], 120);
  branch.researchAnalysis.activeRevisionIds = normalizeStringArray(branch.omniLanguageRevision?.activeRevisionIds || [], 120);
  branch.researchAnalysis.stagedRevisionIds = normalizeStringArray(branch.omniLanguageRevision?.stagedRevisionIds || [], 120);
  branch.researchAnalysis.activeDeploymentIds = normalizeStringArray(branch.revisionDeployment?.activeDeploymentIds || [], 120);
  branch.researchAnalysis.stagedDeploymentIds = normalizeStringArray(branch.revisionDeployment?.stagedDeploymentIds || [], 120);
  branch.researchAnalysis.activeDeploymentFeedbackIds = normalizeStringArray(branch.deploymentFeedback?.activeFeedbackIds || [], 120);
  branch.researchAnalysis.activeFeedbackCycleWaveIds = normalizeStringArray(branch.feedbackWaveCycle?.activeWaveIds || [], 120);
  branch.researchAnalysis.returnPayloadWaveIds = normalizeStringArray(branch.feedbackWaveCycle?.returnPayloadWaveIds || [], 120);
  branch.researchAnalysis.returnPayloadDeltaIds = normalizeStringArray(branch.feedbackWaveCycle?.returnPayloadDeltaIds || [], 120);
  branch.researchAnalysis.activeDeepArchiveDeltaIds = normalizeStringArray(branch.deepArchiveDelta?.activeDeltaIds || [], 120);
  branch.researchAnalysis.activeReturnMintIds = normalizeStringArray(branch.feedbackReturnMint?.activeMintIds || [], 120);
  branch.researchAnalysis.activeReturnRedeployIds = normalizeStringArray(branch.feedbackReturnRedeploy?.activeRedeployIds || [], 120);
  branch.researchAnalysis.activeReturnFindingIds = normalizeStringArray(branch.feedbackReturnFindings?.activeFindingIds || [], 120);
  branch.researchAnalysis.activeReturnPressureIds = normalizeStringArray(branch.feedbackReturnPressure?.activePressureIds || [], 120);
  branch.researchAnalysis.activeReturnPressureCycleIds = normalizeStringArray(branch.feedbackReturnPressureCycle?.activeCycleIds || [], 120);
  branch.researchAnalysis.activeReturnPressurePatchIds = normalizeStringArray(branch.feedbackReturnPressurePatch?.activePatchIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApply?.activeApplyIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyFindings?.activeFindingIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressure?.activePressureIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressureCycleIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressureCycle?.activeCycleIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatch?.activePatchIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApply?.activeApplyIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyPressureCycleIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.activeCycleIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyPressurePatchIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.activePatchIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.activeApplyIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120);
  branch.researchAnalysis.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120);
  branch.researchAnalysis.activePressureGapIds = normalizeStringArray(branch.feedbackReturnPressureCycle?.activeGapIds || [], 120);
  branch.researchAnalysis.activePressureRevisionIds = normalizeStringArray(branch.feedbackReturnPressureCycle?.activeRevisionIds || [], 120);
  branch.researchAnalysis.activePressurePatchGapIds = normalizeStringArray(branch.feedbackReturnPressurePatch?.activeGapIds || [], 120);
  branch.researchAnalysis.activePressurePatchRevisionIds = normalizeStringArray(branch.feedbackReturnPressurePatch?.activeRevisionIds || [], 120);
  branch.researchAnalysis.activePatchApplyGapIds = normalizeStringArray(branch.feedbackReturnPatchApply?.activeGapIds || [], 120);
  branch.researchAnalysis.activePatchApplyRevisionIds = normalizeStringArray(branch.feedbackReturnPatchApply?.activeRevisionIds || [], 120);
  branch.researchAnalysis.nextWaveIds = normalizeStringArray(
    (branch.feedbackWaveCycle?.nextWaveIds && branch.feedbackWaveCycle.nextWaveIds.length)
      ? branch.feedbackWaveCycle.nextWaveIds
      : (branch.researchAnalysis.nextWaveIds || []),
    120
  );
  branch.sessionCapsule.waveCascade = {
    cascadeId: cleanText(branch.waveCascade?.cascadeId, 120),
    resultAuthority: cleanText(branch.waveCascade?.resultAuthority, 160),
    activeOverWaveIds: normalizeStringArray(branch.waveCascade?.activeOverWaveIds || [], 120),
    stagedOverWaveIds: normalizeStringArray(branch.waveCascade?.stagedOverWaveIds || [], 120)
  };
  branch.sessionCapsule.languageGapAnalysis = {
    analysisId: cleanText(branch.languageGapAnalysis?.analysisId, 120),
    resultAuthority: cleanText(branch.languageGapAnalysis?.resultAuthority, 160),
    activeGapIds: normalizeStringArray(branch.languageGapAnalysis?.activeGapIds || [], 120),
    stagedGapIds: normalizeStringArray(branch.languageGapAnalysis?.stagedGapIds || [], 120)
  };
  branch.sessionCapsule.shannonPartInspection = {
    inspectionId: cleanText(branch.shannonPartInspection?.inspectionId, 120),
    resultAuthority: cleanText(branch.shannonPartInspection?.resultAuthority, 160),
    activeMissionIds: normalizeStringArray(branch.shannonPartInspection?.activeMissionIds || [], 120),
    stagedMissionIds: normalizeStringArray(branch.shannonPartInspection?.stagedMissionIds || [], 120)
  };
  branch.sessionCapsule.shannonPartFindings = {
    findingsId: cleanText(branch.shannonPartFindings?.findingsId, 120),
    resultAuthority: cleanText(branch.shannonPartFindings?.resultAuthority, 160),
    activeFindingIds: normalizeStringArray(branch.shannonPartFindings?.activeFindingIds || [], 120),
    stagedFindingIds: normalizeStringArray(branch.shannonPartFindings?.stagedFindingIds || [], 120)
  };
  branch.sessionCapsule.omniLanguageRevision = {
    revisionId: cleanText(branch.omniLanguageRevision?.revisionId, 120),
    resultAuthority: cleanText(branch.omniLanguageRevision?.resultAuthority, 160),
    activeRevisionIds: normalizeStringArray(branch.omniLanguageRevision?.activeRevisionIds || [], 120),
    stagedRevisionIds: normalizeStringArray(branch.omniLanguageRevision?.stagedRevisionIds || [], 120)
  };
  branch.sessionCapsule.revisionDeployment = {
    deploymentId: cleanText(branch.revisionDeployment?.deploymentId, 120),
    resultAuthority: cleanText(branch.revisionDeployment?.resultAuthority, 160),
    activeDeploymentIds: normalizeStringArray(branch.revisionDeployment?.activeDeploymentIds || [], 120),
    stagedDeploymentIds: normalizeStringArray(branch.revisionDeployment?.stagedDeploymentIds || [], 120)
  };
  branch.sessionCapsule.deploymentFeedback = {
    feedbackId: cleanText(branch.deploymentFeedback?.feedbackId, 120),
    resultAuthority: cleanText(branch.deploymentFeedback?.resultAuthority, 160),
    activeFeedbackIds: normalizeStringArray(branch.deploymentFeedback?.activeFeedbackIds || [], 120),
    nextWaveIds: normalizeStringArray(branch.deploymentFeedback?.nextWaveIds || [], 120)
  };
  branch.sessionCapsule.feedbackWaveCycle = {
    cycleId: cleanText(branch.feedbackWaveCycle?.cycleId, 120),
    resultAuthority: cleanText(branch.feedbackWaveCycle?.resultAuthority, 160),
    activeWaveIds: normalizeStringArray(branch.feedbackWaveCycle?.activeWaveIds || [], 120),
    nextWaveIds: normalizeStringArray(branch.feedbackWaveCycle?.nextWaveIds || [], 120),
    returnPayloadId: cleanText(branch.feedbackWaveCycle?.returnPayloadId, 120),
    returnPayloadWaveIds: normalizeStringArray(branch.feedbackWaveCycle?.returnPayloadWaveIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnMint = {
    mintId: cleanText(branch.feedbackReturnMint?.mintId, 120),
    resultAuthority: cleanText(branch.feedbackReturnMint?.resultAuthority, 160),
    activeMintIds: normalizeStringArray(branch.feedbackReturnMint?.activeMintIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnRedeploy = {
    redeployId: cleanText(branch.feedbackReturnRedeploy?.redeployId, 120),
    resultAuthority: cleanText(branch.feedbackReturnRedeploy?.resultAuthority, 160),
    activeRedeployIds: normalizeStringArray(branch.feedbackReturnRedeploy?.activeRedeployIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnFindings = {
    findingsId: cleanText(branch.feedbackReturnFindings?.findingsId, 120),
    resultAuthority: cleanText(branch.feedbackReturnFindings?.resultAuthority, 160),
    activeFindingIds: normalizeStringArray(branch.feedbackReturnFindings?.activeFindingIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPressure = {
    pressureId: cleanText(branch.feedbackReturnPressure?.pressureId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPressure?.resultAuthority, 160),
    activePressureIds: normalizeStringArray(branch.feedbackReturnPressure?.activePressureIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPressureCycle = {
    cycleId: cleanText(branch.feedbackReturnPressureCycle?.cycleId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPressureCycle?.resultAuthority, 160),
    activeCycleIds: normalizeStringArray(branch.feedbackReturnPressureCycle?.activeCycleIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPressurePatch = {
    patchId: cleanText(branch.feedbackReturnPressurePatch?.patchId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPressurePatch?.resultAuthority, 160),
    activePatchIds: normalizeStringArray(branch.feedbackReturnPressurePatch?.activePatchIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApply = {
    applyId: cleanText(branch.feedbackReturnPatchApply?.applyId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApply?.resultAuthority, 160),
    activeApplyIds: normalizeStringArray(branch.feedbackReturnPatchApply?.activeApplyIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyFindings = {
    findingsId: cleanText(branch.feedbackReturnPatchApplyFindings?.findingsId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyFindings?.resultAuthority, 160),
    activeFindingIds: normalizeStringArray(branch.feedbackReturnPatchApplyFindings?.activeFindingIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressure = {
    pressureId: cleanText(branch.feedbackReturnPatchApplyPressure?.pressureId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressure?.resultAuthority, 160),
    activePressureIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressure?.activePressureIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressureCycle = {
    cycleId: cleanText(branch.feedbackReturnPatchApplyPressureCycle?.cycleId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressureCycle?.resultAuthority, 160),
    activeCycleIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressureCycle?.activeCycleIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatch = {
    patchId: cleanText(branch.feedbackReturnPatchApplyPressurePatch?.patchId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatch?.resultAuthority, 160),
    activePatchIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatch?.activePatchIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApply = {
    applyId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.applyId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.resultAuthority, 160),
    activeApplyIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApply?.activeApplyIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApplyFindings = {
    findingsId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingsId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.resultAuthority, 160),
    activeFindingIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApplyPressure = {
    pressureId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.resultAuthority, 160),
    activePressureIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApplyPressureCycle = {
    cycleId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.resultAuthority, 160),
    activeCycleIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.activeCycleIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatch = {
    patchId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.resultAuthority, 160),
    activePatchIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.activePatchIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply = {
    applyId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.resultAuthority, 160),
    activeApplyIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.activeApplyIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings = {
    findingsId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingsId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.resultAuthority, 160),
    activeFindingIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120)
  };
  branch.sessionCapsule.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure = {
    pressureId: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureId, 120),
    resultAuthority: cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.resultAuthority, 160),
    activePressureIds: normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120)
  };
  branch.sessionCapsule.deepArchiveDelta = {
    deltaId: cleanText(branch.deepArchiveDelta?.deltaId, 120),
    resultAuthority: cleanText(branch.deepArchiveDelta?.resultAuthority, 160),
    activeDeltaIds: normalizeStringArray(branch.deepArchiveDelta?.activeDeltaIds || [], 120)
  };
  branch.controlPanel = buildControlPanel(config, branch);
  branch.controlPanel.languageGapAnalysisId = cleanText(branch.languageGapAnalysis?.analysisId, 120);
  branch.controlPanel.shannonPartInspectionId = cleanText(branch.shannonPartInspection?.inspectionId, 120);
  branch.controlPanel.shannonPartFindingsId = cleanText(branch.shannonPartFindings?.findingsId, 120);
  branch.controlPanel.omniLanguageRevisionId = cleanText(branch.omniLanguageRevision?.revisionId, 120);
  branch.controlPanel.revisionDeploymentId = cleanText(branch.revisionDeployment?.deploymentId, 120);
  branch.controlPanel.deploymentFeedbackId = cleanText(branch.deploymentFeedback?.feedbackId, 120);
  branch.controlPanel.feedbackWaveCycleId = cleanText(branch.feedbackWaveCycle?.cycleId, 120);
  branch.controlPanel.feedbackReturnPayloadId = cleanText(branch.feedbackWaveCycle?.returnPayloadId, 120);
  branch.controlPanel.feedbackReturnMintId = cleanText(branch.feedbackReturnMint?.mintId, 120);
  branch.controlPanel.feedbackReturnRedeployId = cleanText(branch.feedbackReturnRedeploy?.redeployId, 120);
  branch.controlPanel.feedbackReturnFindingsId = cleanText(branch.feedbackReturnFindings?.findingsId, 120);
  branch.controlPanel.feedbackReturnPressureId = cleanText(branch.feedbackReturnPressure?.pressureId, 120);
  branch.controlPanel.feedbackReturnPressureCycleId = cleanText(branch.feedbackReturnPressureCycle?.cycleId, 120);
  branch.controlPanel.feedbackReturnPressurePatchId = cleanText(branch.feedbackReturnPressurePatch?.patchId, 120);
  branch.controlPanel.feedbackReturnPatchApplyId = cleanText(branch.feedbackReturnPatchApply?.applyId, 120);
  branch.controlPanel.feedbackReturnPatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyFindings?.findingsId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressure?.pressureId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressureCycle?.cycleId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatch?.patchId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.applyId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.controlPanel.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.controlPanel.deepArchiveDeltaId = cleanText(branch.deepArchiveDelta?.deltaId, 120);
  branch.controlPanel.activeGapIds = normalizeStringArray(branch.languageGapAnalysis?.activeGapIds || [], 120);
  branch.controlPanel.stagedGapIds = normalizeStringArray(branch.languageGapAnalysis?.stagedGapIds || [], 120);
  branch.controlPanel.activeDeepArchiveDeltaIds = normalizeStringArray(branch.deepArchiveDelta?.activeDeltaIds || [], 120);
  branch.controlPanel.returnPayloadWaveIds = normalizeStringArray(branch.feedbackWaveCycle?.returnPayloadWaveIds || [], 120);
  branch.controlPanel.activeReturnMintIds = normalizeStringArray(branch.feedbackReturnMint?.activeMintIds || [], 120);
  branch.controlPanel.activeReturnRedeployIds = normalizeStringArray(branch.feedbackReturnRedeploy?.activeRedeployIds || [], 120);
  branch.controlPanel.activeReturnFindingIds = normalizeStringArray(branch.feedbackReturnFindings?.activeFindingIds || [], 120);
  branch.controlPanel.activeReturnPressureIds = normalizeStringArray(branch.feedbackReturnPressure?.activePressureIds || [], 120);
  branch.controlPanel.activeReturnPressureCycleIds = normalizeStringArray(branch.feedbackReturnPressureCycle?.activeCycleIds || [], 120);
  branch.controlPanel.activeReturnPressurePatchIds = normalizeStringArray(branch.feedbackReturnPressurePatch?.activePatchIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApply?.activeApplyIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyFindings?.activeFindingIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressure?.activePressureIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressureCycleIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressureCycle?.activeCycleIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatch?.activePatchIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApply?.activeApplyIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyPressureCycleIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.activeCycleIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.activePatchIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.activeApplyIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.activeFindingIds || [], 120);
  branch.controlPanel.activeReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureIds = normalizeStringArray(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.activePressureIds || [], 120);
  branch.asolariaHandoff = buildAsolariaHandoff(config, branch);
  branch.asolariaHandoff.instructions.languageGapAnalysisId = cleanText(branch.languageGapAnalysis?.analysisId, 120);
  branch.asolariaHandoff.instructions.deepArchiveDeltaId = cleanText(branch.deepArchiveDelta?.deltaId, 120);
  branch.asolariaHandoff.instructions.shannonPartInspectionId = cleanText(branch.shannonPartInspection?.inspectionId, 120);
  branch.asolariaHandoff.instructions.shannonPartFindingsId = cleanText(branch.shannonPartFindings?.findingsId, 120);
  branch.asolariaHandoff.instructions.omniLanguageRevisionId = cleanText(branch.omniLanguageRevision?.revisionId, 120);
  branch.asolariaHandoff.instructions.revisionDeploymentId = cleanText(branch.revisionDeployment?.deploymentId, 120);
  branch.asolariaHandoff.instructions.deploymentFeedbackId = cleanText(branch.deploymentFeedback?.feedbackId, 120);
  branch.asolariaHandoff.instructions.feedbackWaveCycleId = cleanText(branch.feedbackWaveCycle?.cycleId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPayloadId = cleanText(branch.feedbackWaveCycle?.returnPayloadId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnMintId = cleanText(branch.feedbackReturnMint?.mintId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnRedeployId = cleanText(branch.feedbackReturnRedeploy?.redeployId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnFindingsId = cleanText(branch.feedbackReturnFindings?.findingsId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPressureId = cleanText(branch.feedbackReturnPressure?.pressureId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPressureCycleId = cleanText(branch.feedbackReturnPressureCycle?.cycleId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPressurePatchId = cleanText(branch.feedbackReturnPressurePatch?.patchId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyId = cleanText(branch.feedbackReturnPatchApply?.applyId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyFindings?.findingsId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressure?.pressureId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressureCycle?.cycleId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatch?.patchId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApply?.applyId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyPressureCycleId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle?.cycleId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyPressurePatchId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch?.patchId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply?.applyId, 120);
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings?.findingsId, 120);
  branch.asolariaHandoff.instructions.loadOrder = insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureLoadOrder(
    insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsLoadOrder(
      insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyLoadOrder(
        insertFeedbackReturnPatchApplyPressurePatchApplyPressurePatchLoadOrder(
          insertFeedbackReturnPatchApplyPressurePatchApplyPressureCycleLoadOrder(
            insertFeedbackReturnPatchApplyPressurePatchApplyPressureLoadOrder(
              insertFeedbackReturnPatchApplyPressurePatchApplyLoadOrder(
                insertFeedbackReturnPatchApplyPressurePatchLoadOrder(
                  insertFeedbackReturnPatchApplyPressureCycleLoadOrder(
                    insertFeedbackReturnPatchApplyPressureLoadOrder(
                      insertFeedbackReturnPatchApplyFindingsLoadOrder(
                        insertFeedbackReturnPatchApplyLoadOrder(
                          insertFeedbackReturnPressurePatchLoadOrder(
                            insertFeedbackReturnPressureCycleLoadOrder(
                              insertFeedbackReturnPressureLoadOrder(
                                insertFeedbackReturnFindingsLoadOrder(
                                  insertFeedbackReturnRedeployLoadOrder(
                                    insertFeedbackReturnMintLoadOrder(
                                      insertDeepArchiveDeltaLoadOrder(
                                        insertFeedbackWaveCycleLoadOrder(
                                          insertDeploymentFeedbackLoadOrder(
                                            insertOmniLanguageRevisionLoadOrder(
                                              insertRevisionDeploymentLoadOrder(
                                                insertShannonPartFindingsLoadOrder(
                                                  insertLanguageGapAnalysisLoadOrder(branch.asolariaHandoff.instructions.loadOrder || [])
                                                )
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    )
  );
  branch.asolariaHandoff.instructions.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureId = cleanText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure?.pressureId, 120);
  branch.compactPacketText = buildCompactPacketText(branch);
  branch.analysisMemoryPacketText = buildAnalysisMemoryPacketText(branch.analysisMemory);
  branch.ancestryMemoryPacketText = buildAncestryMemoryPacketText(branch.ancestryMemory);
  branch.timestampMemoryPacketText = buildTimestampMemoryPacketText(branch.timestampMemory);
  branch.expansionKnowledgePacketText = buildExpansionKnowledgePacketText(branch.expansionKnowledge);
  branch.adminReflectionTrainingPacketText = buildAdminReflectionTrainingPacketText(branch.adminReflectionTraining);
  branch.researchAnalysisPacketText = buildResearchAnalysisPacketText(branch.researchAnalysis);
  branch.languageGapAnalysisPacketText = buildLanguageGapAnalysisPacketText(branch.languageGapAnalysis);
  branch.shannonPartInspectionPacketText = buildShannonPartInspectionPacketText(branch.shannonPartInspection);
  branch.shannonPartFindingsPacketText = buildShannonPartFindingsPacketText(branch.shannonPartFindings);
  branch.omniLanguageRevisionPacketText = buildOmniLanguageRevisionPacketText(branch.omniLanguageRevision);
  branch.revisionDeploymentPacketText = buildRevisionDeploymentPacketText(branch.revisionDeployment);
  branch.deploymentFeedbackPacketText = buildDeploymentFeedbackPacketText(branch.deploymentFeedback);
    branch.feedbackWaveCyclePacketText = buildFeedbackWaveCyclePacketText(branch.feedbackWaveCycle);
    branch.feedbackReturnMintPacketText = buildFeedbackReturnMintPacketText(branch.feedbackReturnMint);
    branch.feedbackReturnRedeployPacketText = buildFeedbackReturnRedeployPacketText(branch.feedbackReturnRedeploy);
    branch.feedbackReturnFindingsPacketText = buildFeedbackReturnFindingsPacketText(branch.feedbackReturnFindings);
    branch.feedbackReturnPressurePacketText = buildFeedbackReturnPressurePacketText(branch.feedbackReturnPressure);
    branch.feedbackReturnPressureCyclePacketText = buildFeedbackReturnPressureCyclePacketText(branch.feedbackReturnPressureCycle);
    branch.feedbackReturnPressurePatchPacketText = buildFeedbackReturnPressurePatchPacketText(branch.feedbackReturnPressurePatch);
    branch.feedbackReturnPatchApplyPacketText = buildFeedbackReturnPatchApplyPacketText(branch.feedbackReturnPatchApply);
    branch.feedbackReturnPatchApplyFindingsPacketText = buildFeedbackReturnPatchApplyFindingsPacketText(branch.feedbackReturnPatchApplyFindings);
    branch.feedbackReturnPatchApplyPressurePacketText = buildFeedbackReturnPatchApplyPressurePacketText(branch.feedbackReturnPatchApplyPressure);
    branch.feedbackReturnPatchApplyPressureCyclePacketText = buildFeedbackReturnPatchApplyPressureCyclePacketText(branch.feedbackReturnPatchApplyPressureCycle);
  branch.feedbackReturnPatchApplyPressurePatchPacketText = buildFeedbackReturnPatchApplyPressurePatchPacketText(branch.feedbackReturnPatchApplyPressurePatch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPacketText = buildFeedbackReturnPatchApplyPressurePatchApplyPacketText(branch.feedbackReturnPatchApplyPressurePatchApply);
  branch.feedbackReturnPatchApplyPressurePatchApplyFindingsPacketText = buildFeedbackReturnPatchApplyPressurePatchApplyFindingsPacketText(branch.feedbackReturnPatchApplyPressurePatchApplyFindings);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePacketText = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePacketText(branch.feedbackReturnPatchApplyPressurePatchApplyPressure);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketText = buildFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketText(branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketText = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketText = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketText = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings);
  branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketText = buildFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketText(branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure);
  branch.deepArchiveDeltaPacketText = buildDeepArchiveDeltaPacketText(branch.deepArchiveDelta);
  branch.waveAgentClassesPacketText = buildWaveAgentClassesPacketText(branch.waveAgentClasses);
  branch.omniLanguagePlanesPacketText = buildOmniLanguagePlanesPacketText(branch.omniLanguagePlanes);
  branch.waveLatticePacketText = buildWaveLatticePacketText(branch.waveLattice);
  branch.waveCascadePacketText = buildWaveCascadePacketText(branch.waveCascade);
  branch.sessionCapsulePacketText = buildSessionCapsulePacketText(branch.sessionCapsule);
  branch.controlPanelPacketText = buildControlPanelPacketText(branch.controlPanel);
  branch.asolariaHandoffPacketText = buildAsolariaHandoffPacketText(branch.asolariaHandoff);
  branch.plannerWavePacketText = buildPlannerWavePacketText(branch.plannerWave);
  branch.legacyReferenceWavePacketText = buildLegacyReferenceWavePacketText(branch.legacyReferenceWave);
  branch.deepArchiveReplayPacketText = buildDeepArchiveReplayPacketText(branch.deepArchiveReplay);
  branch.deepArchiveFindingsPacketText = buildDeepArchiveFindingsPacketText(branch.deepArchiveFindings);
  branch.scoutSixPacketText = buildScoutSixPacketText(branch.scoutSix);
  branch.frontBackWavePacketText = buildFrontBackWavePacketText(branch.frontBackWave);
  branch.mapMapMappedScanningPacketText = buildMapMapMappedScanningPacketText(branch.mapMapMappedScanning);
  return branch;
}

function getOmniPartLanguageBranchPath(options = {}) {
  const requested = cleanText(options.outputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-part-language-branch.json");
}

function getOmniPartLanguageBranchPacketPath(options = {}) {
  const requested = cleanText(options.packetOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-part-language-branch.packet.txt");
}

function getOmniPartLanguageSessionCapsulePath(options = {}) {
  const requested = cleanText(options.sessionCapsuleOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "liris-session-capsule.json");
}

function getOmniPartLanguageSessionCapsulePacketPath(options = {}) {
  const requested = cleanText(options.sessionCapsulePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "liris-session-capsule.packet.txt");
}

function getAnalysisMemoryPath(options = {}) {
  const requested = cleanText(options.analysisMemoryOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "analysis-memory.json");
}

function getAnalysisMemoryPacketPath(options = {}) {
  const requested = cleanText(options.analysisMemoryPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "analysis-memory.packet.txt");
}

function getAncestryMemoryPath(options = {}) {
  const requested = cleanText(options.ancestryMemoryOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "ancestry-memory.json");
}

function getAncestryMemoryPacketPath(options = {}) {
  const requested = cleanText(options.ancestryMemoryPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "ancestry-memory.packet.txt");
}

function getTimestampMemoryPath(options = {}) {
  const requested = cleanText(options.timestampMemoryOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "timestamp-memory.json");
}

function getTimestampMemoryPacketPath(options = {}) {
  const requested = cleanText(options.timestampMemoryPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "timestamp-memory.packet.txt");
}

function getExpansionKnowledgePath(options = {}) {
  const requested = cleanText(options.expansionKnowledgeOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "expansion-knowledge.json");
}

function getExpansionKnowledgePacketPath(options = {}) {
  const requested = cleanText(options.expansionKnowledgePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "expansion-knowledge.packet.txt");
}

function getAdminReflectionTrainingPath(options = {}) {
  const requested = cleanText(options.adminReflectionTrainingOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "admin-reflection-training.json");
}

function getAdminReflectionTrainingPacketPath(options = {}) {
  const requested = cleanText(options.adminReflectionTrainingPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "admin-reflection-training.packet.txt");
}

function getResearchAnalysisPath(options = {}) {
  const requested = cleanText(options.researchAnalysisOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-research-analysis.json");
}

function getResearchAnalysisPacketPath(options = {}) {
  const requested = cleanText(options.researchAnalysisPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-research-analysis.packet.txt");
}

function getLanguageGapAnalysisPath(options = {}) {
  const requested = cleanText(options.languageGapAnalysisOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-language-gap-analysis.json");
}

function getLanguageGapAnalysisPacketPath(options = {}) {
  const requested = cleanText(options.languageGapAnalysisPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-language-gap-analysis.packet.txt");
}

function getShannonPartInspectionPath(options = {}) {
  const requested = cleanText(options.shannonPartInspectionOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-shannon-part-inspection.json");
}

function getShannonPartInspectionPacketPath(options = {}) {
  const requested = cleanText(options.shannonPartInspectionPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-shannon-part-inspection.packet.txt");
}

function getShannonPartFindingsPath(options = {}) {
  const requested = cleanText(options.shannonPartFindingsOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-shannon-part-findings.json");
}

function getShannonPartFindingsPacketPath(options = {}) {
  const requested = cleanText(options.shannonPartFindingsPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-shannon-part-findings.packet.txt");
}

function getOmniLanguageRevisionPath(options = {}) {
  const requested = cleanText(options.omniLanguageRevisionOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-language-revision.json");
}

function getOmniLanguageRevisionPacketPath(options = {}) {
  const requested = cleanText(options.omniLanguageRevisionPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-language-revision.packet.txt");
}

function getRevisionDeploymentPath(options = {}) {
  const requested = cleanText(options.revisionDeploymentOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-revision-deployment.json");
}

function getRevisionDeploymentPacketPath(options = {}) {
  const requested = cleanText(options.revisionDeploymentPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-revision-deployment.packet.txt");
}

function getDeploymentFeedbackPath(options = {}) {
  const requested = cleanText(options.deploymentFeedbackOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-deployment-feedback.json");
}

function getDeploymentFeedbackPacketPath(options = {}) {
  const requested = cleanText(options.deploymentFeedbackPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-deployment-feedback.packet.txt");
}

function getFeedbackWaveCyclePath(options = {}) {
  const requested = cleanText(options.feedbackWaveCycleOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-wave-cycle.json");
}

function getFeedbackWaveCyclePacketPath(options = {}) {
  const requested = cleanText(options.feedbackWaveCyclePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-wave-cycle.packet.txt");
}

function getFeedbackReturnMintPath(options = {}) {
  const requested = cleanText(options.feedbackReturnMintOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-mint.json");
}

function getFeedbackReturnMintPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnMintPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-mint.packet.txt");
}

function getFeedbackReturnRedeployPath(options = {}) {
  const requested = cleanText(options.feedbackReturnRedeployOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-redeploy.json");
}

function getFeedbackReturnRedeployPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnRedeployPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-redeploy.packet.txt");
}

function getFeedbackReturnFindingsPath(options = {}) {
  const requested = cleanText(options.feedbackReturnFindingsOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-findings.json");
}

function getFeedbackReturnFindingsPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnFindingsPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-findings.packet.txt");
}

function getFeedbackReturnPressurePath(options = {}) {
  const requested = cleanText(options.feedbackReturnPressureOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-pressure.json");
}

function getFeedbackReturnPressurePacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPressurePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-pressure.packet.txt");
}

function getFeedbackReturnPressureCyclePath(options = {}) {
  const requested = cleanText(options.feedbackReturnPressureCycleOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-pressure-cycle.json");
}

function getFeedbackReturnPressureCyclePacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPressureCyclePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-pressure-cycle.packet.txt");
}

function getFeedbackReturnPressurePatchPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPressurePatchOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-pressure-patch.json");
}

function getFeedbackReturnPressurePatchPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPressurePatchPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-pressure-patch.packet.txt");
}

function getFeedbackReturnPatchApplyPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply.json");
}

function getFeedbackReturnPatchApplyPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply.packet.txt");
}

function getFeedbackReturnPatchApplyFindingsPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyFindingsOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-findings.json");
}

function getFeedbackReturnPatchApplyFindingsPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyFindingsPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-findings.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressureOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure.json");
}

function getFeedbackReturnPatchApplyPressurePacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure.packet.txt");
}

function getFeedbackReturnPatchApplyPressureCyclePath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressureCycleOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-cycle.json");
}

function getFeedbackReturnPatchApplyPressureCyclePacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressureCyclePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-cycle.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch.json");
}

function getFeedbackReturnPatchApplyPressurePatchPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyFindingsPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyFindingsOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-findings.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyFindingsPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyFindingsPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-findings.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressureOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressureCycleOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-cycle.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-cycle.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply-findings.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply-findings.packet.txt");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply-pressure.json");
}

function getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketPath(options = {}) {
  const requested = cleanText(options.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-feedback-return-patch-apply-pressure-patch-apply-pressure-patch-apply-pressure.packet.txt");
}

function getWaveAgentClassesPath(options = {}) {
  const requested = cleanText(options.waveAgentClassesOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-wave-agent-classes.json");
}

function getWaveAgentClassesPacketPath(options = {}) {
  const requested = cleanText(options.waveAgentClassesPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-wave-agent-classes.packet.txt");
}

function getOmniLanguagePlanesPath(options = {}) {
  const requested = cleanText(options.omniLanguagePlanesOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-language-fabric.json");
}

function getOmniLanguagePlanesPacketPath(options = {}) {
  const requested = cleanText(options.omniLanguagePlanesPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-language-fabric.packet.txt");
}

function getOmniControlPanelPath(options = {}) {
  const requested = cleanText(options.controlPanelOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "control-panel-language.json");
}

function getOmniControlPanelPacketPath(options = {}) {
  const requested = cleanText(options.controlPanelPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "control-panel-language.packet.txt");
}

function getAsolariaHandoffPath(options = {}) {
  const requested = cleanText(options.asolariaHandoffOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "asolaria-usb-control-panel-handoff.json");
}

function getAsolariaHandoffPacketPath(options = {}) {
  const requested = cleanText(options.asolariaHandoffPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "asolaria-usb-control-panel-handoff.packet.txt");
}

function getOmniPlannerWavePath(options = {}) {
  const requested = cleanText(options.plannerWaveOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-planner-wave.json");
}

function getOmniPlannerWavePacketPath(options = {}) {
  const requested = cleanText(options.plannerWavePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-planner-wave.packet.txt");
}

function getWaveLatticePath(options = {}) {
  const requested = cleanText(options.waveLatticeOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-wave-lattice.json");
}

function getWaveLatticePacketPath(options = {}) {
  const requested = cleanText(options.waveLatticePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-wave-lattice.packet.txt");
}

function getWaveCascadePath(options = {}) {
  const requested = cleanText(options.waveCascadeOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-wave-cascade.json");
}

function getWaveCascadePacketPath(options = {}) {
  const requested = cleanText(options.waveCascadePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-wave-cascade.packet.txt");
}

function getOmniLegacyReferenceWavePath(options = {}) {
  const requested = cleanText(options.legacyReferenceWaveOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-legacy-reference-wave.json");
}

function getOmniLegacyReferenceWavePacketPath(options = {}) {
  const requested = cleanText(options.legacyReferenceWavePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-legacy-reference-wave.packet.txt");
}

function getDeepArchiveReplayPath(options = {}) {
  const requested = cleanText(options.deepArchiveReplayOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "deep-archive-replay.json");
}

function getDeepArchiveReplayPacketPath(options = {}) {
  const requested = cleanText(options.deepArchiveReplayPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "deep-archive-replay.packet.txt");
}

function getDeepArchiveFindingsPath(options = {}) {
  const requested = cleanText(options.deepArchiveFindingsOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "deep-archive-findings.json");
}

function getDeepArchiveFindingsPacketPath(options = {}) {
  const requested = cleanText(options.deepArchiveFindingsPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "deep-archive-findings.packet.txt");
}

function getDeepArchiveDeltaPath(options = {}) {
  const requested = cleanText(options.deepArchiveDeltaOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "deep-archive-delta.json");
}

function getDeepArchiveDeltaPacketPath(options = {}) {
  const requested = cleanText(options.deepArchiveDeltaPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "deep-archive-delta.packet.txt");
}

function getOmniScoutSixPath(options = {}) {
  const requested = cleanText(options.scoutSixOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-scout-six.json");
}

function getOmniScoutSixPacketPath(options = {}) {
  const requested = cleanText(options.scoutSixPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-scout-six.packet.txt");
}

function getOmniFrontBackWavePath(options = {}) {
  const requested = cleanText(options.frontBackWaveOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-front-back-wave.json");
}

function getOmniFrontBackWavePacketPath(options = {}) {
  const requested = cleanText(options.frontBackWavePacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "omni-front-back-wave.packet.txt");
}

function getMapMapMappedScanningPath(options = {}) {
  const requested = cleanText(options.mapMapMappedScanningOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "map-map-mapped-scanning.json");
}

function getMapMapMappedScanningPacketPath(options = {}) {
  const requested = cleanText(options.mapMapMappedScanningPacketOutputPath, 2000);
  if (requested) {
    return path.resolve(requested);
  }
  return resolveDataPath("omni-language-branch", "map-map-mapped-scanning.packet.txt");
}

function writeJsonAtomic(targetPath, payload) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, targetPath);
}

function writeOmniPartLanguageBranch(options = {}) {
  const branch = buildOmniPartLanguageBranch(options);
  const outputPath = getOmniPartLanguageBranchPath(options);
  const packetPath = getOmniPartLanguageBranchPacketPath(options);
  const analysisMemoryPath = getAnalysisMemoryPath(options);
  const analysisMemoryPacketPath = getAnalysisMemoryPacketPath(options);
  const ancestryMemoryPath = getAncestryMemoryPath(options);
  const ancestryMemoryPacketPath = getAncestryMemoryPacketPath(options);
  const timestampMemoryPath = getTimestampMemoryPath(options);
  const timestampMemoryPacketPath = getTimestampMemoryPacketPath(options);
  const expansionKnowledgePath = getExpansionKnowledgePath(options);
  const expansionKnowledgePacketPath = getExpansionKnowledgePacketPath(options);
  const adminReflectionTrainingPath = getAdminReflectionTrainingPath(options);
  const adminReflectionTrainingPacketPath = getAdminReflectionTrainingPacketPath(options);
  const researchAnalysisPath = getResearchAnalysisPath(options);
  const researchAnalysisPacketPath = getResearchAnalysisPacketPath(options);
  const languageGapAnalysisPath = getLanguageGapAnalysisPath(options);
  const languageGapAnalysisPacketPath = getLanguageGapAnalysisPacketPath(options);
  const shannonPartInspectionPath = getShannonPartInspectionPath(options);
  const shannonPartInspectionPacketPath = getShannonPartInspectionPacketPath(options);
  const shannonPartFindingsPath = getShannonPartFindingsPath(options);
  const shannonPartFindingsPacketPath = getShannonPartFindingsPacketPath(options);
  const omniLanguageRevisionPath = getOmniLanguageRevisionPath(options);
  const omniLanguageRevisionPacketPath = getOmniLanguageRevisionPacketPath(options);
  const revisionDeploymentPath = getRevisionDeploymentPath(options);
  const revisionDeploymentPacketPath = getRevisionDeploymentPacketPath(options);
  const deploymentFeedbackPath = getDeploymentFeedbackPath(options);
  const deploymentFeedbackPacketPath = getDeploymentFeedbackPacketPath(options);
  const feedbackWaveCyclePath = getFeedbackWaveCyclePath(options);
  const feedbackWaveCyclePacketPath = getFeedbackWaveCyclePacketPath(options);
  const feedbackReturnMintPath = getFeedbackReturnMintPath(options);
  const feedbackReturnMintPacketPath = getFeedbackReturnMintPacketPath(options);
  const feedbackReturnRedeployPath = getFeedbackReturnRedeployPath(options);
  const feedbackReturnRedeployPacketPath = getFeedbackReturnRedeployPacketPath(options);
  const feedbackReturnFindingsPath = getFeedbackReturnFindingsPath(options);
  const feedbackReturnFindingsPacketPath = getFeedbackReturnFindingsPacketPath(options);
  const feedbackReturnPressurePath = getFeedbackReturnPressurePath(options);
  const feedbackReturnPressurePacketPath = getFeedbackReturnPressurePacketPath(options);
  const feedbackReturnPressureCyclePath = getFeedbackReturnPressureCyclePath(options);
  const feedbackReturnPressureCyclePacketPath = getFeedbackReturnPressureCyclePacketPath(options);
  const feedbackReturnPressurePatchPath = getFeedbackReturnPressurePatchPath(options);
  const feedbackReturnPressurePatchPacketPath = getFeedbackReturnPressurePatchPacketPath(options);
  const feedbackReturnPatchApplyPath = getFeedbackReturnPatchApplyPath(options);
  const feedbackReturnPatchApplyPacketPath = getFeedbackReturnPatchApplyPacketPath(options);
  const feedbackReturnPatchApplyFindingsPath = getFeedbackReturnPatchApplyFindingsPath(options);
  const feedbackReturnPatchApplyFindingsPacketPath = getFeedbackReturnPatchApplyFindingsPacketPath(options);
  const feedbackReturnPatchApplyPressurePath = getFeedbackReturnPatchApplyPressurePath(options);
  const feedbackReturnPatchApplyPressurePacketPath = getFeedbackReturnPatchApplyPressurePacketPath(options);
  const feedbackReturnPatchApplyPressureCyclePath = getFeedbackReturnPatchApplyPressureCyclePath(options);
  const feedbackReturnPatchApplyPressureCyclePacketPath = getFeedbackReturnPatchApplyPressureCyclePacketPath(options);
  const feedbackReturnPatchApplyPressurePatchPath = getFeedbackReturnPatchApplyPressurePatchPath(options);
  const feedbackReturnPatchApplyPressurePatchPacketPath = getFeedbackReturnPatchApplyPressurePatchPacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPath = getFeedbackReturnPatchApplyPressurePatchApplyPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPacketPath = getFeedbackReturnPatchApplyPressurePatchApplyPacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyFindingsPath = getFeedbackReturnPatchApplyPressurePatchApplyFindingsPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyFindingsPacketPath = getFeedbackReturnPatchApplyPressurePatchApplyFindingsPacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePacketPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressureCyclePath = getFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketPath = getFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketPath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePath(options);
  const feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketPath = getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketPath(options);
  const waveAgentClassesPath = getWaveAgentClassesPath(options);
  const waveAgentClassesPacketPath = getWaveAgentClassesPacketPath(options);
  const omniLanguagePlanesPath = getOmniLanguagePlanesPath(options);
  const omniLanguagePlanesPacketPath = getOmniLanguagePlanesPacketPath(options);
  const sessionCapsulePath = getOmniPartLanguageSessionCapsulePath(options);
  const sessionCapsulePacketPath = getOmniPartLanguageSessionCapsulePacketPath(options);
  const controlPanelPath = getOmniControlPanelPath(options);
  const controlPanelPacketPath = getOmniControlPanelPacketPath(options);
  const asolariaHandoffPath = getAsolariaHandoffPath(options);
  const asolariaHandoffPacketPath = getAsolariaHandoffPacketPath(options);
  const plannerWavePath = getOmniPlannerWavePath(options);
  const plannerWavePacketPath = getOmniPlannerWavePacketPath(options);
  const waveLatticePath = getWaveLatticePath(options);
  const waveLatticePacketPath = getWaveLatticePacketPath(options);
  const waveCascadePath = getWaveCascadePath(options);
  const waveCascadePacketPath = getWaveCascadePacketPath(options);
  const legacyReferenceWavePath = getOmniLegacyReferenceWavePath(options);
  const legacyReferenceWavePacketPath = getOmniLegacyReferenceWavePacketPath(options);
  const deepArchiveReplayPath = getDeepArchiveReplayPath(options);
  const deepArchiveReplayPacketPath = getDeepArchiveReplayPacketPath(options);
  const deepArchiveFindingsPath = getDeepArchiveFindingsPath(options);
  const deepArchiveFindingsPacketPath = getDeepArchiveFindingsPacketPath(options);
  const deepArchiveDeltaPath = getDeepArchiveDeltaPath(options);
  const deepArchiveDeltaPacketPath = getDeepArchiveDeltaPacketPath(options);
  const scoutSixPath = getOmniScoutSixPath(options);
  const scoutSixPacketPath = getOmniScoutSixPacketPath(options);
  const frontBackWavePath = getOmniFrontBackWavePath(options);
  const frontBackWavePacketPath = getOmniFrontBackWavePacketPath(options);
  const mapMapMappedScanningPath = getMapMapMappedScanningPath(options);
  const mapMapMappedScanningPacketPath = getMapMapMappedScanningPacketPath(options);
  writeJsonAtomic(outputPath, branch);
  writeJsonAtomic(analysisMemoryPath, branch.analysisMemory);
  writeJsonAtomic(ancestryMemoryPath, branch.ancestryMemory);
  writeJsonAtomic(timestampMemoryPath, branch.timestampMemory);
  writeJsonAtomic(expansionKnowledgePath, branch.expansionKnowledge);
  writeJsonAtomic(adminReflectionTrainingPath, branch.adminReflectionTraining);
  writeJsonAtomic(researchAnalysisPath, branch.researchAnalysis);
  writeJsonAtomic(languageGapAnalysisPath, branch.languageGapAnalysis);
  writeJsonAtomic(shannonPartInspectionPath, branch.shannonPartInspection);
  writeJsonAtomic(shannonPartFindingsPath, branch.shannonPartFindings);
  writeJsonAtomic(omniLanguageRevisionPath, branch.omniLanguageRevision);
  writeJsonAtomic(revisionDeploymentPath, branch.revisionDeployment);
  writeJsonAtomic(deploymentFeedbackPath, branch.deploymentFeedback);
  writeJsonAtomic(feedbackWaveCyclePath, branch.feedbackWaveCycle);
  writeJsonAtomic(feedbackReturnMintPath, branch.feedbackReturnMint);
  writeJsonAtomic(feedbackReturnRedeployPath, branch.feedbackReturnRedeploy);
  writeJsonAtomic(feedbackReturnFindingsPath, branch.feedbackReturnFindings);
  writeJsonAtomic(feedbackReturnPressurePath, branch.feedbackReturnPressure);
  writeJsonAtomic(feedbackReturnPressureCyclePath, branch.feedbackReturnPressureCycle);
  writeJsonAtomic(feedbackReturnPressurePatchPath, branch.feedbackReturnPressurePatch);
  writeJsonAtomic(feedbackReturnPatchApplyPath, branch.feedbackReturnPatchApply);
  writeJsonAtomic(feedbackReturnPatchApplyFindingsPath, branch.feedbackReturnPatchApplyFindings);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePath, branch.feedbackReturnPatchApplyPressure);
  writeJsonAtomic(feedbackReturnPatchApplyPressureCyclePath, branch.feedbackReturnPatchApplyPressureCycle);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchPath, branch.feedbackReturnPatchApplyPressurePatch);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyPath, branch.feedbackReturnPatchApplyPressurePatchApply);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyFindingsPath, branch.feedbackReturnPatchApplyPressurePatchApplyFindings);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyPressurePath, branch.feedbackReturnPatchApplyPressurePatchApplyPressure);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyPressureCyclePath, branch.feedbackReturnPatchApplyPressurePatchApplyPressureCycle);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyPressurePatchPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatch);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApply);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindings);
  writeJsonAtomic(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressure);
  writeJsonAtomic(waveAgentClassesPath, branch.waveAgentClasses);
  writeJsonAtomic(omniLanguagePlanesPath, branch.omniLanguagePlanes);
  writeJsonAtomic(sessionCapsulePath, branch.sessionCapsule);
  writeJsonAtomic(controlPanelPath, branch.controlPanel);
  writeJsonAtomic(asolariaHandoffPath, branch.asolariaHandoff);
  writeJsonAtomic(plannerWavePath, branch.plannerWave);
  writeJsonAtomic(waveLatticePath, branch.waveLattice);
  writeJsonAtomic(waveCascadePath, branch.waveCascade);
  writeJsonAtomic(legacyReferenceWavePath, branch.legacyReferenceWave);
  writeJsonAtomic(deepArchiveReplayPath, branch.deepArchiveReplay);
  writeJsonAtomic(deepArchiveFindingsPath, branch.deepArchiveFindings);
  writeJsonAtomic(deepArchiveDeltaPath, branch.deepArchiveDelta);
  writeJsonAtomic(scoutSixPath, branch.scoutSix);
  writeJsonAtomic(frontBackWavePath, branch.frontBackWave);
  writeJsonAtomic(mapMapMappedScanningPath, branch.mapMapMappedScanning);
  fs.mkdirSync(path.dirname(packetPath), { recursive: true });
  fs.writeFileSync(packetPath, branch.compactPacketText, "utf8");
  fs.writeFileSync(analysisMemoryPacketPath, branch.analysisMemoryPacketText, "utf8");
  fs.writeFileSync(ancestryMemoryPacketPath, branch.ancestryMemoryPacketText, "utf8");
  fs.writeFileSync(timestampMemoryPacketPath, branch.timestampMemoryPacketText, "utf8");
  fs.writeFileSync(expansionKnowledgePacketPath, branch.expansionKnowledgePacketText, "utf8");
  fs.writeFileSync(adminReflectionTrainingPacketPath, branch.adminReflectionTrainingPacketText, "utf8");
  fs.writeFileSync(researchAnalysisPacketPath, branch.researchAnalysisPacketText, "utf8");
  fs.writeFileSync(languageGapAnalysisPacketPath, branch.languageGapAnalysisPacketText, "utf8");
  fs.writeFileSync(shannonPartInspectionPacketPath, branch.shannonPartInspectionPacketText, "utf8");
  fs.writeFileSync(shannonPartFindingsPacketPath, branch.shannonPartFindingsPacketText, "utf8");
  fs.writeFileSync(omniLanguageRevisionPacketPath, branch.omniLanguageRevisionPacketText, "utf8");
  fs.writeFileSync(revisionDeploymentPacketPath, branch.revisionDeploymentPacketText, "utf8");
  fs.writeFileSync(deploymentFeedbackPacketPath, branch.deploymentFeedbackPacketText, "utf8");
  fs.writeFileSync(feedbackWaveCyclePacketPath, branch.feedbackWaveCyclePacketText, "utf8");
  fs.writeFileSync(feedbackReturnMintPacketPath, branch.feedbackReturnMintPacketText, "utf8");
  fs.writeFileSync(feedbackReturnRedeployPacketPath, branch.feedbackReturnRedeployPacketText, "utf8");
  fs.writeFileSync(feedbackReturnFindingsPacketPath, branch.feedbackReturnFindingsPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPressurePacketPath, branch.feedbackReturnPressurePacketText, "utf8");
  fs.writeFileSync(feedbackReturnPressureCyclePacketPath, branch.feedbackReturnPressureCyclePacketText, "utf8");
  fs.writeFileSync(feedbackReturnPressurePatchPacketPath, branch.feedbackReturnPressurePatchPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPacketPath, branch.feedbackReturnPatchApplyPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyFindingsPacketPath, branch.feedbackReturnPatchApplyFindingsPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePacketPath, branch.feedbackReturnPatchApplyPressurePacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressureCyclePacketPath, branch.feedbackReturnPatchApplyPressureCyclePacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchPacketPath, branch.feedbackReturnPatchApplyPressurePatchPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyPacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyFindingsPacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyFindingsPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyPressurePacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketText, "utf8");
  fs.writeFileSync(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketPath, branch.feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketText, "utf8");
  fs.writeFileSync(waveAgentClassesPacketPath, branch.waveAgentClassesPacketText, "utf8");
  fs.writeFileSync(omniLanguagePlanesPacketPath, branch.omniLanguagePlanesPacketText, "utf8");
  fs.writeFileSync(sessionCapsulePacketPath, branch.sessionCapsulePacketText, "utf8");
  fs.writeFileSync(controlPanelPacketPath, branch.controlPanelPacketText, "utf8");
  fs.writeFileSync(asolariaHandoffPacketPath, branch.asolariaHandoffPacketText, "utf8");
  fs.writeFileSync(plannerWavePacketPath, branch.plannerWavePacketText, "utf8");
  fs.writeFileSync(waveLatticePacketPath, branch.waveLatticePacketText, "utf8");
  fs.writeFileSync(waveCascadePacketPath, branch.waveCascadePacketText, "utf8");
  fs.writeFileSync(legacyReferenceWavePacketPath, branch.legacyReferenceWavePacketText, "utf8");
  fs.writeFileSync(deepArchiveReplayPacketPath, branch.deepArchiveReplayPacketText, "utf8");
  fs.writeFileSync(deepArchiveFindingsPacketPath, branch.deepArchiveFindingsPacketText, "utf8");
  fs.writeFileSync(deepArchiveDeltaPacketPath, branch.deepArchiveDeltaPacketText, "utf8");
  fs.writeFileSync(scoutSixPacketPath, branch.scoutSixPacketText, "utf8");
  fs.writeFileSync(frontBackWavePacketPath, branch.frontBackWavePacketText, "utf8");
  fs.writeFileSync(mapMapMappedScanningPacketPath, branch.mapMapMappedScanningPacketText, "utf8");
  return {
    ok: true,
    branch,
    outputPath,
    relativePath: safeRelativePath(outputPath),
    packetPath,
    packetRelativePath: safeRelativePath(packetPath),
    analysisMemoryPath,
    analysisMemoryRelativePath: safeRelativePath(analysisMemoryPath),
    analysisMemoryPacketPath,
    analysisMemoryPacketRelativePath: safeRelativePath(analysisMemoryPacketPath),
    ancestryMemoryPath,
    ancestryMemoryRelativePath: safeRelativePath(ancestryMemoryPath),
    ancestryMemoryPacketPath,
    ancestryMemoryPacketRelativePath: safeRelativePath(ancestryMemoryPacketPath),
    timestampMemoryPath,
    timestampMemoryRelativePath: safeRelativePath(timestampMemoryPath),
    timestampMemoryPacketPath,
    timestampMemoryPacketRelativePath: safeRelativePath(timestampMemoryPacketPath),
    expansionKnowledgePath,
    expansionKnowledgeRelativePath: safeRelativePath(expansionKnowledgePath),
    expansionKnowledgePacketPath,
    expansionKnowledgePacketRelativePath: safeRelativePath(expansionKnowledgePacketPath),
    adminReflectionTrainingPath,
    adminReflectionTrainingRelativePath: safeRelativePath(adminReflectionTrainingPath),
    adminReflectionTrainingPacketPath,
    adminReflectionTrainingPacketRelativePath: safeRelativePath(adminReflectionTrainingPacketPath),
    researchAnalysisPath,
    researchAnalysisRelativePath: safeRelativePath(researchAnalysisPath),
    researchAnalysisPacketPath,
    researchAnalysisPacketRelativePath: safeRelativePath(researchAnalysisPacketPath),
    languageGapAnalysisPath,
    languageGapAnalysisRelativePath: safeRelativePath(languageGapAnalysisPath),
    languageGapAnalysisPacketPath,
    languageGapAnalysisPacketRelativePath: safeRelativePath(languageGapAnalysisPacketPath),
    shannonPartInspectionPath,
    shannonPartInspectionRelativePath: safeRelativePath(shannonPartInspectionPath),
    shannonPartInspectionPacketPath,
    shannonPartInspectionPacketRelativePath: safeRelativePath(shannonPartInspectionPacketPath),
    shannonPartFindingsPath,
    shannonPartFindingsRelativePath: safeRelativePath(shannonPartFindingsPath),
    shannonPartFindingsPacketPath,
    shannonPartFindingsPacketRelativePath: safeRelativePath(shannonPartFindingsPacketPath),
    omniLanguageRevisionPath,
    omniLanguageRevisionRelativePath: safeRelativePath(omniLanguageRevisionPath),
    omniLanguageRevisionPacketPath,
    omniLanguageRevisionPacketRelativePath: safeRelativePath(omniLanguageRevisionPacketPath),
    revisionDeploymentPath,
    revisionDeploymentRelativePath: safeRelativePath(revisionDeploymentPath),
    revisionDeploymentPacketPath,
    revisionDeploymentPacketRelativePath: safeRelativePath(revisionDeploymentPacketPath),
    deploymentFeedbackPath,
    deploymentFeedbackRelativePath: safeRelativePath(deploymentFeedbackPath),
    deploymentFeedbackPacketPath,
    deploymentFeedbackPacketRelativePath: safeRelativePath(deploymentFeedbackPacketPath),
    feedbackWaveCyclePath,
    feedbackWaveCycleRelativePath: safeRelativePath(feedbackWaveCyclePath),
    feedbackWaveCyclePacketPath,
    feedbackWaveCyclePacketRelativePath: safeRelativePath(feedbackWaveCyclePacketPath),
    feedbackReturnMintPath,
    feedbackReturnMintRelativePath: safeRelativePath(feedbackReturnMintPath),
    feedbackReturnMintPacketPath,
    feedbackReturnMintPacketRelativePath: safeRelativePath(feedbackReturnMintPacketPath),
    feedbackReturnRedeployPath,
    feedbackReturnRedeployRelativePath: safeRelativePath(feedbackReturnRedeployPath),
    feedbackReturnRedeployPacketPath,
    feedbackReturnRedeployPacketRelativePath: safeRelativePath(feedbackReturnRedeployPacketPath),
    feedbackReturnFindingsPath,
    feedbackReturnFindingsRelativePath: safeRelativePath(feedbackReturnFindingsPath),
    feedbackReturnFindingsPacketPath,
    feedbackReturnFindingsPacketRelativePath: safeRelativePath(feedbackReturnFindingsPacketPath),
    feedbackReturnPressurePath,
    feedbackReturnPressureRelativePath: safeRelativePath(feedbackReturnPressurePath),
    feedbackReturnPressurePacketPath,
    feedbackReturnPressurePacketRelativePath: safeRelativePath(feedbackReturnPressurePacketPath),
    feedbackReturnPressureCyclePath,
    feedbackReturnPressureCycleRelativePath: safeRelativePath(feedbackReturnPressureCyclePath),
    feedbackReturnPressureCyclePacketPath,
    feedbackReturnPressureCyclePacketRelativePath: safeRelativePath(feedbackReturnPressureCyclePacketPath),
    feedbackReturnPressurePatchPath,
    feedbackReturnPressurePatchRelativePath: safeRelativePath(feedbackReturnPressurePatchPath),
    feedbackReturnPressurePatchPacketPath,
    feedbackReturnPressurePatchPacketRelativePath: safeRelativePath(feedbackReturnPressurePatchPacketPath),
    feedbackReturnPatchApplyPath,
    feedbackReturnPatchApplyRelativePath: safeRelativePath(feedbackReturnPatchApplyPath),
    feedbackReturnPatchApplyPacketPath,
    feedbackReturnPatchApplyPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPacketPath),
    feedbackReturnPatchApplyFindingsPath,
    feedbackReturnPatchApplyFindingsRelativePath: safeRelativePath(feedbackReturnPatchApplyFindingsPath),
    feedbackReturnPatchApplyFindingsPacketPath,
    feedbackReturnPatchApplyFindingsPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyFindingsPacketPath),
    feedbackReturnPatchApplyPressurePath,
    feedbackReturnPatchApplyPressureRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePath),
    feedbackReturnPatchApplyPressurePacketPath,
    feedbackReturnPatchApplyPressurePacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePacketPath),
    feedbackReturnPatchApplyPressureCyclePath,
    feedbackReturnPatchApplyPressureCycleRelativePath: safeRelativePath(feedbackReturnPatchApplyPressureCyclePath),
    feedbackReturnPatchApplyPressureCyclePacketPath,
    feedbackReturnPatchApplyPressureCyclePacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressureCyclePacketPath),
    feedbackReturnPatchApplyPressurePatchPath,
    feedbackReturnPatchApplyPressurePatchRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchPath),
    feedbackReturnPatchApplyPressurePatchPacketPath,
    feedbackReturnPatchApplyPressurePatchPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchPacketPath),
    feedbackReturnPatchApplyPressurePatchApplyPath,
    feedbackReturnPatchApplyPressurePatchApplyRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPath),
    feedbackReturnPatchApplyPressurePatchApplyPacketPath,
    feedbackReturnPatchApplyPressurePatchApplyPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPacketPath),
    feedbackReturnPatchApplyPressurePatchApplyFindingsPath,
    feedbackReturnPatchApplyPressurePatchApplyFindingsRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyFindingsPath),
    feedbackReturnPatchApplyPressurePatchApplyFindingsPacketPath,
    feedbackReturnPatchApplyPressurePatchApplyFindingsPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyFindingsPacketPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePath,
    feedbackReturnPatchApplyPressurePatchApplyPressureRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePacketPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePacketPath),
    feedbackReturnPatchApplyPressurePatchApplyPressureCyclePath,
    feedbackReturnPatchApplyPressurePatchApplyPressureCycleRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressureCyclePath),
    feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketPath,
    feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyFindingsPacketPath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressureRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePath),
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketPath,
    feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketRelativePath: safeRelativePath(feedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketPath),
    waveAgentClassesPath,
    waveAgentClassesRelativePath: safeRelativePath(waveAgentClassesPath),
    waveAgentClassesPacketPath,
    waveAgentClassesPacketRelativePath: safeRelativePath(waveAgentClassesPacketPath),
    omniLanguagePlanesPath,
    omniLanguagePlanesRelativePath: safeRelativePath(omniLanguagePlanesPath),
    omniLanguagePlanesPacketPath,
    omniLanguagePlanesPacketRelativePath: safeRelativePath(omniLanguagePlanesPacketPath),
    sessionCapsulePath,
    sessionCapsuleRelativePath: safeRelativePath(sessionCapsulePath),
    sessionCapsulePacketPath,
    sessionCapsulePacketRelativePath: safeRelativePath(sessionCapsulePacketPath),
    controlPanelPath,
    controlPanelRelativePath: safeRelativePath(controlPanelPath),
    controlPanelPacketPath,
    controlPanelPacketRelativePath: safeRelativePath(controlPanelPacketPath),
    asolariaHandoffPath,
    asolariaHandoffRelativePath: safeRelativePath(asolariaHandoffPath),
    asolariaHandoffPacketPath,
    asolariaHandoffPacketRelativePath: safeRelativePath(asolariaHandoffPacketPath),
    plannerWavePath,
    plannerWaveRelativePath: safeRelativePath(plannerWavePath),
    plannerWavePacketPath,
    plannerWavePacketRelativePath: safeRelativePath(plannerWavePacketPath),
    waveLatticePath,
    waveLatticeRelativePath: safeRelativePath(waveLatticePath),
    waveLatticePacketPath,
    waveLatticePacketRelativePath: safeRelativePath(waveLatticePacketPath),
    waveCascadePath,
    waveCascadeRelativePath: safeRelativePath(waveCascadePath),
    waveCascadePacketPath,
    waveCascadePacketRelativePath: safeRelativePath(waveCascadePacketPath),
    legacyReferenceWavePath,
    legacyReferenceWaveRelativePath: safeRelativePath(legacyReferenceWavePath),
    legacyReferenceWavePacketPath,
    legacyReferenceWavePacketRelativePath: safeRelativePath(legacyReferenceWavePacketPath),
    deepArchiveReplayPath,
    deepArchiveReplayRelativePath: safeRelativePath(deepArchiveReplayPath),
    deepArchiveReplayPacketPath,
    deepArchiveReplayPacketRelativePath: safeRelativePath(deepArchiveReplayPacketPath),
    deepArchiveFindingsPath,
    deepArchiveFindingsRelativePath: safeRelativePath(deepArchiveFindingsPath),
    deepArchiveFindingsPacketPath,
    deepArchiveFindingsPacketRelativePath: safeRelativePath(deepArchiveFindingsPacketPath),
    deepArchiveDeltaPath,
    deepArchiveDeltaRelativePath: safeRelativePath(deepArchiveDeltaPath),
    deepArchiveDeltaPacketPath,
    deepArchiveDeltaPacketRelativePath: safeRelativePath(deepArchiveDeltaPacketPath),
    scoutSixPath,
    scoutSixRelativePath: safeRelativePath(scoutSixPath),
    scoutSixPacketPath,
    scoutSixPacketRelativePath: safeRelativePath(scoutSixPacketPath),
    frontBackWavePath,
    frontBackWaveRelativePath: safeRelativePath(frontBackWavePath),
    frontBackWavePacketPath,
    frontBackWavePacketRelativePath: safeRelativePath(frontBackWavePacketPath),
    mapMapMappedScanningPath,
    mapMapMappedScanningRelativePath: safeRelativePath(mapMapMappedScanningPath),
    mapMapMappedScanningPacketPath,
    mapMapMappedScanningPacketRelativePath: safeRelativePath(mapMapMappedScanningPacketPath)
  };
}

module.exports = {
  getAdminReflectionTrainingPacketPath,
  getAdminReflectionTrainingPath,
  getAnalysisMemoryPacketPath,
  getAnalysisMemoryPath,
  getTimestampMemoryPacketPath,
  getTimestampMemoryPath,
  getAsolariaHandoffPacketPath,
  getAsolariaHandoffPath,
  buildOmniPartLanguageBranch,
  getExpansionKnowledgePacketPath,
  getExpansionKnowledgePath,
  getLanguageGapAnalysisPacketPath,
  getLanguageGapAnalysisPath,
  getOmniLanguageRevisionPacketPath,
  getOmniLanguageRevisionPath,
  getDeploymentFeedbackPacketPath,
  getDeploymentFeedbackPath,
  getFeedbackWaveCyclePacketPath,
  getFeedbackWaveCyclePath,
  getFeedbackReturnMintPacketPath,
  getFeedbackReturnMintPath,
  getFeedbackReturnFindingsPacketPath,
  getFeedbackReturnFindingsPath,
  getFeedbackReturnPressurePacketPath,
  getFeedbackReturnPressurePath,
  getFeedbackReturnPressureCyclePacketPath,
  getFeedbackReturnPressureCyclePath,
  getFeedbackReturnPressurePatchPacketPath,
  getFeedbackReturnPressurePatchPath,
  getFeedbackReturnPatchApplyPacketPath,
  getFeedbackReturnPatchApplyPath,
  getFeedbackReturnPatchApplyFindingsPacketPath,
  getFeedbackReturnPatchApplyFindingsPath,
  getFeedbackReturnPatchApplyPressurePacketPath,
  getFeedbackReturnPatchApplyPressurePath,
  getFeedbackReturnPatchApplyPressureCyclePacketPath,
  getFeedbackReturnPatchApplyPressureCyclePath,
  getFeedbackReturnPatchApplyPressurePatchPacketPath,
  getFeedbackReturnPatchApplyPressurePatchPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPacketPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPath,
  getFeedbackReturnPatchApplyPressurePatchApplyFindingsPacketPath,
  getFeedbackReturnPatchApplyPressurePatchApplyFindingsPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePacketPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePacketPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressureCyclePath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPacketPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPacketPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePacketPath,
  getFeedbackReturnPatchApplyPressurePatchApplyPressurePatchApplyPressurePath,
  getFeedbackReturnRedeployPacketPath,
  getFeedbackReturnRedeployPath,
  getRevisionDeploymentPacketPath,
  getRevisionDeploymentPath,
  getShannonPartInspectionPacketPath,
  getShannonPartInspectionPath,
  getShannonPartFindingsPacketPath,
  getShannonPartFindingsPath,
  getOmniControlPanelPacketPath,
  getOmniControlPanelPath,
  getOmniLanguagePlanesPacketPath,
  getOmniLanguagePlanesPath,
  getMapMapMappedScanningPacketPath,
  getMapMapMappedScanningPath,
  getOmniFrontBackWavePacketPath,
  getOmniFrontBackWavePath,
  getOmniPartLanguageBranchPacketPath,
  getOmniPartLanguageBranchPath,
  getOmniPlannerWavePacketPath,
  getOmniPlannerWavePath,
  getResearchAnalysisPacketPath,
  getResearchAnalysisPath,
  getWaveAgentClassesPacketPath,
  getWaveAgentClassesPath,
  getWaveCascadePacketPath,
  getWaveCascadePath,
  getWaveLatticePacketPath,
  getWaveLatticePath,
  getOmniLegacyReferenceWavePacketPath,
  getOmniLegacyReferenceWavePath,
  getDeepArchiveReplayPacketPath,
  getDeepArchiveReplayPath,
  getDeepArchiveFindingsPacketPath,
  getDeepArchiveFindingsPath,
  getDeepArchiveDeltaPacketPath,
  getDeepArchiveDeltaPath,
  getOmniPartLanguageSessionCapsulePacketPath,
  getOmniPartLanguageSessionCapsulePath,
  getOmniScoutSixPacketPath,
  getOmniScoutSixPath,
  readOmniPartBranchConfig,
  writeOmniPartLanguageBranch
};
