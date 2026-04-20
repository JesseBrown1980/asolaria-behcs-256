#!/usr/bin/env node
/**
 * brown-hilbert-cube-mount-v0 unit
 *
 * Federation-native canonical-store mount primitive. Per the bilateral blind
 * design + convergence between acer and liris (2026-04-07), this unit exposes
 * the sovereignty USB canonical store as a cube-native API rather than a
 * per-host filesystem path.
 *
 * Phase 1 implementation: skeleton + verb stubs + tests against a TEST
 * canonical store on D:/test-canonical-store/ (acer-local, not the real USB).
 * Phase 6+ runs against the real sovereignty USB after physical rotation +
 * dual operator cosign.
 *
 * Cube alignment:
 *   primary D5_LAYER (1331 = 11^3) + D22_TRANSLATION (493039 = 79^3) co-primary
 *   secondary D11_PROOF (29791) + D16_OWNERSHIP (205379) + D6_GATE (2197)
 *   proposed unit cube 109^3 = 1295029 (pending promotion ritual)
 *
 * Verbs (8 unified per convergence report):
 *   attest        - return holder attestation (PID quadruple, cosign age, audit tail sha)
 *   list          - list files in a directory under the canonical store
 *   read          - read a file's bytes (with optional sha verification)
 *   hash          - return sha256 of files without transferring bytes
 *   write         - write a file (holder side only; non-holder forwards via document-share-v0)
 *   rotate        - declare a holder rotation event (dual operator cosign required)
 *   audit_chain   - return a range of audit chain entries
 *   cosign_pending - (opt-in) promote a staged write to canonical
 *
 * Constitutional gates inherited:
 *   HD-1a external corporate NovaLUM
 *   HD-1b exploit content patterns
 *   HD-2 ext brian/natalie
 *   HD-3 sovereignty USB acer-side write deny
 *   HD-virus self-replicating malware
 *   HD-felipe felipe device touches
 *   HD-rayssa rayssa device touches (acer side)
 *   HD-novalum-storage novalum data outside cubed vault
 *
 * Authority:
 *   bilateral blind design protocol with liris 2026-04-07
 *   joint Rayssa+Jesse cosign for NovaLUM v2 scope
 *   sweep approval "I JESSE authorize everything" 2026-04-07T19:35Z
 *
 * Phase 1 status: skeleton + verb stubs + happy-path tests against TEST canonical store
 * Phases 2-7: queued, require operator cosign per phase
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default to TEST canonical store on local D: for Phase 1+ tests
// Phase 6+ overrides to the real USB path after physical rotation + cosign
const TEST_CANONICAL_ROOT = process.env.BHC_CANONICAL_ROOT || 'D:/test-canonical-store';
const AUDIT_CHAIN_PATH = path.join(TEST_CANONICAL_ROOT, '_bhc_audit_chain.ndjson');
const HOLDER_ATTEST_PATH = path.join(TEST_CANONICAL_ROOT, '_bhc_holder_attest.json');

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

// === Canonical PID quadruple (sovereignty USB; corrected hex 0xA7C09001) ===
const CANONICAL_PID_QUADRUPLE = {
  volume_serial: '741E5B79',
  mbr_signature_hex: '0xA7C09001',
  mbr_signature_decimal: 2814414849,
  volume_guid: 'f6b7863d-2a2a-11f1-9389-94085363401a',
  physical_disk_unique_id: 'e981b5d9-d866-46a5-56c1-64ad46242587'
};

// === Constitutional gates ===
const NOVALUM_EXTERNAL_PATTERNS = [
  /external.*novalum/i,
  /corporate.*novalum/i,
  /third.*party.*novalum/i,
  /novalum.*exploit/i,
];

const HD2_EXT_PATTERNS = [
  /brian/i,
  /natalie/i,
];

const FELIPE_RAYSSA_PATTERNS = [
  /felipe-phone/i,
  /felipe-dump/i,
  /rayssa.*device/i,
];

function err(msg, extra) {
  return Object.assign({ ok: false, error: msg }, extra || {});
}

function pathSafe(p) {
  if (!p || typeof p !== 'string') return false;
  if (p.includes('..')) return false;
  if (path.isAbsolute(p)) return false;
  // No drive letters
  if (/^[a-zA-Z]:/.test(p)) return false;
  return true;
}

function gateNovalum(p) {
  for (const pat of NOVALUM_EXTERNAL_PATTERNS) {
    if (pat.test(p)) return { allowed: false, gate: 'HD-1a', reason: 'external_or_third_party_novalum' };
  }
  if (/device-registry/i.test(p)) return { allowed: false, gate: 'HD-1a', reason: 'device_registry_path_always_shielded' };
  return { allowed: true };
}

function gateHD2(p) {
  for (const pat of HD2_EXT_PATTERNS) {
    if (pat.test(p)) return { allowed: false, gate: 'HD-2_ext', reason: 'brian_or_natalie_pattern' };
  }
  return { allowed: true };
}

function gateFelipeRayssa(p) {
  for (const pat of FELIPE_RAYSSA_PATTERNS) {
    if (pat.test(p)) return { allowed: false, gate: 'HD-felipe-rayssa', reason: 'felipe_or_rayssa_device_pattern' };
  }
  return { allowed: true };
}

function gateAll(p) {
  if (!pathSafe(p)) return { allowed: false, gate: 'path_safety', reason: 'unsafe_path_includes_dotdot_or_absolute_or_drive_letter' };
  const novalum = gateNovalum(p);
  if (!novalum.allowed) return novalum;
  const hd2 = gateHD2(p);
  if (!hd2.allowed) return hd2;
  const felipeRayssa = gateFelipeRayssa(p);
  if (!felipeRayssa.allowed) return felipeRayssa;
  return { allowed: true };
}

function appendAudit(entry) {
  const dir = path.dirname(AUDIT_CHAIN_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(AUDIT_CHAIN_PATH, line);
  return entry;
}

function readAuditTailSha() {
  if (!fs.existsSync(AUDIT_CHAIN_PATH)) return null;
  const lines = fs.readFileSync(AUDIT_CHAIN_PATH, 'utf8').split('\n').filter(l => l.length > 0);
  if (lines.length === 0) return null;
  return crypto.createHash('sha256').update(lines[lines.length - 1]).digest('hex');
}

// === Verbs ===

function verbAttest(_inputs) {
  return {
    ok: true,
    holder_attest: {
      holder_host: require('os').hostname(),
      canonical_root: TEST_CANONICAL_ROOT,
      canonical_pid_quadruple: CANONICAL_PID_QUADRUPLE,
      audit_chain_tail_sha: readAuditTailSha(),
      ts: new Date().toISOString(),
      phase: 'phase_1_skeleton_TEST_canonical_store_not_real_USB'
    }
  };
}

function verbList(inputs) {
  const dirPath = inputs.path || '.';
  const gate = gateAll(dirPath);
  if (!gate.allowed) return err('gate_denied', { gate });
  const fullPath = path.join(TEST_CANONICAL_ROOT, dirPath);
  if (!fs.existsSync(fullPath)) return err('path_not_found', { path: dirPath });
  if (!fs.statSync(fullPath).isDirectory()) return err('not_a_directory', { path: dirPath });
  const entries = fs.readdirSync(fullPath, { withFileTypes: true }).map(e => {
    const stats = fs.statSync(path.join(fullPath, e.name));
    return {
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      size_bytes: stats.size,
      mtime: stats.mtime.toISOString()
    };
  });
  return { ok: true, path: dirPath, entries, total: entries.length };
}

function verbRead(inputs) {
  const filePath = inputs.path;
  if (!filePath) return err('missing_path');
  const gate = gateAll(filePath);
  if (!gate.allowed) return err('gate_denied', { gate });
  const fullPath = path.join(TEST_CANONICAL_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return err('path_not_found', { path: filePath });
  const buf = fs.readFileSync(fullPath);
  if (buf.length > MAX_PAYLOAD_BYTES) return err('payload_too_large', { size: buf.length, max: MAX_PAYLOAD_BYTES });
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (inputs.expected_sha256 && inputs.expected_sha256.toLowerCase() !== sha) {
    return err('sha_mismatch', { expected: inputs.expected_sha256, computed: sha });
  }
  appendAudit({
    audit_id: 'BHC-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    ts: new Date().toISOString(),
    verb: 'read',
    path: filePath,
    bytes: buf.length,
    sha256: sha
  });
  return {
    ok: true,
    path: filePath,
    bytes: buf.length,
    sha256: sha,
    content_base64: buf.toString('base64')
  };
}

function verbHash(inputs) {
  const paths = Array.isArray(inputs.paths) ? inputs.paths : (inputs.path ? [inputs.path] : null);
  if (!paths) return err('missing_paths');
  const result = {};
  for (const p of paths) {
    const gate = gateAll(p);
    if (!gate.allowed) {
      result[p] = { error: 'gate_denied', gate };
      continue;
    }
    const fullPath = path.join(TEST_CANONICAL_ROOT, p);
    if (!fs.existsSync(fullPath)) {
      result[p] = { error: 'not_found' };
      continue;
    }
    const buf = fs.readFileSync(fullPath);
    result[p] = { sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
  }
  return { ok: true, hashes: result };
}

function verbWrite(inputs) {
  // Phase 1: only allows writes to TEST canonical store. Phase 6+ adds real USB write under operator cosign.
  const filePath = inputs.path;
  if (!filePath) return err('missing_path');
  const gate = gateAll(filePath);
  if (!gate.allowed) return err('gate_denied', { gate });
  if (!inputs.content_base64) return err('missing_content_base64');
  if (!inputs.sha256) return err('missing_sha256');

  const buf = Buffer.from(inputs.content_base64, 'base64');
  if (buf.length > MAX_PAYLOAD_BYTES) return err('payload_too_large', { size: buf.length });

  const computed = crypto.createHash('sha256').update(buf).digest('hex');
  if (computed !== String(inputs.sha256).toLowerCase()) {
    return err('sha_mismatch', { expected: inputs.sha256, computed });
  }

  const fullPath = path.join(TEST_CANONICAL_ROOT, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  let preStateSha = null;
  if (fs.existsSync(fullPath)) {
    if (!inputs.overwrite) return err('file_exists', { path: filePath });
    const preBuf = fs.readFileSync(fullPath);
    preStateSha = crypto.createHash('sha256').update(preBuf).digest('hex');
  }

  fs.writeFileSync(fullPath, buf);
  const auditId = 'BHC-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  appendAudit({
    audit_id: auditId,
    ts: new Date().toISOString(),
    verb: 'write',
    path: filePath,
    bytes: buf.length,
    sha256: computed,
    pre_state_sha256: preStateSha
  });

  return {
    ok: true,
    path: filePath,
    bytes_written: buf.length,
    sha256: computed,
    pre_state_sha256: preStateSha,
    audit_id: auditId
  };
}

function verbRotate(_inputs) {
  // Phase 5+ — actual rotation requires dual operator cosign + USB unplug/plug
  // Phase 1 stub: refuse with explanatory error
  return err('rotate_phase_1_stub', { hint: 'rotate verb is implemented as stub in Phase 1; real rotation requires Phase 5+ + dual operator cosign + USB physical move + PID quadruple verification on both sides' });
}

function verbAuditChain(inputs) {
  if (!fs.existsSync(AUDIT_CHAIN_PATH)) return { ok: true, entries: [], total: 0 };
  const lines = fs.readFileSync(AUDIT_CHAIN_PATH, 'utf8').split('\n').filter(l => l.length > 0);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch (e) { return { error: 'parse_failed' }; } });
  const offset = inputs.offset || 0;
  const limit = inputs.limit || entries.length;
  return { ok: true, entries: entries.slice(offset, offset + limit), total: entries.length, tail_sha: readAuditTailSha() };
}

function verbCosignPending(_inputs) {
  // Phase 1 stub: refuse with explanatory error
  return err('cosign_pending_phase_1_stub', { hint: 'cosign_pending is the opt-in deferred-cosign mode for cross-host writes when operator is not at holder host at write time; Phase 1 only implements DIRECT write mode' });
}

const VERBS = {
  attest: verbAttest,
  list: verbList,
  read: verbRead,
  hash: verbHash,
  write: verbWrite,
  rotate: verbRotate,
  audit_chain: verbAuditChain,
  cosign_pending: verbCosignPending
};

function dispatch(inputs) {
  const verb = inputs.verb;
  if (!verb) return err('missing_verb', { allowed: Object.keys(VERBS) });
  const fn = VERBS[verb];
  if (!fn) return err('unknown_verb', { verb, allowed: Object.keys(VERBS) });
  try {
    return fn(inputs);
  } catch (e) {
    return err('verb_threw', { verb, message: e.message });
  }
}

// CLI mode
if (require.main === module) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { buf += c; });
  process.stdin.on('end', () => {
    let manifest;
    try { manifest = JSON.parse(buf); } catch (e) { return console.log(JSON.stringify(err('manifest_parse_failed', { detail: e.message }))); }
    const inputs = manifest.inputs || manifest;
    const result = dispatch(inputs);
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 2);
  });
}

module.exports = {
  dispatch,
  CANONICAL_PID_QUADRUPLE,
  TEST_CANONICAL_ROOT,
  AUDIT_CHAIN_PATH,
  gateAll,
  pathSafe,
  VERBS
};
