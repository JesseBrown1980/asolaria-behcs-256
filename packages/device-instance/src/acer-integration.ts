// packages/device-instance/src/acer-integration.ts — E-acer-integration
//
// Composes:
//   - D-055 ed25519-registry (device-bound signing keys)
//   - D-056 binding-classes taxonomy
//   - device-instance AsolariaInstance + manifest-schema
// into a single "boot a signed device-bound instance" surface.
//
// Given a device glyph (DEV-*), mint or load:
//   - asolaria identity manifest (if absent, spawn via AsolariaInstance)
//   - ed25519 signing key device-bound to that device
// Validates binding invariants (D-056) + manifest validity (E-067).

import { loadRegistry, registerKey, getKey, mintKey, signPayload, type Ed25519Registry, type Ed25519KeyRegistryEntry } from "../../kernel/src/ed25519-registry.ts";
import { validateKeyEntry, bindingClassOf, entityKindOf } from "../../kernel/src/binding-classes.ts";
import { AsolariaInstance, type SpawnRequest } from "./instance.ts";
import { validateManifest, type AsolariaIdentityManifest, type OperatorId } from "./manifest-schema.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface BootRequest {
  device_glyph: string;                        // e.g. DEV-ACER, DEV-LIRIS, DEV-FALCON
  manifest_path: string;                        // where the asolaria identity sits
  registry_path: string;                        // kernel/ed25519-registry.json
  operator: OperatorId;                         // "rayssa" | "jesse"
  permanent_name?: string;                      // required on first boot (spawn)
  hilbert_pid?: string;                         // required on first boot
  shape_fingerprint?: AsolariaIdentityManifest["shape_fingerprint"];
  first_observation_tuple?: AsolariaIdentityManifest["first_observation_tuple"];
  host_device_for_key?: string;                 // key's host_device (defaults to device_glyph)
  now?: string;
}

export interface BootResult {
  ok: boolean;
  device_glyph: string;
  binding_class: string | null;
  manifest_action: "spawned" | "loaded" | "failed";
  manifest_validation: { ok: boolean; violations: any[] };
  key_action: "minted" | "reused" | "failed";
  key_entry: Ed25519KeyRegistryEntry | null;
  key_invariant_check: { ok: boolean; violations: string[] };
  violations: string[];
  glyph_sentence: string;
  private_key_b64?: string;                     // only present on fresh mint
}

export function bootSignedInstance(req: BootRequest): BootResult {
  const violations: string[] = [];

  // 1. binding-class check — must be DEV (hybrid) or we reject
  const kind = entityKindOf(req.device_glyph);
  const bc = bindingClassOf(req.device_glyph);
  if (kind !== "DEV") violations.push(`device_glyph ${req.device_glyph} is not a DEV-* entity (kind=${kind})`);

  // 2. Manifest spawn/load
  let instance: AsolariaInstance | null = null;
  let manifest: AsolariaIdentityManifest | null = null;
  let manifest_action: BootResult["manifest_action"] = "failed";
  let manifest_validation = { ok: false, violations: [] as any[] };

  try {
    if (existsSync(req.manifest_path)) {
      instance = AsolariaInstance.load(req.manifest_path);
      manifest = instance.getManifest();
      manifest_action = "loaded";
    } else {
      if (!req.permanent_name || !req.hilbert_pid || !req.shape_fingerprint || !req.first_observation_tuple) {
        violations.push("spawn requires permanent_name + hilbert_pid + shape_fingerprint + first_observation_tuple");
      } else {
        const spawn: SpawnRequest = {
          permanent_name: req.permanent_name,
          hilbert_pid: req.hilbert_pid,
          shape_fingerprint: req.shape_fingerprint,
          first_observation_tuple: req.first_observation_tuple,
          operator_witness: req.operator,
          now: req.now,
        };
        instance = AsolariaInstance.spawn(req.manifest_path, spawn);
        manifest = instance.getManifest();
        manifest_action = "spawned";
      }
    }
  } catch (e) {
    violations.push(`manifest boot threw: ${(e as Error).message}`);
  }

  if (manifest) {
    manifest_validation = validateManifest(manifest);
    if (!manifest_validation.ok) {
      violations.push(`manifest invalid: ${manifest_validation.violations.map((v: any) => v.field || v.message).join(", ")}`);
    }
  }

  // 3. Key mint or reuse
  let key_action: BootResult["key_action"] = "failed";
  let key_entry: Ed25519KeyRegistryEntry | null = null;
  let private_key_b64: string | undefined;

  try {
    let reg: Ed25519Registry = loadRegistry(req.registry_path);
    const host_device = req.host_device_for_key ?? req.device_glyph;
    // Look for existing non-rotated key owned by this device
    const existing = reg.keys.find(k => k.owner_glyph === req.device_glyph && !k.rotated_at);
    if (existing) {
      key_entry = existing;
      key_action = "reused";
    } else {
      const minted = mintKey({ owner_glyph: req.device_glyph, host_device });
      reg = registerKey(reg, minted.entry);
      // Persist registry
      writeFileSync(req.registry_path, JSON.stringify(reg, null, 2), "utf-8");
      key_entry = minted.entry;
      private_key_b64 = minted.private_key_b64;
      key_action = "minted";
    }
  } catch (e) {
    violations.push(`key boot threw: ${(e as Error).message}`);
  }

  // 4. Invariant check on the key entry
  const key_invariant_check = key_entry
    ? validateKeyEntry(key_entry)
    : { ok: false, violations: ["no key entry produced"] };
  if (!key_invariant_check.ok) {
    violations.push(`key invariant failures: ${key_invariant_check.violations.join(", ")}`);
  }

  const ok = violations.length === 0;
  return {
    ok,
    device_glyph: req.device_glyph,
    binding_class: bc,
    manifest_action,
    manifest_validation,
    key_action,
    key_entry,
    key_invariant_check: { ok: key_invariant_check.ok, violations: key_invariant_check.violations },
    violations,
    glyph_sentence: `META-E-ACER-INTEGRATION · device=${req.device_glyph} · manifest=${manifest_action} · key=${key_action} · ok=${ok} · ${ok ? "@ M-EYEWITNESS" : "@ M-SUBJUNCTIVE"} .`,
    private_key_b64,
  };
}

/** Sign an arbitrary payload with the device's registered key (looked up from registry). */
export function signWithDeviceKey(
  payload: any,
  device_glyph: string,
  registry_path: string,
  private_key_b64: string,
): { ok: boolean; signed: any | null; key_id: string | null; reason?: string } {
  const reg = loadRegistry(registry_path);
  const entry = reg.keys.find(k => k.owner_glyph === device_glyph && !k.rotated_at);
  if (!entry) return { ok: false, signed: null, key_id: null, reason: `no active key for ${device_glyph}` };
  const signed = signPayload(payload, private_key_b64, entry.key_id);
  // Return sibling-shape (E-acer follows G-088 lesson: verb at top level)
  return {
    ok: true,
    signed: { ...payload, entry_sig: signed.signature },
    key_id: entry.key_id,
  };
}
