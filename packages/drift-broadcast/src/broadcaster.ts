// packages/drift-broadcast/src/broadcaster.ts — F-077 drift-broadcast
//
// Turns AsolariaInstance's PASSIVE drift detection (verify() returns ok:false,
// local runtime halts) into ACTIVE federation alarm: any peer's sidecar can
// subscribe to verb=drift-detected envelopes and take defensive action
// (e.g. quarantine the subject, refuse to accept its new envelopes, alert
// operator-witness).
//
// References:
//   D-055 ed25519-registry  — signPayload for authentic broadcast
//   D-056 binding-classes   — AGT-KEY invariants (we sign with device-bound key)
//   D-057 migration-proc    — rollback path if drift is during migration
//   device-instance         — AsolariaInstance.verify + drift_log entries

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { signPayload, loadRegistry, type Ed25519Registry } from "../../kernel/src/ed25519-registry.ts";
import { AsolariaInstance, type AsolariaIdentityManifest, type DriftLogEntry } from "../../device-instance/src/index.ts";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface DriftDetection {
  instance_path: string;
  permanent_name: string;
  hilbert_pid: string;
  instance_sha256: string;
  drift_kind: "verify_failed" | "new_drift_log_entry" | "both";
  verify_result: { ok: boolean; violations: string[] } | null;
  drift_log_entries: DriftLogEntry[];
  observed_at: string;
  observer_pid: string;
}

export interface DriftBroadcastPayload {
  actor: "acer" | "liris" | "falcon" | string;
  verb: "drift-detected";
  target: "federation" | string;
  detection: DriftDetection;
  ts: string;
}

export interface SignedDriftEnvelope {
  payload: DriftBroadcastPayload;
  signature: { key_id: string; sig_b64: string; alg: "ed25519"; signed_at: string };
}

export interface BroadcastResult {
  ok: boolean;
  destinations_attempted: string[];
  destinations_succeeded: string[];
  destinations_failed: Array<{ peer: string; reason: string }>;
  signed_envelope: SignedDriftEnvelope;
  glyph_sentence: string;
}

// ──────────────────────────────────────────────────────────────────────
// Detection — scan an instance for drift
// ──────────────────────────────────────────────────────────────────────

export interface DetectInput {
  instance_path: string;
  observer_pid: string;
  prior_drift_log_length?: number;  // if provided, "new" = entries added since last poll
}

export function detectDrift(input: DetectInput): DriftDetection | null {
  if (!existsSync(input.instance_path)) {
    return null;
  }

  // Load + verify manifest
  const instance = AsolariaInstance.load(input.instance_path);
  const verify = instance.verify();
  const manifest: AsolariaIdentityManifest = instance.getManifest();

  // Compute instance sha256 (for cross-ref in broadcast)
  const buf = readFileSync(input.instance_path);
  const instance_sha256 = createHash("sha256").update(buf).digest("hex");

  // Identify new drift_log entries (if caller tracks prior length)
  const priorLen = input.prior_drift_log_length ?? 0;
  const newDriftEntries = manifest.drift_log.slice(priorLen);

  const hasVerifyFailure = !verify.ok;
  const hasNewDriftEntries = newDriftEntries.length > 0;

  if (!hasVerifyFailure && !hasNewDriftEntries) return null;

  let drift_kind: DriftDetection["drift_kind"];
  if (hasVerifyFailure && hasNewDriftEntries) drift_kind = "both";
  else if (hasVerifyFailure) drift_kind = "verify_failed";
  else drift_kind = "new_drift_log_entry";

  return {
    instance_path: input.instance_path,
    permanent_name: manifest.permanent_name,
    hilbert_pid: manifest.hilbert_pid,
    instance_sha256,
    drift_kind,
    verify_result: hasVerifyFailure ? { ok: verify.ok, violations: (verify.violations ?? []).map((v: any) => typeof v === "string" ? v : JSON.stringify(v)) } : null,
    drift_log_entries: newDriftEntries,
    observed_at: new Date().toISOString(),
    observer_pid: input.observer_pid,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Broadcasting
// ──────────────────────────────────────────────────────────────────────

export interface BroadcastInput {
  detection: DriftDetection;
  signing_key_id: string;
  signing_private_key_b64: string;
  peers: string[];                 // BEHCS URLs, e.g. ["http://192.168.100.2:4947", "http://127.0.0.1:4947"]
  actor?: string;
  target?: "federation" | string;
  /** Optional transport — defaults to HTTP POST /behcs/send. Tests override. */
  transport?: (url: string, body: string) => Promise<{ ok: boolean; status: number; text: string }>;
}

async function defaultTransport(url: string, body: string) {
  const res = await fetch(url + "/behcs/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

export async function broadcastDrift(input: BroadcastInput): Promise<BroadcastResult> {
  if (!input.signing_key_id) throw new Error("broadcastDrift: signing_key_id required (drift broadcasts MUST be signed)");
  if (!input.signing_private_key_b64) throw new Error("broadcastDrift: signing_private_key_b64 required (drift broadcasts MUST be signed)");

  const payload: DriftBroadcastPayload = {
    actor: input.actor ?? "acer",
    verb: "drift-detected",
    target: input.target ?? "federation",
    detection: input.detection,
    ts: new Date().toISOString(),
  };

  const signed = signPayload(payload, input.signing_private_key_b64, input.signing_key_id);

  const succeeded: string[] = [];
  const failed: Array<{ peer: string; reason: string }> = [];
  const transport = input.transport ?? defaultTransport;

  for (const peer of input.peers) {
    try {
      const r = await transport(peer, JSON.stringify(signed));
      if (r.ok) succeeded.push(peer);
      else failed.push({ peer, reason: `http_${r.status}: ${r.text.slice(0, 200)}` });
    } catch (e) {
      failed.push({ peer, reason: (e as Error).message ?? String(e) });
    }
  }

  const stamp = `EVT-DRIFT-BROADCAST · kind=${input.detection.drift_kind} · subject=${input.detection.permanent_name} · peers=${succeeded.length}/${input.peers.length} @ M-EYEWITNESS .`;
  return {
    ok: failed.length === 0,
    destinations_attempted: input.peers,
    destinations_succeeded: succeeded,
    destinations_failed: failed,
    signed_envelope: signed as SignedDriftEnvelope,
    glyph_sentence: stamp,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Convenience: detect + broadcast in one call
// ──────────────────────────────────────────────────────────────────────

export async function detectAndBroadcast(params: DetectInput & Omit<BroadcastInput, "detection">): Promise<BroadcastResult | null> {
  const det = detectDrift({
    instance_path: params.instance_path,
    observer_pid: params.observer_pid,
    prior_drift_log_length: params.prior_drift_log_length,
  });
  if (!det) return null;
  return await broadcastDrift({
    detection: det,
    signing_key_id: params.signing_key_id,
    signing_private_key_b64: params.signing_private_key_b64,
    peers: params.peers,
    actor: params.actor,
    target: params.target,
    transport: params.transport,
  });
}
