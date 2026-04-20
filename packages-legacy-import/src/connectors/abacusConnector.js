const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");
const { normalizeUrl, resolveIsolatedProfilePath } = require("./chromeConnector");
const { appendGraphEvent, appendActionManifest } = require("../graphRuntimeStore");
const { createAbacusPacketRuntime } = require("./abacusPacketRuntime");

const ABACUS_SECRET_NAME = "integrations.abacus";
const DEFAULT_APP_URL = "https://apps.abacus.ai/chatllm/?appId=7560d5f36";
const DEFAULT_PROFILE_NAME = "asolaria-slot-phone_mode";
const DEFAULT_WINDOW_TARGET = "phone_mode";
const DEFAULT_BROWSER_MODE = "managed_isolated";
const DEFAULT_DESKTOP_ROOT = path.join(process.env.LOCALAPPDATA || "", "Programs", "AbacusAI");
const DEFAULT_LISTENER_ROOT = path.join(process.env.LOCALAPPDATA || "", "Programs", "AbacusAI Listener");
const DEFAULT_DESKTOP_USER_DATA = path.join(process.env.APPDATA || "", "AbacusAI");
const DEFAULT_LISTENER_USER_DATA = path.join(process.env.APPDATA || "", "AbacusAI Listener");
const DEFAULT_CLI_PROBE_TIMEOUT_MS = 30000;
const ABACUS_RUNTIME_ROOT = path.join(__dirname, "..", "..", "data", "integrations", "abacus");
const ABACUS_PACKET_ROOT = path.join(ABACUS_RUNTIME_ROOT, "packets");
const ABACUS_PROBE_STATUS_PATH = path.join(ABACUS_RUNTIME_ROOT, "cli-probe-status.json");
const RESPONSE_PLACEHOLDER_HEADING = "# Abacus Response";
const ABACUS_STATUS_CACHE_TTL_MS = 10000;
const abacusStatusCache = {
  expiresAt: 0,
  payload: null
};
const ABACUS_PACKET_PRESETS = [
  {
    id: "chat_quick_chore",
    title: "Chat quick chore",
    description: "Fast browser or desktop chat-mode packet for small bounded chores and short-turn work.",
    workerMode: "chat_mode",
    sensitivity: "sanitized",
    surfaceHints: ["chat_mode", "browser_surface"],
    expectedArtifacts: ["summary.md"],
    launchChecklist: [
      "Use chat mode for quick bounded work, not broad repo mutation or owner-plane tasks.",
      "Keep the request small enough to finish in one short session.",
      "Return the result in response.md instead of spreading work across unrelated surfaces."
    ],
    instructions: "Use chat mode for a short bounded task. Keep the reply concise, actionable, and contained to the objective."
  },
  {
    id: "workflow_studio_job",
    title: "Workflow Studio job",
    description: "Bounded packet for Workflow Studio / multi-step canvas work inside Abacus desktop.",
    workerMode: "workflow_studio",
    sensitivity: "sanitized",
    surfaceHints: ["workflow_studio", "code_mode"],
    expectedArtifacts: ["summary.md", "workflow-notes.md"],
    launchChecklist: [
      "Open Workflow Studio inside the authenticated Abacus desktop workspace.",
      "Keep the canvas bounded to the packet objective and allowed paths only.",
      "Write the final outcome into response.md and place any supporting files in artifacts/."
    ],
    instructions: "Use Abacus Workflow Studio or the IDE agent surface to complete the objective. Keep the output concise, structured, and bounded."
  },
  {
    id: "deep_agent_cloud_job",
    title: "Deep agent cloud job",
    description: "Bounded cloud-heavy packet for larger web or research work where Abacus cloud execution is useful.",
    workerMode: "deep_agent_cloud",
    sensitivity: "sanitized",
    surfaceHints: ["deep_agent", "chat_mode", "browser_surface"],
    expectedArtifacts: ["summary.md", "artifacts-index.md"],
    launchChecklist: [
      "Treat cloud-heavy or multi-step Abacus work as scarce and bounded.",
      "Do not include owner-plane secrets, raw credentials, or wide account context.",
      "Return a compact artifact index so Asolaria can import the result safely."
    ],
    instructions: "Use the Abacus cloud-capable surface only for larger bounded work that benefits from remote execution. Keep scope explicit and avoid unnecessary retries."
  },
  {
    id: "repo_scan",
    title: "Repository scan",
    description: "Repo-level inspection with no owner-plane secrets and no broad filesystem access.",
    workerMode: "desktop_packet",
    sensitivity: "sanitized",
    surfaceHints: ["code_mode", "chat_mode"],
    expectedArtifacts: ["summary.md", "findings.md"],
    instructions: "Inspect only the explicitly allowed paths. Return key findings, risks, and next steps."
  },
  {
    id: "claude_code_patch",
    title: "Claude Code patch",
    description: "Bounded coding packet targeting the Claude Code / Code Mode surface inside Abacus desktop.",
    workerMode: "claude_code",
    sensitivity: "sanitized",
    surfaceHints: ["claude_code", "code_mode"],
    expectedArtifacts: ["summary.md", "patch-plan.md"],
    launchChecklist: [
      "Use the Claude Code or Code Mode surface, not general chat, for repo work.",
      "Stay inside the allowed paths and do not widen scope beyond the packet objective.",
      "If edits are made, summarize changed files and verification steps in response.md."
    ],
    instructions: "Use the coding surface to inspect the allowed paths and make only the smallest scoped change required by the objective. If you do not edit, return a concrete patch plan instead."
  },
  {
    id: "claude_code_review",
    title: "Claude Code review",
    description: "Read-only review packet focused on bugs, regressions, and missing verification.",
    workerMode: "claude_code_review",
    sensitivity: "sanitized",
    surfaceHints: ["claude_code", "code_mode"],
    expectedArtifacts: ["review.md"],
    launchChecklist: [
      "Use the coding surface for repo inspection and diff analysis.",
      "Do not make edits unless the packet objective explicitly allows it.",
      "Return findings ordered by severity with residual risks."
    ],
    instructions: "Prioritize concrete findings and residual risks. Do not make edits unless explicitly instructed in the packet objective."
  },
  {
    id: "listener_triage",
    title: "Listener triage",
    description: "Packet for working from Abacus Listener or transcript-like session context.",
    workerMode: "listener_triage",
    sensitivity: "sanitized",
    surfaceHints: ["listener", "chat_mode"],
    expectedArtifacts: ["summary.md", "actions.md"],
    launchChecklist: [
      "Use the listener or chat surface only for the provided scoped material.",
      "Extract decisions, blockers, and next actions without pulling in unrelated account context.",
      "Write a concise action-oriented response into response.md."
    ],
    instructions: "Triage the provided material into concise actions, blockers, and recommended follow-ups. Prefer structure over prose."
  },
  {
    id: "research_brief",
    title: "Research brief",
    description: "External or internal research packet with bounded deliverables.",
    workerMode: "research_brief",
    sensitivity: "sanitized",
    surfaceHints: ["chat_mode", "web_research"],
    expectedArtifacts: ["brief.md", "sources.md"],
    launchChecklist: [
      "Use the best Abacus research-capable surface available in the authenticated session.",
      "Keep the research bounded to the packet objective and cite uncertainty clearly.",
      "Return a brief plus sources in response.md or artifacts/."
    ],
    instructions: "Write a concise brief with source-backed claims. Call out uncertainty rather than guessing."
  }
];

function normalizeText(value, maxLen = 600) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, maxLen);
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return fallback;
}

function normalizeWindowTarget(value) {
  const target = normalizeText(value, 80).toLowerCase();
  if (!target) return DEFAULT_WINDOW_TARGET;
  return target.replace(/[^a-z0-9_-]/g, "_");
}

function normalizeProfileName(value) {
  const name = normalizeText(value, 80);
  if (!name) return DEFAULT_PROFILE_NAME;
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeBrowserMode(value) {
  const mode = normalizeText(value, 80).toLowerCase();
  if (!mode) return DEFAULT_BROWSER_MODE;
  if (mode === "managed_isolated" || mode === "managed_profile") {
    return mode;
  }
  return DEFAULT_BROWSER_MODE;
}

function normalizeAppUrl(value) {
  const raw = normalizeText(value, 1200);
  if (!raw) return DEFAULT_APP_URL;
  try {
    return normalizeUrl(raw);
  } catch (_error) {
    return DEFAULT_APP_URL;
  }
}

function deriveAppId(appUrl) {
  try {
    const parsed = new URL(appUrl || DEFAULT_APP_URL);
    return normalizeText(parsed.searchParams.get("appId") || "", 120);
  } catch (_error) {
    return "";
  }
}

function resolveAbacusConfig() {
  const secret = getSecret(ABACUS_SECRET_NAME, { namespace: "owner" });
  const stored = secret?.value || {};
  const appUrl = normalizeAppUrl(stored.appUrl || DEFAULT_APP_URL);
  return {
    enabled: normalizeBool(stored.enabled, false),
    appUrl,
    appId: normalizeText(stored.appId || deriveAppId(appUrl), 120),
    accountEmail: normalizeText(stored.accountEmail || "", 200).toLowerCase(),
    authProvider: normalizeText(stored.authProvider || "google", 80).toLowerCase(),
    profileName: normalizeProfileName(stored.profileName || DEFAULT_PROFILE_NAME),
    windowTarget: normalizeWindowTarget(stored.windowTarget || DEFAULT_WINDOW_TARGET),
    browserMode: normalizeBrowserMode(stored.browserMode || DEFAULT_BROWSER_MODE),
    notes: normalizeText(stored.notes || "", 500),
    updatedAt: normalizeText(stored.updatedAt || "", 80)
  };
}

function buildProfileStatus(config) {
  const profilePath = resolveIsolatedProfilePath(config.profileName || DEFAULT_PROFILE_NAME);
  const cookiePaths = [
    path.join(profilePath, "Default", "Cookies"),
    path.join(profilePath, "Default", "Network", "Cookies")
  ];
  const profileExists = fs.existsSync(profilePath);
  const cookiesPath = cookiePaths.find((candidate) => fs.existsSync(candidate)) || "";
  const preferencesPath = path.join(profilePath, "Default", "Preferences");
  return {
    profileName: config.profileName,
    profilePath,
    profileExists,
    cookiesPresent: Boolean(cookiesPath),
    cookiesPath,
    preferencesPresent: fs.existsSync(preferencesPath)
  };
}

function safeStat(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.statSync(filePath);
  } catch (_error) {
    return null;
  }
}

function ensureDir(dirPath) {
  if (!dirPath) return "";
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(String(fs.readFileSync(filePath, "utf8") || ""));
  } catch (_error) {
    return fallback;
  }
}

function safeWriteJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeWriteText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(value || ""), "utf8");
}

function slugifySegment(value, fallback = "work") {
  const normalized = normalizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function normalizeStringList(value, maxItems = 12, maxLen = 260) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|[,;]+/g)
      : [];
  return raw
    .map((item) => normalizeText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function getAbacusPacketPresets() {
  return ABACUS_PACKET_PRESETS.map((item) => ({
    ...item,
    expectedArtifacts: Array.isArray(item.expectedArtifacts) ? [...item.expectedArtifacts] : [],
    surfaceHints: Array.isArray(item.surfaceHints) ? [...item.surfaceHints] : [],
    launchChecklist: Array.isArray(item.launchChecklist) ? [...item.launchChecklist] : []
  }));
}

const abacusPacketRuntime = createAbacusPacketRuntime({
  fs,
  path,
  packetRoot: ABACUS_PACKET_ROOT,
  responsePlaceholderHeading: RESPONSE_PLACEHOLDER_HEADING,
  getAbacusIntegrationStatus,
  getAbacusPacketPresets,
  normalizeText,
  normalizeStringList,
  slugifySegment,
  safeReadJson,
  safeWriteJson,
  safeWriteText,
  safeStat,
  ensureDir,
  emitAbacusManifest,
  emitAbacusEvent,
  defaultBrowserMode: DEFAULT_BROWSER_MODE
});

const {
  findAbacusPacketPreset,
  listAbacusWorkPackets,
  getAbacusWorkPacket,
  ensurePacketWorkspaceScaffold,
  scanAbacusWorkPacket,
  writeAbacusWorkPacketResponse,
  createAbacusWorkPacket
} = abacusPacketRuntime;

function getAbacusOperatingStrategy() {
  const status = getAbacusIntegrationStatus();
  const workerTier = normalizeText(status?.capabilities?.workerLane?.tier || "unknown", 80);
  const browserReady = Boolean(status?.capabilities?.browser?.ready);
  const desktopReady = Boolean(status?.capabilities?.desktop?.installed);
  const cliMcpReady = Boolean(status?.capabilities?.cli?.mcpReady);
  const cliPrintReady = Boolean(status?.capabilities?.cli?.printReady);
  const listenerReady = Boolean(status?.capabilities?.desktop?.listenerInstalled);

  const profiles = [
    {
      id: "quick_chore",
      title: "Quick chore",
      bestFor: "Small one-shot tasks, short summaries, bounded follow-ups, and lightweight browser/cloud help.",
      preferredSurface: "chat_mode",
      fallbackSurface: browserReady ? "browser_surface" : "desktop_chat",
      packetPresetId: "chat_quick_chore",
      costProfile: "low",
      notes: "Use for small work only. Do not spend cloud-heavy or multi-step surfaces on trivial tasks."
    },
    {
      id: "coding_patch",
      title: "Coding patch or repo change",
      bestFor: "Concrete code tasks, bounded repo changes, and targeted implementation work.",
      preferredSurface: "claude_code",
      fallbackSurface: "code_mode",
      packetPresetId: "claude_code_patch",
      costProfile: "medium",
      notes: "Desktop coding surfaces are the primary lane. Keep local allowed paths explicit."
    },
    {
      id: "code_review",
      title: "Code review or audit",
      bestFor: "Read-only repo inspection, bug hunting, regressions, and verification-focused review.",
      preferredSurface: "claude_code_review",
      fallbackSurface: "code_mode",
      packetPresetId: "claude_code_review",
      costProfile: "medium",
      notes: "Prefer review packets before patch packets when the task is uncertain."
    },
    {
      id: "workflow_orchestration",
      title: "Workflow orchestration",
      bestFor: "Multi-step canvases, chained subtasks, and higher-level process design inside Abacus desktop.",
      preferredSurface: "workflow_studio",
      fallbackSurface: "chat_mode",
      packetPresetId: "workflow_studio_job",
      costProfile: "medium",
      notes: "Use when the work benefits from explicit staged nodes rather than a single coding turn."
    },
    {
      id: "meeting_listener",
      title: "Listener / live context",
      bestFor: "Meetings, videos, transcripts, and screen-aware contextual triage.",
      preferredSurface: listenerReady ? "listener" : "chat_mode",
      fallbackSurface: "chat_mode",
      packetPresetId: "listener_triage",
      costProfile: "medium",
      notes: "Good for session intelligence and follow-up extraction, not for owner-plane execution."
    },
    {
      id: "cloud_heavy_job",
      title: "Cloud-heavy remote job",
      bestFor: "Larger bounded research or multi-step tasks where remote Abacus execution adds leverage.",
      preferredSurface: browserReady ? "deep_agent" : "chat_mode",
      fallbackSurface: "workflow_studio",
      packetPresetId: "deep_agent_cloud_job",
      costProfile: "high",
      notes: "Treat as scarce. Use only when the job is big enough to justify remote/cloud agent spend."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    defaultLane: "desktop_first_governed",
    workerTier,
    recommendations: {
      browserReady,
      desktopReady,
      listenerReady,
      cliMcpReady,
      cliPrintReady,
      primaryCodingLane: "claude_code",
      primaryOrchestrationLane: "workflow_studio",
      primaryQuickLane: browserReady ? "chat_mode" : "desktop_chat",
      primaryCloudLane: browserReady ? "deep_agent" : "workflow_studio",
      headlessReady: cliPrintReady
    },
    knownIssues: [
      "CLI print mode is still not reliable on this machine, so Abacus is not yet a safe fully headless worker.",
      "The desktop app exposes many bundled VS Code-style surfaces and extensions; not every prompt or pane is relevant to Asolaria.",
      "Listener is installed but not currently running, so listener-specific work should be treated as opportunistic.",
      "Browser or deep-agent cloud work can consume subscription usage faster than desktop-local packet work.",
      "Abacus outputs should be imported back through Asolaria packets rather than treated as direct ground truth."
    ],
    guardrails: [
      "Asolaria remains the controller, policy kernel, and import path. Abacus is a bounded worker surface.",
      "Do not place owner-plane secrets, raw credentials, or cross-domain account context into Abacus packets.",
      "Prefer desktop coding surfaces for repo work and treat cloud-heavy or deep-agent work as scarce.",
      "Use browser/cloud-heavy Abacus work only for jobs large enough to justify remote execution.",
      "Import results back through packet response/import instead of treating Abacus as a source of truth."
    ],
    profiles
  };
}

function listListeningPortsByProcessName(namePattern) {
  const matches = [];
  try {
    const tasklist = childProcess.spawnSync("tasklist", ["/FO", "CSV", "/NH"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000
    });
    const processRows = String(tasklist.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^"|"$/g, "").split('","'))
      .map((parts) => ({
        image: String(parts[0] || "").trim(),
        pid: Number(String(parts[1] || "").replace(/[^\d]/g, "")) || 0
      }))
      .filter((entry) => entry.pid > 0 && namePattern.test(entry.image));
    if (processRows.length < 1) {
      return matches;
    }
    const pidSet = new Set(processRows.map((entry) => entry.pid));
    const netstat = childProcess.spawnSync("netstat", ["-ano", "-p", "tcp"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000
    });
    const lines = String(netstat.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^TCP\s+/i.test(line));
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const state = String(parts[3] || "").trim().toUpperCase();
      const pid = Number(parts[4] || 0) || 0;
      if (state !== "LISTENING" || !pidSet.has(pid)) {
        continue;
      }
      const local = String(parts[1] || "");
      const splitIndex = local.lastIndexOf(":");
      const localAddress = splitIndex > -1 ? local.slice(0, splitIndex) : local;
      const localPort = splitIndex > -1 ? Number(local.slice(splitIndex + 1)) || 0 : 0;
      matches.push({
        pid,
        localAddress,
        localPort
      });
    }
  } catch (_error) {
    return matches;
  }
  return matches.sort((a, b) => a.localPort - b.localPort);
}

function listRunningProcessesByImage(namePattern) {
  const matches = [];
  try {
    const tasklist = childProcess.spawnSync("tasklist", ["/FO", "CSV", "/NH"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000
    });
    const rows = String(tasklist.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^"|"$/g, "").split('","'))
      .map((parts) => ({
        image: String(parts[0] || "").trim(),
        pid: Number(String(parts[1] || "").replace(/[^\d]/g, "")) || 0
      }))
      .filter((entry) => entry.pid > 0 && namePattern.test(entry.image));
    matches.push(...rows);
  } catch (_error) {
    return matches;
  }
  return matches;
}

function buildProbeStatus() {
  const stored = safeReadJson(ABACUS_PROBE_STATUS_PATH, {});
  const byMode = stored && typeof stored === "object" && stored.byMode && typeof stored.byMode === "object"
    ? stored.byMode
    : {};
  return {
    path: ABACUS_PROBE_STATUS_PATH,
    updatedAt: normalizeText(stored?.updatedAt || "", 80),
    byMode
  };
}

function analyzeProbeResult(result = {}) {
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const logTail = String(result.cliLog?.latestTail || "");
  return {
    loginRequiredDetected: /Not logged in/i.test(stdout),
    interactiveShellDetected: /\? for shortcuts/i.test(stdout) || /Try ".*"/i.test(stdout),
    readyTokenDetected: /\bREADY\b/i.test(stdout),
    mcpListDetected: /Configured MCP servers:/i.test(stdout),
    brokenResourcePathsDetected: /Unable to resolve nonexistent file/i.test(logTail),
    constantsFetchFailedDetected: /Failed to fetch constants from server/i.test(logTail),
    warningsDetected: Boolean(result.cliLog?.warningsDetected),
    stdoutPreview: stdout.slice(0, 500),
    stderrPreview: stderr.slice(0, 500)
  };
}

function recordProbeResult(result = {}) {
  const existing = safeReadJson(ABACUS_PROBE_STATUS_PATH, {});
  const byMode = existing && typeof existing === "object" && existing.byMode && typeof existing.byMode === "object"
    ? existing.byMode
    : {};
  const mode = normalizeText(result.mode || "unknown", 80).toLowerCase() || "unknown";
  byMode[mode] = {
    mode,
    ok: Boolean(result.ok),
    startedAt: normalizeText(result.startedAt || "", 80),
    finishedAt: normalizeText(result.finishedAt || "", 80),
    exitCode: Number(result.exitCode || 0) || 0,
    timedOut: Boolean(result.timedOut),
    command: normalizeText(result.command || "", 1200),
    cliLogPath: normalizeText(result.cliLog?.latestPath || "", 800),
    analysis: analyzeProbeResult(result)
  };
  const payload = {
    updatedAt: new Date().toISOString(),
    byMode
  };
  safeWriteJson(ABACUS_PROBE_STATUS_PATH, payload);
  return payload;
}

function buildWorkerLaneStatus() {
  const packets = listAbacusWorkPackets(10);
  return {
    packetRoot: packets.rootPath,
    packetRootExists: packets.exists,
    totalPackets: packets.total,
    recentPackets: packets.items
  };
}

function buildCapabilitySummary(config = {}, surfaces = {}, probeStatus = {}, workerLane = {}) {
  const helpProbe = probeStatus?.byMode?.help || null;
  const mcpProbe = probeStatus?.byMode?.mcp_list || null;
  const versionProbe = probeStatus?.byMode?.version || null;
  const readyProbe = probeStatus?.byMode?.ready_json || null;
  const cliAnalysis = [
    helpProbe?.analysis,
    mcpProbe?.analysis,
    versionProbe?.analysis,
    readyProbe?.analysis
  ].filter(Boolean);
  const anyCliAnalysis = (predicate) => cliAnalysis.some((item) => Boolean(item && predicate(item)));
  const browserReady = Boolean(config.enabled && config.appUrl && config.profileName);
  const desktopInstalled = Boolean(surfaces.desktop?.installed);
  const desktopRunning = Array.isArray(surfaces.desktop?.running) && surfaces.desktop.running.length > 0;
  const listenerInstalled = Boolean(surfaces.listener?.installed);
  const listenerRunning = Array.isArray(surfaces.listener?.running) && surfaces.listener.running.length > 0;
  const cliInstalled = Boolean(surfaces.desktop?.cliExists);
  const helpReady = Boolean(helpProbe?.ok);
  const mcpReady = Boolean(mcpProbe?.ok);
  const printReady = Boolean(readyProbe?.ok && readyProbe?.analysis?.readyTokenDetected);
  const loginRequired = anyCliAnalysis((item) => item.loginRequiredDetected);
  const interactiveFallback = anyCliAnalysis((item) => item.interactiveShellDetected);
  const workerTier = !browserReady && !desktopInstalled
    ? "unavailable"
    : printReady
      ? "desktop_cli_headless"
      : mcpReady || helpReady
        ? "desktop_cli_limited"
        : desktopRunning
          ? "desktop_interactive"
          : browserReady
            ? "browser_only"
            : "unavailable";
  return {
    browser: {
      ready: browserReady,
      isolatedProfileReady: Boolean(config.browserMode === "managed_isolated" && config.profileName),
      authenticatedLikely: Boolean(config.accountEmail && surfaces.desktop?.userDataExists)
    },
    desktop: {
      installed: desktopInstalled,
      running: desktopRunning,
      listenerInstalled,
      listenerRunning
    },
    cli: {
      installed: cliInstalled,
      helpReady,
      mcpReady,
      printReady,
      loginRequiredDetected: loginRequired,
      interactiveFallbackDetected: interactiveFallback,
      brokenResourcePathsDetected: anyCliAnalysis((item) => item.brokenResourcePathsDetected),
      constantsFetchFailedDetected: anyCliAnalysis((item) => item.constantsFetchFailedDetected)
    },
    workerLane: {
      tier: workerTier,
      packetRoot: workerLane.packetRoot || ABACUS_PACKET_ROOT,
      packetCount: Number(workerLane.totalPackets || 0) || 0
    }
  };
}

function buildLatestCliLogStatus(rootPath) {
  const logsRoot = path.join(rootPath, "logs");
  if (!fs.existsSync(logsRoot)) {
    return {
      logsRoot,
      latestPath: "",
      latestUpdatedAt: "",
      latestTail: "",
      warningsDetected: false
    };
  }
  try {
    const candidates = fs.readdirSync(logsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(logsRoot, entry.name, "cli.log"))
      .filter((candidate) => fs.existsSync(candidate))
      .map((candidate) => ({
        path: candidate,
        stat: safeStat(candidate)
      }))
      .filter((entry) => entry.stat);
    candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    const latest = candidates[0];
    if (!latest) {
      return {
        logsRoot,
        latestPath: "",
        latestUpdatedAt: "",
        latestTail: "",
        warningsDetected: false
      };
    }
    const tail = String(fs.readFileSync(latest.path, "utf8") || "")
      .trim()
      .split(/\r?\n/)
      .slice(-6)
      .join("\n");
    return {
      logsRoot,
      latestPath: latest.path,
      latestUpdatedAt: latest.stat.mtime.toISOString(),
      latestTail: tail,
      warningsDetected: /Failed to fetch constants from server/i.test(tail)
    };
  } catch (_error) {
    return {
      logsRoot,
      latestPath: "",
      latestUpdatedAt: "",
      latestTail: "",
      warningsDetected: false
    };
  }
}

function buildDesktopSurfaceStatus() {
  const installRoot = DEFAULT_DESKTOP_ROOT;
  const listenerRoot = DEFAULT_LISTENER_ROOT;
  const exePath = path.join(installRoot, "AbacusAI.exe");
  const cliPath = path.join(installRoot, "bin", "abacusai.cmd");
  const listenerExePath = path.join(listenerRoot, "AbacusAI Listener.exe");
  return {
    desktop: {
      installRoot,
      installed: fs.existsSync(exePath),
      exePath,
      cliPath,
      cliExists: fs.existsSync(cliPath),
      userDataPath: DEFAULT_DESKTOP_USER_DATA,
      userDataExists: fs.existsSync(DEFAULT_DESKTOP_USER_DATA),
      productJsonPath: path.join(installRoot, "product.json"),
      productJsonExists: fs.existsSync(path.join(installRoot, "product.json")),
      packageJsonPath: path.join(installRoot, "package.json"),
      packageJsonExists: fs.existsSync(path.join(installRoot, "package.json")),
      running: listRunningProcessesByImage(/^AbacusAI(?:\.exe)?$/i),
      listening: listListeningPortsByProcessName(/^AbacusAI(?:\.exe)?$/i),
      cliLog: buildLatestCliLogStatus(DEFAULT_DESKTOP_USER_DATA)
    },
    listener: {
      installRoot: listenerRoot,
      installed: fs.existsSync(listenerExePath),
      exePath: listenerExePath,
      userDataPath: DEFAULT_LISTENER_USER_DATA,
      userDataExists: fs.existsSync(DEFAULT_LISTENER_USER_DATA),
      running: listRunningProcessesByImage(/^AbacusAI Listener(?:\.exe)?$/i),
      listening: listListeningPortsByProcessName(/^AbacusAI Listener(?:\.exe)?$/i)
    }
  };
}

function quoteWindowsArg(value) {
  const text = String(value || "");
  if (!text) return '""';
  if (!/[\s"]/g.test(text)) return text;
  return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
}

function resolveDesktopExecutablePath() {
  return path.join(DEFAULT_DESKTOP_ROOT, "AbacusAI.exe");
}

function resolveDesktopAppCliPath() {
  return path.join(DEFAULT_DESKTOP_ROOT, "bin", "abacusai-app.cmd");
}

function resolveCliPath() {
  return path.join(DEFAULT_DESKTOP_ROOT, "bin", "abacusai.cmd");
}

function resolveListenerExecutablePath() {
  return path.join(DEFAULT_LISTENER_ROOT, "AbacusAI Listener.exe");
}

function killProcessTree(pid) {
  const value = Number(pid || 0) || 0;
  if (value <= 0) return;
  try {
    childProcess.spawnSync("taskkill", ["/PID", String(value), "/T", "/F"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000
    });
  } catch (_error) {
    try {
      process.kill(value);
    } catch (__error) {
      // ignore
    }
  }
}

function runCliCommand(commandPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(commandPath, Array.isArray(args) ? args : [], {
      windowsHide: true,
      cwd: DEFAULT_DESKTOP_ROOT,
      env: process.env,
      shell: true
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code: Number(code || 0) || 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        timedOut
      });
    });
  });
}

function buildCliProbeArgs(mode) {
  const normalized = normalizeText(mode, 80).toLowerCase();
  switch (normalized) {
    case "version":
      return ["--version"];
    case "mcp_list":
      return ["mcp", "list"];
    case "ready_json":
      return ["-p", "--output-format", "json", "Return exactly READY."];
    case "help":
    default:
      return ["--help"];
  }
}

async function runAbacusCliProbe(options = {}) {
  const cliPath = resolveCliPath();
  if (!fs.existsSync(cliPath)) {
    throw new Error(`Abacus CLI is not installed: ${cliPath}`);
  }
  const mode = normalizeText(options.mode || "help", 80).toLowerCase() || "help";
  const args = buildCliProbeArgs(mode);
  const timeoutMs = Math.max(
    5000,
    Math.min(120000, Number(options.timeoutMs || DEFAULT_CLI_PROBE_TIMEOUT_MS))
  );
  const command = `${quoteWindowsArg(cliPath)} ${args.map((item) => quoteWindowsArg(item)).join(" ")}`.trim();
  const startedAt = new Date().toISOString();
  const result = await runCliCommand(cliPath, args, timeoutMs);
  const cliLog = buildLatestCliLogStatus(DEFAULT_DESKTOP_USER_DATA);
  const payload = {
    ok: !result.timedOut && result.code === 0,
    mode,
    command,
    timeoutMs,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.code,
    timedOut: result.timedOut,
    stdout: String(result.stdout || "").trim().slice(0, 12000),
    stderr: String(result.stderr || "").trim().slice(0, 12000),
    cliLog
  };
  payload.analysis = analyzeProbeResult(payload);
  recordProbeResult(payload);
  return payload;
}

function openAbacusDesktop(options = {}) {
  const useAppCli = asBoolLike(options.useAppCli, false);
  const desktopExe = resolveDesktopExecutablePath();
  const desktopAppCli = resolveDesktopAppCliPath();
  if (!fs.existsSync(desktopExe) && !(useAppCli && fs.existsSync(desktopAppCli))) {
    throw new Error(`Abacus desktop app is not installed: ${desktopExe}`);
  }
  const args = Array.isArray(options.args)
    ? options.args.map((item) => normalizeText(item, 1200)).filter(Boolean)
    : [];
  const spawnCwd = normalizeText(options.cwd, 1200) || DEFAULT_DESKTOP_ROOT;
  let child = null;
  let commandPath = desktopExe;

  if (useAppCli && fs.existsSync(desktopAppCli)) {
    commandPath = desktopAppCli;
    child = childProcess.spawn("cmd.exe", ["/c", desktopAppCli, ...args], {
      cwd: spawnCwd,
      windowsHide: false,
      detached: true,
      stdio: "ignore"
    });
  } else {
    child = childProcess.spawn(desktopExe, args, {
      cwd: spawnCwd,
      windowsHide: false,
      detached: true,
      stdio: "ignore"
    });
  }
  child.unref();
  return {
    ok: true,
    pid: Number(child.pid || 0) || 0,
    exePath: commandPath,
    args
  };
}

function openAbacusWorkPacket(packetId, options = {}) {
  const packet = ensurePacketWorkspaceScaffold(getAbacusWorkPacket(packetId));
  const args = [asBoolLike(options.newWindow, false) ? "--new-window" : "--reuse-window"];
  if (asBoolLike(options.openFolder, true)) {
    args.push(packet.packetDir);
  }
  if (asBoolLike(options.openPrompt, true)) {
    args.push(path.basename(packet.promptPath));
  }
  if (asBoolLike(options.openResponse, true)) {
    args.push(path.basename(packet.responsePath));
  }
  const launched = openAbacusDesktop({
    args,
    cwd: packet.packetDir,
    useAppCli: true
  });
  return {
    packet,
    launched
  };
}

function asBoolLike(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const lowered = String(value).trim().toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return fallback;
}

function summarizeConfig(config = {}) {
  const profile = buildProfileStatus(config);
  const secret = getSecret(ABACUS_SECRET_NAME, { namespace: "owner" });
  const surfaces = buildDesktopSurfaceStatus();
  const probeStatus = buildProbeStatus();
  const workerLane = buildWorkerLaneStatus();
  return {
    enabled: Boolean(config.enabled),
    configured: Boolean(config.appUrl && config.profileName),
    source: secret ? "vault" : "defaults",
    appUrl: config.appUrl,
    appId: config.appId,
    accountEmail: config.accountEmail,
    authProvider: config.authProvider,
    browserMode: config.browserMode,
    windowTarget: config.windowTarget,
    notes: config.notes,
    updatedAt: config.updatedAt || "",
    profile,
    surfaces,
    probeStatus,
    capabilities: buildCapabilitySummary(config, surfaces, probeStatus, workerLane),
    workerLane
  };
}

function emitAbacusEvent(action, config = {}, extra = {}) {
  appendGraphEvent({
    component: "abacus-integration",
    category: extra.category || "browser_worker",
    action,
    actor: {
      type: "integration_manager",
      id: "abacus",
      label: "abacus manager",
      domain: "local"
    },
    subject: {
      type: "integration",
      id: "abacus",
      label: "abacus",
      domain: "external",
      criticality: config.enabled ? "medium" : "low"
    },
    target: extra.target || {
      type: "browser_surface",
      id: config.appId || "chatllm",
      label: config.appId || "chatllm",
      domain: "abacus.ai",
      criticality: "medium"
    },
    context: {
      appUrl: config.appUrl || DEFAULT_APP_URL,
      appId: config.appId || "",
      windowTarget: config.windowTarget || DEFAULT_WINDOW_TARGET,
      profileName: config.profileName || DEFAULT_PROFILE_NAME,
      accountEmail: config.accountEmail || "",
      authProvider: config.authProvider || "",
      browserMode: config.browserMode || DEFAULT_BROWSER_MODE,
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

function emitAbacusManifest(action, status, config = {}, extra = {}) {
  appendActionManifest({
    component: "abacus-integration",
    action,
    status,
    actor: {
      type: "integration_manager",
      id: "abacus",
      label: "abacus manager"
    },
    target: extra.target || {
      type: "browser_surface",
      id: config.appId || "chatllm",
      label: config.appId || "chatllm",
      domain: "abacus.ai",
      criticality: "medium"
    },
    reason: extra.reason || "",
    context: {
      appUrl: config.appUrl || DEFAULT_APP_URL,
      appId: config.appId || "",
      windowTarget: config.windowTarget || DEFAULT_WINDOW_TARGET,
      profileName: config.profileName || DEFAULT_PROFILE_NAME,
      accountEmail: config.accountEmail || "",
      authProvider: config.authProvider || "",
      browserMode: config.browserMode || DEFAULT_BROWSER_MODE,
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

function getAbacusIntegrationStatus() {
  const now = Date.now();
  if (abacusStatusCache.payload && abacusStatusCache.expiresAt > now) {
    return JSON.parse(JSON.stringify(abacusStatusCache.payload));
  }
  const payload = summarizeConfig(resolveAbacusConfig());
  abacusStatusCache.payload = payload;
  abacusStatusCache.expiresAt = now + ABACUS_STATUS_CACHE_TTL_MS;
  return JSON.parse(JSON.stringify(payload));
}

function setAbacusConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(ABACUS_SECRET_NAME, { namespace: "owner" });
    const cleared = getAbacusIntegrationStatus();
    emitAbacusManifest("abacus_config", "cleared", resolveAbacusConfig(), {
      reason: "Abacus integration settings cleared."
    });
    return cleared;
  }

  const previous = resolveAbacusConfig();
  const appUrl = Object.prototype.hasOwnProperty.call(input, "appUrl")
    ? normalizeAppUrl(input.appUrl)
    : previous.appUrl;
  const payload = {
    enabled: Object.prototype.hasOwnProperty.call(input, "enabled")
      ? normalizeBool(input.enabled, previous.enabled)
      : previous.enabled,
    appUrl,
    appId: Object.prototype.hasOwnProperty.call(input, "appId")
      ? normalizeText(input.appId || deriveAppId(appUrl), 120)
      : (previous.appId || deriveAppId(appUrl)),
    accountEmail: Object.prototype.hasOwnProperty.call(input, "accountEmail")
      ? normalizeText(input.accountEmail, 200).toLowerCase()
      : previous.accountEmail,
    authProvider: Object.prototype.hasOwnProperty.call(input, "authProvider")
      ? normalizeText(input.authProvider, 80).toLowerCase()
      : previous.authProvider,
    profileName: Object.prototype.hasOwnProperty.call(input, "profileName")
      ? normalizeProfileName(input.profileName)
      : previous.profileName,
    windowTarget: Object.prototype.hasOwnProperty.call(input, "windowTarget")
      ? normalizeWindowTarget(input.windowTarget)
      : previous.windowTarget,
    browserMode: Object.prototype.hasOwnProperty.call(input, "browserMode")
      ? normalizeBrowserMode(input.browserMode)
      : previous.browserMode,
    notes: Object.prototype.hasOwnProperty.call(input, "notes")
      ? normalizeText(input.notes, 500)
      : previous.notes,
    updatedAt: new Date().toISOString()
  };

  setSecret(
    ABACUS_SECRET_NAME,
    payload,
    {
      app: "Asolaria",
      component: "abacus-integration",
      credentialOwner: "owner",
      actor: "owner",
      updatedBy: "api"
    },
    { namespace: "owner" }
  );

  emitAbacusManifest("abacus_config", "queued", payload, {
    reason: "Abacus browser integration settings updated."
  });
  emitAbacusEvent("abacus_config_saved", payload, {
    detail: {
      profileName: payload.profileName,
      windowTarget: payload.windowTarget
    }
  });

  return summarizeConfig(payload);
}

module.exports = {
  getAbacusIntegrationStatus,
  setAbacusConfig,
  getAbacusPacketPresets,
  getAbacusOperatingStrategy,
  listAbacusWorkPackets,
  getAbacusWorkPacket,
  scanAbacusWorkPacket,
  writeAbacusWorkPacketResponse,
  openAbacusWorkPacket,
  createAbacusWorkPacket,
  runAbacusCliProbe,
  openAbacusDesktop,
  emitAbacusEvent,
  emitAbacusManifest
};
