#!/usr/bin/env node
/**
 * Extract all remaining inline route handlers from server.js
 * Uses brace-depth tracking to capture complete handler bodies.
 */
const fs = require("fs");
const path = require("path");

const serverPath = path.join(__dirname, "..", "server.js");
const outputPath = path.join(__dirname, "..", "routes", "remaining.js");

const lines = fs.readFileSync(serverPath, "utf8").split("\n");

// Find all route handlers with brace tracking
const handlers = [];
for (let i = 0; i < lines.length; i++) {
  if (!/^app\.(get|post|put|delete|options)\("\/api\//.test(lines[i])) continue;
  let depth = 0, end = i;
  for (let j = i; j < lines.length; j++) {
    for (const ch of lines[j]) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (depth <= 0 && j > i) { end = j + 1; break; }
  }
  while (end < lines.length && lines[end].trim() === "") end++;
  handlers.push({ start: i, end });
}

console.log("Found", handlers.length, "route handlers");

// Merge adjacent blocks
const blocks = [];
let cur = { start: handlers[0].start, end: handlers[0].end };
for (let i = 1; i < handlers.length; i++) {
  if (handlers[i].start - cur.end <= 5) {
    cur.end = handlers[i].end;
  } else {
    blocks.push(cur);
    cur = { start: handlers[i].start, end: handlers[i].end };
  }
}
blocks.push(cur);

// Extract
const extracted = [];
for (const b of blocks) extracted.push(...lines.slice(b.start, b.end));

let total = 0;
for (const b of blocks) total += (b.end - b.start);
console.log("Total lines:", total, "in", blocks.length, "blocks");

// Transform paths — strip /api/ prefix
const transformed = extracted.map(line =>
  line.replace(/app\.(get|post|put|delete|options)\("\/api\//g, (match, method) => `app.${method}("/`)
);

// Build router file
const header = `/**
 * Remaining Core Routes — extracted from server.js (ADR-0001 Phase 3)
 * All remaining /api/* endpoints: health, settings, swarm, providers, skills,
 * notebook, memory, chat, chrome, guardian mutations, avatar, startup, etc.
 */
const express = require("express");
const path = require("path");
const fs = require("fs");
const { asBool, asEnum, asInt, respondError, inferHttpStatusForError, queueReply } = require("../lib/helpers");
const { isLoopbackRequest } = require("../lib/network");
const { evaluateGuardianGuard } = require("../lib/guardian");
const { requirePermission } = require("../middleware/auth");
const { requireLoopbackOnly, requireMobileAuth, requirePhoneBridgeAccess, requireDesktopSuperMasterAuthority, requireMobileDirectControlEnabled } = require("../lib/mobileAuth");
const settingsLib = require("../lib/settings");
const runtimeStateLib = require("../lib/runtimeState");

function createRemainingRouter(ctx) {
  const router = express.Router();
  const settings = settingsLib.get();
  const runtimeState = runtimeStateLib.get();
  const app = {
    get: (p, ...h) => router.get(p, ...h),
    post: (p, ...h) => router.post(p, ...h),
    put: (p, ...h) => router.put(p, ...h),
    delete: (p, ...h) => router.delete(p, ...h),
    options: (p, ...h) => { try { router.options(p, ...h); } catch(_) {} }
  };
  const deps = ctx;

`;

const footer = `
  return router;
}

module.exports = createRemainingRouter;
`;

fs.writeFileSync(outputPath, header + transformed.join("\n") + footer, "utf8");
console.log("Written", outputPath);

// Remove blocks from server.js
const removeSet = new Set();
for (const b of blocks) {
  for (let i = b.start; i < b.end; i++) removeSet.add(i);
}
const newLines = [];
let inserted = false;
for (let i = 0; i < lines.length; i++) {
  if (removeSet.has(i)) {
    if (!inserted) {
      newLines.push("// ── ALL remaining core routes extracted to routes/remaining.js (ADR-0001 Phase 3) ──");
      inserted = true;
    }
    continue;
  }
  newLines.push(lines[i]);
}

fs.writeFileSync(serverPath, newLines.join("\n"), "utf8");
console.log("Updated server.js:", newLines.length, "lines");
const remaining = (newLines.join("\n").match(/app\.(get|post|put|delete)\("\/api\//g) || []).length;
console.log("Inline routes remaining:", remaining);
