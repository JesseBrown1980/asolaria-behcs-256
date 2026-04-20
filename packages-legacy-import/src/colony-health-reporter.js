/**
 * Colony Health Reporter — Wires colonyAnatomy into ASO typed ops.
 *
 * Runs the colony boot sequence, then for each health check result:
 *   - Finds or creates an ASO topic for the check
 *   - Records an observation (pass/fail/warning + detail)
 *   - Creates a conflict entry for any failed checks
 *
 * Runnable: node src/colony-health-reporter.js
 * LX chain: LX-290, LX-153, LX-154
 */

const { buildColonyBody } = require("./colonyAnatomy");
const aso = require("./aso-client");

const TOPIC_PREFIX = "colony-health";
const AGENT_NAME = process.env.ASOLARIA_AGENT_NAME || "health-reporter";

// Find existing topic by name, or create a new one.
// Returns the asoId.
function findOrCreateTopic(name) {
  const result = aso.search(name, { limit: 5 });
  const matches = (result && result.matches) || [];
  const exact = matches.find(
    (m) => m.name.toLowerCase() === name.toLowerCase()
  );
  if (exact) return exact.asoId;

  const created = aso.topic(name, "topic", {
    tier: "operational",
    tags: ["colony-health", "auto-diagnostic"],
    summary: `Health check topic: ${name}`,
    createdBy: AGENT_NAME,
  });
  // If duplicate race, extract existing id from error
  if (created.ok === false && created.existingId) return created.existingId;
  if (created.ok !== false && created.id) return created.id;
  // Fallback: return whatever we got
  return (created && created.id) || name;
}

function statusLabel(checkStatus) {
  if (checkStatus === "ok") return "pass";
  if (checkStatus === "warning") return "warning";
  return "fail"; // error, critical, anything else
}

async function run() {
  console.log("--- Colony Health Reporter ---\n");

  // 1. Boot the colony body
  console.log("Booting colony anatomy...");
  const body = buildColonyBody();
  const bootResult = await body.boot();
  console.log(`Boot phase: ${bootResult.preBoot} -> ${bootResult.postBoot}`);
  console.log(`Message: ${bootResult.message}\n`);

  // 2. Run full diagnosis to get per-check results
  console.log("Running full diagnosis...");
  const diagnosis = await body.diagnoseAll();

  const summary = { total: 0, passed: 0, warned: 0, failed: 0, observed: 0 };

  // 3. Walk each system and each check
  for (const [systemName, systemResult] of Object.entries(diagnosis.results)) {
    const checks = systemResult.checks || [];
    console.log(`\n  [${systemName}] ${checks.length} checks — ${systemResult.status}`);

    for (const check of checks) {
      summary.total++;
      const label = statusLabel(check.status);
      if (label === "pass") summary.passed++;
      else if (label === "warning") summary.warned++;
      else summary.failed++;

      const topicName = `${TOPIC_PREFIX}/${systemName}/${check.name}`;

      // 3a. Find or create ASO topic
      const topicId = findOrCreateTopic(topicName);

      // 3b. Record observation
      const obsResult = aso.observe(topicId, `[${label.toUpperCase()}] ${check.detail || "no detail"}`, {
        tags: [label, systemName, "auto-diagnostic"],
        createdBy: AGENT_NAME,
      });
      if (obsResult && obsResult.ok !== false) summary.observed++;

      // 3c. If failed, create conflict so it gets flagged
      if (label === "fail") {
        aso.conflict(
          topicId,
          `expected:ok`,
          `actual:${check.status} — ${check.detail || "unknown"}`,
          { createdBy: AGENT_NAME }
        );
      }

      const icon = label === "pass" ? "+" : label === "warning" ? "~" : "!";
      console.log(`    [${icon}] ${check.name}: ${check.detail || check.status}`);
    }
  }

  // 4. Print summary
  console.log("\n--- Summary ---");
  console.log(`Total checks:  ${summary.total}`);
  console.log(`  Passed:      ${summary.passed}`);
  console.log(`  Warnings:    ${summary.warned}`);
  console.log(`  Failed:      ${summary.failed}`);
  console.log(`Observations:  ${summary.observed}`);
  console.log(`Colony status: ${diagnosis.overall}`);
  console.log(`Diagnosed at:  ${diagnosis.diagnosedAt}`);

  return summary;
}

run().catch((err) => {
  console.error("Colony health reporter failed:", err);
  process.exit(1);
});
