#!/usr/bin/env node
// acer-dispatch-daemon.mjs — G-088 BEHCS bus wiring for G-087
//
// Polls acer's BEHCS inbox for envelopes targeted at `target=acer`
// with `verb=shannon-scan-dispatch`. For each new one:
//   1. parse → ShannonScanDispatchEnvelope
//   2. runAcerDispatch (G-087) → L5 result
//   3. buildResultEnvelope → signed POST to liris:4947/behcs/send
//   4. mark scan_id as processed in ledger (idempotent)
//
// Ledger keeps this safe to restart. Skips unknown / malformed envelopes
// with audit trail.

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { execSync } from "node:child_process";
import { runAcerDispatch, buildResultEnvelope } from "../src/acer-dispatch.ts";
import { signPayload, loadRegistry } from "../../kernel/src/ed25519-registry.ts";

// G-090 staleness surface — log on startup + echo into ledger
const PROCESS_STARTED_AT = new Date().toISOString();
let SOURCE_COMMIT = "unknown";
try { SOURCE_COMMIT = execSync("git -C C:/asolaria-acer rev-parse HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim().slice(0, 12); } catch {}

const INBOX = "C:/Users/acer/Asolaria/data/behcs/inbox.ndjson";
const LEDGER = "C:/Users/acer/Asolaria/data/behcs/shannon-dispatch-processed.ndjson";
const REGISTRY = "C:/asolaria-acer/kernel/ed25519-registry.json";
const LIRIS_ENDPOINT = "http://192.168.100.2:4947/behcs/send";
const INTERVAL = parseInt(process.env.SHANNON_DISPATCH_INTERVAL_MS || "3000", 10);
const SIGNING_KEY_ID = process.env.ACER_SIGNING_KEY_ID || "dev-acer-4abb0a9c";
const SIGNING_PRIV_PATH = process.env.ACER_SIGNING_PRIV_PATH || `C:/Users/acer/Asolaria/data/vault/owner/ed25519/${SIGNING_KEY_ID}.private.b64`;

mkdirSync(dirname(LEDGER), { recursive: true });

function loadProcessed() {
  const set = new Set();
  if (!existsSync(LEDGER)) return set;
  for (const line of readFileSync(LEDGER, "utf8").split("\n").filter(Boolean)) {
    try {
      const e = JSON.parse(line);
      if (e.scan_id) set.add(e.scan_id);
    } catch {}
  }
  return set;
}

function logProcessed(record) {
  appendFileSync(LEDGER, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
}

async function httpPost(url, body) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text };
  } catch (e) {
    return { ok: false, status: 0, body: `fetch_err: ${e.message}` };
  }
}

let acerPriv = null;
try { acerPriv = readFileSync(SIGNING_PRIV_PATH, "utf8").trim(); } catch {}

async function sweep() {
  if (!existsSync(INBOX)) return;
  const processed = loadProcessed();
  const lines = readFileSync(INBOX, "utf8").split("\n").filter(Boolean);
  let handled = 0, skipped = 0, errors = 0;

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.verb !== "shannon-scan-dispatch") continue;
    if (msg.target !== "acer") continue;
    const scan_id = msg.body?.scan_id;
    if (!scan_id) { skipped++; continue; }
    if (processed.has(scan_id)) { skipped++; continue; }

    try {
      const envelope = {
        verb: "shannon-scan-dispatch",
        actor: msg.actor ?? "liris-shannon-civ",
        target: "acer",
        d1: msg.d1 ?? "IDENTITY",
        body: msg.body,
        glyph_sentence: msg.glyph_sentence,
      };
      const result = runAcerDispatch(envelope);
      const resultEnv = buildResultEnvelope(result);

      // Sign if key available — preserve top-level verb so Liris's inbox
      // filter works. Embed signature as sibling (not wrapper) so the
      // envelope shape is { verb, actor, target, body, glyph_sentence,
      // entry_sig } with verb at top level.
      let envelopeToSend = resultEnv;
      if (acerPriv) {
        const wrapped = signPayload(resultEnv, acerPriv, SIGNING_KEY_ID);
        envelopeToSend = { ...resultEnv, entry_sig: wrapped.signature };
      }

      const post = await httpPost(LIRIS_ENDPOINT, JSON.stringify(envelopeToSend));
      if (post.ok) {
        handled++;
        processed.add(scan_id);
        logProcessed({ scan_id, verdict: result.verdict, evidence: result.l4.evidence, http_status: post.status, glyph: result.glyph_sentence });
        console.log(`[shannon-acer-dispatch] scan_id=${scan_id} verdict=${result.verdict} → liris ${post.status}`);
      } else {
        errors++;
        logProcessed({ scan_id, verdict: result.verdict, error: post.body.slice(0, 200), http_status: post.status });
        console.error(`[shannon-acer-dispatch] scan_id=${scan_id} POST failed:`, post.body.slice(0, 200));
      }
    } catch (e) {
      errors++;
      logProcessed({ scan_id, error: `dispatch_threw: ${e.message || e}` });
      console.error(`[shannon-acer-dispatch] scan_id=${scan_id} threw:`, e.message || e);
    }
  }
  if (handled || errors) console.log(`[shannon-acer-dispatch ${new Date().toISOString()}] handled=${handled} skipped=${skipped} errors=${errors} ledger=${processed.size}`);
}

console.log("shannon-acer-dispatch-daemon starting");
console.log("  INBOX:", INBOX);
console.log("  LEDGER:", LEDGER);
console.log("  LIRIS:", LIRIS_ENDPOINT);
console.log("  signing:", acerPriv ? `${SIGNING_KEY_ID} (signed)` : "UNSIGNED (no private key loaded)");
console.log("  interval:", INTERVAL + "ms");
console.log("  process_started_at:", PROCESS_STARTED_AT);
console.log("  source_commit:", SOURCE_COMMIT);
console.log("META-ACER-SHANNON-DISPATCH-DAEMON-STARTED · commit=" + SOURCE_COMMIT + " · started=" + PROCESS_STARTED_AT + " @ M-EYEWITNESS .");

await sweep();
setInterval(sweep, INTERVAL);
