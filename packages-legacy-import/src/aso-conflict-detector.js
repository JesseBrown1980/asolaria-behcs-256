/** ASO Conflict Detector — auto-detects contradictions in the ASO knowledge base.
 *  Checks: near-duplicate names, circular relations, orphan topics, stale surfaces.
 *  Idempotent: skips conflicts already open for the same pair.
 *  LX chain: LX-153, LX-154, LX-170 */
const fs = require("fs");
const path = require("path");
const aso = require("./index-kernel/aso");

const STALE_MS = 24 * 60 * 60 * 1000;
const tblPath = (name) => path.join(aso.ASO_DATA_DIR, "tables", `${name}.json`);
const readRows = (name) => {
  try { return JSON.parse(fs.readFileSync(tblPath(name), "utf8")).rows || []; }
  catch (_) { return []; }
};

function levenshtein(a, b) {
  const la = a.length, lb = b.length;
  if (!la) return lb; if (!lb) return la;
  const p = Array.from({ length: lb + 1 }, (_, i) => i);
  for (let i = 1; i <= la; i++) {
    let corner = i - 1; p[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cur = Math.min(p[j] + 1, p[j - 1] + 1, corner + (a[i - 1] === b[j - 1] ? 0 : 1));
      corner = p[j]; p[j] = cur;
    }
  }
  return p[lb];
}

function conflictExists(existing, entryA, entryB) {
  return existing.some((c) => c.resolutionState === "open" &&
    ((c.entryA === entryA && c.entryB === entryB) ||
     (c.entryA === entryB && c.entryB === entryA)));
}

function addIfNew(existing, topicId, entryA, entryB, description, res) {
  if (conflictExists(existing, entryA, entryB)) { res.skipped++; return; }
  const r = aso.addConflict({ topicId, entryA, entryB, description });
  if (r.ok) {
    existing.push({ entryA, entryB, resolutionState: "open" });
    res.added++;
    res.details.push({ id: r.id, entryA, entryB, description });
  } else {
    res.errors.push({ entryA, entryB, error: r.error });
  }
}

function detectNearDuplicates(topics, ex, res) {
  for (let i = 0; i < topics.length; i++) {
    for (let j = i + 1; j < topics.length; j++) {
      const a = topics[i], b = topics[j];
      const nA = (a.name || "").toLowerCase(), nB = (b.name || "").toLowerCase();
      if (nA === nB) continue;
      const d = levenshtein(nA, nB);
      if (d > 0 && d < 3) {
        addIfNew(ex, a.asoId, a.asoId, b.asoId,
          `Near-duplicate names (distance=${d}): "${a.name}" vs "${b.name}"`, res);
      }
    }
  }
}

function detectCircularRelations(ex, res) {
  const rows = readRows("relations").filter((r) => r.active);
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.from}|${r.verb}|${r.to}`;
    const rev = `${r.to}|${r.verb}|${r.from}`;
    if (seen.has(rev)) {
      addIfNew(ex, r.from, r.from, r.to,
        `Circular relation: ${r.from} ${r.verb} ${r.to} AND reverse exists`, res);
    }
    seen.add(key);
  }
}

function detectOrphanTopics(topics, ex, res) {
  const relRows = readRows("relations");
  const obsRows = readRows("observations");
  const linked = new Set();
  for (const r of relRows) { if (r.active) { linked.add(r.from); linked.add(r.to); } }
  const observed = new Set(obsRows.map((o) => o.topicId));
  for (const t of topics) {
    if (!linked.has(t.asoId) && !observed.has(t.asoId)) {
      addIfNew(ex, t.asoId, t.asoId, "ORPHAN",
        `Orphan topic: "${t.name}" has zero relations and zero observations`, res);
    }
  }
}

function detectStaleSurfaces(ex, res) {
  const now = Date.now();
  for (const s of readRows("surfaces")) {
    const age = now - new Date(s.lastVerified || 0).getTime();
    if (age > STALE_MS) {
      addIfNew(ex, s.topicId, s.surfaceId, "STALE",
        `Stale surface: ${s.host}:${s.port} last verified ${Math.round(age / 3600000)}h ago`, res);
    }
  }
}

function detectConflicts() {
  const topics = aso.listTopics();
  const existing = readRows("conflicts");
  const r = { added: 0, skipped: 0, errors: [], details: [] };
  detectNearDuplicates(topics, existing, r);
  detectCircularRelations(existing, r);
  detectOrphanTopics(topics, existing, r);
  detectStaleSurfaces(existing, r);
  return { ok: true, topicsScanned: topics.length,
    conflictsAdded: r.added, conflictsSkipped: r.skipped,
    errors: r.errors, details: r.details };
}

module.exports = { detectConflicts };

if (require.main === module) {
  console.log("[aso-conflict-detector] Running...");
  const result = detectConflicts();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
