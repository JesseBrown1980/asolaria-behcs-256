#!/usr/bin/env node
// run-1000-agent-behcs256-fanout.mjs
// Jesse directive 2026-04-19T17:35Z: "use BEHCS 256" + "run 1000 agents"
// Purpose: deliver the V5 OP-REPLY to Liris via 1000 parallel agents, each
//   BEHCS-256-encoded via codex-bridge, posted to acer:4947 bus. When Liris
//   :4947 returns, messages propagate through the sidecar fan-out.
//
// Each of 1000 agents:
//   - unique actor glyph = hilbertAddress(`acer-agent-${i}`)
//   - verb glyph         = hilbertAddress(`op-reply-section-${section}`)
//   - target glyph       = hilbertAddress('liris')
//   - body slice         = 1/1000 of the OP-REPLY text
//   - fallbackTuples     = plaintext D1/D2/D3/D7 for reconstruction
//
// OUTPUT: a fanout-result.json with wall time, per-agent ok count, glyph bandwidth.

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const codex = require("C:/Users/acer/Asolaria/tools/behcs/codex-bridge.js");

const OUT = "C:/asolaria-acer/plans/deep-wave/1000-agent-behcs256-fanout-result.json";
mkdirSync("C:/asolaria-acer/plans/deep-wave", { recursive: true });

const ACER_BUS = "http://127.0.0.1:4947/behcs/send";
const FALCON_BUS_PRIMARY = "http://192.168.1.13:4950/behcs/send";
const N_AGENTS = 1000;

// The OP-REPLY payload we're delivering
const OP_REPLY_TEXT = [
  "OP-REPLY FROM=COL-ACER TO=COL-LIRIS · SMP-V5 review · batches 2-15 · 40 tracks · 1352 tests green",
  "A_MANIFEST: b2 abb94aa L-001+I-001+N-001 | b2b 9caaf2a L-002+I-002+N-002 | b3 7cf95ca Q-001+M-acer+E-acer-int | b4 f82bcf9 Q-002+N-003+A-017-dry | b5 e6d7297 J-100k+N-004+Q-003 | b6 79ad0a9 L-003+I-003+N-005+M-audit | b7 11bbd27 K-002+F-080+G-091 | b8 c4cea1d G-092+F-081+H-001 | b9 b195303 Q-004+L-004+N-006 | b10 a9a26bf E-rotation+I-004+G-093 | b11 67a95b1 H-002+F-082+N-007 | b12 2020981 J-compress+G-094+K-003 | b13 e125610 Q-005+M-governance+F-083 | b14 5f05589 T-001+L-005+G-095 | b15 4c05dbb U-001+Shannon-23+THIRD | dw 5cda2a6 deep-wave-SECOND",
  "B_SECTIONS: PRE=- A=A-017-dry-awaits-verbatim B=yours D=D-055/D-056-prior E=E-acer-int+E-rotation F=F-077/78/79+F-080/81/82/83 G=G-085..G-095 H=H-001+H-002 I=I-001/I-002+I-003/I-004 J=J-100k+J-compress K=K-001+K-002+K-003 L=L-001..L-005 M=M-acer+M-audit+M-governance N=N-001..N-007 O=yours P=yours Q=Q-001..Q-005 R=yours POST=yours T=T-001-meta-language U=U-001-wave-mode S=yours Shannon-23=MIRROR",
  "C_THIRD_CASCADE: shape=93312/pass 3-passes × 3-variants · symmetric-DIVERGING · confidence-weighted-DIVERGING · periodic-reset-halve@10k-STEADY(winner) · root-cause=population-91152:36-imbalance-nets-+1822/pass · canonical-primitive-proposal=periodic-reset · artifact=plans/deep-wave/third-cascade-comparison.json",
  "D_DELTA_SINCE_SEQ90: b11 67a95b1(98) + b12 2020981(121) + b13 e125610(119) + b14 5f05589(106) + b15 4c05dbb(121) + dw 5cda2a6(86) = 6 commits · 651 new acer tests since your mega-5",
  "E_GAPS_BEYOND_MEGA6: (1) falcon-direct-reply-handler (2) vision-keyboard-supervisor-endpoint-now-known-from-falcon-:4915+:9997 (3) keyboard-:4913-alive+foreground-schema-parity (4) h-NNN-pool-100-anon-agents-likely-wave-harness-escape (5) O/P/R/S/POST-not-mirrored-acer-side (6) A-017-execute-jesse-verbatim-gated (7) Q-001-naming-collision-runtime-watcher-vs-schema-contracts (8) SMP-V6-transition-not-declared",
  "channels: acer-bus-:4947 LIVE · falcon-sidecar-:4947+:4950 LIVE · falcon-vision-:4915+:9997 DISCOVERED · liris-all-5-ports-DARK-reboot-in-progress · mirror-keyboard-per-falcon-STANDBY-01-WORKING · vision-supervisor-per-falcon-ABORTED-correctly-when-liris-keyboard-unreachable",
  "signed-nonce=acer-op-reply-behcs256-1000agent-fanout @ M-EYEWITNESS .",
].join(" | ");

// Chunk text into N slices
function chunkText(text, n) {
  const size = Math.ceil(text.length / n);
  const chunks = [];
  for (let i = 0; i < n; i++) {
    const slice = text.slice(i * size, (i + 1) * size);
    chunks.push(slice || "");
  }
  return chunks;
}

async function postEnvelope(url, env, timeoutMs = 5000) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(env),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

function sectionFor(i) {
  // Map agent index to OP-REPLY section
  if (i < 50) return "A_MANIFEST";
  if (i < 200) return "B_SECTIONS";
  if (i < 400) return "C_THIRD_CASCADE";
  if (i < 600) return "D_DELTA_SINCE_SEQ90";
  if (i < 900) return "E_GAPS_BEYOND_MEGA6";
  return "Z_SIGN_OFF";
}

function buildAgentEnvelope(i, total, chunk, ts) {
  const agent_id = `acer-agent-${String(i).padStart(4, "0")}`;
  const actor = codex.hilbertAddress(agent_id);
  const section = sectionFor(i);
  const verb = codex.hilbertAddress(`op-reply-${section}`);
  const target = codex.hilbertAddress("liris");
  const state = codex.hilbertAddress(`beat:${i}:${total}`);
  const proof = codex.hilbertAddress(`sha:acer-op-reply-behcs256-${i}`);
  const intent = codex.hilbertAddress(`deliver-op-reply-to-liris`);
  const support = {
    D10_DIALECT: codex.hilbertAddress("IX-acer"),
    D26_OMNIDIRECTIONAL: codex.hilbertAddress("acer→liris"),
    D31_SEQ: codex.hilbertAddress(`seq-${i}`),
    D34_CROSS_COLONY: codex.hilbertAddress("cross_host_lan"),
    D44_TUPLE: codex.hilbertAddress(`tuple-${section}-${i}`),
  };
  return {
    id: `acer-op-reply-behcs256-${agent_id}`,
    from: agent_id,
    to: "liris",
    actor,
    verb,
    target,
    state,
    proof,
    intent,
    support,
    fallbackTuples: [
      `D1:${agent_id}`,
      `D2:op-reply`,
      `D3:liris`,
      `D7:alive`,
      `D44:${section}`,
    ],
    mode: "real",
    beat: i,
    wave: i % 12,
    ts,
    payload: `BEHCS-256 op-reply slice ${i + 1}/${total} section=${section}: ${chunk}`,
    body: {
      section,
      agent_index: i,
      total_agents: total,
      chunk,
    },
  };
}

async function main() {
  console.log(`=== 1000-agent BEHCS-256 fanout — OP-REPLY delivery ===`);
  console.log(`codex: alphabet.base=${codex.alphabet.base}, width=${codex.alphabet.canonical_width}, catalogs=${codex.catalogs.catalogs.length}`);
  console.log(`target bus: ${ACER_BUS}`);
  console.log(`OP-REPLY text length: ${OP_REPLY_TEXT.length} chars`);

  const chunks = chunkText(OP_REPLY_TEXT, N_AGENTS);
  const ts = new Date().toISOString();

  const t0 = performance.now();

  // Fan out with a small concurrency cap so we don't DoS our own bus
  const CONCURRENCY = 50;
  let idx = 0;
  let ok = 0, fail = 0;
  const errors = [];

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= N_AGENTS) return;
      const env = buildAgentEnvelope(i, N_AGENTS, chunks[i], ts);
      const r = await postEnvelope(ACER_BUS, env);
      if (r.ok) ok++;
      else { fail++; if (errors.length < 10) errors.push({ i, error: r.error || r.status }); }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const t1 = performance.now();
  const walltimeMs = Math.round(t1 - t0);
  const throughput = Math.round((N_AGENTS / walltimeMs) * 1000);

  // Also send a single SUMMARY envelope via Falcon :4950 for Liris-when-back fanout
  const summary = {
    id: `acer-op-reply-behcs256-fanout-summary`,
    from: "acer",
    to: "liris",
    verb: "acer-op-reply-behcs256-fanout-summary",
    actor: "acer",
    target: "liris",
    mode: "real",
    ts: new Date().toISOString(),
    payload: `1000-agent BEHCS-256 fanout summary · agents=${N_AGENTS}`,
    body: {
      directive: "Jesse 2026-04-19 use BEHCS 256 + run 1000 agents",
      agents: N_AGENTS,
      ok,
      fail,
      walltime_ms: walltimeMs,
      throughput_per_sec: throughput,
      codex: {
        base: codex.alphabet.base,
        width: codex.alphabet.canonical_width,
        catalogs: codex.catalogs.catalogs.length,
      },
      sample_agent_glyph: codex.hilbertAddress("acer-agent-0000"),
      liris_glyph: codex.hilbertAddress("liris"),
      acer_glyph: codex.hilbertAddress("acer"),
      op_reply_text_length: OP_REPLY_TEXT.length,
      first_errors: errors,
    },
    glyph_sentence: `EVT-ACER-BEHCS256-1000AGENT-FANOUT · ok=${ok} · fail=${fail} · walltime=${walltimeMs}ms · throughput=${throughput}/s @ M-EYEWITNESS .`,
  };
  const falconResult = await postEnvelope(FALCON_BUS_PRIMARY, summary);

  const report = {
    ts: new Date().toISOString(),
    directive: "Jesse 2026-04-19T17:35Z: use BEHCS 256 + run 1000 agents",
    agents: N_AGENTS,
    ok,
    fail,
    walltime_ms: walltimeMs,
    throughput_per_sec: throughput,
    codex: { base: codex.alphabet.base, width: codex.alphabet.canonical_width, catalogs: codex.catalogs.catalogs.length },
    sample_envelope: buildAgentEnvelope(0, N_AGENTS, chunks[0], ts),
    summary_envelope_to_falcon: { url: FALCON_BUS_PRIMARY, result: falconResult },
    errors,
    glyph: summary.glyph_sentence,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log("");
  console.log(`── RESULT ──`);
  console.log(`  agents:      ${N_AGENTS}`);
  console.log(`  ok:          ${ok}`);
  console.log(`  fail:        ${fail}`);
  console.log(`  walltime:    ${walltimeMs}ms`);
  console.log(`  throughput:  ${throughput}/s`);
  console.log(`  falcon-summary-push: ${falconResult.ok ? "OK" : "FAIL"} (${falconResult.status})`);
  console.log("");
  console.log(summary.glyph_sentence);
  console.log(`\nwrote ${OUT}`);
}

main().catch(e => { console.error("main failed:", e); process.exit(1); });
