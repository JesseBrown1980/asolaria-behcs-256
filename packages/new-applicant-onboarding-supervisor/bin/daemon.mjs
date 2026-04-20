#!/usr/bin/env node
// Onboarding Supervisor Daemon
// Watches bus for OP-ONBOARD-APPLICANT verbs + auto-onboards new joiners.
//
// Verb shape: OP-ONBOARD-APPLICANT { name, kind, serial?, smb_target_dir? }
// On match: calls onboardApplicant → emits EVT-ACER-NEW-APPLICANT-ONBOARDED

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { onboardApplicant, reOnboardFederation } from "../src/index.mjs";
import { emitEnvelope } from "../../pid-targeted-kick-supervisor/src/bus-fire-with-retry.mjs";

const BUS_BASE = "http://127.0.0.1:4947";
const LOG_PATH = "C:/asolaria-acer/tmp/new-applicant-onboarding-supervisor.log";
const POLL_MS = 10_000;
if (!existsSync("C:/asolaria-acer/tmp")) mkdirSync("C:/asolaria-acer/tmp", { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG_PATH, line + "\n"); } catch {}
}

let lastTs = new Date(Date.now() - 60_000).toISOString();
const seen = new Set();

async function pollBus() {
  try {
    const r = await fetch(`${BUS_BASE}/behcs/inbox?limit=50&since=${encodeURIComponent(lastTs)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    return j.messages || [];
  } catch (e) {
    log(`poll FAIL ${e.message}`);
    return [];
  }
}

async function dispatch(env) {
  const verb = env.verb || "";
  const body = env.body || {};
  if (verb === "OP-ONBOARD-APPLICANT") {
    log(`  OP-ONBOARD-APPLICANT ${body.name} kind=${body.kind}`);
    const r = await onboardApplicant(body);
    log(`  onboard ${body.name} ok=${r.ok}`);
    return;
  }
  if (verb === "OP-RE-ONBOARD-FEDERATION") {
    log(`  OP-RE-ONBOARD-FEDERATION (full refresh)`);
    const r = await reOnboardFederation(body.peers);
    log(`  re-onboard ok=${r.ok} applicants=${r.applicants}`);
  }
}

async function main() {
  log("NEW-APPLICANT-ONBOARDING-SUPERVISOR online · poll=" + POLL_MS + "ms");
  await emitEnvelope({
    verb: "EVT-NEW-APPLICANT-ONBOARDING-SUPERVISOR-BOOT",
    payload: "onboarding supervisor daemon online · watches OP-ONBOARD-APPLICANT + OP-RE-ONBOARD-FEDERATION",
    body: { accepted_verbs: ["OP-ONBOARD-APPLICANT", "OP-RE-ONBOARD-FEDERATION"], version: "1.0.0" },
    retry: false,
  });
  while (true) {
    const msgs = await pollBus();
    for (const m of msgs) {
      if (!m.ts) continue;
      if (m.ts > lastTs) lastTs = m.ts;
      if (m.id && seen.has(m.id)) continue;
      if (m.id) seen.add(m.id);
      const v = m.verb || "";
      if (v === "OP-ONBOARD-APPLICANT" || v === "OP-RE-ONBOARD-FEDERATION") await dispatch(m);
    }
    if (seen.size > 500) {
      const arr = [...seen];
      seen.clear();
      for (const x of arr.slice(-200)) seen.add(x);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

main().catch(e => { log(`FATAL ${e.message}`); process.exit(1); });
