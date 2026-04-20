// FIB-L03 · scheduling · classifier-gulp-wire-1500
// My inference (no peek):
//   - a classifier assigns each incoming envelope to a bucket (verb-based)
//   - the wire moves batches of 1500 envelopes from classifier → gulp consumer
//   - preserves order within a bucket; ensures no-loss + no-dupe
//   - deterministic scheduling: batches flush on 1500-count OR watermark-ts (deadline)

const CAP = 1500;

function classifyVerb(verb) {
  const v = String(verb || "").toUpperCase();
  if (!v) return "unknown";
  // halt/fail first so EVT-FAIL routes to halt, not event
  if (v.includes("HALT") || v.includes("FAIL")) return "halt";
  if (v.includes("HEARTBEAT")) return "heartbeat";
  if (v.startsWith("EVT-")) return "event";
  if (v.startsWith("OP-"))  return "op";
  return "other";
}

function createWire({ cap = CAP, onBatch, clock = () => Date.now(), watermark_ms = 2000 }) {
  const buckets = new Map();
  const seenIds = new Set();
  let lastFlush = clock();

  function add(env) {
    if (!env || !env.id) return { ok: false, reason: "no-id" };
    if (seenIds.has(env.id)) return { ok: false, reason: "dupe" };
    seenIds.add(env.id);
    const bucket = classifyVerb(env.verb || env.kind);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(env);
    const total = [...buckets.values()].reduce((a, b) => a + b.length, 0);
    if (total >= cap) return flush("cap");
    if (clock() - lastFlush >= watermark_ms) return flush("watermark");
    return { ok: true, bucket };
  }

  function flush(reason = "manual") {
    const out = {};
    let total = 0;
    for (const [k, v] of buckets) {
      if (!v.length) continue;
      out[k] = v.slice();
      total += v.length;
    }
    buckets.clear();
    lastFlush = clock();
    if (onBatch && total > 0) onBatch({ reason, total, buckets: out });
    return { ok: true, flushed: total, reason };
  }

  function stats() {
    return { pending: [...buckets.values()].reduce((a, b) => a + b.length, 0), seen: seenIds.size };
  }

  return { add, flush, stats, classifyVerb, CAP: cap };
}

module.exports = { createWire, classifyVerb, CAP };
