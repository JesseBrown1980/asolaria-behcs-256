// schema-ingress.js — Q-003 behcs-bus schema-ingress shim
//
// Plain CJS mirror of Q-002 ingressCheck for consumption from behcs-bus.js.
// Observe-mode only at this layer: never rejects, just logs schema drift
// events so we can measure real-wire compliance before enforcement.
//
// Authoritative contracts stay in packages/schema-contracts/src/contracts.ts —
// this file is a runtime probe. If a verb is unmapped here, it falls
// through as accept (same shape Q-002 returns for unmapped verbs).

'use strict';

// Minimal per-verb top-level + body field requirements. Mirrors
// SHANNON_SCAN_DISPATCH, SHANNON_SCAN_RESULT, DRIFT_DETECTED from Q-001.
const CONTRACTS = {
  'shannon-scan-dispatch': {
    top: { verb: 'string', actor: 'string', target: 'string', body: 'object' },
    body_required: ['scan_id', 'spawn_request', 'l0_l2_verdicts'],
    enums: { verb: ['shannon-scan-dispatch'], target: ['acer'] },
  },
  'shannon-scan-result': {
    top: { verb: 'string', actor: 'string', target: 'string', body: 'object' },
    body_required: ['scan_id', 'acer_verdict', 'reason', 'l3', 'l4'],
    enums: { verb: ['shannon-scan-result'], actor: ['acer'], target: ['liris'] },
  },
  'drift-detected': {
    top: { verb: 'string', actor: 'string', target: 'string', detection: 'object' },
    detection_required: ['permanent_name', 'hilbert_pid'],
    enums: { verb: ['drift-detected'] },
  },
  'migration-intent-ack': {
    top: { verb: 'string', actor: 'string', target: 'string' },
    enums: { verb: ['migration-intent-ack'] },
  },
};

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function validate(msg, contract) {
  const violations = [];
  for (const [field, kind] of Object.entries(contract.top || {})) {
    if (!(field in msg)) { violations.push({ kind: 'missing', field, detail: 'required' }); continue; }
    const got = typeOf(msg[field]);
    if (got !== kind) violations.push({ kind: 'wrong_type', field, detail: `expected ${kind} got ${got}` });
  }
  for (const [field, allowed] of Object.entries(contract.enums || {})) {
    if (field in msg && !allowed.includes(msg[field])) {
      violations.push({ kind: 'bad_enum', field, detail: `got=${msg[field]} allowed=${allowed.join(',')}` });
    }
  }
  if (contract.body_required && msg.body && typeof msg.body === 'object') {
    for (const k of contract.body_required) {
      if (!(k in msg.body)) violations.push({ kind: 'missing', field: `body.${k}`, detail: 'required' });
    }
  }
  if (contract.detection_required && msg.detection && typeof msg.detection === 'object') {
    for (const k of contract.detection_required) {
      if (!(k in msg.detection)) violations.push({ kind: 'missing', field: `detection.${k}`, detail: 'required' });
    }
  }
  return violations;
}

// Pure function — returns { action, matched_contract, violations, glyph_sentence, mode }
// action is always 'accept' in observe mode — inspection only.
function ingressCheck(msg, mode) {
  const enforce = mode || 'observe';
  const verb = typeof msg?.verb === 'string' ? msg.verb : null;
  if (!verb) {
    return {
      action: 'accept',
      matched_contract: null,
      violations: [],
      glyph_sentence: 'EVT-INGRESS-SCHEMA-NO-VERB · @ M-INDICATIVE .',
      mode: enforce,
    };
  }
  const contract = CONTRACTS[verb];
  if (!contract) {
    return {
      action: 'accept',
      matched_contract: null,
      violations: [],
      glyph_sentence: `EVT-INGRESS-SCHEMA-UNMAPPED · verb=${verb} @ M-INDICATIVE .`,
      mode: enforce,
    };
  }
  const violations = validate(msg, contract);
  if (violations.length === 0) {
    return {
      action: 'accept',
      matched_contract: verb,
      violations: [],
      glyph_sentence: `EVT-INGRESS-SCHEMA-OK · verb=${verb} · contract=${verb} @ M-EYEWITNESS .`,
      mode: enforce,
    };
  }
  const summary = violations.slice(0, 5).map(v => `${v.field}:${v.kind}`).join('; ');
  const label = enforce === 'reject' ? 'REJECTED' : (enforce === 'warn' ? 'WARNED' : 'OBSERVED');
  return {
    action: enforce === 'reject' ? 'reject' : 'accept',
    matched_contract: verb,
    violations,
    glyph_sentence: `EVT-INGRESS-SCHEMA-${label} · verb=${verb} · contract=${verb} · violations=${violations.length} · ${summary} @ M-EYEWITNESS .`,
    mode: enforce,
  };
}

module.exports = { ingressCheck, CONTRACTS };
