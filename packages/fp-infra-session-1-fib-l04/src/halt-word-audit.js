// FIB-L04 · security · halt-word-audit-0
// "halt-word-audit-0" inferred as: zero-false-positive halt-canon auditor.
// A halt-word fires ONLY when it appears as a whole-word token (delimited by
// non-word chars or start/end), never as a substring inside a legitimate verb.
// Example: OP-HALT → fires · EVT-ACER-S2A-CADENCE-SLOW → does NOT fire.

const HALT_CANON_11 = Object.freeze([
  "HALT","BLOCKED","STALE","FAIL","DENIED","EMERGENCY","STOP","KILL","ABORT","TERMINATE","DIVERGE",
]);

function tokenize(verb) {
  return String(verb || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

function audit(verb) {
  const tokens = tokenize(verb);
  const hits = [];
  for (const t of tokens) {
    if (HALT_CANON_11.includes(t)) hits.push(t);
  }
  return { verb, tokens, halt_hit: hits.length > 0, words_hit: hits };
}

function auditStream(verbs) {
  const report = { total: 0, halts: [], clear: [], by_word: {} };
  for (const v of verbs) {
    report.total++;
    const a = audit(v);
    if (a.halt_hit) {
      report.halts.push(a);
      for (const w of a.words_hit) report.by_word[w] = (report.by_word[w] || 0) + 1;
    } else {
      report.clear.push(v);
    }
  }
  return report;
}

module.exports = { HALT_CANON_11, tokenize, audit, auditStream };
