// Item 094 · Stage runner harness · executes 23 stages in order, collects per-stage LCR

const STAGES = [
  "ingress-raw","verb-normalize","shadow-vs-real-split","stage-bucket-assign",
  "reverse-gnn-score","omni-gnn-score","agreement-check","rubber-stamp-detect",
  "promote-or-halt","cadence-feedback","halt-canon-scan","slo-gate-evaluate",
  "lens-calibrate","convergent-trap-check","resono-twin-mirror","structural-8-verb",
  "cosign-request","multi-agent-gate","bilateral-sha-record","trace-append",
  "civilization-verdict","meta-close","loop-back",
];

async function runStages(envelope, handlers) {
  const trace = [];
  let current = envelope;
  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const stageId = `S${String(i+1).padStart(2, "0")}`;
    const h = (handlers && handlers[stage]) || (async (env) => ({ ok: true, LCR: 0.5, env }));
    try {
      const res = await h(current, { stageId, trace });
      const LCR = typeof res?.LCR === "number" ? res.LCR : 0.5;
      trace.push({ stageId, stage, LCR, ts: new Date().toISOString() });
      if (res?.env) current = res.env;
      if (res?.halt === true) { trace.push({ stageId, stage, halted: true }); break; }
    } catch (e) {
      trace.push({ stageId, stage, error: String(e.message || e), LCR: 0 });
      break;
    }
  }
  return { envelope: current, trace };
}

function civilizationVerdict(trace) {
  const lcrs = trace.filter(t => typeof t.LCR === "number").map(t => t.LCR);
  if (!lcrs.length) return { verdict: "fail", reason: "no-LCR" };
  const mean = lcrs.reduce((a,b)=>a+b,0) / lcrs.length;
  const min  = Math.min(...lcrs);
  if (mean >= 0.65 && min >= 0.40) return { verdict: "pass", mean, min };
  if (mean < 0.50) return { verdict: "fail", mean, min };
  return { verdict: "mixed", mean, min };
}

module.exports = { STAGES, runStages, civilizationVerdict };
