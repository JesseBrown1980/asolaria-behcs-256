"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { resolveToolPaths } = require("./connectors/systemPaths");
const { instanceRoot } = require("./runtimePaths");
const { normalizeColonyCapabilities } = require("./colonyCapabilitySchema");
const { buildColonyLaneRouting } = require("./colonyCapabilityRouting");
const { readLirisNodeIdentity } = require("./lirisBootstrapConfig");

const gatewayConfigPath = path.join(instanceRoot, "config", "asolaria.gateway.json");

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function clipText(value, maxChars = 2400) {
  const text = String(value || "").replace(/\r/g, "").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function normalizeText(value, maxChars = 240) {
  return clipText(value, maxChars);
}

function firstExisting(items) {
  for (const item of Array.isArray(items) ? items : []) {
    if (item && fs.existsSync(item)) {
      return item;
    }
  }
  return "";
}

function commandExists(name) {
  const command = normalizeText(name, 120);
  if (!command) return "";
  try {
    const result = childProcess.spawnSync("where", [command], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 5000
    });
    if (result.status !== 0) return "";
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) || "";
  } catch {
    return "";
  }
}

function isCmdScript(executable) {
  return /\.cmd$/i.test(String(executable || "")) || /\.bat$/i.test(String(executable || ""));
}

function quoteForCmd(value) {
  return `"${String(value || "").replace(/"/g, "\"\"")}"`;
}

function runBoundedProbe(probe) {
  const executable = String(probe?.executable || "").trim();
  const args = Array.isArray(probe?.args) ? probe.args.map((item) => String(item || "")) : [];
  const startedAt = new Date().toISOString();

  if (!executable) {
    return {
      id: probe.id,
      label: probe.label,
      ok: false,
      available: false,
      startedAt,
      completedAt: startedAt,
      exitCode: null,
      output: "",
      error: "executable_not_found"
    };
  }

  const useCmd = process.platform === "win32" && isCmdScript(executable);
  const commandLine = useCmd
    ? `${quoteForCmd(executable)} ${args.map((arg) => quoteForCmd(arg)).join(" ")}`.trim()
    : [executable, ...args].join(" ").trim();

  try {
    const result = useCmd
      ? childProcess.spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", commandLine], {
          windowsHide: true,
          encoding: "utf8",
          timeout: 10000
        })
      : childProcess.spawnSync(executable, args, {
          windowsHide: true,
          encoding: "utf8",
          timeout: 10000
        });
    const output = clipText(`${result.stdout || ""}\n${result.stderr || ""}`.trim(), 4000);
    return {
      id: probe.id,
      label: probe.label,
      ok: Number(result.status) === 0,
      available: true,
      executable,
      commandLine,
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode: Number.isInteger(result.status) ? result.status : null,
      output,
      error: result.error ? normalizeText(result.error.message || result.error, 240) : ""
    };
  } catch (error) {
    return {
      id: probe.id,
      label: probe.label,
      ok: false,
      available: true,
      executable,
      commandLine,
      startedAt,
      completedAt: new Date().toISOString(),
      exitCode: null,
      output: "",
      error: normalizeText(error?.message || error, 240)
    };
  }
}

function buildProbePlan() {
  const toolPaths = resolveToolPaths();
  const pythonConfigured = String(process.env.ASOLARIA_LOCAL_OPS_PYTHON_CMD || "").trim();
  const pythonPath = firstExisting([pythonConfigured]) || commandExists("python");
  const rgPath = commandExists("rg");
  const gitPath = commandExists("git");

  return [
    {
      id: "python_version",
      label: "python --version",
      executable: pythonPath,
      args: ["--version"]
    },
    {
      id: "rg_version",
      label: "rg --version",
      executable: rgPath,
      args: ["--version"]
    },
    {
      id: "git_version",
      label: "git --version",
      executable: gitPath,
      args: ["--version"]
    }
  ];
}

function summarizePolicy(config = {}) {
  const allow = Array.isArray(config?.tools?.allow) ? config.tools.allow.map((item) => String(item || "").trim()) : [];
  const requireApproval = Array.isArray(config?.tools?.requireApproval)
    ? config.tools.requireApproval.map((item) => String(item || "").trim())
    : [];
  return {
    localOpsAllowed: allow.includes("localops.run"),
    localOpsApprovalRequired: requireApproval.includes("localops.run"),
    sandboxExecuteAllowed: allow.includes("sandbox.execute"),
    sandboxExecuteApprovalRequired: requireApproval.includes("sandbox.execute")
  };
}

function normalizeCapabilityList(identity = {}) {
  return Array.isArray(identity.capabilities)
    ? identity.capabilities.map((item) => normalizeText(item, 80).toLowerCase()).filter(Boolean)
    : [];
}

function buildIdentityColonyCapabilities(identity = {}, computeWorkerReady = false) {
  const capabilities = normalizeCapabilityList(identity);
  const phoneOrbital = identity.phoneOrbital !== undefined
    ? Boolean(identity.phoneOrbital)
    : capabilities.includes("phone_orbital");
  const phoneAgents = identity.phoneAgents !== undefined
    ? Boolean(identity.phoneAgents)
    : capabilities.includes("phone_agents") || phoneOrbital;
  const desktopAgents = identity.desktopAgents !== undefined
    ? Boolean(identity.desktopAgents)
    : capabilities.includes("code_execution") || computeWorkerReady;
  return normalizeColonyCapabilities({
    role: identity.role || "sub_colony",
    headColony: identity.headColony || "",
    authorityMode: identity.authorityMode || "",
    languageVersion: identity.languageVersion || "",
    phoneMode: identity.phoneMode || (phoneOrbital ? "phone_enabled" : "no_phone"),
    phoneOrbital,
    desktopAgents,
    phoneAgents,
    subColonyClass: identity.subColonyClass || ""
  }, {
    nodeId: identity.nodeId,
    defaultRole: identity.role || "sub_colony"
  });
}

function getLocalComputeReadinessStatus() {
  const identity = readLirisNodeIdentity();
  const gatewayConfig = readJsonFile(gatewayConfigPath, {});
  const toolPaths = resolveToolPaths();
  const policy = summarizePolicy(gatewayConfig);
  const probes = buildProbePlan().map((probe) => runBoundedProbe(probe));
  const successfulProbe = probes.find((probe) => probe.ok) || null;
  const capabilities = Array.isArray(identity.capabilities) ? identity.capabilities.slice() : [];
  const codeExecutionAdvertised = capabilities.includes("code_execution");
  const computeWorkerReady = Boolean(
    identity.nodeId
    && codeExecutionAdvertised
    && policy.localOpsAllowed
    && successfulProbe
  );
  const colonyCapabilities = buildIdentityColonyCapabilities(identity, computeWorkerReady);
  const federationRouting = buildColonyLaneRouting({
    nodeId: identity.nodeId,
    status: identity.nodeId ? "online" : "offline",
    capabilities: colonyCapabilities,
    computeWorkerReady,
    phoneOrbitalReady: Boolean(identity.phoneOrbitalReady || identity.phoneReady)
  }, {
    nodeId: identity.nodeId,
    defaultRole: identity.role || "sub_colony"
  });

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    hostScope: "rayssa",
    node: {
      nodeId: String(identity.nodeId || "").trim(),
      role: String(identity.role || "").trim(),
      operator: String(identity.operator || "").trim(),
      mqttTopicPrefix: String(identity.mqttTopicPrefix || "").trim(),
      capabilities
    },
    colonyCapabilities,
    federationRouting,
    advertisedContract: {
      surface: "federation_self_compute_readiness",
      boundedProbeOrder: probes.map((probe) => probe.label),
      selectedProbe: successfulProbe?.label || "",
      selectedProbeId: successfulProbe?.id || "",
      localOpsAllowed: policy.localOpsAllowed,
      localOpsApprovalRequired: policy.localOpsApprovalRequired,
      codeExecutionAdvertised,
      computeWorkerReady,
      reason: computeWorkerReady
        ? "bounded_allowlisted_probe_succeeded_on_advertised_liris_node"
        : "bounded_worker_contract_not_yet_satisfied"
    },
    workerSurface: {
      localCodexAvailable: Boolean(toolPaths.codexPath),
      claudeMaxReady: Boolean(toolPaths.claudePath),
      mqttTopicPrefixPresent: Boolean(identity.mqttTopicPrefix),
      sandboxConfigured: Boolean(String(gatewayConfig?.sandbox?.baseUrl || "").trim())
    },
    probe: {
      attempts: probes,
      successfulAttempt: successfulProbe
    }
  };
}

module.exports = {
  getLocalComputeReadinessStatus
};
