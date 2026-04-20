#!/usr/bin/env node
import { tick, SUPERVISOR_CATALOG } from "../src/index.mjs";
import { emitEnvelope } from "../../pid-targeted-kick-supervisor/src/bus-fire-with-retry.mjs";

const POLL_MS = 30_000;

await emitEnvelope({
  verb: "EVT-META-SUPERVISOR-HERMES-BOOT",
  payload: "meta-supervisor-hermes (room 41) online · watches " + Object.keys(SUPERVISOR_CATALOG).length + " supervisor daemons · self-heal flatlines + dead pids · glyph-instrumented",
  body: { version: "1.0.0", room: 41, watched: Object.keys(SUPERVISOR_CATALOG), poll_ms: POLL_MS },
  retry: false,
});

console.log(`[${new Date().toISOString()}] meta-supervisor-hermes online · poll=${POLL_MS}ms · watching ${Object.keys(SUPERVISOR_CATALOG).length} daemons`);

while (true) {
  try { await tick(); }
  catch (e) { console.error(`[${new Date().toISOString()}] tick-error:`, e.message); }
  await new Promise(r => setTimeout(r, POLL_MS));
}
