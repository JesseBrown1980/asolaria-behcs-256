#!/usr/bin/env node
/**
 * document-share-v0 unit
 *
 * Cross-host document transfer via /omni/submit. Reads manifest from stdin,
 * validates sha256, decodes base64 content, writes to a constrained sandbox-
 * relative incoming dir, returns structured result.
 *
 * Constraints:
 *   - novalum shield inheritance: file_name MUST NOT contain "novalum" or
 *     resolve to a path under data/device-registry/novalum-*
 *   - target path is FIXED to data/omni-processor/paper-draft/incoming/<file_name>
 *     unless caller passes inputs.target_subdir which is appended (no .. allowed)
 *   - sha256 verification is MANDATORY — receiver computes the hash of the
 *     decoded bytes and rejects if mismatch
 *   - max payload bytes 16 MiB (matches both sides' helper maxBuffer)
 *
 * Inputs (from manifest.inputs):
 *   file_name        string (required, basename only, no path traversal)
 *   content_base64   string (required, base64 of file content)
 *   sha256           string (required, hex sha256 of decoded bytes)
 *   total_bytes      int    (required, expected decoded byte length)
 *   chunk_id         int    (optional, for multi-chunk transfers)
 *   of_total_chunks  int    (optional, total expected chunks)
 *   target_subdir    string (optional, subdir under incoming/, no ..)
 *   overwrite        bool   (optional, default false)
 *
 * Outputs (to stdout as JSON):
 *   ok               bool
 *   bytes_written    int
 *   sha256_verified  bool
 *   path_stored      string (absolute path)
 *   chunk_id         int (echoed if provided)
 *   error            string (if any)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const ROOT = 'C:/Users/acer/Asolaria';
const INCOMING_BASE = path.join(ROOT, 'data/omni-processor/paper-draft/incoming');

// === NovaLUM Shield v2 deployment flag ===
// Per joint Rayssa+Jesse cosign 2026-04-07 + the NovaLUM SHIELD CLAUSE scope
// clarification (feedback_novalum_shield_scope_clarification.md), the blanket
// novalum filename regex is being SCOPED, not removed:
//
//   HD-1a — external corporate NovaLUM operations: HARD DENY (always)
//   HD-1b — exploit content patterns: HARD DENY (always)
//   HD-1c — local NovaLUM unit with cube_analysis scope: PERMITTED under v2
//   HD-1d — published-artifact-review: PERMITTED (deferred to higher layer)
//
// The v2 code path is INERT until the local operator creates the flag file
// at data/vault/owner/omni-processor/NOVALUM_SHIELD_V2_DEPLOY in their own
// terminal via the verbatim cosign ritual. Until then, the v1 blanket regex
// is the active classifier. Hot rollback = delete the flag.
const SHIELD_V2_FLAG_PATH = path.join(ROOT, 'data/vault/owner/omni-processor/NOVALUM_SHIELD_V2_DEPLOY');

function isShieldV2Deployed() {
  try { return fs.existsSync(SHIELD_V2_FLAG_PATH); }
  catch (e) { return false; }
}

// HD-1a — external corporate NovaLUM patterns. Always denied regardless of v1/v2.
const NOVALUM_EXTERNAL_PATTERNS = [
  /external.*novalum/i,
  /corporate.*novalum/i,
  /third.*party.*novalum/i,
  /novalum.*exploit/i,
];

// HD-1c — local-unit cube_analysis scope marker. Permitted ONLY under v2.
const NOVALUM_LOCAL_ANALYSIS_PREFIX = /^(local-cube-analysis|local-novalum-analysis|novalum-local-analysis|novalum-cube-analysis).*\.(md|json|ndjson|txt)$/i;

function classifyNovalumFileName(fileName, targetSubdir) {
  // Returns { class: 'HD-1a'|'HD-1b'|'HD-1c'|'HD-1d'|'CLEAR', allowed: bool, reason: string }
  // HD-1a — external corporate NovaLUM
  for (const pat of NOVALUM_EXTERNAL_PATTERNS) {
    if (pat.test(fileName) || (targetSubdir && pat.test(targetSubdir))) {
      return { class: 'HD-1a', allowed: false, reason: 'external_or_third_party_novalum_pattern_detected' };
    }
  }
  // device-registry is always shielded (no scope override)
  if (/device-registry/i.test(fileName) || (targetSubdir && /device-registry/i.test(targetSubdir))) {
    return { class: 'HD-1a', allowed: false, reason: 'device_registry_path_always_shielded' };
  }
  // HD-1c — local cube_analysis prefix
  if (NOVALUM_LOCAL_ANALYSIS_PREFIX.test(fileName)) {
    if (isShieldV2Deployed()) {
      return { class: 'HD-1c', allowed: true, reason: 'local_unit_cube_analysis_scope_v2_deployed' };
    } else {
      return { class: 'HD-1c', allowed: false, reason: 'local_unit_cube_analysis_scope_recognized_BUT_v2_not_deployed_at_NOVALUM_SHIELD_V2_DEPLOY_flag_path' };
    }
  }
  // bare /novalum/i — falls under v1 blanket OR HD-1d in v2
  if (/novalum/i.test(fileName) || (targetSubdir && /novalum/i.test(targetSubdir))) {
    if (isShieldV2Deployed()) {
      return { class: 'HD-1d', allowed: false, reason: 'unscoped_novalum_filename_under_v2_requires_explicit_local_analysis_prefix_OR_published_artifact_review_higher_layer_NOT_implemented_yet' };
    } else {
      return { class: 'V1_BLANKET', allowed: false, reason: 'v1_blanket_shield_active_filename_contains_novalum_v2_not_deployed' };
    }
  }
  return { class: 'CLEAR', allowed: true, reason: 'no_novalum_pattern_detected' };
}

function err(msg, extra) {
  process.stdout.write(JSON.stringify(Object.assign({ ok: false, error: msg }, extra || {})) + '\n');
  process.exit(2);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function (c) { buf += c; });
process.stdin.on('end', function () {
  let manifest;
  try { manifest = JSON.parse(buf); }
  catch (e) { err('manifest_parse_failed: ' + e.message); }

  const inputs = manifest.inputs || {};

  // Validate required inputs
  const required = ['file_name', 'content_base64', 'sha256', 'total_bytes'];
  const missing = required.filter(k => inputs[k] === undefined || inputs[k] === null);
  if (missing.length > 0) {
    err('missing_required_inputs', { missing: missing });
  }

  // novalum shield check (RG-1 inheritance) — branched v1/v2 per shield clarification
  const fileName = String(inputs.file_name);
  const subdirRaw = inputs.target_subdir ? String(inputs.target_subdir) : null;
  const novalumDecision = classifyNovalumFileName(fileName, subdirRaw);
  if (!novalumDecision.allowed) {
    err('novalum_shield_violation', { file_name: fileName, target_subdir: subdirRaw, classification: novalumDecision.class, reason: novalumDecision.reason, shield_v2_deployed: isShieldV2Deployed() });
  }

  // path safety: no path traversal in file_name
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    err('invalid_file_name: must be basename only, no path separators or ..', { file_name: fileName });
  }

  // target subdir safety
  let targetDir = INCOMING_BASE;
  if (subdirRaw) {
    const sub = subdirRaw;
    if (sub.includes('..') || path.isAbsolute(sub)) {
      err('invalid_target_subdir: no .. or absolute path', { target_subdir: sub });
    }
    targetDir = path.join(INCOMING_BASE, sub);
  }

  // payload size check before decode
  const b64 = String(inputs.content_base64);
  // base64 decoded size = ceil(b64.length * 3 / 4) - padding
  const estimatedDecodedBytes = Math.ceil(b64.length * 3 / 4);
  if (estimatedDecodedBytes > MAX_PAYLOAD_BYTES) {
    err('payload_too_large: estimated_decoded_bytes=' + estimatedDecodedBytes + ' max=' + MAX_PAYLOAD_BYTES);
  }

  // Decode base64
  let decoded;
  try { decoded = Buffer.from(b64, 'base64'); }
  catch (e) { err('base64_decode_failed: ' + e.message); }

  // Verify byte length
  if (decoded.length !== Number(inputs.total_bytes)) {
    err('byte_length_mismatch', { expected: Number(inputs.total_bytes), actual: decoded.length });
  }

  // Verify sha256
  const computedSha = crypto.createHash('sha256').update(decoded).digest('hex');
  if (computedSha !== String(inputs.sha256).toLowerCase()) {
    err('sha256_mismatch', { expected: inputs.sha256, computed: computedSha });
  }

  // Determine final path
  const finalPath = path.join(targetDir, fileName);

  // Overwrite check
  if (fs.existsSync(finalPath) && !inputs.overwrite) {
    err('file_exists: pass overwrite=true to replace', { path: finalPath });
  }

  // Ensure dir exists
  try { fs.mkdirSync(targetDir, { recursive: true }); }
  catch (e) { err('mkdir_failed: ' + e.message, { dir: targetDir }); }

  // Write
  try { fs.writeFileSync(finalPath, decoded); }
  catch (e) { err('write_failed: ' + e.message, { path: finalPath }); }

  // Success
  const result = {
    ok: true,
    bytes_written: decoded.length,
    sha256_verified: true,
    sha256: computedSha,
    path_stored: finalPath,
    file_name: fileName,
    target_subdir: inputs.target_subdir || null,
    chunk_id: inputs.chunk_id || null,
    of_total_chunks: inputs.of_total_chunks || null,
    overwrite_used: !!inputs.overwrite,
    manifest_id: manifest.manifest_id,
    ts: new Date().toISOString()
  };
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);
});
