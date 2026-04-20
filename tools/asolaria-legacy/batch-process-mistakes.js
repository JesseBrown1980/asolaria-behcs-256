/**
 * batch-process-mistakes.js
 *
 * Reads data/behcs/d0-runtime/mistakes.ndjson line-by-line,
 * transforms each row to the mistake-ledger schema, and appends
 * via appendMistakeLedger (serialized, one at a time per W2 feedback).
 *
 * Usage:  node tools/batch-process-mistakes.js
 * Deploy: copy to C:\Users\acer\Asolaria\tools\ and run from project root.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const PROJECT_ROOT = path.join(__dirname, "..");
const { appendMistakeLedger } = require(path.join(PROJECT_ROOT, "src", "mistakeLedgerStore"));

const SOURCE_PATH = path.join(
  PROJECT_ROOT,
  "data",
  "behcs",
  "d0-runtime",
  "mistakes.ndjson"
);

function parseContextSafe(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function transformRow(row) {
  const ctx = parseContextSafe(row.context);

  // Extract useful fields from nested context for the ledger
  const sourceDim = ctx.source_dim || "";
  const output = ctx.output || {};

  return {
    at: row.ts || new Date().toISOString(),
    feature: "d0-runtime-migration",
    operation: (row.source_event || "unknown").toLowerCase(),
    type: (row.source_event || "mistake").toLowerCase(),
    severity: output.strict ? "high" : "medium",
    actor: "batch-process-mistakes",
    laneId: "d0-runtime",
    message: row.reason || "migrated from d0-runtime",
    code: sourceDim,
    classificationCode: "",
    context: {
      migrated_from: "data/behcs/d0-runtime/mistakes.ndjson",
      hdHits: Array.isArray(row.hdHits) ? row.hdHits.join(",") : "",
      source_dim: sourceDim,
      threshold: output.threshold != null ? output.threshold : "",
      sourceConfidence: output.sourceConfidence != null ? output.sourceConfidence : "",
      signal: ctx.signal != null ? ctx.signal : ""
    }
  };
}

async function main() {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`[FATAL] Source not found: ${SOURCE_PATH}`);
    process.exit(1);
  }

  const stats = fs.statSync(SOURCE_PATH);
  console.log(`[INFO] Source: ${SOURCE_PATH}`);
  console.log(`[INFO] Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  const rl = readline.createInterface({
    input: fs.createReadStream(SOURCE_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  let total = 0;
  let successes = 0;
  let failures = 0;
  let parseErrors = 0;
  const startTime = Date.now();

  for await (const line of rl) {
    total++;

    // Parse source row
    let row;
    try {
      row = JSON.parse(line);
    } catch (err) {
      parseErrors++;
      if (parseErrors <= 10) {
        console.error(`[PARSE_ERROR] Line ${total}: ${err.message}`);
      }
      continue;
    }

    // Transform and append (serialized — one at a time)
    try {
      const record = transformRow(row);
      const result = appendMistakeLedger(record);
      if (result.ok) {
        successes++;
      } else {
        failures++;
        if (failures <= 10) {
          console.error(`[APPEND_FAIL] Line ${total}: ${result.error}`);
        }
      }
    } catch (err) {
      failures++;
      if (failures <= 10) {
        console.error(`[ERROR] Line ${total}: ${err.message}`);
      }
    }

    // Progress log every 500 rows
    if (total % 500 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[PROGRESS] ${total} rows processed | ${successes} ok | ${failures} fail | ${parseErrors} parse_err | ${elapsed}s`
      );
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("---");
  console.log(`[DONE] Total: ${total} | Success: ${successes} | Fail: ${failures} | ParseErr: ${parseErrors} | Time: ${elapsed}s`);

  if (failures > 0 || parseErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
