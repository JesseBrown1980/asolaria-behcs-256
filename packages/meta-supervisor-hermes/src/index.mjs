// meta-supervisor-hermes · supervisor-of-supervisors
// Brown-Hilbert room 41 · PROF-META-SUPERVISOR-HERMES

import { spawn } from "node:child_process";
import { readFileSync, existsSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { emitEnvelope } from "../../pid-targeted-kick-supervisor/src/bus-fire-with-retry.mjs";
import { makeGlyphLogger, wrapEmitEnvelope, glyph, sentence, ROOM_MAP, tripsHaltCanon } from "../../glyph-instrument/src/index.mjs";

const ACTOR = "meta-supervisor-hermes";
const ROOM  = "meta-supervisor-hermes"; // = 41

const LOG_PATH   = "C:/asolaria-acer/tmp/meta-supervisor-hermes.log";
const STATE_PATH = "C:/asolaria-acer/tmp/meta-supervisor-hermes.state.json";
if (!existsSync("C:/asolaria-acer/tmp")) mkdirSync("C:/asolaria-acer/tmp", { recursive: true });

const log = makeGlyphLogger({ actor: ACTOR, room: ROOM });
const emitGlyphed = wrapEmitEnvelope(emitEnvelope, { actor: ACTOR, defaultRoom: ROOM });

/**
 * Known supervisor daemons + their restart recipes + health probes.
 * Each entry declares how to recognize a live daemon and how to restart it.
 */
export const SUPERVISOR_CATALOG = {
  "pid-targeted-kick-supervisor": {
    room: "bus-and-kick", // 29 (uses bus-and-kick primitive)
    cmdline_signature: /pid-targeted-kick-supervisor[\/\\]bin[\/\\]daemon\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/pid-targeted-kick-supervisor/bin/daemon.mjs"],
    health_log: "C:/asolaria-acer/tmp/pid-targeted-kick-supervisor.log",
    flatline_ms: 90_000, // if log hasn't advanced in 90s → flatline
  },
  "new-applicant-onboarding-supervisor": {
    room: "meta-supervisor-hermes", // 41 (peer)
    cmdline_signature: /new-applicant-onboarding-supervisor[\/\\]bin[\/\\]daemon\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/new-applicant-onboarding-supervisor/bin/daemon.mjs"],
    health_log: "C:/asolaria-acer/tmp/new-applicant-onboarding-supervisor.log",
    flatline_ms: 120_000,
  },
  "act-supervisor": {
    room: "gc-inbox-supervisor", // 35
    cmdline_signature: /act-supervisor[\/\\]supervisor\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/act-supervisor/supervisor.mjs"],
    health_log: "C:/asolaria-acer/tmp/act-supervisor.log",
    flatline_ms: 60_000,
  },
  "immune-l1-supervisor": {
    room: "agent-auditor", // 30
    cmdline_signature: /immune-l1-supervisor[\/\\]src[\/\\]daemon\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/immune-l1-supervisor/src/daemon.mjs"],
    health_url: "http://127.0.0.1:4821/health",
    flatline_ms: 60_000,
  },
  "cycle-orchestrator": {
    room: "supervisor-daemon", // 27
    cmdline_signature: /cycle-orchestrator[\/\\]src[\/\\]index\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/cycle-orchestrator/src/index.mjs"],
    health_log: "C:/asolaria-acer/tmp/cycle-orch-heartbeat.log",
    flatline_ms: 60_000,
  },
  "super-gulp-tier3-consumer": {
    room: "super-gulp", // 37
    cmdline_signature: /super-gulp-tier3-consumer[\/\\]src[\/\\]daemon\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/super-gulp-tier3-consumer/src/daemon.mjs"],
    health_log: "C:/asolaria-acer/tmp/super-gulp-tier3.log",
    flatline_ms: 60_000,
  },
  "whiteroom-consumer": {
    room: "agent-whiteroom-digester", // 34
    cmdline_signature: /whiteroom-consumer[\/\\]src[\/\\]daemon\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/whiteroom-consumer/src/daemon.mjs"],
    flatline_ms: 60_000,
  },
  "gulp-http-bridge": {
    room: "agent-gulp-state", // 31
    cmdline_signature: /gulp-http-bridge[\/\\]src[\/\\]daemon\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/gulp-http-bridge/src/daemon.mjs"],
    health_url: "http://127.0.0.1:4923/behcs/gulp/status",
    flatline_ms: 60_000,
    restart_env: { ASOLARIA_INSTANCE_ROOT: "C:/Users/acer/Asolaria", ASOLARIA_ROOT: "C:/Users/acer/Asolaria" },
  },
  "stage-to-actual-converter": {
    room: "unison-processor", // 26
    cmdline_signature: /stage-to-actual-converter[\/\\]src[\/\\]daemon\.mjs/,
    restart_cmd: "node",
    restart_args: ["C:/asolaria-acer/packages/stage-to-actual-converter/src/daemon.mjs"],
    flatline_ms: 60_000,
  },
};

function runWmic() {
  return new Promise((resolve) => {
    const cp = spawn("powershell", ["-NoProfile", "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId, CommandLine, CreationDate | ConvertTo-Json -Depth 2 -Compress"
    ], { shell: false, windowsHide: true });
    let out = ""; let err = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve({ ok: false, out, err: err + "\nTIMEOUT" }); }, 15_000);
    cp.stdout.on("data", d => out += d.toString());
    cp.stderr.on("data", d => err += d.toString());
    cp.on("close", c => { clearTimeout(t); resolve({ ok: c === 0, out, err }); });
  });
}

function parsePsDate(d) {
  // PowerShell JSON date: "/Date(1776320000000)/" or ISO string
  if (!d) return 0;
  const s = String(d);
  const m = s.match(/\/Date\((\d+)\)\//);
  if (m) return parseInt(m[1], 10);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

export async function enumerateLiveDaemons() {
  const r = await runWmic();
  if (!r.ok) return { ok: false, error: r.err };
  let arr;
  try { arr = JSON.parse(r.out || "[]"); if (!Array.isArray(arr)) arr = [arr]; }
  catch { arr = []; }
  const live = {};
  for (const [name, entry] of Object.entries(SUPERVISOR_CATALOG)) {
    // Collect ALL matches; pick the NEWEST-started one (avoid ancient stale-log trap)
    const matches = arr.filter(p => p && p.CommandLine && entry.cmdline_signature.test(String(p.CommandLine)));
    if (!matches.length) { live[name] = null; continue; }
    matches.sort((a, b) => parsePsDate(b.CreationDate) - parsePsDate(a.CreationDate));
    const winner = matches[0];
    live[name] = {
      pid: winner.ProcessId,
      cmdline: winner.CommandLine,
      start_ms: parsePsDate(winner.CreationDate),
      duplicate_pids: matches.slice(1).map(p => p.ProcessId),
    };
  }
  return { ok: true, live };
}

export async function pingHealth(entry) {
  // http health is definitive when configured
  if (entry.health_url) {
    try {
      const r = await fetch(entry.health_url, { signal: AbortSignal.timeout(5000) });
      return { ok: r.ok, status: r.status, method: "http" };
    } catch (e) { return { ok: false, error: String(e.message || e), method: "http" }; }
  }
  // log_mtime is only a HINT — return null so status-resolver defaults to process-existence
  // (idle daemons don't write logs; we don't want to restart them just because they're quiet)
  return { ok: null, method: "none" };
}

export async function restartDaemon(name) {
  const entry = SUPERVISOR_CATALOG[name];
  if (!entry) return { ok: false, reason: "unknown-daemon" };
  const cp = spawn(entry.restart_cmd, entry.restart_args, {
    shell: false, windowsHide: true, detached: true, stdio: "ignore",
    env: { ...process.env, ...(entry.restart_env || {}) },
  });
  cp.unref();
  return { ok: true, pid: cp.pid, cmd: entry.restart_cmd, args: entry.restart_args };
}

/**
 * One tick: enumerate → ping each → restart flatlined → emit EVT-META-SUPERVISOR-*
 */
export async function tick() {
  const enumRes = await enumerateLiveDaemons();
  if (!enumRes.ok) { log("enum-fail", enumRes); return { ok: false }; }
  const report = { ts: new Date().toISOString(), supervisors: {}, healed: [], flat: [], skipped_newborn: [] };
  const NEWBORN_GRACE_MS = 120_000; // don't flatline-check processes < 2min old
  for (const [name, entry] of Object.entries(SUPERVISOR_CATALOG)) {
    const live = enumRes.live[name];
    const age_ms = live?.start_ms ? (Date.now() - live.start_ms) : null;
    const ping = live ? await pingHealth(entry) : { ok: false, error: "no-process" };
    let status;
    if (!live) status = "dead";
    else if (age_ms !== null && age_ms < NEWBORN_GRACE_MS) { status = "live"; report.skipped_newborn.push({ name, age_ms }); }
    else if (ping.ok === false) status = "flatline";
    else if (ping.ok === true)  status = "live";
    else status = "unknown"; // no health probe configured → assume live if process exists
    if (status === "unknown" && live) status = "live";
    report.supervisors[name] = { live: !!live, pid: live?.pid || null, ping, status, age_ms, duplicate_pids: live?.duplicate_pids || [], room: entry.room, D_room: ROOM_MAP[entry.room] };
    if (status === "dead" || status === "flatline") {
      const heal = await restartDaemon(name);
      if (heal.ok) {
        report.healed.push({ name, new_pid: heal.pid, prior_status: status });
        log(`healed-${name}`, { new_pid: heal.pid, prior: status });
        await emitGlyphed({
          verb: `EVT-META-SUPERVISOR-HEALED-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
          actor: ACTOR, target: "federation",
          payload: `${name} was ${status} · restarted · new pid ${heal.pid}`,
          body: { name, prior_status: status, new_pid: heal.pid, ping, room: entry.room, D_room: ROOM_MAP[entry.room] },
        });
      } else {
        report.flat.push({ name, prior_status: status, heal_err: heal.reason });
      }
    }
  }
  try { writeFileSync(STATE_PATH, JSON.stringify(report, null, 2)); } catch {}
  log("tick-done", { supervisors: Object.keys(report.supervisors).length, healed: report.healed.length, flat: report.flat.length });
  return { ok: true, report };
}

export { glyph, sentence, ROOM_MAP, tripsHaltCanon };
