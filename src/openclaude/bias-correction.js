// Item 173 · OpenClaude third bias-correction tier hook
// Runs between `judge` and `record`. Input: judge output. Output: possibly-adjusted verdict + bias report.

function biasCorrect(judgeOutput, peerObservations = []) {
  // Simple quorum-style correction: if 2+ peers disagree with judge, adjust.
  const judgeVerdict = judgeOutput?.verdict;
  const votes = peerObservations.map(p => p.verdict);
  const counts = {};
  for (const v of [judgeVerdict, ...votes]) counts[v] = (counts[v] || 0) + 1;
  const [majority] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [judgeVerdict, 0];
  const corrected = majority !== judgeVerdict;
  return {
    original: judgeVerdict,
    corrected_to: corrected ? majority : judgeVerdict,
    corrected,
    counts,
    peers_consulted: peerObservations.length,
    ts: new Date().toISOString(),
  };
}

module.exports = { biasCorrect };
