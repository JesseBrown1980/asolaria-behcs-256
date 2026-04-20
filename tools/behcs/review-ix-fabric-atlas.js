#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..");
const REPORTS_ROOT = path.join(ROOT, "reports");

const {
  ATLAS_PATH,
  SURFACE_REGISTRY_PATH,
  PROMOTION_QUEUE_PATH,
  loadIxFabricAtlasBundle,
  resolveIxRuntimeBinding
} = require("../../src/ixFabricAtlasStore");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeTextAtomic(filePath, text) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${String(text || "").replace(/\r/g, "").trimEnd()}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, JSON.stringify(value, null, 2));
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function normalizePathValue(value) {
  return String(value || "").trim();
}

function collectStrings(value, out = []) {
  if (value === null || value === undefined) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  for (const item of Object.values(value)) {
    collectStrings(item, out);
  }
  return out;
}

function buildGate(gate, pass, reason) {
  return {
    gate,
    status: pass ? "pass" : "fail",
    reason: String(reason || "").trim()
  };
}

function buildReviewStamp(createdAt) {
  return String(createdAt || "")
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
    .replace("T", "-")
    .replace("Z", "");
}

function runIxFabricAtlasWhiteRoomReview(options = {}) {
  const createdAt = String(options.createdAt || new Date().toISOString());
  const stamp = String(options.stamp || buildReviewStamp(createdAt));
  const reportsRoot = options.reportsRoot
    ? path.resolve(String(options.reportsRoot))
    : REPORTS_ROOT;
  const reportBase = String(options.reportBase || `ix-fabric-atlas-white-room-review-${stamp}`);
  const latestBaseName = String(options.latestBaseName || "ix-fabric-atlas-white-room-review-latest");
  const jsonPath = path.join(reportsRoot, `${reportBase}.json`);
  const mdPath = path.join(reportsRoot, `${reportBase}.md`);
  const latestJsonPath = path.join(reportsRoot, `${latestBaseName}.json`);
  const latestMdPath = path.join(reportsRoot, `${latestBaseName}.md`);

  const bundle = loadIxFabricAtlasBundle({ force: true });
  const gates = [];

  gates.push(buildGate(
    "atlas_bundle_present",
    Boolean(bundle.enabled),
    bundle.enabled ? "atlas, surface registry, and promotion queue all loaded" : "missing required atlas bundle outputs"
  ));

  const atlas = bundle.atlas || {};
  const surfaceRegistry = bundle.surfaceRegistry || {};
  const promotionQueue = bundle.promotionQueue || {};

  gates.push(buildGate(
    "ids_match_expected",
    atlas.atlasId === "ix-fabric-atlas.v1"
      && surfaceRegistry.registryId === "ix-surface-registry.v1"
      && promotionQueue.queueId === "ix-promotion-queue.v1",
    "expected atlas/surface/queue identifiers are present"
  ));

  gates.push(buildGate(
    "local_only_posture",
    atlas.status?.state === "LOCAL_ONLY_OVERLAY_FIRST"
      && atlas.status?.promotion === "DENY_UNTIL_PROOFS"
      && atlas.status?.remote === "NO_REMOTE",
    "atlas posture remains local-only and promotion-denied"
  ));

  const totalEntries = Number(atlas.summary?.totalEntries || 0);
  const archiveEntryCount = Number(atlas.summary?.archiveEntryCount || 0);
  const combinedReachableEntryCount = Number(atlas.summary?.combinedReachableEntryCount || 0);
  gates.push(buildGate(
    "count_consistency",
    combinedReachableEntryCount === totalEntries + archiveEntryCount,
    `combined reachable count ${combinedReachableEntryCount} matches total+archive ${totalEntries + archiveEntryCount}`
  ));

  const surfaceCount = Array.isArray(surfaceRegistry.surfaces) ? surfaceRegistry.surfaces.length : 0;
  const groupCount = Array.isArray(surfaceRegistry.groups) ? surfaceRegistry.groups.length : 0;
  gates.push(buildGate(
    "surface_registry_consistency",
    surfaceCount === Number(surfaceRegistry.summary?.surfaceCount || 0)
      && groupCount === Number(surfaceRegistry.summary?.groupCount || 0),
    "surface registry summary counts match concrete arrays"
  ));

  const laneIds = Array.isArray(promotionQueue.transitionLanes)
    ? promotionQueue.transitionLanes.map((lane) => String(lane.id || ""))
    : [];
  gates.push(buildGate(
    "transition_lanes_present",
    laneIds.includes("memory-index-docs") && laneIds.includes("gateway-runtime-routing"),
    "required memory/index and gateway/runtime lanes are present"
  ));

  const runtimeBinding = resolveIxRuntimeBinding({
    route: "instant_agent_spawner",
    routeStage: "spawn",
    role: "falcon",
    sourcePaths: ["src/instantAgentSpawner.js", "src/hookEventStore.js", "routes/constructions.js"]
  });
  gates.push(buildGate(
    "runtime_binding_smoke",
    runtimeBinding.enabled === true
      && runtimeBinding.laneId === "gateway-runtime-routing"
      && Array.isArray(runtimeBinding.matchingSurfaceIds)
      && runtimeBinding.matchingSurfaceIds.length >= 2,
    "instant-agent spawn route resolves to gateway-runtime-routing with matched surfaces"
  ));

  const allStrings = collectStrings({ atlas, surfaceRegistry, promotionQueue });
  const eDriveRefs = Array.from(new Set(
    allStrings
      .map((value) => normalizePathValue(value))
      .filter((value) => /^[Ee]:[\\/]/.test(value))
  )).slice(0, 25);
  gates.push(buildGate(
    "no_e_drive_paths",
    eDriveRefs.length < 1,
    eDriveRefs.length < 1 ? "no E: paths leaked into atlas outputs" : `unexpected E: paths detected (${eDriveRefs.length})`
  ));

  const projectRootNormalized = path.resolve(ROOT).toLowerCase();
  const externalSurfacePaths = Array.from(new Set(
    (surfaceRegistry.surfaces || [])
      .map((surface) => normalizePathValue(surface.absolutePath))
      .filter(Boolean)
      .filter((value) => /^[A-Za-z]:[\\/]/.test(value))
      .filter((value) => !path.resolve(value).toLowerCase().startsWith(projectRootNormalized))
  )).slice(0, 25);
  gates.push(buildGate(
    "file_surfaces_scoped_to_project",
    externalSurfacePaths.length < 1,
    externalSurfacePaths.length < 1 ? "file-backed surfaces stay within the project root" : `external surface paths detected (${externalSurfacePaths.length})`
  ));

  const promotedLane = (promotionQueue.transitionLanes || []).find((lane) =>
    String(lane.currentStage || "") === "bounded_live_promotion"
  );
  gates.push(buildGate(
    "no_live_promotion_stage",
    !promotedLane,
    promotedLane ? `lane ${promotedLane.id} is already at bounded_live_promotion` : "no transition lane claims live promotion"
  ));

  const finalStatus = gates.every((gate) => gate.status === "pass") ? "pass" : "fail_closed";
  const denyFlags = [
    "NO_PUBLIC_READY_CLAIMS",
    "NO_SECURITY_GUARANTEES",
    "NO_REMOTE",
    "PROMOTION_DENY_UNTIL_PROOFS"
  ];

  const report = {
    reviewId: "ix-fabric-atlas-white-room-review.v1",
    createdAt,
    finalStatus,
    denyFlags,
    inputs: {
      atlas: {
        path: path.relative(ROOT, ATLAS_PATH).replace(/\\/g, "/"),
        sha256: sha256File(ATLAS_PATH)
      },
      surfaceRegistry: {
        path: path.relative(ROOT, SURFACE_REGISTRY_PATH).replace(/\\/g, "/"),
        sha256: sha256File(SURFACE_REGISTRY_PATH)
      },
      promotionQueue: {
        path: path.relative(ROOT, PROMOTION_QUEUE_PATH).replace(/\\/g, "/"),
        sha256: sha256File(PROMOTION_QUEUE_PATH)
      }
    },
    verify: {
      totalEntries,
      archiveEntryCount,
      combinedReachableEntryCount,
      surfaceCount,
      groupCount,
      laneCount: laneIds.length
    },
    runtimeBinding,
    eDriveRefs,
    externalSurfacePaths,
    gateResults: gates
  };

  const markdown = [
    "# IX Fabric Atlas White-Room Review",
    "",
    `- Created: ${createdAt}`,
    `- Final status: ${finalStatus}`,
    `- Deny flags: ${denyFlags.join(", ")}`,
    `- Active canon entries: ${totalEntries}`,
    `- Archive entries: ${archiveEntryCount}`,
    `- Combined reachable entries: ${combinedReachableEntryCount}`,
    `- Surface count: ${surfaceCount} across ${groupCount} groups`,
    `- Transition lanes: ${laneIds.length}`,
    "",
    "## Runtime Binding Smoke",
    `- route: ${runtimeBinding.route || "unknown"}`,
    `- routeStage: ${runtimeBinding.routeStage || "unknown"}`,
    `- role: ${runtimeBinding.role || "unknown"}`,
    `- lane: ${runtimeBinding.laneId || "unbound"} (${runtimeBinding.laneStatus || "unknown"} / ${runtimeBinding.laneCurrentStage || "unknown"} -> ${runtimeBinding.laneNextStage || "unknown"})`,
    `- matched surfaces: ${(runtimeBinding.matchingSurfaceIds || []).join(", ") || "none"}`,
    "",
    "## Gates",
    ...gates.map((gate) => `- ${gate.gate}: ${gate.status} — ${gate.reason}`),
    "",
    "## Inputs",
    `- ${report.inputs.atlas.path} (${report.inputs.atlas.sha256})`,
    `- ${report.inputs.surfaceRegistry.path} (${report.inputs.surfaceRegistry.sha256})`,
    `- ${report.inputs.promotionQueue.path} (${report.inputs.promotionQueue.sha256})`
  ].join("\n");

  writeJsonAtomic(jsonPath, report);
  writeTextAtomic(mdPath, markdown);
  writeJsonAtomic(latestJsonPath, report);
  writeTextAtomic(latestMdPath, markdown);

  return {
    ok: true,
    createdAt,
    finalStatus,
    report,
    markdown,
    paths: {
      reportJson: jsonPath,
      reportMd: mdPath,
      latestJson: latestJsonPath,
      latestMd: latestMdPath
    }
  };
}

function main() {
  const result = runIxFabricAtlasWhiteRoomReview();
  console.log(JSON.stringify({
    ok: true,
    createdAt: result.createdAt,
    finalStatus: result.finalStatus,
    reportJson: path.relative(ROOT, result.paths.reportJson).replace(/\\/g, "/"),
    reportMd: path.relative(ROOT, result.paths.reportMd).replace(/\\/g, "/"),
    latestJson: path.relative(ROOT, result.paths.latestJson).replace(/\\/g, "/"),
    latestMd: path.relative(ROOT, result.paths.latestMd).replace(/\\/g, "/")
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  ATLAS_PATH,
  SURFACE_REGISTRY_PATH,
  PROMOTION_QUEUE_PATH,
  loadIxFabricAtlasBundle,
  resolveIxRuntimeBinding,
  runIxFabricAtlasWhiteRoomReview
};
