// Item 099 · ReSono 8-verb structural twin hook
// Mirrors the 23-stage trace into an 8-verb structural summary for cross-system comparison.

const TWIN_VERBS = ["perceive", "classify", "score", "compare", "judge", "record", "attest", "close"];

function toTwin(trace) {
  const buckets = { perceive: [], classify: [], score: [], compare: [], judge: [], record: [], attest: [], close: [] };
  for (const t of trace) {
    if (!t.stageId) continue;
    const n = parseInt(t.stageId.slice(1), 10);
    if (n <= 2)       buckets.perceive.push(t);
    else if (n <= 4)  buckets.classify.push(t);
    else if (n <= 6)  buckets.score.push(t);
    else if (n <= 8)  buckets.compare.push(t);
    else if (n <= 12) buckets.judge.push(t);
    else if (n <= 16) buckets.record.push(t);
    else if (n <= 20) buckets.attest.push(t);
    else              buckets.close.push(t);
  }
  return { verbs: TWIN_VERBS, buckets };
}

module.exports = { toTwin, TWIN_VERBS };
