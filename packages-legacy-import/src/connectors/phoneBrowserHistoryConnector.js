const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { instanceRoot } = require("../runtimePaths");

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_ENTRIES = 40;
const DEFAULT_STRATEGY = "auto";
const SUPPORTED_STRATEGIES = new Set(["auto", "fast", "balanced", "evidence"]);
const SUPPORTED_COST_MODES = new Set(["low", "balanced", "quality"]);

function normalizeText(value) {
  return String(value || "").trim();
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function toInt(value, fallback = 0, min = -2147483648, max = 2147483647) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function parseOptionalBool(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return undefined;
}

function normalizeStrategy(value, fallback = DEFAULT_STRATEGY) {
  const strategy = String(value || "").trim().toLowerCase();
  if (SUPPORTED_STRATEGIES.has(strategy)) {
    return strategy;
  }
  const safeFallback = String(fallback || "").trim().toLowerCase();
  return SUPPORTED_STRATEGIES.has(safeFallback) ? safeFallback : DEFAULT_STRATEGY;
}

function normalizeCostMode(value, fallback = "low") {
  const mode = String(value || "").trim().toLowerCase();
  if (SUPPORTED_COST_MODES.has(mode)) {
    return mode;
  }
  const safeFallback = String(fallback || "").trim().toLowerCase();
  return SUPPORTED_COST_MODES.has(safeFallback) ? safeFallback : "low";
}

function resolveHistoryExecutionPlan(options = {}) {
  const requestedStrategy = normalizeStrategy(options.strategy, DEFAULT_STRATEGY);
  const costMode = normalizeCostMode(options.costMode, "low");
  const selectedStrategy = requestedStrategy === "auto"
    ? (costMode === "quality" ? "evidence" : costMode === "balanced" ? "balanced" : "fast")
    : requestedStrategy;

  const defaultsByStrategy = {
    fast: {
      maxEntries: 24,
      includeScreenshot: false,
      includeRecents: false,
      preferDirectIntent: true,
      allowMenuFallback: true,
      allowDirectFallback: false
    },
    balanced: {
      maxEntries: DEFAULT_MAX_ENTRIES,
      includeScreenshot: true,
      includeRecents: false,
      preferDirectIntent: false,
      allowMenuFallback: true,
      allowDirectFallback: true
    },
    evidence: {
      maxEntries: 80,
      includeScreenshot: true,
      includeRecents: true,
      preferDirectIntent: false,
      allowMenuFallback: true,
      allowDirectFallback: true
    }
  };

  const defaults = defaultsByStrategy[selectedStrategy] || defaultsByStrategy.fast;
  const includeScreenshotOverride = parseOptionalBool(options.includeScreenshot);

  return {
    requestedStrategy,
    selectedStrategy,
    costMode,
    maxEntries: toInt(options.maxEntries, defaults.maxEntries, 1, 200),
    includeScreenshot: includeScreenshotOverride !== undefined
      ? includeScreenshotOverride
      : defaults.includeScreenshot,
    includeRecents: defaults.includeRecents,
    includeDefaultResolve: true,
    preferDirectIntent: defaults.preferDirectIntent,
    allowMenuFallback: defaults.allowMenuFallback,
    allowDirectFallback: defaults.allowDirectFallback
  };
}

function timestampStamp(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function resolveAdbPath() {
  const envPath = normalizeText(process.env.ASOLARIA_ADB_PATH);
  const candidates = [
    envPath,
    "C:\\Users\\acer\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
    "C:\\Android\\platform-tools\\adb.exe",
    "C:\\platform-tools\\adb.exe",
    "C:\\Program Files\\Android\\platform-tools\\adb.exe",
    "C:\\Users\\acer\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools\\adb.exe"
  ].filter(Boolean);
  for (const item of candidates) {
    if (fs.existsSync(item)) {
      return item;
    }
  }
  try {
    const where = childProcess.spawnSync("where", ["adb"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 3000
    });
    if (where.status === 0) {
      const first = String(where.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (first && fs.existsSync(first)) {
        return first;
      }
    }
  } catch (_error) {
    // ignore lookup failures
  }
  return "";
}

function runCommand(exe, args, options = {}) {
  const timeoutMs = Math.max(2500, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(exe, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const stdoutChunks = [];
    let stderrText = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrText += String(chunk || "");
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks);
      const stderr = String(stderrText || "").trim();
      if (code !== 0 && !options.allowNonZero) {
        const reason = stderr || normalizeText(stdout.toString("utf8")) || "unknown_error";
        return reject(new Error(`Command exited ${code}: ${reason}`));
      }
      return resolve({
        code: Number(code || 0),
        stdout,
        stderr
      });
    });

    if (options.stdinBuffer && Buffer.isBuffer(options.stdinBuffer)) {
      child.stdin.write(options.stdinBuffer);
    } else if (options.stdinText !== undefined) {
      child.stdin.write(String(options.stdinText || ""));
    }
    child.stdin.end();
  });
}

async function runAdb(adbPath, args, options = {}) {
  if (!adbPath) {
    throw new Error("adb_not_found");
  }
  return runCommand(adbPath, args, options);
}

async function sleep(ms) {
  const duration = Math.max(0, Number(ms || 0));
  if (!duration) return;
  await new Promise((resolve) => setTimeout(resolve, duration));
}

function parseAdbDevices(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (/^list of devices attached/i.test(line)) {
      continue;
    }
    const match = /^(\S+)\s+(\S+)$/.exec(line);
    if (!match) continue;
    rows.push({
      id: match[1],
      state: match[2]
    });
  }
  return rows;
}

async function resolveDeviceContext(options = {}) {
  const adbPath = resolveAdbPath();
  if (!adbPath) {
    throw new Error("adb_not_found");
  }
  const listed = await runAdb(adbPath, ["devices"], {
    timeoutMs: Math.max(3000, Number(options.timeoutMs || 8000))
  });
  const devices = parseAdbDevices(listed.stdout.toString("utf8"));
  const requested = normalizeText(options.deviceId);
  const authorized = devices.filter((row) => String(row.state || "").toLowerCase() === "device");
  let deviceId = "";
  if (requested) {
    const exact = authorized.find((row) => row.id === requested);
    if (exact) {
      deviceId = exact.id;
    }
  }
  if (!deviceId && authorized.length > 0) {
    deviceId = authorized[0].id;
  }
  if (!deviceId) {
    throw new Error("no_authorized_phone_device");
  }
  return {
    adbPath,
    deviceId,
    devices
  };
}

function withDeviceArgs(deviceId, args) {
  return ["-s", deviceId, ...args];
}

async function adbShell(ctx, shellArgs, options = {}) {
  return runAdb(ctx.adbPath, withDeviceArgs(ctx.deviceId, ["shell", ...shellArgs]), options);
}

async function capturePhonePng(ctx, outputPath, timeoutMs = 15000) {
  const result = await runAdb(ctx.adbPath, withDeviceArgs(ctx.deviceId, ["exec-out", "screencap", "-p"]), {
    timeoutMs: Math.max(3000, Number(timeoutMs || 15000))
  });
  const png = Buffer.from(result.stdout || Buffer.alloc(0));
  if (png.length < 80) {
    throw new Error("phone_screencap_empty");
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, png);
  return {
    path: outputPath,
    sizeBytes: png.length
  };
}

async function dumpUiXmlText(ctx, remotePath = "/sdcard/asolaria-ui-dump.xml") {
  await adbShell(ctx, ["uiautomator", "dump", remotePath], {
    timeoutMs: 12000,
    allowNonZero: true
  });
  const read = await adbShell(ctx, ["cat", remotePath], {
    timeoutMs: 12000
  });
  return String(read.stdout || "");
}

function parseBounds(boundsText) {
  const text = String(boundsText || "").trim();
  const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(text);
  if (!match) return null;
  const left = Number(match[1]);
  const top = Number(match[2]);
  const right = Number(match[3]);
  const bottom = Number(match[4]);
  if (![left, top, right, bottom].every(Number.isFinite)) {
    return null;
  }
  if (right <= left || bottom <= top) {
    return null;
  }
  return { left, top, right, bottom };
}

function centerPoint(boundsText) {
  const b = parseBounds(boundsText);
  if (!b) return null;
  return {
    x: Math.round((b.left + b.right) / 2),
    y: Math.round((b.top + b.bottom) / 2)
  };
}

function parseXmlNodes(xmlText) {
  const text = String(xmlText || "");
  const nodes = [];
  const nodeRegex = /<node\b([^>]*)>/g;
  let match = null;
  while ((match = nodeRegex.exec(text)) !== null) {
    const attrsRaw = String(match[1] || "");
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9:_-]+)="([^"]*)"/g;
    let attrMatch = null;
    while ((attrMatch = attrRegex.exec(attrsRaw)) !== null) {
      attrs[attrMatch[1]] = decodeXml(attrMatch[2]);
    }
    nodes.push(attrs);
  }
  return nodes;
}

function parsePackagePathOutput(text, packageName) {
  if (!normalizeText(packageName)) return false;
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return false;
  }
  return lines.some((line) => /^package:\S+/i.test(line));
}

function parseDefaultResolve(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const activityLine = lines.find((line) => line.includes("/")) || "";
  const [pkg, activity] = activityLine ? activityLine.split("/", 2) : ["", ""];
  return {
    activity: activityLine,
    packageName: normalizeText(pkg),
    className: normalizeText(activity)
  };
}

function parseRecentsPackages(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const set = new Set();
  for (const line of lines) {
    const activityMatch = /\bA=\d+:([a-zA-Z0-9._]+)/.exec(line);
    if (activityMatch && activityMatch[1]) {
      set.add(activityMatch[1]);
      continue;
    }
    const intentMatch = /\bcmp=([a-zA-Z0-9._]+)\//.exec(line);
    if (intentMatch && intentMatch[1]) {
      set.add(intentMatch[1]);
    }
  }
  return Array.from(set.values());
}

function routeBucketFromHost(host) {
  const value = String(host || "").trim().toLowerCase();
  if (!value) return "unknown";
  if (value === "127.0.0.1" || value === "localhost") {
    return "usb_local";
  }
  if (/^192\.168\./.test(value) || /^10\./.test(value) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) {
    return "private_lan";
  }
  if (value.includes(".ts.net")) {
    return "tailnet";
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    return "public_ip";
  }
  return "domain";
}

function summarizeHistoryEntries(entries) {
  const byHost = {};
  const byRoute = {};
  let asolariaCount = 0;
  for (const entry of entries) {
    const host = String(entry.host || "").trim().toLowerCase();
    const route = routeBucketFromHost(host);
    if (entry.isAsolaria) {
      asolariaCount += 1;
    }
    if (host) {
      byHost[host] = (byHost[host] || 0) + 1;
    }
    byRoute[route] = (byRoute[route] || 0) + 1;
  }
  const duplicateHosts = Object.entries(byHost)
    .filter(([, count]) => Number(count) > 1)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
  return {
    total: entries.length,
    asolariaCount,
    byHost,
    byRoute,
    duplicateHosts
  };
}

function extractHistoryEntriesFromNodes(nodes, maxEntries = DEFAULT_MAX_ENTRIES) {
  const items = [];
  const cap = Math.max(1, Math.min(200, Number(maxEntries || DEFAULT_MAX_ENTRIES)));
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i] || {};
    const rid = String(node["resource-id"] || "").trim();
    const title = normalizeText(node.text);
    if (rid !== "com.android.chrome:id/title") {
      continue;
    }
    if (!title || title.toLowerCase() === "history") {
      continue;
    }
    let description = "";
    for (let j = i + 1; j < Math.min(nodes.length, i + 8); j += 1) {
      const next = nodes[j] || {};
      const nextRid = String(next["resource-id"] || "").trim();
      if (nextRid === "com.android.chrome:id/title") {
        break;
      }
      if (nextRid === "com.android.chrome:id/description") {
        description = normalizeText(next.text);
        break;
      }
    }
    const host = description;
    const lowerTitle = title.toLowerCase();
    const lowerHost = host.toLowerCase();
    const isAsolaria = lowerTitle.includes("asolaria") || lowerHost.includes("asolaria")
      || lowerHost === "127.0.0.1"
      || /^192\.168\./.test(lowerHost);
    items.push({
      title,
      host,
      route: routeBucketFromHost(host),
      isAsolaria,
      bounds: normalizeText(node.bounds)
    });
    if (items.length >= cap) {
      break;
    }
  }
  return items;
}

function findHistoryMenuTapPoint(menuNodes) {
  const direct = menuNodes.find((node) => String(node["resource-id"] || "") === "com.android.chrome:id/open_history_menu_id");
  if (direct) {
    const point = centerPoint(direct.bounds);
    if (point) return point;
  }
  const fallbackText = menuNodes.find((node) => normalizeText(node.text).toLowerCase() === "history");
  if (fallbackText) {
    const point = centerPoint(fallbackText.bounds);
    if (point) return point;
  }
  return null;
}

async function isPackageInstalled(ctx, packageName) {
  const packageId = normalizeText(packageName);
  if (!packageId) {
    return false;
  }

  const quickCheck = await adbShell(ctx, ["cmd", "package", "path", packageId], {
    timeoutMs: 7000,
    allowNonZero: true
  });
  if (parsePackagePathOutput(quickCheck.stdout.toString("utf8"), packageId)) {
    return true;
  }

  const fallback = await adbShell(ctx, ["pm", "path", packageId], {
    timeoutMs: 9000,
    allowNonZero: true
  });
  return parsePackagePathOutput(fallback.stdout.toString("utf8"), packageId);
}

async function collectBrowserEnvironment(ctx, options = {}) {
  const includeDefaultResolve = options.includeDefaultResolve !== false;
  const includeRecents = Boolean(options.includeRecents);

  const [chromeInstalled, samsungInstalled, edgeInstalled] = await Promise.all([
    isPackageInstalled(ctx, "com.android.chrome"),
    isPackageInstalled(ctx, "com.sec.android.app.sbrowser"),
    isPackageInstalled(ctx, "com.microsoft.emmx")
  ]);

  const installed = {
    chrome: chromeInstalled,
    samsungInternet: samsungInstalled,
    edge: edgeInstalled
  };

  let defaultResolve = {
    activity: "",
    packageName: "",
    className: ""
  };
  if (includeDefaultResolve) {
    const defaultResolveResult = await adbShell(
      ctx,
      ["cmd", "package", "resolve-activity", "--brief", "-a", "android.intent.action.VIEW", "-d", "http://example.com"],
      {
        timeoutMs: 12000,
        allowNonZero: true
      }
    );
    defaultResolve = parseDefaultResolve(defaultResolveResult.stdout.toString("utf8"));
  }

  let recentPackages = [];
  if (includeRecents) {
    const recentsResult = await adbShell(ctx, ["dumpsys", "activity", "recents"], {
      timeoutMs: 15000,
      allowNonZero: true
    });
    recentPackages = parseRecentsPackages(recentsResult.stdout.toString("utf8"));
  }

  return {
    installed,
    defaultResolve,
    recentPackages,
    probes: {
      includeDefaultResolve,
      includeRecents
    }
  };
}

async function openChromeHistoryDirectAndCollect(ctx, outputRoot, options = {}) {
  const stamp = timestampStamp();
  const historyDumpPath = path.join(outputRoot, `chrome-history-direct-${stamp}.xml`);
  const historyShotPath = path.join(outputRoot, `chrome-history-direct-${stamp}.png`);

  await adbShell(
    ctx,
    [
      "am",
      "start",
      "-n",
      "com.android.chrome/com.google.android.apps.chrome.Main",
      "-a",
      "android.intent.action.VIEW",
      "-d",
      "chrome://history"
    ],
    {
      timeoutMs: 10000,
      allowNonZero: true
    }
  );
  await sleep(900);

  const historyXml = await dumpUiXmlText(ctx, "/sdcard/asolaria-ui-history.xml");
  fs.writeFileSync(historyDumpPath, historyXml, "utf8");
  const historyNodes = parseXmlNodes(historyXml);
  const entries = extractHistoryEntriesFromNodes(historyNodes, options.maxEntries);
  const summary = summarizeHistoryEntries(entries);

  let screenshot = null;
  if (options.includeScreenshot !== false) {
    screenshot = await capturePhonePng(ctx, historyShotPath, 20000);
  }

  return {
    collectionMethod: "direct_intent",
    menuDumpPath: "",
    historyDumpPath,
    screenshotPath: screenshot?.path || "",
    screenshotSizeBytes: Number(screenshot?.sizeBytes || 0),
    menuTapPoint: null,
    entryCount: entries.length,
    entries,
    summary
  };
}

async function openChromeHistoryAndCollect(ctx, outputRoot, options = {}) {
  const stamp = timestampStamp();
  const menuDumpPath = path.join(outputRoot, `chrome-menu-${stamp}.xml`);
  const historyDumpPath = path.join(outputRoot, `chrome-history-${stamp}.xml`);
  const historyShotPath = path.join(outputRoot, `chrome-history-${stamp}.png`);

  await adbShell(ctx, ["am", "start", "-n", "com.android.chrome/com.google.android.apps.chrome.Main"], {
    timeoutMs: 10000,
    allowNonZero: true
  });
  await sleep(700);

  await adbShell(ctx, ["input", "keyevent", "82"], {
    timeoutMs: 8000,
    allowNonZero: true
  });
  await sleep(500);

  const menuXml = await dumpUiXmlText(ctx, "/sdcard/asolaria-ui-menu.xml");
  fs.writeFileSync(menuDumpPath, menuXml, "utf8");
  const menuNodes = parseXmlNodes(menuXml);
  const tapPoint = findHistoryMenuTapPoint(menuNodes);
  if (!tapPoint) {
    throw new Error("history_menu_item_not_found");
  }

  await adbShell(
    ctx,
    ["input", "tap", String(tapPoint.x), String(tapPoint.y)],
    {
      timeoutMs: 8000,
      allowNonZero: true
    }
  );
  await sleep(1200);

  const historyXml = await dumpUiXmlText(ctx, "/sdcard/asolaria-ui-history.xml");
  fs.writeFileSync(historyDumpPath, historyXml, "utf8");
  const historyNodes = parseXmlNodes(historyXml);
  const entries = extractHistoryEntriesFromNodes(historyNodes, options.maxEntries);
  const summary = summarizeHistoryEntries(entries);

  let screenshot = null;
  if (options.includeScreenshot !== false) {
    screenshot = await capturePhonePng(ctx, historyShotPath, 20000);
  }

  return {
    collectionMethod: "menu_tap",
    menuDumpPath,
    historyDumpPath,
    screenshotPath: screenshot?.path || "",
    screenshotSizeBytes: Number(screenshot?.sizeBytes || 0),
    menuTapPoint: tapPoint,
    entryCount: entries.length,
    entries,
    summary
  };
}

function buildAttempt(method, ok, reason) {
  const item = {
    method: normalizeText(method),
    ok: Boolean(ok)
  };
  if (!ok && reason) {
    item.reason = normalizeText(reason);
  }
  return item;
}

function attemptSummary(attempts = []) {
  return attempts
    .map((item) => {
      const method = normalizeText(item.method) || "unknown";
      if (item.ok) return `${method}:ok`;
      return `${method}:${normalizeText(item.reason) || "failed"}`;
    })
    .join("|");
}

async function collectChromeHistoryWithPlan(ctx, outputRoot, plan) {
  const attempts = [];

  if (plan.preferDirectIntent) {
    try {
      const direct = await openChromeHistoryDirectAndCollect(ctx, outputRoot, plan);
      attempts.push(buildAttempt("direct_intent", true));
      return {
        ...direct,
        attempts
      };
    } catch (error) {
      attempts.push(buildAttempt("direct_intent", false, error?.message || error));
      if (!plan.allowMenuFallback) {
        const wrapped = new Error(`chrome_history_check_failed:${attemptSummary(attempts)}`);
        wrapped.attempts = attempts;
        throw wrapped;
      }
    }
  }

  try {
    const menu = await openChromeHistoryAndCollect(ctx, outputRoot, plan);
    attempts.push(buildAttempt("menu_tap", true));
    return {
      ...menu,
      attempts
    };
  } catch (error) {
    attempts.push(buildAttempt("menu_tap", false, error?.message || error));
    if (!plan.allowDirectFallback || plan.preferDirectIntent) {
      const wrapped = new Error(`chrome_history_check_failed:${attemptSummary(attempts)}`);
      wrapped.attempts = attempts;
      throw wrapped;
    }
  }

  try {
    const directFallback = await openChromeHistoryDirectAndCollect(ctx, outputRoot, plan);
    attempts.push(buildAttempt("direct_intent", true));
    return {
      ...directFallback,
      attempts
    };
  } catch (error) {
    attempts.push(buildAttempt("direct_intent", false, error?.message || error));
    const wrapped = new Error(`chrome_history_check_failed:${attemptSummary(attempts)}`);
    wrapped.attempts = attempts;
    throw wrapped;
  }
}

async function runPhoneBrowserHistoryCheck(options = {}) {
  const plan = resolveHistoryExecutionPlan(options);
  const outputRoot = path.join(instanceRoot, "reports", "phone-browser-history");
  fs.mkdirSync(outputRoot, { recursive: true });

  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const ctx = await resolveDeviceContext(options);
  const browserEnv = await collectBrowserEnvironment(ctx, {
    includeRecents: plan.includeRecents,
    includeDefaultResolve: plan.includeDefaultResolve
  });

  let chromeHistory = {
    attempted: false,
    opened: false,
    reason: "chrome_not_installed",
    collectionMethod: "",
    attempts: [],
    menuDumpPath: "",
    historyDumpPath: "",
    screenshotPath: "",
    screenshotSizeBytes: 0,
    menuTapPoint: null,
    entryCount: 0,
    entries: [],
    summary: {
      total: 0,
      asolariaCount: 0,
      byHost: {},
      byRoute: {},
      duplicateHosts: []
    }
  };

  if (browserEnv.installed.chrome) {
    chromeHistory.attempted = true;
    try {
      const collected = await collectChromeHistoryWithPlan(ctx, outputRoot, plan);
      chromeHistory = {
        attempted: true,
        opened: true,
        reason: "ok",
        ...collected
      };
    } catch (error) {
      chromeHistory = {
        attempted: true,
        opened: false,
        reason: normalizeText(error?.message || error || "chrome_history_check_failed"),
        collectionMethod: "",
        attempts: Array.isArray(error?.attempts) ? error.attempts.slice(0, 8) : [],
        menuDumpPath: "",
        historyDumpPath: "",
        screenshotPath: "",
        screenshotSizeBytes: 0,
        menuTapPoint: null,
        entryCount: 0,
        entries: [],
        summary: {
          total: 0,
          asolariaCount: 0,
          byHost: {},
          byRoute: {},
          duplicateHosts: []
        }
      };
    }
  }

  const notes = [];
  notes.push(
    `History strategy: ${plan.selectedStrategy} (requested=${plan.requestedStrategy}, costMode=${plan.costMode}).`
  );
  if (browserEnv.installed.samsungInternet) {
    notes.push("Samsung Internet is installed (kept as optional backup browser).");
  }
  if (browserEnv.installed.edge) {
    notes.push("Microsoft Edge is installed (kept as optional backup browser).");
  }
  if (chromeHistory.opened && chromeHistory.summary.asolariaCount > 0) {
    notes.push("Chrome history contains Asolaria entries; duplicate route records can appear when switching USB/LAN paths.");
  }
  if (chromeHistory.opened && chromeHistory.summary.duplicateHosts.length > 0) {
    notes.push("Duplicate host history entries detected; consider using one canonical host per connection mode.");
  }

  return {
    ok: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    elapsedMs: Math.max(0, Date.now() - startedAtMs),
    adbPath: ctx.adbPath,
    deviceId: ctx.deviceId,
    devices: ctx.devices,
    executionPlan: plan,
    browserEnvironment: browserEnv,
    chromeHistory,
    notes
  };
}

module.exports = {
  runPhoneBrowserHistoryCheck
};
