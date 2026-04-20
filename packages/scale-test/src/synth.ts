// packages/scale-test/src/synth.ts — J-100k envelope synthesizer + harness
//
// Generates large batches of synthetic envelopes, runs them through
// schema-contracts validation + signature verify, measures throughput.

import { createHash, randomUUID, createPublicKey, createPrivateKey, sign as cryptoSign, verify as cryptoVerify, generateKeyPairSync } from "node:crypto";
import { validateEnvelope, SHANNON_SCAN_DISPATCH, SHANNON_SCAN_RESULT, DRIFT_DETECTED, type EnvelopeContract } from "../../schema-contracts/src/contracts.ts";

export type EnvelopeKind = "shannon-scan-dispatch" | "shannon-scan-result" | "drift-detected";

// Key pool for signing synthetic envelopes
export interface KeyPair {
  key_id: string;
  priv_seed: Buffer;
  pub_raw: Buffer;
}

export function makeKeyPool(n: number): KeyPair[] {
  const out: KeyPair[] = [];
  for (let i = 0; i < n; i++) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privSeed = Buffer.from(privateKey.export({ format: "der", type: "pkcs8" }).slice(-32));
    const pubRaw = Buffer.from(publicKey.export({ format: "der", type: "spki" }).slice(-32));
    out.push({ key_id: `dev-test-${i}-${pubRaw.toString("hex").slice(0, 8)}`, priv_seed: privSeed, pub_raw: pubRaw });
  }
  return out;
}

function seedToPkcs8Der(seed: Buffer) {
  const header = Buffer.from("302e020100300506032b657004220420", "hex");
  return Buffer.concat([header, seed]);
}
function rawPubToSpkiKey(raw: Buffer) {
  const header = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([header, raw]), format: "der", type: "spki" });
}

export function synthEnvelope(kind: EnvelopeKind, i: number): any {
  const scan_id = `scan-j100k-${i}`;
  const now = new Date().toISOString();
  if (kind === "shannon-scan-dispatch") {
    return {
      verb: "shannon-scan-dispatch",
      actor: "liris-shannon-civ",
      target: "acer",
      body: {
        scan_id,
        spawn_request: {
          profile_name: "shannon-recon",
          scan_id,
          scope: { allowed_hosts: ["test.example"], allowed_paths: ["/p"] },
          operator_witness: { gate: "jesse", profile: "owner" },
          requested_by: "j100k",
          ts: now,
        },
        l0_l2_verdicts: [
          { layer: "L0", decision: "pass" },
          { layer: "L1", decision: "pass" },
          { layer: "L2", decision: "pass" },
        ],
      },
      glyph_sentence: `EVT-SCAN-${i} @ M-INDICATIVE .`,
    };
  }
  if (kind === "shannon-scan-result") {
    return {
      verb: "shannon-scan-result",
      actor: "acer",
      target: "liris",
      body: { scan_id, acer_verdict: "promote", reason: `test-${i}`, l3: {}, l4: {} },
      glyph_sentence: `EVT-RESULT-${i} @ M-EYEWITNESS .`,
    };
  }
  // drift-detected
  return {
    actor: "acer",
    verb: "drift-detected",
    target: "federation",
    detection: {
      instance_path: `/test/${i}`,
      permanent_name: `subject-${i}`,
      hilbert_pid: `PID-J100k-${i}`,
      instance_sha256: createHash("sha256").update(String(i)).digest("hex"),
      drift_kind: "verify_failed",
      drift_log_entries: [],
      observed_at: now,
      observer_pid: "test",
    },
    ts: now,
  };
}

export function signEnvelope(env: any, key: KeyPair): any {
  const material = Buffer.from(JSON.stringify(env), "utf-8");
  const priv = createPrivateKey({ key: seedToPkcs8Der(key.priv_seed), format: "der", type: "pkcs8" });
  const sig = cryptoSign(null, material, priv);
  return { ...env, entry_sig: { key_id: key.key_id, sig_b64: sig.toString("base64"), alg: "ed25519", signed_at: new Date().toISOString() } };
}

export function verifyEnvelope(env: any, keyPool: KeyPair[]): boolean {
  if (!env.entry_sig) return false;
  const key = keyPool.find(k => k.key_id === env.entry_sig.key_id);
  if (!key) return false;
  const { entry_sig, ...rest } = env;
  const material = Buffer.from(JSON.stringify(rest), "utf-8");
  const pub = rawPubToSpkiKey(key.pub_raw);
  try {
    return cryptoVerify(null, material, pub, Buffer.from(entry_sig.sig_b64, "base64"));
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Batch runner
// ──────────────────────────────────────────────────────────────────────

export interface BatchRunInput {
  n: number;
  kinds: EnvelopeKind[];   // rotate through
  key_pool_size: number;
  sign: boolean;
  validate_schema: boolean;
  verify_sigs: boolean;
}

export interface BatchRunResult {
  n: number;
  sign_ms: number;
  schema_ms: number;
  verify_ms: number;
  schema_invalid: number;
  sig_failed: number;
  throughput_synth_per_s: number;
  throughput_verify_per_s: number;
  glyph_sentence: string;
}

export function runBatch(input: BatchRunInput): BatchRunResult {
  const keys = makeKeyPool(input.key_pool_size);
  const kinds = input.kinds.length ? input.kinds : ["shannon-scan-dispatch"] as EnvelopeKind[];
  const envelopes: any[] = [];

  const t0 = Date.now();
  for (let i = 0; i < input.n; i++) {
    const kind = kinds[i % kinds.length];
    let env = synthEnvelope(kind, i);
    if (input.sign) env = signEnvelope(env, keys[i % keys.length]);
    envelopes.push(env);
  }
  const sign_ms = Date.now() - t0;

  let schema_invalid = 0;
  const tSchema0 = Date.now();
  if (input.validate_schema) {
    for (const env of envelopes) {
      const verb = env.verb;
      let contract: EnvelopeContract | null = null;
      if (verb === "shannon-scan-dispatch") contract = SHANNON_SCAN_DISPATCH;
      else if (verb === "shannon-scan-result") contract = SHANNON_SCAN_RESULT;
      else if (verb === "drift-detected") contract = DRIFT_DETECTED;
      if (contract) {
        const r = validateEnvelope(env, contract);
        if (!r.ok) schema_invalid++;
      }
    }
  }
  const schema_ms = Date.now() - tSchema0;

  let sig_failed = 0;
  const tVerify0 = Date.now();
  if (input.verify_sigs) {
    for (const env of envelopes) {
      if (!verifyEnvelope(env, keys)) sig_failed++;
    }
  }
  const verify_ms = Date.now() - tVerify0;

  const synthSec = sign_ms / 1000;
  const verifySec = verify_ms / 1000;

  return {
    n: input.n,
    sign_ms, schema_ms, verify_ms,
    schema_invalid, sig_failed,
    throughput_synth_per_s: synthSec > 0 ? Math.round(input.n / synthSec) : 0,
    throughput_verify_per_s: verifySec > 0 ? Math.round(input.n / verifySec) : 0,
    glyph_sentence: `EVT-J100K-BATCH · n=${input.n} · synth=${sign_ms}ms · schema=${schema_ms}ms · verify=${verify_ms}ms · schema-invalid=${schema_invalid} · sig-failed=${sig_failed} @ M-EYEWITNESS .`,
  };
}
