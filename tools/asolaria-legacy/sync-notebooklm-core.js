const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function parseArgs(argv) {
  const out = {
    baseUrl: "http://127.0.0.1:4781",
    account: "plasmatoid@gmail.com",
    project: "winged-complex-390417",
    location: "global",
    notebookTitle: "Asolaria Enterprise Memory"
  };
  for (let i = 2; i < argv.length; i += 1) {
    const key = String(argv[i] || "");
    const value = String(argv[i + 1] || "");
    if (!key.startsWith("--")) continue;
    if (key === "--baseUrl") out.baseUrl = value;
    if (key === "--account") out.account = value;
    if (key === "--project") out.project = value;
    if (key === "--location") out.location = value;
    if (key === "--notebookTitle") out.notebookTitle = value;
    i += 1;
  }
  return out;
}

function sanitizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

function canonicalizeNotebookSeedText(value) {
  let text = sanitizeText(value);
  const literalRewrites = [
    ["C:\\Users\\acer\\codex-bridge\\colony-agent-bot.js", "the shared Vector lane bridge bot runner"],
    ["C:\\Users\\acer\\codex-bridge\\this-codex-bot.js", "the shared Vector lane bridge bot runner"],
    ["`colony-agent-bot.js`", "`Vector lane bridge bot runner`"],
    ["`this-codex-bot.js`", "`Vector lane bridge bot runner`"],
    ["this/other/build/phone", "vector/rook/forge/falcon"]
  ];
  for (const [from, to] of literalRewrites) {
    text = text.split(from).join(to);
  }
  // External notes and historical exports may still carry pre-rename lane ids.
  const patternRewrites = [
    [/@asolaria-core\b/gi, "@asolaria"],
    [/@this-codex\b/gi, "@vector"],
    [/@other-codex\b/gi, "@rook"],
    [/@build-codex\b/gi, "@forge"],
    [/@phone-codex\b/gi, "@falcon"],
    [/\basolaria-core\b/gi, "asolaria"],
    [/\bcolony-agent-bot\b/gi, "Vector lane bot"],
    [/\bthis-codex-bot\b/gi, "Vector lane bot"],
    [/\bthis-codex\b/gi, "vector"],
    [/\bother-codex\b/gi, "rook"],
    [/\bbuild-codex\b/gi, "forge"],
    [/\bphone-codex\b/gi, "falcon"]
  ];
  for (const [pattern, replacement] of patternRewrites) {
    text = text.replace(pattern, replacement);
  }
  return sanitizeText(text);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

async function getJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error.message}`);
  }
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status} for ${url}`);
  }
  return json;
}

async function waitJob(baseUrl, jobId, timeoutMs = 120000) {
  const deadline = Date.now() + Math.max(10000, timeoutMs);
  while (Date.now() < deadline) {
    const row = await getJson(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`);
    const status = String(row?.job?.status || "");
    if (status !== "queued" && status !== "running") {
      return row.job;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function queueGetJob(baseUrl, pathWithQuery) {
  const queued = await getJson(`${baseUrl}${pathWithQuery}`);
  return waitJob(baseUrl, queued.job.id);
}

async function queuePostJob(baseUrl, pathName, body) {
  const queued = await getJson(`${baseUrl}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return waitJob(baseUrl, queued.job.id, 240000);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readUtf8(filePath, maxChars = 32000) {
  const raw = fs.readFileSync(filePath, "utf8");
  if (raw.length <= maxChars) {
    return canonicalizeNotebookSeedText(raw);
  }
  return canonicalizeNotebookSeedText(`${raw.slice(0, maxChars).trim()}\n\n[Truncated for NotebookLM seed bundle.]`);
}

function readActiveTasks(tasksPath, maxChars = 26000) {
  const lines = fs.readFileSync(tasksPath, "utf8").split(/\r?\n/);
  let start = 0;
  let end = lines.length - 1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^## Active Tasks/.test(lines[i])) {
      start = i;
      break;
    }
  }
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## Completed Tasks/.test(lines[i])) {
      end = i - 1;
      break;
    }
  }
  const text = lines.slice(start, end + 1).join("\n");
  if (text.length <= maxChars) {
    return canonicalizeNotebookSeedText(text);
  }
  return canonicalizeNotebookSeedText(`${text.slice(0, maxChars).trim()}\n\n[Truncated active task snapshot.]`);
}

function writeRenderedSource(reportsDir, slug, title, origin, body) {
  ensureDir(reportsDir);
  const rendered = sanitizeText([
    `# ${title}`,
    "",
    origin ? `Origin: ${origin}` : "",
    body
  ].filter(Boolean).join("\n"));
  const renderedPath = path.join(reportsDir, `${slug}.md`);
  fs.writeFileSync(renderedPath, rendered, "utf8");
  return { renderedPath, content: rendered };
}

async function buildRuntimeSnapshot(baseUrl, account, project, location) {
  const fast = await getJson(`${baseUrl}/api/health/fast`);
  const statusJob = await queueGetJob(
    baseUrl,
    `/api/integrations/notebooklm/enterprise/status?account=${encodeURIComponent(account)}&project=${encodeURIComponent(project)}&location=${encodeURIComponent(location)}`
  );
  if (String(statusJob.status) !== "completed") {
    throw new Error(`NotebookLM status failed: ${statusJob.error || "unknown"}`);
  }
  const status = statusJob.result || {};
  const route = fast?.connectionRouting?.selected || {};
  const phoneKeeper = fast?.networkPolicy?.phoneBridgeKeeper || {};
  const phoneMonitor = fast?.networkPolicy?.phoneTunnelMonitor || {};
  return sanitizeText([
    "# Asolaria Runtime Snapshot",
    "",
    `Primary provider: ${fast?.settings?.brainPrimaryProvider || ""}`,
    `Voice output mode: ${fast?.settings?.voiceOutputMode || ""}`,
    `Wake word: ${fast?.settings?.voiceWakeWord || ""}`,
    `Bridge auto-sync enabled: ${fast?.settings?.bridgeAutoSyncEnabled || false}`,
    `Agent colony watchdog enabled: ${fast?.settings?.agentColonyWatchdogEnabled || false}`,
    `Selected route: ${route?.channel || ""}`,
    `Route reason: ${route?.reason || ""}`,
    `Phone bridge keeper running: ${phoneKeeper?.running || false}`,
    `Phone tunnel monitor running: ${phoneMonitor?.running || false}`,
    `NotebookLM enterprise ready: ${status?.enterpriseReady || false}`,
    `NotebookLM access: ${status?.access || false}`,
    `NotebookLM recent notebook count: ${status?.recentNotebookCount || 0}`,
    "",
    "## Memory Architecture Split",
    "",
    "- Asolaria shared memory handles low-latency, multi-turn phone/live memory.",
    "- Gemini Live / Vertex Live handles app-managed realtime voice interaction.",
    "- NotebookLM Enterprise is reserved for curated, slower-changing long-form project knowledge.",
    "- The phone Gemini edge route now carries `chatId=phone-live` and writes turns into Asolaria shared memory.",
    "",
    "## Current Control Principle",
    "",
    "- Asolaria is the control plane.",
    "- Gemini is the live voice/model surface under Asolaria routing and task control.",
    "- NotebookLM is project knowledge, not the instant wake-word memory store."
  ].join("\n"));
}

function loadState(statePath) {
  try {
    if (!fs.existsSync(statePath)) {
      return { notebookTitle: "", notebookName: "", updatedAt: "", sources: {} };
    }
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    parsed.sources = parsed && typeof parsed.sources === "object" && parsed.sources ? parsed.sources : {};
    return parsed;
  } catch {
    return { notebookTitle: "", notebookName: "", updatedAt: "", sources: {} };
  }
}

function saveState(statePath, state) {
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(__dirname, "..");
  const reportsDir = path.join(root, "reports", "notebooklm-core");
  const statePath = path.join(root, "data", "notebooklm-core-sync-state.json");
  const baseUrl = String(args.baseUrl || "").replace(/\/+$/, "");

  const statusJob = await queueGetJob(
    baseUrl,
    `/api/integrations/notebooklm/enterprise/status?account=${encodeURIComponent(args.account)}&project=${encodeURIComponent(args.project)}&location=${encodeURIComponent(args.location)}`
  );
  if (String(statusJob.status) !== "completed") {
    throw new Error(`NotebookLM status failed: ${statusJob.error || "unknown"}`);
  }
  if (!statusJob?.result?.enterpriseReady) {
    throw new Error(`NotebookLM Enterprise is not ready: ${(statusJob?.result?.blockers || []).join(" | ")}`);
  }

  const listJob = await queueGetJob(
    baseUrl,
    `/api/integrations/notebooklm/enterprise/notebooks?account=${encodeURIComponent(args.account)}&project=${encodeURIComponent(args.project)}&location=${encodeURIComponent(args.location)}&limit=50`
  );
  if (String(listJob.status) !== "completed") {
    throw new Error(`Notebook list failed: ${listJob.error || "unknown"}`);
  }
  const notebooks = Array.isArray(listJob?.result?.notebooks) ? listJob.result.notebooks : [];
  let notebook = notebooks.find((row) => String(row?.title || "") === args.notebookTitle) || null;
  let notebookCreated = false;
  if (!notebook) {
    const createJob = await queuePostJob(baseUrl, "/api/integrations/notebooklm/enterprise/notebooks", {
      account: args.account,
      project: args.project,
      location: args.location,
      title: args.notebookTitle
    });
    if (String(createJob.status) !== "completed") {
      throw new Error(`Notebook create failed: ${createJob.error || "unknown"}`);
    }
    notebook = createJob.result.notebook;
    notebookCreated = true;
  }
  const notebookName = String(notebook?.name || "").trim();
  if (!notebookName) {
    throw new Error("Notebook name was empty after list/create.");
  }

  const runtimeText = await buildRuntimeSnapshot(baseUrl, args.account, args.project, args.location);
  const notebooklmReferenceText = sanitizeText([
    "# NotebookLM Enterprise Reference",
    "",
    "NotebookLM Enterprise is the long-form project-knowledge layer for Asolaria, not the instant phone/live memory layer.",
    "",
    "Recommended split:",
    "- Asolaria shared memory: low-latency multi-turn phone and operator conversations.",
    "- Gemini Live / Vertex Live: realtime app-managed voice sessions.",
    "- NotebookLM Enterprise: curated docs, runbooks, policy, architecture, and selected task summaries.",
    "",
    "Current verified setup on this machine:",
    `- Account: ${args.account}`,
    `- Project: ${args.project}`,
    `- Location: ${args.location}`,
    "- Discovery Engine API is enabled.",
    "- NotebookLM Enterprise access is healthy for the configured account.",
    "",
    "Official references:",
    "- Setup: https://cloud.google.com/gemini/enterprise/docs/notebooklm-enterprise/set-up-notebooklm-enterprise",
    "- Vertex Live API: https://cloud.google.com/vertex-ai/generative-ai/docs/live-api",
    "- Gemini Live Android: https://developer.android.com/ai/gemini/live"
  ].join("\n"));
  const sourceDefs = [];
  function pushTextSource(key, title, originPath, body) {
    const rendered = writeRenderedSource(reportsDir, key, title, originPath, body);
    sourceDefs.push({
      key,
      type: "text",
      sourceName: title,
      origin: originPath,
      renderedPath: rendered.renderedPath,
      content: rendered.content,
      fingerprint: sha256(rendered.content)
    });
  }
  function pushWebSource(key, title, url) {
    sourceDefs.push({
      key,
      type: "web",
      sourceName: title,
      origin: url,
      renderedPath: "",
      url,
      content: "",
      fingerprint: sha256(`${title}\n${url}`)
    });
  }

  pushTextSource("runtime-snapshot", "Asolaria Runtime Snapshot", "live runtime", runtimeText);
  pushTextSource("system-card", "Asolaria System Card", path.join(root, "reports", "asolaria-system-card-20260303.md"), readUtf8(path.join(root, "reports", "asolaria-system-card-20260303.md"), 24000));
  pushTextSource("startup-contract", "Asolaria Startup Contract", path.join(root, "docs", "STARTUP_CONTRACT_V1.md"), readUtf8(path.join(root, "docs", "STARTUP_CONTRACT_V1.md"), 18000));
  pushTextSource("startup-gap-report", "Asolaria Startup Gap Report", path.join(root, "docs", "STARTUP_ARCHITECTURE_GAP_REPORT.md"), readUtf8(path.join(root, "docs", "STARTUP_ARCHITECTURE_GAP_REPORT.md"), 18000));
  pushTextSource("augment-context-sidecar", "Augment Context Sidecar", path.join(root, "docs", "AUGMENT_CONTEXT_SIDECAR.md"), readUtf8(path.join(root, "docs", "AUGMENT_CONTEXT_SIDECAR.md"), 16000));
  pushTextSource("symphony-integration", "Symphony Integration", path.join(root, "docs", "SYMPHONY_INTEGRATION.md"), readUtf8(path.join(root, "docs", "SYMPHONY_INTEGRATION.md"), 16000));
  pushTextSource("symphony-workflow", "Symphony Workflow", path.join(root, "config", "symphony", "WORKFLOW.asolaria.md"), readUtf8(path.join(root, "config", "symphony", "WORKFLOW.asolaria.md"), 12000));
  pushTextSource("active-tasks", "Asolaria Active Tasks Snapshot", path.join(root, "TASKS.md"), readActiveTasks(path.join(root, "TASKS.md"), 26000));
  const skillsToolsMistakesIndexPath = path.join(root, "reports", "skills-tools-mistakes-index-latest.md");
  if (fs.existsSync(skillsToolsMistakesIndexPath)) {
    pushTextSource("skills-tools-mistakes-index", "Skills Tools Mistakes Index", skillsToolsMistakesIndexPath, readUtf8(skillsToolsMistakesIndexPath, 16000));
  }
  const queueServerSftpPath = path.join(root, "reports", "queue-server-sftp-troubleshooting-20260311.md");
  if (fs.existsSync(queueServerSftpPath)) {
    pushTextSource("queue-server-sftp-troubleshooting", "Queue-Server SFTP Troubleshooting 2026-03-11", queueServerSftpPath, readUtf8(queueServerSftpPath, 18000));
  }
  const qddMonorepoCheckpointPath = path.join(root, "reports", "qdd-monorepo-ez-protect-checkpoint-latest.md");
  if (fs.existsSync(qddMonorepoCheckpointPath)) {
    pushTextSource("qdd-monorepo-ez-protect-checkpoint", "QDD Monorepo EZ Protect Checkpoint", qddMonorepoCheckpointPath, readUtf8(qddMonorepoCheckpointPath, 18000));
  }
  const qddRestartPacketPath = path.join(root, "reports", "qdd-codex-restart-packet-latest.md");
  if (fs.existsSync(qddRestartPacketPath)) {
    pushTextSource("qdd-codex-restart-packet", "QDD Codex Restart Packet", qddRestartPacketPath, readUtf8(qddRestartPacketPath, 18000));
  }
  pushWebSource("vertex-live-docs", "Vertex AI Live API Official Docs", "https://cloud.google.com/vertex-ai/generative-ai/docs/live-api");
  pushTextSource("notebooklm-enterprise-reference", "NotebookLM Enterprise Reference", "official docs summary", notebooklmReferenceText);

  const state = loadState(statePath);
  const pending = sourceDefs.filter((source) => {
    const previous = state?.sources?.[source.key];
    return String(state?.notebookName || "") !== notebookName || String(previous?.fingerprint || "") !== source.fingerprint;
  });

  let batchJobId = "";
  let batchResult = { createdCount: 0, sources: [] };
  let successfulBatchTitles = new Set();
  if (pending.length) {
    const entries = pending.map((source) => {
      if (source.type === "web") {
        return { type: "web", sourceName: source.sourceName, url: source.url };
      }
      return { type: "text", sourceName: source.sourceName, content: source.content };
    });
    const batchJob = await queuePostJob(baseUrl, "/api/integrations/notebooklm/enterprise/sources/batch_create", {
      account: args.account,
      project: args.project,
      location: args.location,
      notebook: notebookName,
      entries
    });
    batchJobId = String(batchJob.id || "");
    if (String(batchJob.status) !== "completed") {
      throw new Error(`Notebook source batch failed: ${batchJob.error || "unknown"}`);
    }
    batchResult = batchJob.result || batchResult;
    successfulBatchTitles = new Set(
      (Array.isArray(batchResult?.sources) ? batchResult.sources : [])
        .map((row) => String(row?.title || "").trim())
        .filter(Boolean)
    );
  }

  const nextState = {
    notebookTitle: args.notebookTitle,
    notebookName,
    updatedAt: new Date().toISOString(),
    sources: {}
  };
  for (const source of sourceDefs) {
    const wasChanged = pending.some((row) => row.key === source.key);
    if (wasChanged && pending.length && !successfulBatchTitles.has(source.sourceName) && source.type !== "web") {
      continue;
    }
    if (wasChanged && pending.length && source.type === "web" && !successfulBatchTitles.has(source.sourceName)) {
      continue;
    }
    nextState.sources[source.key] = {
      fingerprint: source.fingerprint,
      sourceName: source.sourceName,
      type: source.type,
      origin: source.origin,
      renderedPath: source.renderedPath,
      updatedAt: new Date().toISOString()
    };
  }
  saveState(statePath, nextState);

  ensureDir(reportsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportJsonPath = path.join(reportsDir, `notebooklm-core-sync-${stamp}.json`);
  const reportMdPath = path.join(reportsDir, `notebooklm-core-sync-${stamp}.md`);
  const summary = {
    ok: true,
    notebookTitle: args.notebookTitle,
    notebookName,
    notebookCreated,
    account: args.account,
    project: args.project,
    location: args.location,
    totalSourcesDefined: sourceDefs.length,
    changedSourceCount: pending.length,
    changedSources: pending.map((row) => row.sourceName),
    createdCount: Number(batchResult?.createdCount || 0),
    batchJobId,
    statePath,
    renderedSources: sourceDefs.map((row) => ({
      sourceName: row.sourceName,
      type: row.type,
      origin: row.origin,
      renderedPath: row.renderedPath
    })),
    batchSources: Array.isArray(batchResult?.sources) ? batchResult.sources : []
  };
  fs.writeFileSync(reportJsonPath, JSON.stringify(summary, null, 2), "utf8");
  const md = [
    "# NotebookLM Core Sync",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Notebook title: ${args.notebookTitle}`,
    `Notebook name: ${notebookName}`,
    `Notebook created: ${notebookCreated}`,
    `Changed source count: ${pending.length}`,
    `Created source count: ${Number(batchResult?.createdCount || 0)}`,
    "",
    "## Changed Sources",
    "",
    ...(pending.length ? pending.map((row) => `- ${row.sourceName} (${row.type})`) : ["- None. Local sync state already matched the current bundle."]),
    "",
    "## Rendered Source Artifacts",
    "",
    ...sourceDefs.map((row) => `- ${row.sourceName}: ${row.renderedPath || row.origin}`),
    "",
    "## State",
    "",
    `- State file: ${statePath}`,
    `- JSON report: ${reportJsonPath}`
  ].join("\n");
  fs.writeFileSync(reportMdPath, md, "utf8");

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(String(error?.message || error || "sync_failed"));
  process.exit(1);
});
