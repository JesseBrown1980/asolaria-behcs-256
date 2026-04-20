// instance.ts — E-069 AsolariaInstance API.
//
// Thin wrapper around the manifest-schema validator that enforces the
// lifecycle invariants of a device-bound _asolaria_identity.json:
//
//   spawn(req)   — mint a new manifest (operator_witness BINDING KEY required)
//   load(path)   — read + validate from disk
//   appendLocationHistory(entry) — enforce append-only; write atomically
//   appendDriftLog(entry)        — enforce append-only; write atomically
//   verify()     — re-read disk + re-validate; returns verdict
//
// Atomic write pattern: write to `<path>.tmp.<pid>.<ts>` then rename.
//
// LAW-001: no ports. LAW-008: file is the mirror. LAW-012: read-before-write.
// named_agent: liris-smp-v5-E-069-builder (2026-04-18).

import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import {
  validateManifest,
  checkAppendOnlyDiff,
  type AsolariaIdentityManifest,
  type LocationHistoryEntry,
  type DriftLogEntry,
  type ValidateResult,
} from "./manifest-schema.ts";

export interface SpawnRequest {
  permanent_name: string;
  hilbert_pid: string;
  shape_fingerprint: AsolariaIdentityManifest["shape_fingerprint"];
  first_observation_tuple: AsolariaIdentityManifest["first_observation_tuple"];
  operator_witness: "rayssa" | "jesse";
  now?: string; // override for tests
}

export class AsolariaInstance {
  readonly path: string;
  private manifest: AsolariaIdentityManifest;

  private constructor(path: string, manifest: AsolariaIdentityManifest) {
    this.path = path;
    this.manifest = manifest;
  }

  /** Current manifest snapshot (immutable — callers should treat as read-only). */
  getManifest(): AsolariaIdentityManifest {
    return this.manifest;
  }

  /** Mint a new manifest and persist to `path`. Fails if path already exists. */
  static spawn(path: string, req: SpawnRequest): AsolariaInstance {
    if (existsSync(path)) {
      throw new Error(`spawn: manifest already exists at ${path}; use load()`);
    }
    const now = req.now ?? new Date().toISOString();
    const manifest: AsolariaIdentityManifest = {
      permanent_name: req.permanent_name,
      hilbert_pid: req.hilbert_pid,
      shape_fingerprint: req.shape_fingerprint,
      first_observation_tuple: req.first_observation_tuple,
      provenance: "original",
      last_verified_at: now,
      last_verified_by: req.operator_witness,
      constitutional_clauses: [
        "no_mutation_without_operator_acknowledged_rebind",
        "verify_on_every_touch",
        "halt_on_fingerprint_drift",
      ],
      location_history: [],
      drift_log: [],
      schema_version: "1.0.0",
    };
    const v = validateManifest(manifest);
    if (!v.ok) {
      throw new Error(`spawn: minted manifest failed validation: ${JSON.stringify(v.violations)}`);
    }
    writeAtomic(path, manifest);
    return new AsolariaInstance(path, manifest);
  }

  /** Load from disk; validates. Throws on missing file or validation failure. */
  static load(path: string): AsolariaInstance {
    if (!existsSync(path)) throw new Error(`load: manifest missing at ${path}`);
    const raw = readFileSync(path, "utf-8");
    const m = JSON.parse(raw) as AsolariaIdentityManifest;
    const v = validateManifest(m);
    if (!v.ok) throw new Error(`load: manifest invalid: ${JSON.stringify(v.violations)}`);
    return new AsolariaInstance(path, m);
  }

  /** Re-read disk and re-validate. Returns ValidateResult. */
  verify(): ValidateResult {
    const raw = readFileSync(this.path, "utf-8");
    const onDisk = JSON.parse(raw) as AsolariaIdentityManifest;
    const r = validateManifest(onDisk);
    if (r.ok) this.manifest = onDisk;
    return r;
  }

  /** Append a location-history entry. Enforces append-only diff. Atomic write. */
  appendLocationHistory(entry: LocationHistoryEntry, verifier: string, now?: string): void {
    const prior = this.manifest;
    const next: AsolariaIdentityManifest = {
      ...prior,
      location_history: [...prior.location_history, entry],
      last_verified_at: now ?? new Date().toISOString(),
      last_verified_by: verifier,
    };
    this.commitNext(prior, next);
  }

  /** Append a drift-log entry. Enforces append-only diff. Atomic write. */
  appendDriftLog(entry: DriftLogEntry, verifier: string, now?: string): void {
    const prior = this.manifest;
    const next: AsolariaIdentityManifest = {
      ...prior,
      drift_log: [...prior.drift_log, entry],
      last_verified_at: now ?? new Date().toISOString(),
      last_verified_by: verifier,
    };
    this.commitNext(prior, next);
  }

  private commitNext(prior: AsolariaIdentityManifest, next: AsolariaIdentityManifest): void {
    const diff = checkAppendOnlyDiff(prior, next);
    if (diff.length > 0) {
      throw new Error(`append-only violation: ${JSON.stringify(diff)}`);
    }
    const v = validateManifest(next);
    if (!v.ok) {
      throw new Error(`proposed manifest failed validation: ${JSON.stringify(v.violations)}`);
    }
    writeAtomic(this.path, next);
    this.manifest = next;
  }
}

function writeAtomic(path: string, manifest: AsolariaIdentityManifest): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2), { encoding: "utf-8" });
  try {
    renameSync(tmp, path);
  } catch {
    writeFileSync(path, JSON.stringify(manifest, null, 2), { encoding: "utf-8" });
  }
}

/** Bind an AsolariaInstance manifest to an ed25519 key via its hilbert_pid.
 * Returns the expected binding record shape that the ed25519-registry entry
 * should carry (`owner_glyph` and `host_device` consistency check). The
 * caller is responsible for actually writing the registry — this module
 * stays orthogonal to the kernel package. */
export interface KeyBindingDescriptor {
  hilbert_pid: string;
  permanent_name: string;
  expected_owner_glyph: string;  // e.g. "DEV-LIRIS"
  expected_host_device: string;  // same
}

export function deriveKeyBinding(manifest: AsolariaIdentityManifest, deviceGlyph: string): KeyBindingDescriptor {
  return {
    hilbert_pid: manifest.hilbert_pid,
    permanent_name: manifest.permanent_name,
    expected_owner_glyph: deviceGlyph,
    expected_host_device: deviceGlyph,
  };
}
