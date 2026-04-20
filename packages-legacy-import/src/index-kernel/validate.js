const fs = require("fs");
const path = require("path");
const { runIntegrityCheck } = require("../indexIntegrityEngine");
const { agentIndexRoot, indexKernelRoot, projectRoot, SCHEMA_VERSION } = require("./schema");
const { resolveUnifiedIndexProfile } = require("./profile");
const { searchDocuments } = require("./query");

const KERNEL_MODULE_LINE_LIMIT = 300;
const KERNEL_FACADE_LINE_LIMIT = 180;
const KERNEL_CLI_LINE_LIMIT = 180;

function validatePayloadForProfile(payload, profileInput = {}) {
  const profile = resolveUnifiedIndexProfile(profileInput);
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["payload_missing"] };
  }
  if (Number(payload.schemaVersion || 0) !== SCHEMA_VERSION) {
    errors.push(`schema_version_mismatch:${payload.schemaVersion || 0}`);
  }
  if (!Array.isArray(payload.documents)) {
    errors.push("documents_missing");
    return { ok: false, errors };
  }
  if (profile.profile === "staging") {
    if (String(payload.profile || "").toLowerCase() !== "staging") {
      errors.push(`profile_mismatch:${payload.profile || ""}`);
    }
    if (String(payload.sourceContract || "") !== profile.sourceContract) {
      errors.push(`source_contract_mismatch:${payload.sourceContract || ""}`);
    }
    for (const document of payload.documents) {
      if (document.prefix !== "LX") {
        errors.push(`staging_non_lx:${document.id}`);
        continue;
      }
      if (document.layer !== "canonical") {
        errors.push(`staging_non_canonical:${document.id}`);
      }
      if (document.sourceKind !== "canonical_lx") {
        errors.push(`staging_non_canonical_source:${document.id}`);
      }
    }
    if (Array.isArray(payload.auxiliarySourceFiles) && payload.auxiliarySourceFiles.length > 0) {
      errors.push("staging_has_auxiliary_sources");
    }
  }
  if (profile.profile === "running" || profile.profile === "prod") {
    if (String(payload.profile || "").toLowerCase() !== profile.profile) {
      errors.push(`profile_mismatch:${payload.profile || ""}`);
    }
    if (String(payload.sourceContract || "") !== profile.sourceContract) {
      errors.push(`source_contract_mismatch:${payload.sourceContract || ""}`);
    }
  }
  if (profile.profile === "running") {
    if (!payload.validated) {
      errors.push("running_not_validated");
    }
    if (String(payload.promotedFromProfile || "").toLowerCase() !== "staging") {
      errors.push(`running_invalid_source:${payload.promotedFromProfile || ""}`);
    }
  }
  return {
    ok: errors.length < 1,
    errors
  };
}

function countLines(filePath) {
  return String(fs.readFileSync(filePath, "utf8") || "").split(/\r?\n/g).length;
}

function collectKernelBudgetViolations() {
  const violations = [];
  if (fs.existsSync(indexKernelRoot)) {
    const entries = fs.readdirSync(indexKernelRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) {
        continue;
      }
      const filePath = path.join(indexKernelRoot, entry.name);
      const lines = countLines(filePath);
      if (lines > KERNEL_MODULE_LINE_LIMIT) {
        violations.push({ filePath, lines, limit: KERNEL_MODULE_LINE_LIMIT });
      }
    }
  }

  const facadePath = path.join(projectRoot, "src", "unifiedAgentIndexStore.js");
  const cliPath = path.join(projectRoot, "tools", "Rebuild-AgentIndex.js");
  for (const [filePath, limit] of [[facadePath, KERNEL_FACADE_LINE_LIMIT], [cliPath, KERNEL_CLI_LINE_LIMIT]]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const lines = countLines(filePath);
    if (lines > limit) {
      violations.push({ filePath, lines, limit });
    }
  }

  return {
    ok: violations.length < 1,
    violations,
    summary: violations.length < 1
      ? "kernel line budgets satisfied"
      : `${violations.length} files exceed the kernel line budgets`
  };
}

function runSearchSmoke(payload) {
  const sample = (payload.documents || []).find((document) => document.prefix === "LX");
  if (!sample) {
    return {
      ok: false,
      summary: "no canonical LX sample available",
      sampleId: ""
    };
  }
  const result = searchDocuments(payload.documents, sample.id, { limit: 1, maxSnippetChars: 120 });
  const ok = result.matches[0]?.id === sample.id;
  return {
    ok,
    summary: ok ? `exact id search resolves ${sample.id}` : `exact id search failed for ${sample.id}`,
    sampleId: sample.id
  };
}

function validateStagingScanContract(scanContract = null) {
  const contract = scanContract && typeof scanContract === "object" ? scanContract : {};
  const mode = String(contract.mode || "").toLowerCase();
  const errors = [];
  if (!["warm", "deep"].includes(mode)) {
    errors.push("mode must be warm or deep");
  }
  if (contract.freshnessChecked !== true) {
    errors.push("freshnessChecked must be true");
  }
  if (contract.builtFromSource !== true) {
    errors.push("builtFromSource must be true");
  }
  if (String(contract.sourceWalk || "") !== "canonical-index-root") {
    errors.push("sourceWalk must be canonical-index-root");
  }
  if (contract.manifestPointer === true) {
    errors.push("manifestPointer must be false");
  }
  if (!["content", "stat"].includes(String(contract.hashMode || "").toLowerCase())) {
    errors.push("hashMode must be stat or content");
  }
  if ((mode === "deep" && String(contract.hashMode || "").toLowerCase() !== "content")
    || (mode === "warm" && String(contract.hashMode || "").toLowerCase() !== "stat")) {
    errors.push(`hashMode must match ${mode}`);
  }
  return {
    ok: errors.length < 1,
    errors,
    contract
  };
}

function runStagingGates(payload, profileInput = {}) {
  const profile = resolveUnifiedIndexProfile(profileInput);
  const gates = [];
  const pushGate = (id, ok, summary, detail = {}) => {
    gates.push({ id, ok: Boolean(ok), summary, detail });
  };

  const payloadValidation = validatePayloadForProfile(payload, profile);
  pushGate(
    "payload_contract",
    payloadValidation.ok,
    payloadValidation.ok ? "payload matches staging profile contract" : payloadValidation.errors.join(", "),
    { errors: payloadValidation.errors }
  );

  const integrityReport = runIntegrityCheck(agentIndexRoot);
  pushGate(
    "source_integrity",
    integrityReport.totalErrors < 1,
    integrityReport.totalErrors < 1
      ? `${integrityReport.totalEntries} canonical entries, 0 integrity errors`
      : `${integrityReport.totalErrors} integrity errors detected`,
    { integrityReport }
  );

  const lineBudget = collectKernelBudgetViolations();
  pushGate("kernel_line_budget", lineBudget.ok, lineBudget.summary, lineBudget);

  const scanContract = payload?.persistedScanContract || payload?.scanContract || null;
  const scanValidation = validateStagingScanContract(scanContract);
  pushGate(
    "scan_contract",
    scanValidation.ok,
    scanValidation.ok
      ? `staging build used ${String(scanValidation.contract.mode || "").toLowerCase()} scan contract`
      : scanValidation.errors.join(", "),
    { scanContract }
  );

  const searchSmoke = runSearchSmoke(payload);
  pushGate("search_smoke", searchSmoke.ok, searchSmoke.summary, searchSmoke);

  return {
    ok: gates.every((gate) => gate.ok),
    profile: profile.profile,
    checkedAt: new Date().toISOString(),
    gates,
    errors: gates.filter((gate) => !gate.ok).map((gate) => `${gate.id}:${gate.summary}`),
    integrityReport,
    lineBudget
  };
}

module.exports = {
  validatePayloadForProfile,
  runStagingGates
};
