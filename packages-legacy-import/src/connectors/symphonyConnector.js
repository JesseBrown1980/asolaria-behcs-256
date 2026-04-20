const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");
const { projectRoot, resolveDataPath, resolveLogPath } = require("../runtimePaths");
const { resolveToolPaths } = require("./systemPaths");
const { appendGraphEvent, appendActionManifest } = require("../graphRuntimeStore");
const { createSymphonyLinearRuntime } = require("./symphonyLinear");
const { createSymphonyConfigRuntime } = require("./symphonyConfig");
const { createSymphonyServiceRuntime } = require("./symphonyServiceRuntime");
const { createSymphonyOrchestrationRuntime } = require("./symphonyOrchestration");

const SYMPHONY_SECRET_NAME = "integrations.symphony";
const SYMPHONY_PID_FILE = resolveLogPath("symphony.pid");
const SYMPHONY_STATE_FILE = resolveDataPath("symphony-state.json");
const SYMPHONY_STDOUT_LOG = resolveLogPath("symphony.out.log");
const SYMPHONY_STDERR_LOG = resolveLogPath("symphony.err.log");
const SYMPHONY_TEMPLATE_PATH = path.join(projectRoot, "config", "symphony", "WORKFLOW.example.md");
const DEFAULT_SYMPHONY_PORT = 4792;
let lastSuccessfulSymphonyLiveState = null;
const DEFAULT_RUNTIME_KIND = "elixir_reference";
const DEFAULT_LOGS_ROOT = resolveLogPath("symphony-service");
const DEFAULT_SOURCE_REPO_URL = "https://github.com/openai/symphony.git";
const VALID_RUNTIME_KINDS = new Set(["elixir_reference", "custom"]);
const symphonyConfigRuntime = createSymphonyConfigRuntime({
  fs,
  path,
  getSecret,
  stateFile: SYMPHONY_STATE_FILE,
  secretName: SYMPHONY_SECRET_NAME,
  defaultRuntimeKind: DEFAULT_RUNTIME_KIND,
  defaultLogsRoot: DEFAULT_LOGS_ROOT,
  defaultSourceRepoUrl: DEFAULT_SOURCE_REPO_URL,
  templateWorkflowPath: SYMPHONY_TEMPLATE_PATH,
  validRuntimeKinds: VALID_RUNTIME_KINDS
});
const normalizeText = symphonyConfigRuntime.normalizeText;
const normalizeBool = symphonyConfigRuntime.normalizeBool;
const normalizeInt = symphonyConfigRuntime.normalizeInt;
const normalizePath = symphonyConfigRuntime.normalizePath;
const normalizeRuntimeKind = symphonyConfigRuntime.normalizeRuntimeKind;
const normalizeApiKey = symphonyConfigRuntime.normalizeApiKey;
const maskToken = symphonyConfigRuntime.maskToken;
const ensureDirExists = symphonyConfigRuntime.ensureDirExists;
const readJsonSafe = symphonyConfigRuntime.readJsonSafe;
const writeJsonSafe = symphonyConfigRuntime.writeJsonSafe;
const readState = symphonyConfigRuntime.readState;
const writeState = symphonyConfigRuntime.writeState;
const resolveSymphonyConfig = symphonyConfigRuntime.resolveSymphonyConfig;
const summarizeConfig = symphonyConfigRuntime.summarizeConfig;

function buildSymphonyActorRef() {
  return {
    type: "service_manager",
    id: "symphony-manager",
    label: "symphony manager",
    domain: "local"
  };
}

function buildSymphonySubjectRef(config = {}) {
  return {
    type: "integration",
    id: "symphony",
    label: "symphony",
    domain: "local",
    criticality: config.enabled ? "high" : "medium"
  };
}

function buildSymphonyTargetRef(config = {}, mode = "service") {
  if (mode === "workflow") {
    const workflowPath = normalizePath(config.workflowPath);
    const workflowName = workflowPath ? path.basename(workflowPath) : "workflow";
    return {
      type: "workflow",
      id: workflowPath || workflowName,
      label: workflowName,
      criticality: "medium"
    };
  }
  const port = Number(config.port || DEFAULT_SYMPHONY_PORT) || DEFAULT_SYMPHONY_PORT;
  return {
    type: "service_endpoint",
    id: `symphony:${port}`,
    label: `symphony:${port}`,
    domain: "local",
    criticality: "high"
  };
}

function emitSymphonyEvent(action, config = {}, extra = {}) {
  appendGraphEvent({
    component: "symphony-integration",
    category: extra.category || "service_lifecycle",
    action,
    actor: buildSymphonyActorRef(),
    subject: buildSymphonySubjectRef(config),
    target: extra.target || buildSymphonyTargetRef(config, extra.targetMode || "service"),
    context: {
      runtime: config.runtime || DEFAULT_RUNTIME_KIND,
      port: Number(config.port || DEFAULT_SYMPHONY_PORT) || DEFAULT_SYMPHONY_PORT,
      repoRoot: config.repoRoot || "",
      workflowPath: config.workflowPath || "",
      workspaceRoot: config.workspaceRoot || "",
      linearProjectSlug: config.linearProjectSlug || "",
      ...((extra.context && typeof extra.context === "object") ? extra.context : {})
    },
    policy: {
      mode: "loopback_guarded",
      approvalState: extra.approvalState || "not_required",
      autonomous: false
    },
    detail: extra.detail || {},
    status: extra.status || "ok"
  });
}

function emitSymphonyManifest(action, status, config = {}, extra = {}) {
  appendActionManifest({
    component: "symphony-integration",
    action,
    status,
    actor: buildSymphonyActorRef(),
    target: extra.target || buildSymphonyTargetRef(config, extra.targetMode || "service"),
    reason: extra.reason || "",
    context: {
      runtime: config.runtime || DEFAULT_RUNTIME_KIND,
      port: Number(config.port || DEFAULT_SYMPHONY_PORT) || DEFAULT_SYMPHONY_PORT,
      repoRoot: config.repoRoot || "",
      workflowPath: config.workflowPath || "",
      workspaceRoot: config.workspaceRoot || "",
      linearProjectSlug: config.linearProjectSlug || "",
      ...((extra.context && typeof extra.context === "object") ? extra.context : {})
    },
    policy: {
      mode: "loopback_guarded",
      approvalState: extra.approvalState || "not_required",
      autonomous: false
    },
    evidence: extra.evidence || {}
  });
}

const symphonyLinearRuntime = createSymphonyLinearRuntime({
  fetchImpl: global.fetch,
  normalizeApiKey,
  normalizeText
});
const linearGraphqlRequest = symphonyLinearRuntime.linearGraphqlRequest;
const resolveLinearProjectContext = symphonyLinearRuntime.resolveLinearProjectContext;
const buildSymphonyIssueDescription = symphonyLinearRuntime.buildSymphonyIssueDescription;
const mapSymphonyPriority = symphonyLinearRuntime.mapSymphonyPriority;
const symphonyServiceRuntime = createSymphonyServiceRuntime({
  fs,
  path,
  childProcess,
  processRef: process,
  resolveToolPaths,
  normalizeText,
  normalizePath,
  ensureDirExists,
  pidFile: SYMPHONY_PID_FILE,
  stdoutLog: SYMPHONY_STDOUT_LOG,
  stderrLog: SYMPHONY_STDERR_LOG,
  templateWorkflowPath: SYMPHONY_TEMPLATE_PATH,
  defaultPort: DEFAULT_SYMPHONY_PORT,
  defaultLogsRoot: DEFAULT_LOGS_ROOT,
  projectRoot
});
const resolveCodexCommand = symphonyServiceRuntime.resolveCodexCommand;
const collectWindowsShellPathEntries = symphonyServiceRuntime.collectWindowsShellPathEntries;
const syncWorkflowCodexCommand = symphonyServiceRuntime.syncWorkflowCodexCommand;
const buildLaunchPlan = symphonyServiceRuntime.buildLaunchPlan;
const getProcessStatus = symphonyServiceRuntime.getProcessStatus;
const writePidFile = symphonyServiceRuntime.writePidFile;
const removeFileQuietly = symphonyServiceRuntime.removeFileQuietly;
const symphonyOrchestrationRuntime = createSymphonyOrchestrationRuntime({
  fs,
  path,
  childProcess,
  fetchImpl: global.fetch,
  processRef: process,
  setSecret,
  deleteSecret,
  resolveToolPaths,
  normalizeText,
  normalizeBool,
  normalizeInt,
  normalizePath,
  normalizeRuntimeKind,
  normalizeApiKey,
  ensureDirExists,
  readState,
  writeState,
  resolveSymphonyConfig,
  summarizeConfig,
  getProcessStatus,
  buildLaunchPlan,
  resolveCodexCommand,
  collectWindowsShellPathEntries,
  syncWorkflowCodexCommand,
  writePidFile,
  removeFileQuietly,
  emitSymphonyEvent,
  emitSymphonyManifest,
  secretName: SYMPHONY_SECRET_NAME,
  pidFile: SYMPHONY_PID_FILE,
  stdoutLog: SYMPHONY_STDOUT_LOG,
  stderrLog: SYMPHONY_STDERR_LOG,
  defaultLogsRoot: DEFAULT_LOGS_ROOT,
  defaultPort: DEFAULT_SYMPHONY_PORT,
  defaultSourceRepoUrl: DEFAULT_SOURCE_REPO_URL
});
const orchestrationGetSymphonyIntegrationStatus = symphonyOrchestrationRuntime.getSymphonyIntegrationStatus;
const orchestrationFetchSymphonyLiveState = symphonyOrchestrationRuntime.fetchSymphonyLiveState;
const orchestrationSetSymphonyConfig = symphonyOrchestrationRuntime.setSymphonyConfig;
const orchestrationStartSymphonyService = symphonyOrchestrationRuntime.startSymphonyService;
const orchestrationStopSymphonyService = symphonyOrchestrationRuntime.stopSymphonyService;
const orchestrationRestartSymphonyService = symphonyOrchestrationRuntime.restartSymphonyService;

async function submitSymphonyWorkItem(input = {}) {
  const config = resolveSymphonyConfig();
  const summary = summarizeConfig(config);
  if (!config.enabled) {
    throw new Error("Symphony integration is disabled.");
  }
  if (!summary.configured) {
    throw new Error("Symphony integration is not fully configured.");
  }

  let processInfo = getProcessStatus();
  let serviceAction = "none";
  if (normalizeBool(input.ensureService, true) && !processInfo.running) {
    startSymphonyService();
    processInfo = getProcessStatus();
    serviceAction = processInfo.running ? "started" : "start_requested";
  }

  const context = await resolveLinearProjectContext(config);
  const title = normalizeText(input.title || input.objective || "", 240);
  if (!title) {
    throw new Error("Symphony work item requires a title or objective.");
  }
  const description = buildSymphonyIssueDescription(input, config, context);
  const issueInput = {
    title,
    description,
    teamId: context.team.id,
    projectId: context.project.id,
    stateId: context.todoState?.id || undefined,
    priority: mapSymphonyPriority(input)
  };
  const data = await linearGraphqlRequest(
    config,
    `
      mutation SymphonyIssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            url
            priority
            state {
              id
              name
              type
            }
            team {
              id
              key
              name
            }
            project {
              id
              name
              url
            }
          }
        }
      }
    `,
    { input: issueInput }
  );
  const payload = data?.issueCreate || {};
  if (!payload?.success || !payload?.issue?.id) {
    throw new Error("Linear issue creation did not return an issue.");
  }
  const issue = payload.issue;
  emitSymphonyEvent("symphony_issue_created", config, {
    category: "work_submission",
    target: {
      type: "linear_issue",
      id: String(issue.id || ""),
      label: String(issue.identifier || issue.title || "linear issue"),
      domain: "external",
      criticality: "medium"
    },
    context: {
      issueId: String(issue.id || ""),
      issueIdentifier: String(issue.identifier || ""),
      issueUrl: String(issue.url || ""),
      teamId: context.team.id,
      projectId: context.project.id,
      stateId: context.todoState?.id || "",
      taskType: normalizeText(input.taskType, 80),
      sensitivity: normalizeText(input.sensitivity, 80),
      size: normalizeText(input.size, 80)
    },
    detail: {
      serviceAction,
      state: issue.state || null
    }
  });
  emitSymphonyManifest("symphony_issue_submit", "completed", config, {
    reason: `Created Linear issue ${String(issue.identifier || "").trim() || "for Symphony"}.`,
    target: {
      type: "linear_issue",
      id: String(issue.id || ""),
      label: String(issue.identifier || issue.title || "linear issue"),
      domain: "external",
      criticality: "medium"
    },
    context: {
      issueId: String(issue.id || ""),
      issueIdentifier: String(issue.identifier || ""),
      issueUrl: String(issue.url || ""),
      taskType: normalizeText(input.taskType, 80),
      sensitivity: normalizeText(input.sensitivity, 80),
      size: normalizeText(input.size, 80)
    },
    evidence: {
      issue: {
        id: String(issue.id || ""),
        identifier: String(issue.identifier || ""),
        title: String(issue.title || ""),
        url: String(issue.url || "")
      },
      serviceAction,
      team: context.team,
      project: context.project,
      state: issue.state || context.todoState || null
    }
  });
  return {
    submittedAt: new Date().toISOString(),
    serviceAction,
    issue,
    team: context.team,
    project: context.project,
    targetState: context.todoState || null,
    process: processInfo
  };
}

const getSymphonyIntegrationStatus = orchestrationGetSymphonyIntegrationStatus;
const fetchSymphonyLiveState = orchestrationFetchSymphonyLiveState;
const setSymphonyConfig = orchestrationSetSymphonyConfig;
const startSymphonyService = orchestrationStartSymphonyService;
const stopSymphonyService = orchestrationStopSymphonyService;
const restartSymphonyService = orchestrationRestartSymphonyService;

module.exports = {
  getSymphonyIntegrationStatus,
  fetchSymphonyLiveState,
  setSymphonyConfig,
  startSymphonyService,
  stopSymphonyService,
  restartSymphonyService,
  submitSymphonyWorkItem
};
