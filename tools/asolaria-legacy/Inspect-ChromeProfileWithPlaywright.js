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

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function clip(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
    // Chrome keeps some DB files locked while running; skip and continue.
  }
}

function copyProfileTree(srcRoot, profileDirectory, tempRoot) {
  ensureDir(tempRoot);
  const localStateSrc = path.join(srcRoot, "Local State");
  const localStateDest = path.join(tempRoot, "Local State");
  if (fs.existsSync(localStateSrc)) {
    try {
      fs.copyFileSync(localStateSrc, localStateDest);
    } catch (_error) {
      // Best effort only.
    }
  }
  const profileSrc = path.join(srcRoot, profileDirectory);
  const profileDest = path.join(tempRoot, profileDirectory);
  copyTreeBestEffort(profileSrc, profileDest);
}

async function main() {
  const args = parseArgs(process.argv);
  const profileDirectory = String(args["profile-directory"] || "").trim();
  const url = String(args.url || "").trim();
  const waitMs = Math.max(0, Math.min(15000, Number(args["wait-ms"] || 4000)));
  const maxChars = Math.max(200, Math.min(20000, Number(args["max-chars"] || 2000)));
  const chromePath = String(args["chrome-path"] || "C:/Program Files/Google/Chrome/Application/chrome.exe").trim();
  const sourceRoot = String(args["source-root"] || "C:/Users/acer/AppData/Local/Google/Chrome/User Data").trim();

  if (!profileDirectory) {
    throw new Error("--profile-directory is required.");
  }
  if (!url) {
    throw new Error("--url is required.");
  }
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome executable not found: ${chromePath}`);
  }
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Chrome user data root not found: ${sourceRoot}`);
  }

  const tempRoot = path.join(os.tmpdir(), `asolaria-pw-${profileDirectory.replace(/[^a-z0-9._-]+/gi, "_")}`);
  if (fs.existsSync(tempRoot)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  copyProfileTree(sourceRoot, profileDirectory, tempRoot);

  let context = null;
  try {
    context = await chromium.launchPersistentContext(tempRoot, {
      executablePath: chromePath,
      headless: true,
      args: [`--profile-directory=${profileDirectory}`]
    });
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(waitMs);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const payload = {
      ok: true,
      url: page.url(),
      title: await page.title(),
      bodyText: clip(bodyText, maxChars),
      tempRoot
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error && error.stack || error)}\n`);
  process.exit(1);
});
