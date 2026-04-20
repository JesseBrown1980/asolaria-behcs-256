// packages/kernel/src/ed25519-registry.ts — D-055 ed25519 signing-key registry
//
// Closes the signing half of the D-054 two-layer rule:
//   device-bound          : ed25519 private keys (never leave the device)
//   substrate-independent : signed envelopes (any peer with the public key verifies)
//
// Also addresses:
//   - H-044 critical finding (authorized_by-sig-not-yet-verified)
//   - PRE-006 follow-up (signed-cosign-append envelopes)
//   - D-054 next-hook #1
//
// Uses node:crypto ed25519 primitives — zero external deps.

import {
  generateKeyPairSync, createPrivateKey, createPublicKey,
  sign as cryptoSign, verify as cryptoVerify, randomUUID,
} from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface Ed25519KeyRegistryEntry {
  /** Canonical key id — e.g. "acer-primary-2026-04-18" */
  key_id: string;
  /** Which entity this key belongs to (DEV-*, COL-*, AGT-*, OP-*) */
  owner_glyph: string;
  /** Base64-encoded 32-byte raw public key */
  public_key_b64: string;
  /** D11 level */
  d11_level: "ASSUMED" | "OBSERVED";
  /** When minted */
  created_at: string;
  /** When (if) rotated out */
  rotated_at: string | null;
  /** Optional usage hints — e.g. ["cosign-append", "behcs-envelope", "device-attestation"] */
  usage: string[];
  /** binding_class per D-054 — keys are always device-bound */
  binding_class: "device-bound";
  /** Host device glyph (DEV-*) where private key lives. Private key MUST stay here. */
  host_device: string;
  /** Free-form */
  notes: string;
}

export interface Ed25519Registry {
  version: string;
  updated_at: string;
  keys: Ed25519KeyRegistryEntry[];
  notes: string[];
}

export interface SignedEnvelope<T> {
  payload: T;
  signature: {
    key_id: string;
    sig_b64: string;
    alg: "ed25519";
    signed_at: string;
  };
}

// ──────────────────────────────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────────────────────────────

const REGISTRY_PATH_DEFAULT = join(
  process.cwd().replace(/\\/g, "/"),
  "kernel",
  "ed25519-registry.json",
);

export function registryPath(): string {
  return REGISTRY_PATH_DEFAULT;
}

// ──────────────────────────────────────────────────────────────────────
// Registry IO
// ──────────────────────────────────────────────────────────────────────

export function loadRegistry(path: string = REGISTRY_PATH_DEFAULT): Ed25519Registry {
  if (!existsSync(path)) {
    return {
      version: "0.1.0",
      updated_at: new Date().toISOString(),
      keys: [],
      notes: ["empty registry — mint keys with mintKey()"],
    };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Ed25519Registry;
  } catch {
    return { version: "0.1.0", updated_at: new Date().toISOString(), keys: [], notes: ["parse_error"] };
  }
}

export function saveRegistry(reg: Ed25519Registry, path: string = REGISTRY_PATH_DEFAULT): void {
  mkdirSync(dirname(path), { recursive: true });
  reg.updated_at = new Date().toISOString();
  writeFileSync(path, JSON.stringify(reg, null, 2), "utf-8");
}

// ──────────────────────────────────────────────────────────────────────
// Key minting
// ──────────────────────────────────────────────────────────────────────

export interface MintedKey {
  entry: Ed25519KeyRegistryEntry;
  /** Base64-encoded raw 32-byte private key seed. MUST stay on host device. */
  private_key_b64: string;
}

export function mintKey(opts: {
  owner_glyph: string;
  host_device: string;
  key_id?: string;
  usage?: string[];
  notes?: string;
}): MintedKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  // Export raw 32-byte forms (Node wraps them in ASN.1/DER by default; we strip to the seed/point)
  const privDer = privateKey.export({ format: "der", type: "pkcs8" });
  const pubDer = publicKey.export({ format: "der", type: "spki" });

  // Extract the raw 32-byte seed from the PKCS#8 structure (ed25519 seed lives in the last 32 bytes)
  const privRaw = Buffer.from(privDer.slice(-32));
  // Extract the raw 32-byte public key from SPKI (ed25519 public key lives in the last 32 bytes)
  const pubRaw = Buffer.from(pubDer.slice(-32));

  const entry: Ed25519KeyRegistryEntry = {
    key_id: opts.key_id ?? `${opts.owner_glyph.toLowerCase()}-${randomUUID().slice(0, 8)}`,
    owner_glyph: opts.owner_glyph,
    public_key_b64: pubRaw.toString("base64"),
    d11_level: "ASSUMED",
    created_at: new Date().toISOString(),
    rotated_at: null,
    usage: opts.usage ?? ["cosign-append", "behcs-envelope"],
    binding_class: "device-bound",
    host_device: opts.host_device,
    notes: opts.notes ?? "",
  };

  return { entry, private_key_b64: privRaw.toString("base64") };
}

// ──────────────────────────────────────────────────────────────────────
// Registry mutations
// ──────────────────────────────────────────────────────────────────────

export function registerKey(reg: Ed25519Registry, entry: Ed25519KeyRegistryEntry): Ed25519Registry {
  const filtered = reg.keys.filter((k) => k.key_id !== entry.key_id);
  filtered.push(entry);
  return { ...reg, keys: filtered, updated_at: new Date().toISOString() };
}

export function getKey(reg: Ed25519Registry, key_id: string): Ed25519KeyRegistryEntry | null {
  return reg.keys.find((k) => k.key_id === key_id) ?? null;
}

export function rotateKey(reg: Ed25519Registry, key_id: string): Ed25519Registry {
  return {
    ...reg,
    keys: reg.keys.map((k) => k.key_id === key_id ? { ...k, rotated_at: new Date().toISOString() } : k),
    updated_at: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Sign / verify
// ──────────────────────────────────────────────────────────────────────

function rawPrivateKeyToKeyObject(b64: string) {
  const raw = Buffer.from(b64, "base64");
  // Wrap the 32-byte seed back in PKCS#8 DER for node:crypto
  // PKCS#8 ed25519: 30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 <32 bytes>
  const header = Buffer.from("302e020100300506032b657004220420", "hex");
  const der = Buffer.concat([header, raw]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function rawPublicKeyToKeyObject(b64: string) {
  const raw = Buffer.from(b64, "base64");
  // SPKI ed25519: 302a300506032b6570032100 <32 bytes>
  const header = Buffer.from("302a300506032b6570032100", "hex");
  const der = Buffer.concat([header, raw]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

export function signPayload<T>(payload: T, private_key_b64: string, key_id: string): SignedEnvelope<T> {
  const canonical = JSON.stringify(payload);
  const key = rawPrivateKeyToKeyObject(private_key_b64);
  const sig = cryptoSign(null, Buffer.from(canonical, "utf-8"), key);
  return {
    payload,
    signature: {
      key_id,
      sig_b64: sig.toString("base64"),
      alg: "ed25519",
      signed_at: new Date().toISOString(),
    },
  };
}

export interface VerifyResult {
  ok: boolean;
  key_id: string;
  owner_glyph: string | null;
  host_device: string | null;
  reason?: string;
}

export function verifyEnvelope<T>(
  envelope: SignedEnvelope<T>,
  reg: Ed25519Registry,
): VerifyResult {
  const entry = getKey(reg, envelope.signature.key_id);
  if (!entry) return { ok: false, key_id: envelope.signature.key_id, owner_glyph: null, host_device: null, reason: "key_not_in_registry" };
  if (entry.rotated_at) return { ok: false, key_id: envelope.signature.key_id, owner_glyph: entry.owner_glyph, host_device: entry.host_device, reason: "key_rotated_out" };
  if (envelope.signature.alg !== "ed25519") return { ok: false, key_id: envelope.signature.key_id, owner_glyph: entry.owner_glyph, host_device: entry.host_device, reason: "wrong_alg" };
  const pubKey = rawPublicKeyToKeyObject(entry.public_key_b64);
  const canonical = JSON.stringify(envelope.payload);
  const sig = Buffer.from(envelope.signature.sig_b64, "base64");
  const ok = cryptoVerify(null, Buffer.from(canonical, "utf-8"), pubKey, sig);
  return {
    ok,
    key_id: envelope.signature.key_id,
    owner_glyph: entry.owner_glyph,
    host_device: entry.host_device,
    reason: ok ? undefined : "signature_mismatch",
  };
}

// ──────────────────────────────────────────────────────────────────────
// Bootstrap helper: mint + register a first key for the local device
// ──────────────────────────────────────────────────────────────────────

export function bootstrapLocalKey(owner_glyph: string, host_device: string, regPath: string = REGISTRY_PATH_DEFAULT): MintedKey {
  const reg = loadRegistry(regPath);
  const minted = mintKey({ owner_glyph, host_device, usage: ["cosign-append", "behcs-envelope", "bootstrap"], notes: "bootstrap-local-key" });
  const next = registerKey(reg, minted.entry);
  saveRegistry(next, regPath);
  return minted;
}
