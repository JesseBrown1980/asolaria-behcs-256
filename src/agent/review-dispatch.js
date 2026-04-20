// Item 052 · Six-body-system review dispatcher
// For a given target (code, plan, artifact), fans out to 6 review profiles in parallel.

const BODIES = ["PLN", "EXP", "BLD", "REV", "CHAIR", "SUPERVISOR"];

async function dispatchSixBodyReview({ target, artifact_path }, callReviewer /* (role, {target, artifact_path}) => Promise */) {
  const results = await Promise.allSettled(
    BODIES.map(role => callReviewer(role, { target, artifact_path }))
  );
  const passed = results.filter(r => r.status === "fulfilled" && r.value && r.value.ok).length;
  return {
    target, artifact_path,
    by_body: Object.fromEntries(BODIES.map((role, i) => [role, results[i].status === "fulfilled" ? results[i].value : { ok: false, error: results[i].reason }])),
    consensus: passed >= 4 ? "pass" : passed >= 2 ? "mixed" : "fail",
    passed_count: passed, total: BODIES.length,
  };
}

module.exports = { dispatchSixBodyReview, BODIES };
