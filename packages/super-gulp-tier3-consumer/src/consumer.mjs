// Tier-3 reverse-gain-GNN consumer
// Reads each .ndjson in super-gulp-queue/, feeds envelopes through stage-to-actual converter,
// extracts PROMOTED (actual-bucket) envelopes as "task-candidates" for SMP-v5+ ledger.
// PROF-SUPER-GULP-SUPERVISOR room 37 · PID-H04-A01-W037000000-P037-N00001

import { readdirSync, readFileSync, appendFileSync, renameSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { convertStageToActual } from "../../stage-to-actual-converter/src/converter.mjs";

const SUPER_GULP_QUEUE = "C:/Users/acer/Asolaria/data/behcs/super-gulp-queue";
const PROCESSED_DIR    = join(SUPER_GULP_QUEUE, "processed");
const TASK_CANDIDATES_LEDGER = "C:/Users/acer/Asolaria/data/smp-v5-plus-task-candidates.ndjson";
const MAX_LINES_PER_FILE = 5000; // soft cap per file to bound processing time

export function consumeOneSuperGulpFile() {
  if (!existsSync(SUPER_GULP_QUEUE)) return { ok: false, reason: "super-gulp-queue missing" };
  if (!existsSync(PROCESSED_DIR)) mkdirSync(PROCESSED_DIR, { recursive: true });

  const files = readdirSync(SUPER_GULP_QUEUE, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".ndjson"))
    .map(e => ({ name: e.name, full: join(SUPER_GULP_QUEUE, e.name), mtime_ms: statSync(join(SUPER_GULP_QUEUE, e.name)).mtime.getTime() }))
    .sort((a, b) => a.mtime_ms - b.mtime_ms);

  if (!files.length) return { ok: true, consumed: 0, note: "queue empty" };

  const target = files[0];
  let raw;
  try { raw = readFileSync(target.full, "utf8"); } catch (e) { return { ok: false, reason: "read-fail", err: e.message }; }
  const lines = raw.split("\n").filter(Boolean).slice(0, MAX_LINES_PER_FILE);

  let actualCount = 0;
  let candidateCount = 0;
  let stageCount = 0;
  let haltCount = 0;
  const taskCandidates = [];

  for (const line of lines) {
    let env;
    try { env = JSON.parse(line); } catch { continue; }
    if (!env || typeof env !== "object") continue;
    // Skip shadow + non-ASCII verbs + milk/heartbeat noise (same rules as s2a daemon)
    const v = String(env.verb || "");
    if (!v) continue;
    if (env.mode === "shadow") continue;
    if (/[^\x20-\x7E]/.test(v)) continue;
    if (v.includes("HEARTBEAT") || v.includes("fleet-report") || v.includes("behcs.heartbeat")) continue;
    if (v === "EVT-ACER-ALIVE-AND-WORKING" || v === "falcon-milk-status" || v === "falcon-milk-report") continue;

    const result = convertStageToActual(env);
    const outcome = result.final_outcome;
    if (outcome === "actual") {
      actualCount++;
      taskCandidates.push({
        candidate_id: `tc-${Date.now()}-${actualCount}`,
        source_file: target.name,
        source_envelope_id: result.envelope_id,
        source_envelope_verb: result.envelope_verb,
        omni_score: result.omni_gnn.score,
        reverse_score: result.reverse_gnn.score,
        confidence: result.agreement.confidence,
        cube_address: result.whiteroom.cube_address,
        supervisor_chain: result.supervisor_chain,
        promoted_at: new Date().toISOString(),
      });
    } else if (outcome === "candidate") candidateCount++;
    else if (outcome === "stage") stageCount++;
    else haltCount++;
  }

  // Append task-candidates to the SMP-v5+ ledger
  for (const tc of taskCandidates) {
    try { appendFileSync(TASK_CANDIDATES_LEDGER, JSON.stringify(tc) + "\n"); } catch {}
  }

  // Move processed file
  const dstName = target.name.replace(/\.ndjson$/, `.processed-${Date.now()}.ndjson`);
  const dstPath = join(PROCESSED_DIR, dstName);
  try { renameSync(target.full, dstPath); } catch {}

  return {
    ok: true,
    consumed: target.name,
    lines_scanned: lines.length,
    task_candidates_extracted: taskCandidates.length,
    outcome_counts: { actual: actualCount, candidate: candidateCount, stage: stageCount, halt: haltCount },
    moved_to: dstPath,
  };
}

export const TIER3_CONFIG = {
  super_gulp_queue: SUPER_GULP_QUEUE,
  processed_dir: PROCESSED_DIR,
  task_candidates_ledger: TASK_CANDIDATES_LEDGER,
  max_lines_per_file: MAX_LINES_PER_FILE,
  supervisor_pid: "PID-H04-A01-W037000000-P037-N00001",
  supervisor_glyph: "PROF-SUPER-GULP-SUPERVISOR",
  hilbert_room: 37,
};
