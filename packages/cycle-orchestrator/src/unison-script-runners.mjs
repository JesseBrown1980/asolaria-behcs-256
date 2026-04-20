// unison-script-runners.mjs — UNISON test deterministic script runners
//
// Replaces the cycle-orchestrator scriptRunner stub (which returned
// "deterministic-placeholder" — ANY bilateral "match" it produced was FAKE).
//
// Contract:
//   export async function runUnisonTest(test_id, params = {})
//     → { canonical_bytes, sha256, deterministic_today, meta }
//
// Fail-closed principle:
//   Any runner that cannot be made TRULY deterministic today returns
//   { deterministic_today: false, reason, sha256: null }. The driver
//   must treat this as a runner-not-ready error and NOT fabricate a
//   bilateral match.
//
// Rationale per test:
//   TEST-001  Shannon L0-L6 verdict — runAcerDispatch is pure given a
//             fixed envelope. We port the L3/L4/L5 decision logic from
//             packages/shannon-civ/src/acer-dispatch.ts into pure JS
//             here (no node_modules/tsx available in this package, and
//             shannon-civ exports .ts). Canonicalize the L5Result via
//             stable-sorted JSON.
//
//   TEST-002  key-rotation-intent — buildRotationIntent is pure given
//             a fixed KeyRotationCandidate + fixed planned_at. Port
//             the intent builder from
//             packages/device-instance/src/key-rotation.ts.
//
//   TEST-003  fed-health-roll-up — computeHealth from
//             packages/health-aggregator/src/health.ts is pure given
//             fixed federation snapshot + fixed `now`. Port
//             computeHealth + peerColor/worst helpers.
//
//   TEST-004  drift-broadcast — detectDrift requires on-disk instance
//             content + new Date(), broadcastDrift uses new Date() +
//             ed25519 signPayload (operator key). Both sources of
//             non-determinism outside this runner's control today.
//             Marked { deterministic_today: false }.
//
//   TEST-005  contract-migration Q-005 — migrate is pure given fixed
//             registry + fixed envelope. Port findPath + migrate from
//             packages/schema-contracts/src/migration.ts with a fixed
//             v1→v2→v3 registry baked in.
//
// This file is a STABLE SURFACE. Canonical bytes MUST NOT contain
// timestamps, pids, or any runtime-varying material — per D11=PROVEN
// feedback_content_deterministic_artifacts.

import { createHash } from "node:crypto";

// ──────────────────────────────────────────────────────────────────────
// Stable canonicalization — sorted-keys JSON (no whitespace, no locale
// surprises). We do NOT rely on structuredClone / JSON.stringify with
// replacer because key order is not guaranteed for plain objects; we
// walk the tree ourselves.
// ──────────────────────────────────────────────────────────────────────

function canonical(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      // Encode ±Infinity / NaN deterministically (migrate rarely hits
      // this, but guard so sha never depends on Node's JSON behavior).
      if (Number.isNaN(value)) return "\"__NaN__\"";
      return value > 0 ? "\"__Infinity__\"" : "\"__-Infinity__\"";
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonical).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  // bigint / symbol / function — intentionally unsupported
  throw new Error(`canonical: unsupported type ${typeof value}`);
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function seal(obj) {
  const canonical_bytes = canonical(obj);
  const sha256 = hashBytes(canonical_bytes);
  return { canonical_bytes, sha256 };
}

// ──────────────────────────────────────────────────────────────────────
// TEST-001 — Shannon L0-L6 verdict (port of acer-dispatch.ts L3/L4/L5)
// Fixed input envelope → deterministic L5Result.
// ──────────────────────────────────────────────────────────────────────

const CANONICAL_PROFILES = {
  // Mirror of packages/shannon-civ/src/profile-schema.ts CANONICAL_PROFILES.
  // Keep a frozen subset we actually use in the fixed input; including
  // every profile would make this file brittle. If a test uses a profile
  // not in this mirror, the runner halts with PROFILE_UNKNOWN — which is
  // itself a deterministic outcome.
  "shannon-recon":    { phase: 1, model: "sonnet", lives_on_device: "DEV-ACER", halts_on: ["surface mismatch","rate limit exceeded"], never_performs: ["exploit","auth bypass"] },
  "shannon-pre-recon": { phase: 0, model: "haiku", lives_on_device: "DEV-LIRIS", halts_on: ["out-of-scope target","missing operator_witness"], never_performs: ["exploit","destructive probes"] },
};

function classifyProfile(envelope) {
  const { scan_id, spawn_request } = envelope.body;
  const profile_name = spawn_request.profile_name;
  const reasons = [];
  const canonical = CANONICAL_PROFILES[profile_name];
  if (!canonical) {
    return { scan_id, profile_name, verdict: "PROFILE_UNKNOWN", resident_device: "UNKNOWN", halts_observed: [], never_performs_observed: [], reasons: [`profile '${profile_name}' not in CANONICAL_PROFILES`] };
  }
  const resident = canonical.lives_on_device;
  if (resident !== "DEV-ACER") {
    reasons.push(`profile lives_on_device=${resident}; acer-side dispatch rejects`);
    return { scan_id, profile_name, verdict: "PROFILE_LIRIS_RESIDENT", resident_device: resident, halts_observed: [], never_performs_observed: [], reasons };
  }
  const halts = [];
  const allowedHosts = spawn_request.scope?.allowed_hosts ?? [];
  const allowedPaths = spawn_request.scope?.allowed_paths ?? [];
  if (allowedHosts.length === 0) halts.push("scope.allowed_hosts is empty (matches halts_on: 'out-of-scope target')");
  if (allowedPaths.length === 0) halts.push("scope.allowed_paths is empty");
  if (!spawn_request.operator_witness?.gate) halts.push("halts_on: 'missing operator_witness'");
  if (halts.length > 0) {
    for (const h of halts) reasons.push(`halt: ${h}`);
    return { scan_id, profile_name, verdict: "PROFILE_HALT", resident_device: "DEV-ACER", halts_observed: halts, never_performs_observed: [], reasons };
  }
  reasons.push(`profile=${profile_name} resident=DEV-ACER scope-valid witness=${spawn_request.operator_witness.gate}`);
  return { scan_id, profile_name, verdict: "PROFILE_ACER_RESIDENT", resident_device: "DEV-ACER", halts_observed: [], never_performs_observed: [], reasons };
}

function synthesize(envelope, l3) {
  const { scan_id, spawn_request, l0_l2_verdicts } = envelope.body;
  const notes = [];
  const isItemOk = (v) => {
    if (typeof v.ok === "boolean") return v.ok;
    if (typeof v.decision === "string") return v.decision === "pass" || v.decision === "ok";
    return false;
  };
  const itemLevel = (v) => String(v.level ?? v.layer ?? "");
  const l0l2_all_ok = l0_l2_verdicts.every(isItemOk);
  const l3_accepted = l3.verdict === "PROFILE_ACER_RESIDENT";
  const canonical = CANONICAL_PROFILES[spawn_request.profile_name];
  const phase_expected = canonical?.phase;
  const hasAllLevels = ["L0", "L1", "L2"].every(lvl => l0_l2_verdicts.some(v => itemLevel(v) === lvl));
  const phase_expectation_met = hasAllLevels;
  if (!hasAllLevels) notes.push("L0/L1/L2 coverage incomplete");
  if (typeof phase_expected === "number") notes.push(`profile phase=${phase_expected}`);
  let evidence;
  if (l0l2_all_ok && l3_accepted && phase_expectation_met) evidence = "STRONG";
  else if (!l0l2_all_ok && l3_accepted) evidence = "CONTRADICTORY";
  else if (!l3_accepted) evidence = "INSUFFICIENT";
  else evidence = "WEAK";
  notes.push(`evidence=${evidence} (l0l2_all_ok=${l0l2_all_ok} l3_accepted=${l3_accepted} phase_met=${phase_expectation_met})`);
  return { scan_id, evidence, phase_expectation_met, l0_l2_all_ok: l0l2_all_ok, l3_accepted, notes };
}

function decide(envelope, l3, l4) {
  let verdict, reason;
  if (l3.verdict === "PROFILE_HALT") { verdict = "halt"; reason = `L3 halt triggered: ${l3.halts_observed.join("; ")}`; }
  else if (l3.verdict === "PROFILE_UNKNOWN") { verdict = "halt"; reason = `L3 unknown profile: ${l3.profile_name}`; }
  else if (l3.verdict === "PROFILE_LIRIS_RESIDENT") { verdict = "pending-acer-civ-return"; reason = `profile lives on ${l3.resident_device}; not acer's to run — returning to liris for re-routing`; }
  else if (l4.evidence === "STRONG") { verdict = "promote"; reason = "L0-L2 all-ok + L3 accepted + phase expectation met"; }
  else if (l4.evidence === "CONTRADICTORY") { verdict = "halt"; reason = "L0-L2 found issues despite L3 acceptance — operator review required"; }
  else { verdict = "pending-acer-civ-return"; reason = `evidence=${l4.evidence}; returning to liris for L6 synthesis + operator review`; }
  // NOTE: skip glyph_sentence in canonical output (free text) to keep
  // byte output compact and avoid string-format drift.
  return { scan_id: envelope.body.scan_id, verdict, reason, l3, l4 };
}

function runAcerDispatch(envelope) {
  const l3 = classifyProfile(envelope);
  const l4 = synthesize(envelope, l3);
  return decide(envelope, l3, l4);
}

// Fixed envelope for TEST-001. ALL strings & arrays here are immutable
// and the envelope never contains a timestamp.
const TEST_001_ENVELOPE = {
  verb: "shannon-scan-dispatch",
  actor: "liris-shannon-civ",
  target: "acer",
  body: {
    scan_id: "UNISON-TEST-001-fixed-scan",
    spawn_request: {
      profile_name: "shannon-recon",
      scan_id: "UNISON-TEST-001-fixed-scan",
      scope: {
        allowed_hosts: ["example.test", "lab.example.test"],
        allowed_paths: ["/api", "/public"],
      },
      operator_witness: { gate: "jesse", profile: "owner" },
      requested_by: "cycle-orchestrator-unison-runner",
      ts: "2026-04-19T00:00:00.000Z",
    },
    l0_l2_verdicts: [
      { level: "L0", ok: true, reason: "in-scope" },
      { level: "L1", ok: true, reason: "witness-valid" },
      { level: "L2", ok: true, reason: "patterns-clean" },
    ],
  },
};

function runTest001() {
  const l5 = runAcerDispatch(TEST_001_ENVELOPE);
  const { canonical_bytes, sha256 } = seal(l5);
  return {
    canonical_bytes,
    sha256,
    deterministic_today: true,
    meta: {
      test_id: "UNISON-TEST-001",
      test_name: "shannon-l0-l6-verdict",
      source: "packages/shannon-civ/src/acer-dispatch.ts (ported)",
      verdict: l5.verdict,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// TEST-002 — key-rotation intent
// Fixed KeyRotationCandidate + fixed planned_at → deterministic intent.
// Ported from packages/device-instance/src/key-rotation.ts
// ──────────────────────────────────────────────────────────────────────

function buildRotationIntent(input) {
  const planned_at = input.planned_at;            // REQUIRED for determinism
  const strategy = input.strategy ?? "side-by-side";
  const grace = input.grace_days ?? 7;
  const target = new Date(Date.parse(planned_at) + grace * 86400_000).toISOString();
  const d11 = input.d11_target ?? "WITNESSED_TWICE";
  const id = input.intent_id ?? `rot-${input.candidate.key_id}-${Date.parse(planned_at)}`;
  return {
    intent_id: id,
    candidate_key_id: input.candidate.key_id,
    owner_glyph: input.candidate.owner_glyph,
    host_device: input.candidate.host_device,
    strategy,
    planned_at,
    target_rotation_by: target,
    d11_target: d11,
    requires_owner_ack: true,
    witness_profiles_accepted: ["owner"],
    evidence: {
      verdict: input.candidate.verdict,
      reason: input.candidate.reason,
      age_days: input.candidate.age_days,
    },
    // NOTE: glyph_sentence omitted from canonical output (string-format drift).
  };
}

const TEST_002_CANDIDATE = {
  key_id: "dev-acer-4abb0a9c",
  owner_glyph: "OP-JESSE",
  host_device: "DEV-ACER",
  verdict: "rotate-now",
  reason: "age ≥ 90d policy threshold",
  age_days: 92,
};

function runTest002() {
  const intent = buildRotationIntent({
    candidate: TEST_002_CANDIDATE,
    strategy: "side-by-side",
    grace_days: 7,
    d11_target: "WITNESSED_TWICE",
    planned_at: "2026-04-19T00:00:00.000Z",
  });
  const { canonical_bytes, sha256 } = seal(intent);
  return {
    canonical_bytes,
    sha256,
    deterministic_today: true,
    meta: {
      test_id: "UNISON-TEST-002",
      test_name: "key-rotation-intent",
      source: "packages/device-instance/src/key-rotation.ts (ported)",
      intent_id: intent.intent_id,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// TEST-003 — federation health roll-up
// Fixed peer list + daemons + explicit `now` → deterministic verdict.
// Ported from packages/health-aggregator/src/health.ts
// ──────────────────────────────────────────────────────────────────────

function peerColor(p, threshold) {
  if (!p.ok) return "RED";
  if (p.stale_vs_reference || p.uptime_exceeds_max) return "YELLOW";
  if (typeof p.uptime_s === "number" && p.uptime_s > threshold) return "YELLOW";
  return "GREEN";
}
function worst(colors) {
  if (colors.includes("RED")) return "RED";
  if (colors.includes("YELLOW")) return "YELLOW";
  return "GREEN";
}

function computeHealth(input) {
  const now = input.now;   // REQUIRED — NO new Date() fallback (kills determinism)
  const threshold = input.stale_age_threshold_s ?? Number.POSITIVE_INFINITY;
  const peerColors = [];
  let peerOk = 0, peerFail = 0, peerStale = 0;
  let worstPeer = null;
  const reasons = [];
  if (input.federation) {
    for (const p of input.federation.peers) {
      const c = peerColor(p, threshold);
      peerColors.push(c);
      if (p.ok) peerOk++; else { peerFail++; if (!worstPeer || c === "RED") worstPeer = p.name; }
      if (p.stale_vs_reference) peerStale++;
      if (c === "RED") reasons.push(`peer ${p.name} DOWN (${p.error ?? "no error"})`);
      else if (c === "YELLOW") reasons.push(`peer ${p.name} stale/degraded`);
    }
  }
  const daemonColors = [];
  let daemonOk = 0, daemonRed = 0;
  let worstDaemon = null;
  for (const d of input.daemons ?? []) {
    daemonColors.push(d.color);
    if (d.ok) daemonOk++;
    if (d.color === "RED") { daemonRed++; worstDaemon = worstDaemon ?? d.name; reasons.push(`daemon ${d.name} RED${d.note ? ": " + d.note : ""}`); }
    else if (d.color === "YELLOW") reasons.push(`daemon ${d.name} YELLOW${d.note ? ": " + d.note : ""}`);
  }
  const allColors = [...peerColors, ...daemonColors];
  const color = allColors.length === 0 ? "GREEN" : worst(allColors);
  const one_liner = `[${color}] peers=${peerOk}/${(input.federation?.peer_count ?? 0)} ok · daemons=${daemonOk}/${(input.daemons?.length ?? 0)} ok${peerFail + daemonRed > 0 ? ` · ${peerFail + daemonRed} fail` : ""}`;
  return {
    color,
    peer_count: input.federation?.peer_count ?? 0,
    peer_ok: peerOk,
    peer_fail: peerFail,
    peer_stale: peerStale,
    daemon_count: (input.daemons ?? []).length,
    daemon_ok: daemonOk,
    daemon_red: daemonRed,
    reasons,
    worst_peer: worstPeer,
    worst_daemon: worstDaemon,
    one_liner,
    computed_at: now,
  };
}

const TEST_003_FEDERATION = {
  peer_count: 3,
  peers: [
    { name: "acer",   ok: true,  uptime_s: 3600, stale_vs_reference: false, uptime_exceeds_max: false },
    { name: "liris",  ok: true,  uptime_s: 7200, stale_vs_reference: false, uptime_exceeds_max: false },
    { name: "falcon", ok: false, uptime_s: 0,    stale_vs_reference: true,  uptime_exceeds_max: false, error: "unreachable" },
  ],
};
const TEST_003_DAEMONS = [
  { name: "behcs-bus",       ok: true,  color: "GREEN" },
  { name: "shannon-dispatch", ok: true, color: "GREEN" },
];

function runTest003() {
  const verdict = computeHealth({
    federation: TEST_003_FEDERATION,
    daemons: TEST_003_DAEMONS,
    stale_age_threshold_s: 86400,
    now: "2026-04-19T00:00:00.000Z",
  });
  const { canonical_bytes, sha256 } = seal(verdict);
  return {
    canonical_bytes,
    sha256,
    deterministic_today: true,
    meta: {
      test_id: "UNISON-TEST-003",
      test_name: "fed-health-roll-up",
      source: "packages/health-aggregator/src/health.ts (ported)",
      color: verdict.color,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// TEST-004 — drift-broadcast
// CANNOT be deterministic today:
//   · detectDrift reads instance file from disk; content-dependent.
//   · Both detectDrift and broadcastDrift call new Date().toISOString().
//   · broadcastDrift calls signPayload(ed25519) — requires operator key,
//     produces signatures whose bytes depend on private key material.
// Fixing these would require plumbing a fixed-clock + fixed-key mode
// through device-instance + drift-broadcast + ed25519-registry — a
// multi-package change outside this runner's scope.
// FAIL-CLOSED: return null sha, deterministic_today=false.
// ──────────────────────────────────────────────────────────────────────

function runTest004() {
  return {
    canonical_bytes: null,
    sha256: null,
    deterministic_today: false,
    meta: {
      test_id: "UNISON-TEST-004",
      test_name: "drift-broadcast",
      reason: "drift-broadcast needs fixed-clock + fixed-key plumbing through device-instance/drift-broadcast/ed25519-registry (new Date() + ed25519 signPayload both non-deterministic). Out of scope for this runner.",
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// TEST-005 — contract-migration Q-005
// Fixed migration registry + fixed v1 envelope → deterministic v3 output.
// Ported from packages/schema-contracts/src/migration.ts (findPath + migrate).
// ──────────────────────────────────────────────────────────────────────

function findPath(registry, from, to) {
  if (from === to) return [];
  const queue = [{ node: from, path: [] }];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const cur = queue.shift();
    const next = registry.steps.filter(s => s.from_version === cur.node);
    for (const step of next) {
      if (seen.has(step.to_version)) continue;
      const newPath = [...cur.path, step];
      if (step.to_version === to) return newPath;
      seen.add(step.to_version);
      queue.push({ node: step.to_version, path: newPath });
    }
  }
  return null;
}

function migrate(envelope, from_version, to_version, registry) {
  const path = findPath(registry, from_version, to_version);
  if (path === null) {
    return { ok: false, from_version, to_version, envelope: null, steps_applied: [], reason: `no migration path from ${from_version} → ${to_version} for verb=${registry.verb}` };
  }
  let current = structuredClone(envelope);
  const applied = [];
  for (const step of path) {
    try {
      current = step.transform(current);
      applied.push({ from: step.from_version, to: step.to_version, description: step.description });
    } catch (e) {
      return { ok: false, from_version, to_version, envelope: null, steps_applied: applied, reason: `transform threw in ${step.from_version} → ${step.to_version}: ${e.message}` };
    }
  }
  return { ok: true, from_version, to_version, envelope: current, steps_applied: applied, reason: `migrated through ${applied.length} step(s)` };
}

// Fixed, pure-function registry for verb=shannon-scan-dispatch.
// v1 → v2: rename body.spawn_request.profile_name → body.spawn_request.profile_id
// v2 → v3: attach body.schema_version field, normalize allowed_hosts sort
const TEST_005_REGISTRY = {
  verb: "shannon-scan-dispatch",
  steps: [
    {
      from_version: "v1",
      to_version: "v2",
      description: "rename profile_name → profile_id",
      transform: (e) => {
        const out = structuredClone(e);
        if (out.body?.spawn_request?.profile_name !== undefined) {
          out.body.spawn_request.profile_id = out.body.spawn_request.profile_name;
          delete out.body.spawn_request.profile_name;
        }
        return out;
      },
    },
    {
      from_version: "v2",
      to_version: "v3",
      description: "attach schema_version + sort allowed_hosts",
      transform: (e) => {
        const out = structuredClone(e);
        out.body = out.body ?? {};
        out.body.schema_version = "v3";
        const hosts = out.body?.spawn_request?.scope?.allowed_hosts;
        if (Array.isArray(hosts)) {
          out.body.spawn_request.scope.allowed_hosts = [...hosts].sort();
        }
        return out;
      },
    },
  ],
};

const TEST_005_ENVELOPE_V1 = {
  verb: "shannon-scan-dispatch",
  actor: "liris",
  target: "acer",
  body: {
    scan_id: "UNISON-TEST-005-fixed",
    spawn_request: {
      profile_name: "shannon-recon",
      scope: { allowed_hosts: ["z.test", "a.test", "m.test"], allowed_paths: ["/api"] },
      operator_witness: { gate: "jesse", profile: "owner" },
    },
  },
};

function runTest005() {
  const result = migrate(TEST_005_ENVELOPE_V1, "v1", "v3", TEST_005_REGISTRY);
  // Canonicalize the FULL result (envelope + steps_applied + ok + reason)
  // so both peers hash the same migration trace.
  const { canonical_bytes, sha256 } = seal(result);
  return {
    canonical_bytes,
    sha256,
    deterministic_today: true,
    meta: {
      test_id: "UNISON-TEST-005",
      test_name: "contract-migration-q-005",
      source: "packages/schema-contracts/src/migration.ts (ported)",
      steps_applied: result.steps_applied.length,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────

const RUNNERS = {
  "UNISON-TEST-001": runTest001,
  "UNISON-TEST-002": runTest002,
  "UNISON-TEST-003": runTest003,
  "UNISON-TEST-004": runTest004,
  "UNISON-TEST-005": runTest005,
};

export async function runUnisonTest(test_id, _params = {}) {
  const fn = RUNNERS[test_id];
  if (!fn) {
    return {
      canonical_bytes: null,
      sha256: null,
      deterministic_today: false,
      meta: { test_id, reason: `unknown test_id '${test_id}'` },
    };
  }
  // All current runners are synchronous — await still supported so future
  // runners can go async without a signature change.
  return await fn();
}

// Exported for tests
export const __internal = { canonical, seal, hashBytes, RUNNERS };
