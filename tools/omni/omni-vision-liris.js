#!/usr/bin/env node
"use strict";

/**
 * omni-vision-liris.js
 *
 * V3 / hyper federation helper for the active Acer -> Liris loop:
 *   look     = local HDMI/window capture
 *   type     = omnikeyboard relay to Liris with ENTER structurally bound
 *   connect  = document-share-v0 box send to /omni/submit
 *   map      = emit the current anchor map across Omnilanguage / Omni Shannon / Omni GNN
 *
 * This tool intentionally avoids the older v1/v2 "one-off relay" shape.
 * It centers the 6x6x6x6x12 / omni-shannon-v3 / LX-491 surfaces.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const http = require("http");

const ROOT = "C:/Users/acer/Asolaria";
const PEER_TOKENS_PATH = path.join(ROOT, "data/vault/owner/agent-keyboard/peer-tokens.json");
const DEFAULT_WINDOW = process.env.LIRIS_WINDOW_TITLE || "Claude Code";
const DEFAULT_TYPE_TIMEOUT_MS = 90 * 1000;
const DEFAULT_HTTP_TIMEOUT_MS = 30 * 1000;
const DEFAULT_MAX_PART_CHARS = 1400;
const DEFAULT_MAP_PATH = path.join(ROOT, "reports", "omni-vision-liris-map-latest.md");
const DEFAULT_ENTER_DELAY_MS = Number(process.env.LIRIS_ENTER_DELAY_MS || 180);

function fail(message, exitCode = 1) {
  console.error(message);
  process.exit(exitCode);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function sha256OfBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256OfString(text) {
  return sha256OfBuffer(Buffer.from(String(text), "utf8"));
}

function loadPeer() {
  if (!fs.existsSync(PEER_TOKENS_PATH)) {
    fail("peer-tokens.json missing at " + PEER_TOKENS_PATH, 2);
  }
  const parsed = readJson(PEER_TOKENS_PATH);
  const peer = parsed.peers && parsed.peers["liris-rayssa"];
  if (!peer || !peer.url || !peer.token) {
    fail("liris-rayssa peer missing url/token in peer-tokens.json", 3);
  }
  const endpoint = new URL(peer.url);
  return {
    endpoint,
    token: peer.token,
    note: peer.note || "",
    updatedAt: parsed.updated_at || ""
  };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postJson(peer, routePath, bodyObj, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(bodyObj);
    const req = http.request(
      {
        hostname: peer.endpoint.hostname,
        port: Number(peer.endpoint.port || 80),
        path: routePath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: "Bearer " + peer.token
        },
        timeout: timeoutMs
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          chunks += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            body: chunks
          });
        });
      }
    );
    req.on("error", (error) => reject(error));
    req.on("timeout", () => {
      req.destroy(new Error("timeout after " + timeoutMs + "ms"));
    });
    req.write(body);
    req.end();
  });
}

function getJson(peer, routePath, timeoutMs = DEFAULT_HTTP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: peer.endpoint.hostname,
        port: Number(peer.endpoint.port || 80),
        path: routePath,
        method: "GET",
        headers: {
          Authorization: "Bearer " + peer.token
        },
        timeout: timeoutMs
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          chunks += chunk;
        });
        res.on("end", () => {
          try {
            resolve({
              statusCode: res.statusCode,
              body: JSON.parse(chunks || "{}")
            });
          } catch (_error) {
            resolve({
              statusCode: res.statusCode,
              body: {}
            });
          }
        });
      }
    );
    req.on("error", (error) => reject(error));
    req.on("timeout", () => {
      req.destroy(new Error("timeout after " + timeoutMs + "ms"));
    });
    req.end();
  });
}

function splitText(text, maxChars = DEFAULT_MAX_PART_CHARS) {
  if (text.length <= maxChars) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf("\n", maxChars);
    if (cut < Math.floor(maxChars * 0.5)) {
      cut = remaining.lastIndexOf(" ", maxChars);
    }
    if (cut <= 0) cut = maxChars;
    parts.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) parts.push(remaining);
  return parts.filter(Boolean);
}

async function sendText(peer, text, options = {}) {
  const windowName = options.window || DEFAULT_WINDOW;
  let resolvedWindowTitle = windowName;
  let resolvedWindowId = 0;
  let remoteForeground = "";
  try {
    const health = await getJson(peer, "/health", 5000);
    remoteForeground = String((health.body && health.body.foreground_window) || "").trim();
    if (health.statusCode === 200 && remoteForeground) {
      const desired = String(windowName).toLowerCase();
      const current = remoteForeground.toLowerCase();
      if (current.includes(desired) || desired.includes(current)) {
        // If the correct window is already foreground, skip AppActivate.
        resolvedWindowTitle = "";
      }
    }
  } catch (_error) {
    // Fall back to explicit targeting when health preflight is unavailable.
  }
  try {
    const windows = await getJson(peer, "/windows", 5000);
    const targets = Array.isArray(windows.body && windows.body.targets) ? windows.body.targets : [];
    if (targets.length > 0) {
      const desired = String(windowName).toLowerCase();
      const current = remoteForeground.toLowerCase();
      const exactForeground = targets.find((target) => String(target.title || "").toLowerCase() === current);
      const matchingTarget = exactForeground || targets.find((target) => {
        const title = String(target.title || "").toLowerCase();
        return title.includes(desired) || desired.includes(title);
      });
      if (matchingTarget && Number(matchingTarget.id) > 0) {
        resolvedWindowId = Number(matchingTarget.id);
      }
    }
  } catch (_error) {
    // Old receivers may not expose targets yet.
  }
  const parts = splitText(String(text), Number(options.maxChars || DEFAULT_MAX_PART_CHARS));
  const results = [];
  for (let i = 0; i < parts.length; i += 1) {
    const isLast = i === parts.length - 1;
    const typeBody = {
      text: parts[i],
      press_enter: parts.length === 1 || isLast,
      enter_delay_ms: parts.length === 1 || isLast ? DEFAULT_ENTER_DELAY_MS : 0
    };
    if (resolvedWindowTitle) {
      typeBody.window_title = resolvedWindowTitle;
    }
    if (resolvedWindowId > 0) {
      typeBody.window_id = resolvedWindowId;
    }
    const typeRes = await postJson(
      peer,
      "/type",
      typeBody,
      DEFAULT_TYPE_TIMEOUT_MS
    );
    results.push({ op: "type", index: i, statusCode: typeRes.statusCode, chars: parts[i].length });
    if (typeRes.statusCode !== 200) {
      return { ok: false, phase: "type", results, body: typeRes.body };
    }
    if (parts.length === 1) {
      return {
        ok: typeRes.statusCode === 200,
        phase: "single",
        results,
        body: typeRes.body,
        resolvedWindowTitle,
        remoteForeground,
        resolvedWindowId
      };
    }
    await sleep(180);
    if (!isLast) {
      const pressBody = { key: "enter", shift: true };
      if (resolvedWindowTitle) {
        pressBody.window_title = resolvedWindowTitle;
      }
      if (resolvedWindowId > 0) {
        pressBody.window_id = resolvedWindowId;
      }
      const pressRes = await postJson(peer, "/press", pressBody, DEFAULT_TYPE_TIMEOUT_MS);
      results.push({ op: "press", index: i, statusCode: pressRes.statusCode, key: "enter", shift: true });
      if (pressRes.statusCode !== 200) {
        return { ok: false, phase: "press", results, body: pressRes.body, resolvedWindowTitle, remoteForeground, resolvedWindowId };
      }
      await sleep(180);
    }
  }
  return { ok: true, phase: "multi", results, resolvedWindowTitle, remoteForeground, resolvedWindowId };
}

function resolveCapturePath(explicitPath, fallbackName) {
  if (explicitPath) return explicitPath;
  return path.join(ROOT, "captures", fallbackName);
}

function runPowerShellScript(scriptPath, args) {
  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args];
  return cp.spawnSync("powershell.exe", psArgs, {
    encoding: "utf8",
    timeout: 60 * 1000,
    maxBuffer: 16 * 1024 * 1024
  });
}

function captureScreen(args) {
  const outputPath = resolveCapturePath(args.out, "omni-vision-primary-screen.png");
  const scriptPath = path.join(ROOT, "tools", "Capture-PrimaryScreen.ps1");
  const psArgs = ["-OutputPath", outputPath];
  if (args["screen-index"]) psArgs.push("-ScreenIndex", String(args["screen-index"]));
  if (args["capture-all"]) psArgs.push("-CaptureAll");
  const run = runPowerShellScript(scriptPath, psArgs);
  if (run.status !== 0) {
    fail("capture-screen failed: " + (run.stderr || run.stdout || "").trim(), 20);
  }
  const storedPath = (run.stdout || "").trim() || outputPath;
  const fileBytes = fs.readFileSync(storedPath);
  const payload = {
    ok: true,
    mode: "capture-screen",
    outputPath: storedPath,
    bytes: fileBytes.length,
    sha256: sha256OfBuffer(fileBytes)
  };
  console.log(JSON.stringify(payload, null, 2));
}

function captureWindow(args) {
  const outputPath = resolveCapturePath(args.out, path.join("desktop", "omni-vision-window.png"));
  const scriptPath = path.join(ROOT, "tools", "Capture-Window.ps1");
  const psArgs = ["-OutputPath", outputPath];
  if (args.title) psArgs.push("-WindowTitle", String(args.title));
  if (args.id) psArgs.push("-WindowId", String(args.id));
  const run = runPowerShellScript(scriptPath, psArgs);
  if (run.status !== 0) {
    fail("capture-window failed: " + (run.stderr || run.stdout || "").trim(), 21);
  }
  let meta;
  try {
    meta = JSON.parse((run.stdout || "{}").trim());
  } catch (_error) {
    meta = { ok: true, outputPath };
  }
  const fileBytes = fs.readFileSync(meta.outputPath || outputPath);
  meta.sha256 = sha256OfBuffer(fileBytes);
  meta.bytes = fileBytes.length;
  console.log(JSON.stringify(meta, null, 2));
}

function buildMap() {
  const peer = loadPeer();
  return {
    ts: nowIso(),
    axisMapVersion: "v3.4d12",
    intent: "map_map_mapped / cube_cube_cubed / omni_vision",
    transport: {
      omnikeyboard: {
        lx: "LX-485",
        tool: "tools/keyboard/type-to-liris.js",
        multiTool: "tools/keyboard/type-multi-to-liris.js",
        server: "tools/agent-keyboard.js",
        peerTokens: "data/vault/owner/agent-keyboard/peer-tokens.json",
        endpoint: peer.endpoint.origin
      },
      omnibox: {
        tool: "tools/cube/omni-processor/units/document-share.js",
        processor: "tools/omni/omni-request-processor.js",
        server: "tools/agent-keyboard.js:/omni/submit",
        schema: "document-share-v0"
      },
      capture: {
        primaryScreen: "tools/Capture-PrimaryScreen.ps1",
        window: "tools/Capture-Window.ps1"
      }
    },
    cube: {
      policy: "src/sharedComputeFabric.js:agent_first_scan_6x6x6x6x12",
      omnishannonV3: "tools/cube/omni-shannon-v3-4d12.js",
      omnishannon: "tools/cube/omni-shannon.js",
      omniGnn: "ix/gates/gnn.js",
      lx491: "data/agent-index/projects/LX-491-omni-gnn-inference-fabric-20260407.md",
      gnnWatcher: "src/gnnConstructionWatcher.js",
      constructions: "routes/constructions.js",
      tensorReport: "reports/cube-analysis/federation-self-tensor-collapse-2026-04-07.md",
      law: "data/agent-index/rules/IX-485.md"
    },
    loop: [
      "look -> capture-screen / capture-window",
      "type -> omnikeyboard relay with structural ENTER",
      "connect -> document-share-v0 over /omni/submit",
      "map -> omni-shannon-v3 / LX-491 anchor report"
    ]
  };
}

function renderMapMarkdown(map) {
  return [
    "# IX-494 — Omni Vision Liris Map (v3 / hyper)",
    "",
    `Generated: ${map.ts}`,
    "",
    "D11_PROOF 29791",
    `- axis_map_version = ${map.axisMapVersion}`,
    `- intent = ${map.intent}`,
    `- policy = ${map.cube.policy}`,
    "",
    "D8_CHAIN 6859",
    `- omnikeyboard = ${map.transport.omnikeyboard.tool}`,
    `- omnikeyboard_multi = ${map.transport.omnikeyboard.multiTool}`,
    `- keyboard_server = ${map.transport.omnikeyboard.server}`,
    `- omnibox_unit = ${map.transport.omnibox.tool}`,
    `- omnibox_processor = ${map.transport.omnibox.processor}`,
    `- capture_primary = ${map.transport.capture.primaryScreen}`,
    `- capture_window = ${map.transport.capture.window}`,
    "",
    "D22_TRANSLATION 493039",
    `- omnishannon_v3 = ${map.cube.omnishannonV3}`,
    `- omnishannon = ${map.cube.omnishannon}`,
    `- omnignn = ${map.cube.omniGnn}`,
    `- lx491 = ${map.cube.lx491}`,
    `- gnn_watcher = ${map.cube.gnnWatcher}`,
    `- tensor_report = ${map.cube.tensorReport}`,
    "",
    "D24_INTENT 13824",
    "- look -> type -> connect -> map",
    "- RULE -> LAW -> MEMORY -> INDEX -> CUBE -> CUBE -> CUBED",
    "- v3 / hyper only; no v1/v2 relay fallback",
    ""
  ].join("\n");
}

function mapCommand(args) {
  const map = buildMap();
  const markdown = renderMapMarkdown(map);
  const writePath = args.write === true ? DEFAULT_MAP_PATH : (args.write || null);
  if (writePath) {
    ensureDir(path.dirname(writePath));
    fs.writeFileSync(writePath, markdown, "utf8");
  }
  const payload = {
    ok: true,
    map,
    writePath: writePath || null,
    sha256: sha256OfString(markdown)
  };
  console.log(JSON.stringify(payload, null, 2));
}

async function boxSendCommand(args) {
  const filePath = args.file || args.path;
  if (!filePath) fail("box-send requires --file <path>", 30);
  if (!fs.existsSync(filePath)) fail("box-send file missing: " + filePath, 31);
  const peer = loadPeer();
  const fileBytes = fs.readFileSync(filePath);
  const manifestId = args["manifest-id"] || ("OMNI-VISION-" + Date.now());
  const targetSubdir = args.subdir || args["target-subdir"] || "";
  const manifest = {
    manifest_id: manifestId,
    dispatcher: {
      agent_id: "asolaria-acer",
      host: "asolaria-instance@acer",
      via: "omni-vision-liris"
    },
    target: {
      node: "liris-rayssa",
      host: "liris-instance@rayssa",
      route: "paper-draft/incoming"
    },
    unit: {
      unit_id: "document-share-v0",
      version: "v0",
      novalum_shield_check: true
    },
    inputs: {
      file_name: path.basename(filePath),
      content_base64: fileBytes.toString("base64"),
      sha256: sha256OfBuffer(fileBytes),
      total_bytes: fileBytes.length,
      target_subdir: targetSubdir || undefined,
      overwrite: !!args.overwrite
    },
    authority: {
      operator: "jesse",
      mode: "omni-vision-v3",
      chain: "IX-494+LX-485+LX-491+IX-485"
    },
    law_class: "document_share"
  };
  const res = await postJson(peer, "/omni/submit", manifest, 90 * 1000);
  let parsedBody;
  try {
    parsedBody = JSON.parse(res.body || "{}");
  } catch (_error) {
    parsedBody = { raw: res.body };
  }
  console.log(JSON.stringify({
    ok: res.statusCode === 200,
    manifestId,
    statusCode: res.statusCode,
    response: parsedBody
  }, null, 2));
  if (res.statusCode !== 200) process.exit(32);
}

async function packetCommand(args) {
  const text = args.text || args.message || args._.join(" ");
  if (!text) fail("packet requires text", 40);
  const peer = loadPeer();
  const result = await sendText(peer, text, {
    window: args.window || DEFAULT_WINDOW,
    maxChars: args["max-part-chars"] || DEFAULT_MAX_PART_CHARS
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(41);
}

async function selfTestCommand() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const peer = loadPeer();
  add("peer_tokens", true, peer.endpoint.toString());

  const requiredFiles = [
    path.join(ROOT, "tools", "keyboard", "type-to-liris.js"),
    path.join(ROOT, "tools", "keyboard", "type-multi-to-liris.js"),
    path.join(ROOT, "tools", "Capture-PrimaryScreen.ps1"),
    path.join(ROOT, "tools", "Capture-Window.ps1"),
    path.join(ROOT, "tools", "cube", "omni-processor", "units", "document-share.js"),
    path.join(ROOT, "tools", "cube", "omni-shannon-v3-4d12.js"),
    path.join(ROOT, "src", "gnnConstructionWatcher.js")
  ];
  for (const file of requiredFiles) {
    add(path.relative(ROOT, file), fs.existsSync(file), fs.existsSync(file) ? "present" : "missing");
  }

  try {
    const health = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: peer.endpoint.hostname,
          port: Number(peer.endpoint.port || 80),
          path: "/health",
          method: "GET",
          timeout: 5000
        },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve({ statusCode: res.statusCode, body }));
        }
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.end();
    });
    add("peer_health", health.statusCode === 200, health.body.slice(0, 120));
  } catch (error) {
    add("peer_health", false, error.message);
  }

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({
    ok,
    axisMapVersion: "v3.4d12",
    checks
  }, null, 2));
  if (!ok) process.exit(50);
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));
  if (!command || command === "help" || command === "--help") {
    console.log([
      "omni-vision-liris.js",
      "",
      "Commands:",
      "  packet <text> [--window liris] [--max-part-chars N]",
      "  box-send --file <path> [--subdir name] [--overwrite] [--manifest-id id]",
      "  capture-screen [--out path] [--screen-index N] [--capture-all]",
      "  capture-window [--title text | --id pid] [--out path]",
      "  map [--write [path]]",
      "  self-test"
    ].join("\n"));
    return;
  }
  if (command === "packet" || command === "say" || command === "type") {
    return packetCommand(args);
  }
  if (command === "box-send" || command === "connect") {
    return boxSendCommand(args);
  }
  if (command === "capture-screen" || command === "look-screen") {
    return captureScreen(args);
  }
  if (command === "capture-window" || command === "look-window") {
    return captureWindow(args);
  }
  if (command === "map") {
    return mapCommand(args);
  }
  if (command === "self-test") {
    return selfTestCommand();
  }
  fail("unknown command: " + command, 64);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(99);
});
