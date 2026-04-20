// Q-003 test — validates the plain-JS schema-ingress shim used by behcs-bus.js
// against the same envelope shapes the TS contracts validate.
//
// Run with: node packages/schema-contracts/tests/ingress-shim.test.js
'use strict';

const { ingressCheck, CONTRACTS } = require('C:/Users/acer/Asolaria/tools/behcs/schema-ingress.js');

let pass = 0, fail = 0;
function assert(cond, label, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else      { fail++; console.log('  FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
}

console.log('=== Q-003 schema-ingress shim tests ===\n');

// T1: no verb → accept, unmapped glyph
console.log('T1: no verb');
const r1 = ingressCheck({}, 'observe');
assert(r1.action === 'accept', 'accepts missing verb');
assert(r1.matched_contract === null, 'no contract matched');
assert(r1.glyph_sentence.includes('NO-VERB'), 'no-verb glyph');

// T2: unknown verb → accept, unmapped
console.log('\nT2: unknown verb');
const r2 = ingressCheck({ verb: 'random-gibberish' }, 'observe');
assert(r2.action === 'accept', 'accepts unknown verb');
assert(r2.matched_contract === null, 'no contract');
assert(r2.glyph_sentence.includes('UNMAPPED'), 'unmapped glyph');

// T3: valid shannon-scan-dispatch → OK
console.log('\nT3: valid dispatch');
const dispatchGood = {
  verb: 'shannon-scan-dispatch',
  actor: 'liris',
  target: 'acer',
  body: {
    scan_id: 'scan-1',
    spawn_request: { target: 'host', purpose: 'test' },
    l0_l2_verdicts: [{ level: 0 }, { level: 1 }, { level: 2 }],
  },
};
const r3 = ingressCheck(dispatchGood, 'observe');
assert(r3.action === 'accept', 'valid dispatch accepted');
assert(r3.matched_contract === 'shannon-scan-dispatch', 'contract matched');
assert(r3.violations.length === 0, 'no violations');
assert(r3.glyph_sentence.includes('SCHEMA-OK'), 'OK glyph');

// T4: dispatch missing body.scan_id → OBSERVED (observe mode still accepts)
console.log('\nT4: dispatch missing scan_id, observe mode');
const dispatchBad = JSON.parse(JSON.stringify(dispatchGood));
delete dispatchBad.body.scan_id;
const r4 = ingressCheck(dispatchBad, 'observe');
assert(r4.action === 'accept', 'observe still accepts');
assert(r4.violations.length === 1, '1 violation');
assert(r4.violations[0].field === 'body.scan_id', 'caught scan_id missing');
assert(r4.glyph_sentence.includes('OBSERVED'), 'observed glyph');

// T5: dispatch with wrong target enum
console.log('\nT5: bad enum target=elsewhere');
const dispatchWrongTarget = { ...dispatchGood, target: 'elsewhere' };
const r5 = ingressCheck(dispatchWrongTarget, 'observe');
assert(r5.violations.some(v => v.kind === 'bad_enum' && v.field === 'target'), 'bad_enum target caught');

// T6: valid shannon-scan-result
console.log('\nT6: valid result');
const resultGood = {
  verb: 'shannon-scan-result',
  actor: 'acer',
  target: 'liris',
  body: {
    scan_id: 'scan-1',
    acer_verdict: 'promote',
    reason: 'clean',
    l3: { level: 3 }, l4: { level: 4 },
  },
};
const r6 = ingressCheck(resultGood, 'observe');
assert(r6.action === 'accept', 'valid result accepted');
assert(r6.violations.length === 0, 'no violations');

// T7: result with wrong acer_verdict (not in enum mirror — note, shim doesn't enforce this enum,
//     just checks required body keys; enum enforcement lives in TS contracts for now)
console.log('\nT7: result with missing l4');
const resultMissingL4 = JSON.parse(JSON.stringify(resultGood));
delete resultMissingL4.body.l4;
const r7 = ingressCheck(resultMissingL4, 'observe');
assert(r7.violations.some(v => v.field === 'body.l4' && v.kind === 'missing'), 'l4 missing caught');

// T8: valid drift-detected
console.log('\nT8: valid drift');
const driftGood = {
  verb: 'drift-detected',
  actor: 'acer',
  target: 'liris',
  detection: { permanent_name: 'subject-x', hilbert_pid: 'pid-y' },
};
const r8 = ingressCheck(driftGood, 'observe');
assert(r8.action === 'accept', 'valid drift accepted');
assert(r8.violations.length === 0, 'no violations');

// T9: drift missing hilbert_pid
console.log('\nT9: drift missing hilbert_pid');
const driftBad = JSON.parse(JSON.stringify(driftGood));
delete driftBad.detection.hilbert_pid;
const r9 = ingressCheck(driftBad, 'observe');
assert(r9.violations.some(v => v.field === 'detection.hilbert_pid' && v.kind === 'missing'), 'hilbert_pid missing caught');

// T10: reject mode actually rejects
console.log('\nT10: reject mode');
const r10 = ingressCheck(dispatchBad, 'reject');
assert(r10.action === 'reject', 'reject mode rejects');
assert(r10.glyph_sentence.includes('REJECTED'), 'rejected glyph');

// T11: warn mode accepts but flags
console.log('\nT11: warn mode');
const r11 = ingressCheck(dispatchBad, 'warn');
assert(r11.action === 'accept', 'warn mode still accepts');
assert(r11.glyph_sentence.includes('WARNED'), 'warned glyph');

// T12: contracts registry has all 4 verbs
console.log('\nT12: contracts coverage');
assert('shannon-scan-dispatch' in CONTRACTS, 'has dispatch contract');
assert('shannon-scan-result' in CONTRACTS, 'has result contract');
assert('drift-detected' in CONTRACTS, 'has drift contract');
assert('migration-intent-ack' in CONTRACTS, 'has migration-intent-ack contract');

console.log('\n=== RESULTS ===');
console.log('pass:', pass, 'fail:', fail);
console.log(`META-ACER-Q-003-SHIM-TESTS · pass=${pass} · fail=${fail} · verdict=${fail === 0 ? 'ALL-GREEN' : 'DIVERGENCE'} @ M-EYEWITNESS .`);
process.exit(fail === 0 ? 0 : 1);
