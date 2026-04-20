#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { buildGraphRuntimeTrainingDataset } = require("../src/graphRuntimeQuery");

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function parseBool(value, fallback = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function main() {
  const dataset = buildGraphRuntimeTrainingDataset({
    windowMinutes: readArg("windowMinutes", "1440"),
    includeLowRisk: parseBool(readArg("includeLowRisk", "1"), true),
    maxNodes: readArg("maxNodes", "72"),
    maxEdges: readArg("maxEdges", "160"),
    component: readArg("component", ""),
    action: readArg("action", ""),
    minRisk: readArg("minRisk", ""),
    cutoffAt: readArg("cutoffAt", ""),
    compareCutoffAt: readArg("compareCutoffAt", ""),
    eventLimit: readArg("eventLimit", "1200"),
    manifestLimit: readArg("manifestLimit", "500"),
    recentEventLimit: readArg("recentEventLimit", "50"),
    recentManifestLimit: readArg("recentManifestLimit", "25")
  });

  const rootDir = path.resolve(__dirname, "..");
  const outDir = path.join(rootDir, "reports", "graph-runtime-datasets");
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `graph-runtime-training-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2), "utf8");

  process.stdout.write(JSON.stringify({
    ok: true,
    outPath,
    stats: dataset.stats,
    generatedAt: dataset.generatedAt
  }, null, 2));
}

main();
