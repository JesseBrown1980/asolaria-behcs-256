#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT, "reports");

const { getOmnispindle, resetOmnispindle, VALID_LANE_IDS } = require(path.join(ROOT, "src", "omnispindle"));
const { evaluateFileCap, summarizeFileCapStatus } = require(path.join(__dirname, "behcs-file-cap"));

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function cleanText(value, max = 200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, Math.max(1, max));
}

function nowStamp() {
  const now = new Date();
  const yyyy = String(now.getFullYear()).padStart(4, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function increment(map, key, delta = 1) {
  map[key] = Number(map[key] || 0) + delta;
}

function uniqueKeys(input) {
  return Object.keys(input || {}).filter(Boolean).sort();
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function buildMarkdown(summary) {
  const laneLabels = Object.keys(summary.laneTotals || {});
  const lines = [
    `# Omnispindle Child Fabric ${summary.runs}-Run Soak`,
    "",
    `- Timestamp: \`${summary.generatedAt}\``,
    `- Scope: \`C:\` only`,
    `- Mode: deterministic local soak; no live OpenCode child execution`,
    `- Runs: \`${summary.runs}\``,
    `- Capsules generated: \`${summary.totalCapsules}\``,
    `- Final stages: \`${summary.stageTotals.complete || 0}\` complete / \`${summary.stageTotals.failed || 0}\` failed`,
    `- Parent lanes: \`${laneLabels.join(", ") || "none"}\``,
    "",
    "## Core",
    "",
    `- All generated capsules bound to atlas lane \`${summary.atlasLaneIds.join(", ") || "unbound"}\`.`,
    `- Role surface ids observed: \`${summary.roleSurfaceIds.join(", ") || "none"}\`.`,
    `- Boss scheduler route: \`${summary.bossChannels.scheduler.join(", ") || "none"}\`.`,
    `- Boss mailbox path: \`${summary.bossChannels.mailbox.join(", ") || "none"}\`.`,
    `- Boss meeting runtime: \`${summary.bossChannels.meeting.join(", ") || "none"}\`.`,
    `- Boss meeting algorithm: \`${summary.bossChannels.meetingAlgorithm.join(", ") || "none"}\`.`,
    "",
    "## GC",
    "",
    `- File-cap status stayed \`${summary.fileCap.statusSet.join(", ") || "unknown"}\` with tracked files \`${summary.fileCap.start.trackedFiles}\` -> \`${summary.fileCap.end.trackedFiles}\`.`,
    `- Minimum remaining tracked-file budget during soak: \`${summary.fileCap.minRemaining}\`.`,
    `- GC trigger threshold from policy: \`${summary.fileCap.gcTriggerMessages}\` messages; soak reached threshold: \`${summary.fileCap.gcTriggerReached}\`.`,
    "",
    "## Outputs",
    "",
    `- Trace: \`${summary.outputs.trace}\``,
    `- JSON: \`${summary.outputs.json}\``,
    `- Latest JSON: \`${summary.outputs.latestJson}\``,
    `- Latest MD: \`${summary.outputs.latestMd}\``
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const runsArg = process.argv.find((arg) => arg.startsWith("--runs="));
  const runs = clampInt(runsArg ? runsArg.split("=").slice(1).join("=") : 2000, 2000, 1, 200000);
  const stamp = nowStamp();

  const tracePath = path.join(REPORTS_DIR, `omnispindle-child-fabric-soak-${stamp}.ndjson`);
  const jsonPath = path.join(REPORTS_DIR, `omnispindle-child-fabric-soak-${stamp}.json`);
  const latestJsonPath = path.join(REPORTS_DIR, "omnispindle-child-fabric-soak-latest.json");
  const mdPath = path.join(REPORTS_DIR, `omnispindle-child-fabric-soak-${stamp}.md`);
  const latestMdPath = path.join(REPORTS_DIR, "omnispindle-child-fabric-soak-latest.md");

  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const startFileCap = summarizeFileCapStatus(evaluateFileCap({ reason: "omnispindle_child_fabric_soak:start" }));
  const spindle = getOmnispindle({ workingDir: ROOT });

  const stageTotals = {};
  const laneTotals = {};
  const stageByLane = {};
  const atlasLaneTotals = {};
  const roleSurfaceTotals = {};
  const bossSchedulerTotals = {};
  const bossMailboxTotals = {};
  const bossMeetingTotals = {};
  const bossMeetingAlgorithmTotals = {};
  const stagePlan = ["dispatch", "start", "complete"];
  const gcSamples = [startFileCap];

  fs.writeFileSync(tracePath, "", "utf8");

  try {
    for (let index = 0; index < runs; index += 1) {
      const runNumber = index + 1;
      const laneId = VALID_LANE_IDS[index % VALID_LANE_IDS.length];
      const childIndex = (index % 6) + 1;
      const finalStage = runNumber % 10 === 0 ? "failed" : "complete";
      const stages = ["dispatch", "start", finalStage];

      increment(laneTotals, laneId);
      if (!stageByLane[laneId]) {
        stageByLane[laneId] = {};
      }

      for (const stage of stages) {
        increment(stageTotals, stage);
        increment(stageByLane[laneId], stage);

        const capsule = spindle._buildChildCapsule(
          laneId,
          childIndex,
          {
            objective: `Soak run ${runNumber} on lane ${laneId}.`,
            instructions: `Deterministic capsule-generation probe at stage ${stage}.`,
            tokenBudget: 1200 + (runNumber % 13),
            ttlMs: 90000 + ((runNumber % 5) * 1000),
            labels: ["behcs", "omnispindle", "opencode", laneId, `run-${runNumber}`]
          },
          stage
        );

        const atlasLaneId = cleanText(capsule.routeHook?.atlas?.laneId || "unbound", 80);
        const roleSurfaceId = cleanText(capsule.routeHook?.atlas?.roleSurfaceId || "", 120);
        const scheduler = cleanText(capsule.bossChannels?.scheduler?.upcomingRoute || "", 180);
        const mailbox = cleanText(capsule.bossChannels?.mailbox?.pendingPath || "", 220);
        const meeting = cleanText(capsule.bossChannels?.meeting?.roomRuntime || "", 220);
        const meetingAlgorithm = cleanText(capsule.bossChannels?.meeting?.algorithm || "", 120);

        increment(atlasLaneTotals, atlasLaneId);
        increment(roleSurfaceTotals, roleSurfaceId || "none");
        increment(bossSchedulerTotals, scheduler || "none");
        increment(bossMailboxTotals, mailbox || "none");
        increment(bossMeetingTotals, meeting || "none");
        increment(bossMeetingAlgorithmTotals, meetingAlgorithm || "none");

        const traceEntry = {
          run: runNumber,
          laneId,
          childIndex,
          stage,
          qId: capsule.qId,
          trancheId: capsule.trancheId,
          route: capsule.routeHook?.route || "",
          routeStage: capsule.routeHook?.routeStage || "",
          atlasLaneId,
          roleSurfaceId,
          scheduler,
          mailbox,
          meeting,
          meetingAlgorithm,
          scopeHash: capsule.routeHook?.scopeHash || "",
          sealSha256: capsule.sealSha256 || ""
        };
        fs.appendFileSync(tracePath, `${JSON.stringify(traceEntry)}\n`, "utf8");
      }

      if (runNumber % 100 === 0 || runNumber === runs) {
        gcSamples.push(
          summarizeFileCapStatus(evaluateFileCap({ reason: `omnispindle_child_fabric_soak:${runNumber}` }))
        );
      }
    }
  } finally {
    resetOmnispindle();
  }

  const endFileCap = summarizeFileCapStatus(evaluateFileCap({ reason: "omnispindle_child_fabric_soak:end" }));
  const fileCapStatuses = uniqueKeys(gcSamples.reduce((acc, sample) => {
    if (sample?.status) acc[sample.status] = true;
    return acc;
  }, {}));
  const minRemaining = gcSamples.reduce((min, sample) => Math.min(min, Number(sample?.remaining || 0)), Number.MAX_SAFE_INTEGER);
  const totalCapsules = Object.values(stageTotals).reduce((sum, value) => sum + Number(value || 0), 0);

  const summary = {
    ok: true,
    generatedAt: new Date().toISOString(),
    scope: "C_ONLY",
    mode: "deterministic_local_soak",
    runs,
    stagePlan,
    totalCapsules,
    laneTotals,
    stageTotals,
    stageByLane,
    atlasLaneIds: uniqueKeys(atlasLaneTotals),
    atlasLaneTotals,
    roleSurfaceIds: uniqueKeys(roleSurfaceTotals).filter((value) => value !== "none"),
    roleSurfaceTotals,
    bossChannels: {
      scheduler: uniqueKeys(bossSchedulerTotals).filter((value) => value !== "none"),
      schedulerTotals: bossSchedulerTotals,
      mailbox: uniqueKeys(bossMailboxTotals).filter((value) => value !== "none"),
      mailboxTotals: bossMailboxTotals,
      meeting: uniqueKeys(bossMeetingTotals).filter((value) => value !== "none"),
      meetingTotals: bossMeetingTotals,
      meetingAlgorithm: uniqueKeys(bossMeetingAlgorithmTotals).filter((value) => value !== "none"),
      meetingAlgorithmTotals: bossMeetingAlgorithmTotals
    },
    fileCap: {
      start: startFileCap,
      end: endFileCap,
      samples: gcSamples,
      statusSet: fileCapStatuses,
      minRemaining: Number.isFinite(minRemaining) ? minRemaining : 0,
      gcTriggerMessages: Number(endFileCap?.gcTriggerMessages || 0),
      gcTriggerReached: runs >= Number(endFileCap?.gcTriggerMessages || Number.MAX_SAFE_INTEGER)
    },
    boundary: {
      liveOpenCodeLaunches: 0,
      phoneMutation: false,
      eDriveWrites: false,
      storageBootWidening: false
    },
    outputs: {
      trace: path.relative(ROOT, tracePath).replace(/\\/g, "/"),
      json: path.relative(ROOT, jsonPath).replace(/\\/g, "/"),
      latestJson: path.relative(ROOT, latestJsonPath).replace(/\\/g, "/"),
      md: path.relative(ROOT, mdPath).replace(/\\/g, "/"),
      latestMd: path.relative(ROOT, latestMdPath).replace(/\\/g, "/")
    }
  };

  writeJson(jsonPath, summary);
  writeJson(latestJsonPath, summary);
  fs.writeFileSync(mdPath, buildMarkdown(summary), "utf8");
  fs.writeFileSync(latestMdPath, buildMarkdown(summary), "utf8");

  console.log(JSON.stringify({
    ok: true,
    runs: summary.runs,
    totalCapsules: summary.totalCapsules,
    atlasLaneIds: summary.atlasLaneIds,
    fileCapStatuses: summary.fileCap.statusSet,
    gcTriggerReached: summary.fileCap.gcTriggerReached,
    outputs: summary.outputs
  }, null, 2));
}

main();
