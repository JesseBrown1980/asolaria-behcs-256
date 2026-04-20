// packages/migration/tests/operator-ui.test.ts — D-061 tests

import {
  OPERATORS_2W, OP_2W_WINDOW_EXPIRES,
  presentMigrationPlan, signOperatorAck, verifyOperatorAck, countOperatorQuorum,
  type MigrationPlanSummary, type OperatorAckPayload,
} from "../src/operator-ui.ts";
import { mintKey, registerKey, loadRegistry, saveRegistry, type Ed25519Registry } from "../../kernel/src/ed25519-registry.ts";
import { rmSync, existsSync } from "node:fs";

const TEST_REG = "C:/tmp/d061-test-registry.json";
if (existsSync(TEST_REG)) rmSync(TEST_REG);

let pass = 0, fail = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { pass++; console.log("  PASS  " + label); }
  else      { fail++; console.log("  FAIL  " + label + (detail ? "  [" + detail + "]" : "")); }
}

async function main() {
console.log("=== D-061 operator-ui tests ===\n");

// Mint 5 operator keys (one per 2W authorized operator)
let reg = loadRegistry(TEST_REG);
const opKeys: Record<string, { key_id: string; priv: string }> = {};
for (const op of OPERATORS_2W) {
  const m = mintKey({ owner_glyph: "OP-" + op.toUpperCase(), host_device: "DEV-ACER" });
  reg = registerKey(reg, m.entry);
  opKeys[op] = { key_id: m.entry.key_id, priv: m.private_key_b64 };
}
saveRegistry(reg, TEST_REG);

const plan: MigrationPlanSummary = {
  session_id: "test-session-001",
  subject: "AGT-ROSE",
  source: "DEV-AMY-MAC",
  target: "DEV-AMY-LINUX",
  colony: "COL-AMY",
  rationale: "testing",
  planned_at: "2026-04-19T00:00:00Z",
  risks: ["fingerprint-drift"],
  rollback_available: true,
};

// T1: presentMigrationPlan contains required sections
console.log("T1: presentMigrationPlan output");
const presented = presentMigrationPlan(plan);
assert(presented.includes("session_id : test-session-001"), "has session_id");
assert(presented.includes("subject    : AGT-ROSE"), "has subject");
assert(presented.includes("ACK REQUIRED"), "has ack-required banner");
assert(presented.includes("operators  : jesse, rayssa, amy, felipe, dan"), "lists all 5 operators");

// T2: signOperatorAck happy path
console.log("\nT2: signOperatorAck amy signs");
const ackAmy = signOperatorAck({ operator: "amy", plan, signing_key_id: opKeys.amy.key_id, signing_private_key_b64: opKeys.amy.priv });
assert(ackAmy.signature.alg === "ed25519", "sig alg=ed25519");
assert(ackAmy.payload.verb === "migration-intent-ack", "verb=migration-intent-ack");
assert(ackAmy.payload.operator === "amy", "operator=amy");

// T3: signOperatorAck rejects non-2W operator
console.log("\nT3: signOperatorAck rejects unauthorized");
try {
  signOperatorAck({ operator: "stranger" as any, plan, signing_key_id: opKeys.amy.key_id, signing_private_key_b64: opKeys.amy.priv });
  assert(false, "should have thrown");
} catch (e) {
  assert((e as Error).message.includes("not in 2W authorized"), "throws with 2W message");
}

// T4: signOperatorAck rejects post-expiry
console.log("\nT4: signOperatorAck rejects post-window-expiry");
try {
  signOperatorAck({ operator: "jesse", plan, signing_key_id: opKeys.jesse.key_id, signing_private_key_b64: opKeys.jesse.priv, now: "2026-05-03T00:00:00Z" });
  assert(false, "should have thrown");
} catch (e) {
  assert((e as Error).message.includes("expired"), "throws with expiry message");
}

// T5: verifyOperatorAck happy path
console.log("\nT5: verifyOperatorAck valid");
const v1 = verifyOperatorAck(ackAmy, plan.session_id, reg);
assert(v1.ok === true, "verification succeeds", v1.reason);
assert(v1.operator === "amy", "operator returned");
assert(v1.plan_session_matches === true, "session matches");
assert(v1.window_valid === true, "window valid");

// T6: verifyOperatorAck rejects tampered envelope
console.log("\nT6: tampered envelope rejected");
const tamp = JSON.parse(JSON.stringify(ackAmy));
tamp.payload.plan.target = "DEV-TAMPERED";
const v2 = verifyOperatorAck(tamp, plan.session_id, reg);
assert(v2.ok === false, "tampered rejected");
assert(v2.reason?.includes("signature"), "reason cites signature");

// T7: verifyOperatorAck rejects session mismatch
console.log("\nT7: session_id mismatch rejected");
const v3 = verifyOperatorAck(ackAmy, "different-session-id", reg);
assert(v3.ok === false, "wrong session rejected");
assert(v3.plan_session_matches === false, "plan_session_matches=false");

// T8: verifyOperatorAck rejects after window expiry
console.log("\nT8: verify post-expiry rejected");
const v4 = verifyOperatorAck(ackAmy, plan.session_id, reg, "2026-05-03T00:00:00Z");
assert(v4.ok === false, "post-expiry rejected");
assert(v4.window_valid === false, "window_valid=false");

// T9: verifyOperatorAck rejects unknown signer key
console.log("\nT9: unknown key rejected");
const unknownKid = JSON.parse(JSON.stringify(ackAmy));
unknownKid.signature.key_id = "never-existed-key";
const v5 = verifyOperatorAck(unknownKid, plan.session_id, reg);
assert(v5.ok === false, "unknown key rejected");

// T10: countOperatorQuorum — 3 distinct valid operators
console.log("\nT10: quorum counts distinct operators");
const ackJesse = signOperatorAck({ operator: "jesse", plan, signing_key_id: opKeys.jesse.key_id, signing_private_key_b64: opKeys.jesse.priv });
const ackFelipe = signOperatorAck({ operator: "felipe", plan, signing_key_id: opKeys.felipe.key_id, signing_private_key_b64: opKeys.felipe.priv });
const q = countOperatorQuorum([ackAmy, ackJesse, ackFelipe], plan.session_id, reg);
assert(q.distinct_valid_operators.length === 3, `3 distinct operators (got ${q.distinct_valid_operators.length})`);
assert(q.invalid_count === 0, "no invalid acks");
assert(q.first_valid_at !== null, "first_valid_at set");

// T11: duplicate ack from same operator counts once
console.log("\nT11: duplicate operator ack deduped");
const ackAmy2 = signOperatorAck({ operator: "amy", plan, signing_key_id: opKeys.amy.key_id, signing_private_key_b64: opKeys.amy.priv });
const q2 = countOperatorQuorum([ackAmy, ackAmy2], plan.session_id, reg);
assert(q2.distinct_valid_operators.length === 1, "1 distinct despite 2 acks");
assert(q2.total_acks === 2, "total_acks=2");

// T12: mixed valid + invalid in quorum
console.log("\nT12: mixed valid + invalid reported separately");
const tamper = JSON.parse(JSON.stringify(ackJesse));
tamper.payload.plan.rationale = "MODIFIED";
const q3 = countOperatorQuorum([ackAmy, tamper, ackFelipe], plan.session_id, reg);
assert(q3.distinct_valid_operators.length === 2, "2 distinct valid (amy + felipe)");
assert(q3.invalid_count === 1, "1 invalid (tampered jesse)");

// T13: OP_2W_WINDOW_EXPIRES is the correct literal
console.log("\nT13: 2W expiry constant");
assert(OP_2W_WINDOW_EXPIRES === "2026-05-02T23:59:59Z", "window expiry matches authorization memory");

console.log("\n=== RESULTS ===");
console.log("pass:", pass);
console.log("fail:", fail);
console.log(`META-ACER-D-061-OPERATOR-UI-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? "ALL-GREEN" : "DIVERGENCE"} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("main threw:", e); process.exit(2); });
