#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const EXCLUDED_NAMES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "Cache_Data",
  "blob_storage",
  "DawnCache",
  "GrShaderCache",
  "GraphiteDawnCache",
  "Media Cache",
  "OptimizationGuidePredictionModels",
  "ShaderCache"
]);

const DEFAULT_CREATE_URL =
  "https://portal.singlestore.com/organizations/bc8e29e2-6b74-41ea-b4d4-efc7c73b4f5f/workspaces/create?initialDeploymentType=dedicated&from=%2Fonboarding";

const DEFAULT_BOOTSTRAP_SQL = [
  "CREATE DATABASE IF NOT EXISTS asolaria_control;",
  "USE asolaria_control;",
  "CREATE TABLE IF NOT EXISTS agent_events (",
  "  id BIGINT AUTO_INCREMENT PRIMARY KEY,",
  "  event_ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,",
  "  source VARCHAR(64) NOT NULL,",
  "  event_type VARCHAR(64) NOT NULL,",
  "  payload_json JSON NULL,",
  "  KEY idx_event_ts (event_ts),",
  "  KEY idx_source_type (source, event_type)",
  ");",
  "CREATE TABLE IF NOT EXISTS task_runs (",
  "  id BIGINT AUTO_INCREMENT PRIMARY KEY,",
  "  task_id VARCHAR(128) NOT NULL,",
  "  run_ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,",
  "  status VARCHAR(32) NOT NULL,",
  "  duration_ms BIGINT NULL,",
  "  detail_json JSON NULL,",
  "  KEY idx_task_run_ts (task_id, run_ts),",
  "  KEY idx_status (status)",
  ");"
].join("\n");

function parseArgs(argv) {
  const out = {
    profileDirectory: "Profile 3",
    sourceRoot: "C:/Users/acer/AppData/Local/Google/Chrome/User Data",
    chromePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    createUrl: DEFAULT_CREATE_URL,
    initialWaitMs: 5000,
    provisionTimeoutMs: 12 * 60 * 1000,
    runBootstrap: true,
    maxTextChars: 25000
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--profile-directory" && next) {
      out.profileDirectory = String(next).trim();
      i += 1;
    } else if (arg === "--source-root" && next) {
      out.sourceRoot = String(next).trim();
      i += 1;
    } else if (arg === "--chrome-path" && next) {
      out.chromePath = String(next).trim();
      i += 1;
    } else if (arg === "--url" && next) {
      out.createUrl = String(next).trim();
      i += 1;
    } else if (arg === "--initial-wait-ms" && next) {
      out.initialWaitMs = Number(next) || out.initialWaitMs;
      i += 1;
    } else if (arg === "--provision-timeout-ms" && next) {
      out.provisionTimeoutMs = Number(next) || out.provisionTimeoutMs;
      i += 1;
    } else if (arg === "--run-bootstrap" && next) {
      out.runBootstrap = !/^(0|false|no)$/i.test(String(next).trim());
      i += 1;
    } else if (arg === "--max-text-chars" && next) {
      out.maxTextChars = Number(next) || out.maxTextChars;
      i += 1;
    }
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clip(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function shouldCopy(src) {
  const base = path.basename(src);
  if (EXCLUDED_NAMES.has(base)) return false;
  if (src.includes(`${path.sep}Service Worker${path.sep}CacheStorage`)) return false;
  return true;
}

function copyTreeBestEffort(src, dest) {
  if (!shouldCopy(src)) {
    return;
  }
  let stat = null;
  try {
    stat = fs.statSync(src);
  } catch (_error) {
    return;
  }
  if (stat.isDirectory()) {
    ensureDir(dest);
    let entries = [];
    try {
      entries = fs.readdirSync(src, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      copyTreeBestEffort(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  try {
    fs.copyFileSync(src, dest);
  } catch (_error) {
    // Skip files locked by live Chrome.
  }
}

function copyProfileTree(sourceRoot, profileDirectory, tempRoot) {
  ensureDir(tempRoot);
  for (const rootFile of ["Local State", "First Run", "Last Version"]) {
    const src = path.join(sourceRoot, rootFile);
    const dest = path.join(tempRoot, rootFile);
    if (!fs.existsSync(src)) continue;
    try {
      fs.copyFileSync(src, dest);
    } catch (_error) {
      // best effort
    }
  }
  copyTreeBestEffort(path.join(sourceRoot, profileDirectory), path.join(tempRoot, profileDirectory));
}

function deriveOrgBase(createUrl) {
  const match = String(createUrl || "").match(/(https:\/\/portal\.singlestore\.com\/organizations\/[^/]+)/i);
  if (!match) {
    throw new Error(`Could not derive organization base URL from: ${createUrl}`);
  }
  return match[1];
}

function extractWorkspaceName(text) {
  const match = String(text || "").match(/\bworkspace-[a-z0-9-]+\b/i);
  return match ? String(match[0]) : "";
}

function isAuthPage(text) {
  return /\bsign in\b|\blog in\b|continue with/i.test(String(text || ""));
}

function isSpinnerOnly(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  return t.length < 380 && /ask sqrl|usage policy/i.test(t);
}

function looksLikeSqlEditor(text) {
  const value = String(text || "");
  return /message logs/i.test(value) && /run\s*ctrl/i.test(value);
}

function looksLikeProvisioning(text) {
  return /provisioning|creating your deployment|\b\d{1,3}%\b/i.test(String(text || ""));
}

async function readBodyText(page, maxChars) {
  try {
    const value = await page.locator("body").innerText();
    return clip(value, maxChars);
  } catch (_error) {
    return "";
  }
}

async function clickFirstVisible(page, selectors, timeoutMs = 6000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      const count = await page.locator(selector).count();
      if (count < 1) continue;
      if (!(await locator.isVisible())) continue;
      await locator.click({ timeout: timeoutMs });
      return selector;
    } catch (_error) {
      // try next
    }
  }
  return "";
}

async function takeShot(page, captureDir, stamp, label, result) {
  const safe = String(label || "shot").replace(/[^a-z0-9._-]+/gi, "-");
  const shot = path.join(captureDir, `singlestore-${stamp}-${safe}.png`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  if (result && Array.isArray(result.screenshots)) {
    result.screenshots.push(shot);
  }
  return shot;
}

async function monitorWorkspaceReady(page, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 12 * 60 * 1000);
  const maxChars = Number(options.maxChars || 24000);
  const workspaceName = String(options.workspaceName || "").trim();
  const started = Date.now();
  const ticks = [];
  while (Date.now() - started < timeoutMs) {
    const text = await readBodyText(page, maxChars);
    const hasWorkspace = workspaceName
      ? text.toLowerCase().includes(workspaceName.toLowerCase())
      : /\bworkspace-[a-z0-9-]+\b/i.test(text);
    const provisioning = looksLikeProvisioning(text);
    const connectVisible = /\bconnect\b/i.test(text);
    const spinnerOnly = isSpinnerOnly(text);
    const percentMatch = text.match(/\b(\d{1,3})%\b/);
    ticks.push({
      at: new Date().toISOString(),
      hasWorkspace,
      provisioning,
      connectVisible,
      spinnerOnly,
      percent: percentMatch ? Number(percentMatch[1]) : null,
      url: page.url()
    });

    if (isAuthPage(text)) {
      return {
        ready: false,
        reason: "auth_required",
        ticks,
        text
      };
    }
    if (hasWorkspace && connectVisible && !provisioning && !spinnerOnly) {
      return {
        ready: true,
        reason: "workspace_ready",
        ticks,
        text
      };
    }

    await page.waitForTimeout(12000);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  const finalText = await readBodyText(page, maxChars);
  return {
    ready: false,
    reason: "provision_timeout",
    ticks,
    text: finalText
  };
}

async function ensureSqlEditorLoaded(page, editorUrl, options = {}) {
  const maxAttempts = Number(options.maxAttempts || 8);
  const maxChars = Number(options.maxChars || 24000);
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const text = await readBodyText(page, maxChars);
    const state = {
      attempt,
      at: new Date().toISOString(),
      url: page.url(),
      spinnerOnly: isSpinnerOnly(text),
      hasSqlEditor: looksLikeSqlEditor(text),
      hasOpenButton: /open sql editor/i.test(text)
    };
    attempts.push(state);
    if (isAuthPage(text)) {
      return { ok: false, reason: "auth_required", attempts, text };
    }
    if (state.hasSqlEditor) {
      return { ok: true, reason: "loaded", attempts, text };
    }
    if (state.hasOpenButton) {
      await clickFirstVisible(page, [
        "text=Open SQL Editor",
        "button:has-text('Open SQL Editor')",
        "[role='button']:has-text('Open SQL Editor')"
      ]);
      await page.waitForTimeout(6000);
      continue;
    }
    await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(5000);
  }
  const text = await readBodyText(page, maxChars);
  return { ok: false, reason: "editor_not_loaded", attempts, text };
}

async function selectConnection(page, workspaceName = "") {
  const clicked = await clickFirstVisible(page, [
    "text=Select Connection",
    "button:has-text('Select Connection')",
    "text=No connection selected",
    "button:has-text('No connection selected')"
  ]);
  if (!clicked) {
    return { attempted: false, selected: false, clicked: "" };
  }
  await page.waitForTimeout(1800);

  const selectors = [
    "[role='option']",
    "li[role='option']",
    "[data-testid*='option']",
    ".sui-c-select__option"
  ];

  for (const selector of selectors) {
    try {
      const rows = page.locator(selector);
      const count = await rows.count();
      if (count < 1) continue;
      let fallbackIndex = -1;
      for (let i = 0; i < Math.min(count, 30); i += 1) {
        const row = rows.nth(i);
        const label = String((await row.innerText().catch(() => "")) || "").trim();
        if (!label) continue;
        if (/no connection selected/i.test(label)) continue;
        if (fallbackIndex < 0) fallbackIndex = i;
        if (workspaceName && label.toLowerCase().includes(workspaceName.toLowerCase())) {
          await row.click({ timeout: 7000 });
          await page.waitForTimeout(2500);
          return { attempted: true, selected: true, clicked, optionSelector: selector, optionLabel: label };
        }
      }
      if (fallbackIndex >= 0) {
        const row = rows.nth(fallbackIndex);
        const label = String((await row.innerText().catch(() => "")) || "").trim();
        await row.click({ timeout: 7000 });
        await page.waitForTimeout(2500);
        return { attempted: true, selected: true, clicked, optionSelector: selector, optionLabel: label };
      }
    } catch (_error) {
      // continue
    }
  }
  return { attempted: true, selected: false, clicked, optionSelector: "", optionLabel: "" };
}

async function focusSqlEditor(page) {
  const selectors = [
    ".monaco-editor textarea",
    ".monaco-editor",
    "[data-testid*='editor'] textarea",
    "[aria-label*='SQL Editor' i]"
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      const count = await page.locator(selector).count();
      if (count < 1) continue;
      await locator.click({ timeout: 7000 });
      return selector;
    } catch (_error) {
      // try next
    }
  }
  throw new Error("Could not focus SQL editor input.");
}

async function runSql(page, sqlText) {
  const focusedSelector = await focusSqlEditor(page);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(sqlText);
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(7000);
  return {
    focusedSelector,
    typedChars: String(sqlText || "").length
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(args.chromePath)) {
    throw new Error(`Chrome executable not found: ${args.chromePath}`);
  }
  if (!fs.existsSync(args.sourceRoot)) {
    throw new Error(`Chrome user data root not found: ${args.sourceRoot}`);
  }

  const orgBase = deriveOrgBase(args.createUrl);
  const workspacesUrl = `${orgBase}/workspaces`;
  const developUrl = `${orgBase}/develop`;
  const editorUrl = `${orgBase}/develop/editor`;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.join("C:/Users/acer/Asolaria/reports", "singlestore");
  const captureDir = path.join("C:/Users/acer/Asolaria/captures", "singlestore");
  ensureDir(reportDir);
  ensureDir(captureDir);

  const tempRoot = path.join(
    os.tmpdir(),
    `asolaria-singlestore-${args.profileDirectory.replace(/[^a-z0-9._-]+/gi, "_")}`
  );
  if (fs.existsSync(tempRoot)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  copyProfileTree(args.sourceRoot, args.profileDirectory, tempRoot);

  const result = {
    ok: true,
    startedAt: new Date().toISOString(),
    profileDirectory: args.profileDirectory,
    createUrl: args.createUrl,
    workspacesUrl,
    developUrl,
    editorUrl,
    tempRoot,
    workspaceName: "",
    actions: [],
    states: [],
    screenshots: [],
    sql: {
      attempted: false,
      bootstrap: null,
      verify: null
    }
  };

  let context = null;
  try {
    context = await chromium.launchPersistentContext(tempRoot, {
      executablePath: args.chromePath,
      headless: true,
      args: [`--profile-directory=${args.profileDirectory}`, "--no-first-run", "--no-default-browser-check"]
    });
    const page = context.pages()[0] || (await context.newPage());

    await page.goto(args.createUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(args.initialWaitMs);
    let text = await readBodyText(page, args.maxTextChars);
    result.workspaceName = extractWorkspaceName(text);
    result.states.push({
      at: new Date().toISOString(),
      stage: "create_open",
      url: page.url(),
      workspaceName: result.workspaceName,
      authRequired: isAuthPage(text),
      provisioning: looksLikeProvisioning(text)
    });
    await takeShot(page, captureDir, stamp, "create-open", result);
    if (isAuthPage(text)) {
      throw new Error("SingleStore auth page is shown for this profile snapshot.");
    }

    const createClick = await clickFirstVisible(page, [
      "text=Create Workspace",
      "button:has-text('Create Workspace')",
      "[role='button']:has-text('Create Workspace')"
    ]);
    result.actions.push({ action: "create_workspace_click", clicked: createClick || "" });
    await page.waitForTimeout(4000);
    text = await readBodyText(page, args.maxTextChars);
    if (!result.workspaceName) {
      result.workspaceName = extractWorkspaceName(text);
    }
    result.states.push({
      at: new Date().toISOString(),
      stage: "create_after_click",
      url: page.url(),
      workspaceName: result.workspaceName,
      provisioning: looksLikeProvisioning(text)
    });
    await takeShot(page, captureDir, stamp, "create-after-click", result);

    await page.goto(workspacesUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4500);
    const monitor = await monitorWorkspaceReady(page, {
      workspaceName: result.workspaceName,
      timeoutMs: args.provisionTimeoutMs,
      maxChars: args.maxTextChars
    });
    result.actions.push({
      action: "workspace_monitor",
      ready: monitor.ready,
      reason: monitor.reason,
      tickCount: Array.isArray(monitor.ticks) ? monitor.ticks.length : 0
    });
    result.workspaceMonitor = monitor;
    result.states.push({
      at: new Date().toISOString(),
      stage: "workspace_monitor_done",
      url: page.url(),
      reason: monitor.reason
    });
    await takeShot(page, captureDir, stamp, "workspace-status", result);
    if (!monitor.ready) {
      throw new Error(`Workspace not ready: ${monitor.reason}`);
    }

    await page.goto(developUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3500);
    const editor = await ensureSqlEditorLoaded(page, editorUrl, {
      maxAttempts: 10,
      maxChars: args.maxTextChars
    });
    result.actions.push({
      action: "open_sql_editor",
      ok: editor.ok,
      reason: editor.reason,
      attempts: Array.isArray(editor.attempts) ? editor.attempts.length : 0
    });
    result.sqlEditor = editor;
    await takeShot(page, captureDir, stamp, "editor-open", result);
    if (!editor.ok) {
      throw new Error(`SQL editor not ready: ${editor.reason}`);
    }

    const connection = await selectConnection(page, result.workspaceName);
    result.actions.push({ action: "select_connection", ...connection });
    await page.waitForTimeout(2500);
    text = await readBodyText(page, args.maxTextChars);
    const noConnection = /no connection selected/i.test(text);
    result.states.push({
      at: new Date().toISOString(),
      stage: "connection_after_select",
      noConnection,
      url: page.url()
    });
    await takeShot(page, captureDir, stamp, "connection-selected", result);
    if (noConnection) {
      throw new Error("Connection was not selected in SQL editor.");
    }

    if (args.runBootstrap) {
      result.sql.attempted = true;
      result.sql.bootstrap = await runSql(page, DEFAULT_BOOTSTRAP_SQL);
      result.sql.verify = await runSql(page, "SHOW DATABASES LIKE 'asolaria_control';");
      text = await readBodyText(page, args.maxTextChars);
      result.states.push({
        at: new Date().toISOString(),
        stage: "sql_done",
        url: page.url(),
        hasAsolariaDbLabel: /asolaria_control/i.test(text)
      });
      await takeShot(page, captureDir, stamp, "sql-done", result);
    }

    result.finalUrl = page.url();
    result.finalTitle = await page.title();
    result.finalText = text;
  } catch (error) {
    result.ok = false;
    result.error = String(error?.stack || error);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  result.finishedAt = new Date().toISOString();
  const reportPath = path.join(reportDir, `singlestore-computer-use-${stamp}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  result.reportPath = reportPath;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error)}\n`);
  process.exit(1);
});
