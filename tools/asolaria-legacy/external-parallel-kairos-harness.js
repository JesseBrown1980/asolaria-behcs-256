#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const { projectRoot, instanceRoot } = require("../src/runtimePaths");

const DEFAULT_INPUT_PATH = path.join(
  projectRoot,
  "data",
  "omni-processor",
  "paper-draft",
  "incoming",
  "external-parallel-reddit-kairos-white-room-2026-04-10.json"
);
const DEFAULT_MAP_PATH = path.join(
  projectRoot,
  "data",
  "omni-processor",
  "paper-draft",
  "incoming",
  "hilbert-omni-35D.json"
);
const DEFAULT_OUTPUT_ROOT = path.join(instanceRoot, "runtime", "external-parallel-kairos");
const DEFAULT_PLAN_ID = "IX-489";
const DEFAULT_TOOL_ID = "IX-490";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/g)
    .filter((token) => token && token.length >= 3);
}

function collectScalarStrings(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectScalarStrings(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(String(key));
      collectScalarStrings(item, out);
    }
    return out;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
  }
  return out;
}

function buildCanonicalTuple(projection = {}) {
  const order = [
    "D1_ACTOR",
    "D3_TARGET",
    "D6_GATE",
    "D9_WAVE",
    "D10_DIALECT",
    "D11_PROOF",
    "D12_SCOPE",
    "D22_TRANSLATION",
    "D24_INTENT",
    "D35_HYPERLANGUAGE"
  ];
  return order.map((key) => ({
    dimension: key,
    values: Array.isArray(projection[key]) ? projection[key].slice() : []
  }));
}

function computeMotifOverlap(intake, hyperlanguageMap) {
  const corpusStrings = collectScalarStrings(hyperlanguageMap);
  const corpusTokens = new Set();
  for (const entry of corpusStrings) {
    for (const token of tokenize(entry)) {
      corpusTokens.add(token);
    }
  }

  const motifMatches = [];
  const motifMisses = [];
  for (const motif of intake.observedMotifs || []) {
    const motifTokens = tokenize(motif);
    const matchedTokens = motifTokens.filter((token) => corpusTokens.has(token));
    const record = {
      motif,
      matchedTokens
    };
    if (matchedTokens.length > 0) {
      motifMatches.push(record);
    } else {
      motifMisses.push(record);
    }
  }

  const overlapTokens = [...new Set(motifMatches.flatMap((entry) => entry.matchedTokens))].sort();
  return {
    motifMatches,
    motifMisses,
    overlapTokens,
    overlapTokenCount: overlapTokens.length
  };
}

function buildPlan(intake) {
  return {
    planId: DEFAULT_PLAN_ID,
    waveShape: "6x6x6x6x6x12",
    objective: "Integrate the external KAIROS screenshot bundle as a bounded sidecar, orchestrate mirrored intake on LIRIS, test tuple stability, and review without mutating canon.",
    phases: [
      {
        name: "integrate",
        law: "index_sidecar_without_canon_mutation",
        outputs: [
          "agent-index reference entry",
          "runtime packet and manifest",
          "bounded tuple projection"
        ]
      },
      {
        name: "orchestrate",
        law: "relay_bounded_rule_to_liris",
        outputs: [
          "LIRIS inbox packet",
          "shared sidecar classification",
          "mirrored keep-not-import law"
        ]
      },
      {
        name: "test",
        law: "stable_tuple_and_no_canon_drift",
        outputs: [
          "unit test for harness output",
          "classification assertion",
          "projection persistence check"
        ]
      },
      {
        name: "review",
        law: "benchmark_yes_runtime_import_no",
        outputs: [
          "review artifact",
          "watch/keep decision",
          "next-step recommendation"
        ]
      }
    ],
    doNotDo: intake.doNotUseFor || []
  };
}

function buildReview(intake, overlap, tuple) {
  return {
    reviewState: "bounded_sidecar_approved",
    recommendation: "keep_for_benchmark_and_translation_tests_not_execution",
    promoteToCanon: Boolean(intake?.decision?.promoteToCanon),
    mutate35DMap: Boolean(intake?.decision?.mutate35DMap),
    screenshotCount: Array.isArray(intake.screenshots) ? intake.screenshots.length : 0,
    motifCount: Array.isArray(intake.observedMotifs) ? intake.observedMotifs.length : 0,
    overlapTokenCount: overlap.overlapTokenCount,
    overlapTokens: overlap.overlapTokens,
    tupleDimensions: tuple.map((entry) => entry.dimension),
    recommendedUses: intake.whiteRoomUse || [],
    doNotUseFor: intake.doNotUseFor || []
  };
}

function buildPacket(manifest, review) {
  return [
    "EXTERNAL PARALLEL KAIROS WAVE",
    `artifact_id=${manifest.artifactId}`,
    `material_id=${manifest.materialId}`,
    `class=${manifest.classification}`,
    `plan_id=${manifest.planId}`,
    `tool_id=${manifest.toolId}`,
    `wave_shape=${manifest.waveShape}`,
    `screenshot_count=${manifest.screenshotCount}`,
    `motif_count=${manifest.motifCount}`,
    `overlap_token_count=${review.overlapTokenCount}`,
    `overlap_tokens=${review.overlapTokens.join("|") || "none"}`,
    `review_state=${review.reviewState}`,
    `recommendation=${review.recommendation}`,
    "law=keep_for_benchmark_translation_and_filter_tests_only",
    "canon_rule=do_not_mutate_hilbert_omni_35D_from_screenshots_alone"
  ].join("\n");
}

function runWave(options = {}) {
  const inputPath = path.resolve(options.inputPath || DEFAULT_INPUT_PATH);
  const mapPath = path.resolve(options.mapPath || DEFAULT_MAP_PATH);
  const outputRoot = path.resolve(options.outputRoot || DEFAULT_OUTPUT_ROOT);
  const intake = options.intake || readJson(inputPath);
  const hyperlanguageMap = options.hyperlanguageMap || readJson(mapPath);

  const tuple = buildCanonicalTuple(intake?.hyperlanguageProjection?.projection || {});
  const overlap = computeMotifOverlap(intake, hyperlanguageMap);
  const plan = buildPlan(intake);
  const review = buildReview(intake, overlap, tuple);

  const manifest = {
    artifactId: "OMNISHANNON-EXTERNAL-PARALLEL-KAIROS-WAVE-20260410",
    materialId: intake.materialId || "UNKNOWN",
    classification: intake.classification || "unknown",
    usefulnessVerdict: intake.usefulnessVerdict || "unknown",
    waveShape: "6x6x6x6x6x12",
    planId: DEFAULT_PLAN_ID,
    toolId: DEFAULT_TOOL_ID,
    sourceType: intake.sourceType || "unknown",
    inputPath,
    mapPath,
    outputRoot,
    screenshotCount: Array.isArray(intake.screenshots) ? intake.screenshots.length : 0,
    motifCount: Array.isArray(intake.observedMotifs) ? intake.observedMotifs.length : 0,
    overlapTokenCount: overlap.overlapTokenCount,
    promoteToCanon: Boolean(intake?.decision?.promoteToCanon),
    mutate35DMap: Boolean(intake?.decision?.mutate35DMap),
    runtimeImportAllowed: false,
    lirisRelayRecommended: true
  };

  const packet = buildPacket(manifest, review);
  if (options.write !== false) {
    fs.mkdirSync(outputRoot, { recursive: true });
    writeJson(path.join(outputRoot, "manifest.json"), manifest);
    writeJson(path.join(outputRoot, "plan.json"), plan);
    writeJson(path.join(outputRoot, "review.json"), review);
    writeJson(path.join(outputRoot, "tuple.json"), tuple);
    fs.writeFileSync(path.join(outputRoot, "packet.txt"), `${packet}\n`, "utf8");
  }

  return {
    manifest,
    plan,
    review,
    tuple,
    packet
  };
}

function main() {
  const result = runWave();
  process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_INPUT_PATH,
  DEFAULT_MAP_PATH,
  DEFAULT_OUTPUT_ROOT,
  buildCanonicalTuple,
  buildPlan,
  buildReview,
  computeMotifOverlap,
  runWave
};
