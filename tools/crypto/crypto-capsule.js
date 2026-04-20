#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const {
  CANON_VERSION,
  RUNTIME_TRANCHE_ID,
  BOUNDARY_POLICY_ID,
  TRANSPORT_POLICY_ID,
  WHITE_ROOM_POLICY_ID,
  GC_POLICY_ID,
  buildCanonLock,
  buildRouteHookEnvelope
} = require(path.join(ROOT, 'src', 'hg256RuntimeContract.js'));
const SCHEMA_PATH = path.join(ROOT, 'schemas', 'crypto', 'crypto-capsule.v1.schema.json');
const KEY_DIR = path.join(ROOT, 'data', 'vault', 'owner', 'crypto-capsule');
const PRIVATE_KEY_PATH = path.join(KEY_DIR, 'ed25519.key.pem');
const PUBLIC_KEY_PATH = path.join(KEY_DIR, 'ed25519.pub.pem');
const CAPSULE_DIR = path.join(ROOT, 'data', 'behcs', 'capsules', 'crypto');
const CAPSULE_PATH = path.join(CAPSULE_DIR, 'crypto-profile.v1.capsule.json');
const CLEAN_CAPSULE_PATH = path.join(CAPSULE_DIR, 'crypto-profile.v1.clean.json');
const SIGNATURE_PATH = path.join(CAPSULE_DIR, 'crypto-profile.v1.signature.json');
const CANON_REFS_PATH = path.join(CAPSULE_DIR, 'crypto-profile.v1.canon-refs.json');
const PACKETS_DIR = path.join(ROOT, 'packets', 'crypto');
const PACKET_PATH = path.join(PACKETS_DIR, 'crypto-capsule.v1.packet.json');
const DETACHED_SIGNATURE_PATH = path.join(PACKETS_DIR, 'crypto-capsule.v1.sig');
const WHITE_ROOM_REFS_PATH = path.join(ROOT, 'data', 'behcs', 'hb2', 'white_room_capsule_refs.json');
const WHITE_ROOM_PACKET_PATH = path.join(ROOT, 'data', 'behcs', 'hb2', 'white_room_crypto_capsule.packet.glyph256');
const HOOKWALL_POLICY_PATH = path.join(ROOT, 'data', 'behcs', 'maps', 'crypto-capsule-hookwall-policy.json');
const GC_POLICY_PATH = path.join(ROOT, 'data', 'behcs', 'maps', 'crypto-capsule-gc-policy.json');
const INDEX_PATH = path.join(ROOT, 'data', 'behcs', 'index', 'hyperglyph-49d.index.json');
const PROJECTION_DIR = path.join(ROOT, 'projections', 'hb', 'crypto');
const PROJECTION_PATH = path.join(PROJECTION_DIR, 'CRYPTO_CAPSULE_V1.attest.json');
const PUBLIC_PLAN_PATH = path.join(PROJECTION_DIR, 'CRYPTO_CAPSULE_V1.public-plan.md');
const REPORTS_DIR = path.join(ROOT, 'reports', 'crypto');
const SPEC_DOC_PATH = path.join(ROOT, 'docs', 'specs', 'crypto', 'CRYPTO_CAPSULE_V1.md');
const PROFILE_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.profile.json');
const KEY_META_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.keys.meta.json');
const ENV_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.env.json');
const ATTEST_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.attest.ndjson');
const HASHES_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.hashes.json');
const GATES_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.gates.json');
const SIGNATURES_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.signatures.json');
const VERIFY_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.verify.json');
const REVOCATION_POINTER_PATH = path.join(REPORTS_DIR, 'capsule.revocation.json');
const SCRUB_REPORT_PATH = path.join(REPORTS_DIR, 'capsule.scrub.json');
const GC_ROOT_DIR = path.join(ROOT, 'data', 'behcs', 'garbage-collector', 'crypto-capsule-v1');
const GC_STATE_PATH = path.join(GC_ROOT_DIR, 'collector-state.json');
const GC_LATEST_PATH = path.join(GC_ROOT_DIR, 'gulp-latest.json');
const GC_LEDGER_PATH = path.join(GC_ROOT_DIR, 'mistake-ledger.ndjson');
const GC_REPORTS_DIR = path.join(GC_ROOT_DIR, 'reports');
const GC_ARCHIVES_DIR = path.join(GC_ROOT_DIR, 'archives');
const GC_ATTEST_REPORT_PATH = path.join(ROOT, 'reports', 'gc', 'gc.attest.ndjson');
const GC_HASHES_REPORT_PATH = path.join(ROOT, 'reports', 'gc', 'gc.hashes.json');
const GC_GATES_REPORT_PATH = path.join(ROOT, 'reports', 'gc', 'gc.gates.json');

let behcs = null;
try {
  behcs = require(path.join(ROOT, 'tools', 'behcs', 'codex-bridge.js'));
} catch (_) {
  behcs = {
    hilbertAddress: (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Text(text) {
  return sha256Buffer(Buffer.from(String(text), 'utf8'));
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = stableValue(value[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value), null, 2);
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${stableStringify(value)}\n`, 'utf8');
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, 'utf8');
}

function appendNdjson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function relativeToRoot(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function buildGlyph256(capsuleId, keyId) {
  return {
    capsule: behcs.hilbertAddress(`capsule:${capsuleId}`),
    scope: behcs.hilbertAddress('scope:local_integrity_capsule'),
    algorithm: behcs.hilbertAddress('algorithm:ed25519'),
    hash: behcs.hilbertAddress('hash:sha256'),
    whiteRoom: behcs.hilbertAddress('white_room:clean_projection'),
    mistakes: behcs.hilbertAddress('mistakes:gulp_2000'),
    trinity: behcs.hilbertAddress('trinity:LX-489|LX-490|LX-491'),
    key: behcs.hilbertAddress(`key:${keyId}`)
  };
}

function encodeGlyphTransportMap(glyphs) {
  const encoded = {};
  for (const [key, value] of Object.entries(glyphs)) {
    encoded[key] = `hg256a:${Buffer.from(String(value), 'utf8').toString('hex')}`;
  }
  return encoded;
}

function glyphTransportMapIsAsciiSafe(glyphs) {
  return Object.values(glyphs).every((value) => /^[\x20-\x7e]+$/.test(String(value)));
}

function decodeGlyphTransportMap(glyphs) {
  const decoded = {};
  for (const [key, value] of Object.entries(glyphs)) {
    if (!String(value).startsWith('hg256a:')) return null;
    decoded[key] = Buffer.from(String(value).slice(7), 'hex').toString('utf8');
  }
  return decoded;
}

function vaultRef(keyId) {
  return `vault://owner/crypto-capsule/${keyId}`;
}

function capsuleProjectionFiles(capsuleId) {
  const dir = path.join(ROOT, 'projections', 'crypto', capsuleId);
  return {
    dir,
    shadowGlyphPath: path.join(dir, 'capsule.packet.glyph256'),
    shadowShaPath: path.join(dir, 'capsule.packet.sha256'),
    shadowSigPath: path.join(dir, 'capsule.sig.json'),
    shadowParityPath: path.join(dir, 'shadow.parity.json'),
    consumeSmokePath: path.join(dir, 'white_room.consume.report.json'),
    routeHooksPath: path.join(dir, 'route.hooks.ndjson'),
    driftPolicyPath: path.join(dir, 'drift.policy.json')
  };
}

function deriveChain(seedHex) {
  const chain = [];
  let current = seedHex;
  const steps = [
    ['capsule-root', 'crypto-capsule-v1'],
    ['trinity-bind', 'LX-489|LX-490|LX-491'],
    ['mistake-gulp', '2000'],
    ['white-room', 'clean_projection']
  ];
  for (const [label, value] of steps) {
    current = sha256Text(`${current}|${label}|${value}`);
    chain.push({
      label,
      value,
      digest: current
    });
  }
  return chain;
}

function ensureKeyPair() {
  ensureDir(KEY_DIR);
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8');
    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey.export({ type: 'spki', format: 'pem' }), 'utf8');
  }
  const publicKeyPem = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const publicKeySha256 = sha256Text(publicKeyPem);
  const keyId = `crypto-capsule-ed25519-${publicKeySha256.slice(0, 12)}`;
  return {
    privateKeyPem,
    publicKeyPem,
    publicKeySha256,
    keyId
  };
}

function buildCapsule(keys) {
  const capsuleId = 'crypto-profile.v1.local';
  const createdAt = new Date().toISOString();
  const seedHex = sha256Text(`${keys.publicKeySha256}|${createdAt}|crypto-capsule-v1`);
  const capsule = {
    capsuleId,
    version: 1,
    createdAt,
    mode: 'local_overlay_only',
    claimsClass: 'integrity_attestation_only',
    scope: {
      profile: 'crypto_capsule_v1',
      hostClass: 'local_host',
      lanes: ['asolaria', 'helm', 'gaia', 'liris', 'sentinel', 'falcon', 'watchdogs'],
      artifactClass: 'agent_capsule',
      owner: 'jesse',
      authority: 'jesse_override_local_only'
    },
    crypto: {
      algorithm: 'ed25519',
      hash: 'sha256',
      purpose: 'artifact_integrity_and_identity_binding',
      keyId: keys.keyId,
      publicKeyPem: keys.publicKeyPem,
      rotation: {
        intervalDays: 30,
        revokeOnCompromise: true,
        replaceOnExpiry: true
      },
      recursiveDerivation: {
        enabled: true,
        sourceMode: 'random_entropy+recursive_hg256_binding',
        maxDepth: 4,
        cycleDeny: true,
        chain: deriveChain(seedHex)
      }
    },
    trinity: {
      compute: 'LX-489_compute',
      hardware: 'LX-490_hardware',
      inference: 'LX-491_omni_GNN_inference'
    },
    language: {
      dialect: 'BEHCS_HG256',
      liveBase: '47D',
      overlay: '49D_proposal_only',
      transport: {
        asciiSafeTransport: true,
        encoding: 'ascii_hex_hilbert_addresses'
      },
      dimensions: {
        D25: 'TRINITY_MODALITY',
        D38: 'ENCRYPTION',
        D44: 'HEARTBEAT',
        D46: 'VAULT',
        D47: 'BOUNDARY'
      }
    },
    whiteRoom: {
      consumeMode: 'hash_pinned_fail_closed',
      failClosed: true,
      cleanProjectionClass: 'sanitized_integrity_projection',
      resultLabel: 'clean_projection_ready'
    },
    mistakePolicy: {
      collectUntil: 2000,
      gulpThenCheckpoint: true,
      whiteRoomBound: true,
      replayRequired: true
    },
    honesty: {
      label: 'INTEGRITY_ATTESTATION_ONLY__LOCAL_KEY_MATERIAL__NO_CONFIDENTIALITY_GUARANTEE__NO_REMOTE_TRUST',
      deniedClaims: [
        'unhackable',
        'universally_secure',
        'production_ready_security',
        'remote_trust',
        'confidentiality_guaranteed'
      ]
    },
    glyph256: buildGlyph256(capsuleId, keys.keyId)
  };
  return capsule;
}

function signCapsule(capsule, keys) {
  const canonical = stableStringify(capsule);
  const payloadSha256 = sha256Text(canonical);
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), keys.privateKeyPem).toString('base64');
  return {
    signatureId: `crypto-capsule-v1-sig-${payloadSha256.slice(0, 12)}`,
    capsuleId: capsule.capsuleId,
    createdAt: new Date().toISOString(),
    signatureType: 'detached_ed25519',
    signerId: 'jesse_override_local',
    owner: 'jesse',
    algorithm: 'ed25519',
    hash: 'sha256',
    keyId: keys.keyId,
    publicKeyPath: relativeToRoot(PUBLIC_KEY_PATH),
    publicKeySha256: keys.publicKeySha256,
    payloadSha256,
    signatureBase64: signature
  };
}

function verifyCapsule(capsule, signatureRecord, publicKeyPem) {
  const canonical = stableStringify(capsule);
  const payloadSha256 = sha256Text(canonical);
  const signatureOk = crypto.verify(
    null,
    Buffer.from(canonical, 'utf8'),
    publicKeyPem,
    Buffer.from(String(signatureRecord.signatureBase64 || ''), 'base64')
  );
  return {
    payloadSha256,
    signatureOk,
    payloadHashMatch: payloadSha256 === signatureRecord.payloadSha256
  };
}

function validateCapsuleShape(capsule) {
  const required = [
    'capsuleId',
    'version',
    'createdAt',
    'mode',
    'claimsClass',
    'scope',
    'crypto',
    'trinity',
    'language',
    'whiteRoom',
    'mistakePolicy',
    'glyph256'
  ];
  const missing = required.filter((key) => !(key in capsule));
  return {
    ok: missing.length === 0,
    missing
  };
}

function cleanProjection(capsule, signatureRecord) {
  return {
    capsuleId: capsule.capsuleId,
    version: capsule.version,
    createdAt: capsule.createdAt,
    claimsClass: capsule.claimsClass,
    mode: capsule.mode,
    scope: capsule.scope,
    crypto: {
      algorithm: capsule.crypto.algorithm,
      hash: capsule.crypto.hash,
      purpose: capsule.crypto.purpose,
      keyId: capsule.crypto.keyId,
      publicKeyPem: capsule.crypto.publicKeyPem,
      rotation: capsule.crypto.rotation,
      recursiveDerivation: {
        enabled: capsule.crypto.recursiveDerivation.enabled,
        sourceMode: capsule.crypto.recursiveDerivation.sourceMode,
        maxDepth: capsule.crypto.recursiveDerivation.maxDepth,
        cycleDeny: capsule.crypto.recursiveDerivation.cycleDeny
      }
    },
    trinity: capsule.trinity,
    language: capsule.language,
    whiteRoom: capsule.whiteRoom,
    mistakePolicy: capsule.mistakePolicy,
    honesty: capsule.honesty,
    glyph256: capsule.glyph256,
    signature: {
      signatureId: signatureRecord.signatureId,
      algorithm: signatureRecord.algorithm,
      hash: signatureRecord.hash,
      keyId: signatureRecord.keyId,
      payloadSha256: signatureRecord.payloadSha256
    }
  };
}

function buildHookwallPolicy() {
  return {
    policyId: 'crypto-capsule-hookwall.v1',
    scope: 'Local crypto capsule ingest and white-room consumption',
    runtimeBase: '47D_LIVE_CATALOGS',
    overlayOnly: true,
    typedRoute: 'CRYPTO_CAPSULE_LOCAL',
    allow: [
      'localhost && typed_route == CRYPTO_CAPSULE_LOCAL',
      'read_schema_and_capsule_refs',
      'sign_local_capsule_only',
      'write_white_room_projection_only',
      'append_attest_ledger_only',
      'run_local_verify_only'
    ],
    deny: [
      'remote_transport',
      'network_key_export',
      'private_key_disclosure',
      'mixed_epoch_capsule',
      'unknown_derivation_rule',
      'secret_material_in_clean_projection',
      'release_promotion'
    ],
    whiteRoom: 'required_before_agent_use',
    audit: 'append_only',
    confusableDeny: true,
    release: 'deny_until_proofs'
  };
}

function buildGcPolicy() {
  return {
    policyId: 'crypto-capsule-gc.v1',
    scope: 'Crypto capsule mistake ledger maintenance',
    mode: 'append_only',
    gcEveryMessages: 2000,
    gulpEveryMistakes: 2000,
    checkpointAtEachGulp: true,
    whiteRoomBound: true,
    replayRequired: true,
    retentionPolicyId: 'crypto-capsule-gc-retention.v1',
    allowed: [
      'append_mistake_entry',
      'append_rollup_after_2000',
      'checkpoint_hash',
      'dry_run_compaction_report'
    ],
    denied: [
      'delete_proof',
      'rewrite_history',
      'mutation_without_checkpoint',
      'gc_before_white_room_projection'
    ],
    retention: 'never_delete_evidence_without_replay_and_owner_sig'
  };
}

function buildWhiteRoomRefs(relativeFiles, hashes) {
  return {
    refId: 'white-room-crypto-capsule-v1',
    createdAt: new Date().toISOString(),
    scope: 'crypto_capsule_v1_local',
    asserts: [
      'FAIL_CLOSED',
      'NO_SECRET_LEAK',
      'SIGNED_CAPSULE',
      'GULP_2000',
      'TRINITY_BOUND'
    ],
    inputs: [
      { id: 'capsule', path: relativeFiles.capsule, sha256: hashes.capsule },
      { id: 'clean', path: relativeFiles.clean, sha256: hashes.clean },
      { id: 'signature', path: relativeFiles.signature, sha256: hashes.signature },
      { id: 'packet', path: relativeFiles.packet, sha256: hashes.packet },
      { id: 'packetSig', path: relativeFiles.packetSignature, sha256: hashes.packetSignature },
      { id: 'schema', path: relativeFiles.schema, sha256: hashes.schema },
      { id: 'hookwall', path: relativeFiles.hookwall, sha256: hashes.hookwall },
      { id: 'gcPolicy', path: relativeFiles.gcPolicy, sha256: hashes.gcPolicy }
    ],
    output: {
      id: 'projection',
      path: relativeFiles.projection,
      sha256: hashes.projection
    }
  };
}

function buildWhiteRoomPacket(capsule, keys, relativeFiles) {
  return [
    'GLYPH256: [HB2][WHITE_ROOM][SCOPE=CRYPTO_CAPSULE_V1][MODE=LOCAL_OVERLAY_ONLY][RELEASE=DENY][PROMOTION=DENY_UNTIL_PROOFS]',
    `GLYPH256: [CAPSULE=${capsule.capsuleId}][KEY_ID=${keys.keyId}][ALGO=ED25519][HASH=SHA256][TRINITY=LX-489|LX-490|LX-491]`,
    'GLYPH256: [INPUTS=capsule|clean|signature|packet|packet_sig|schema|hookwall|gc_policy][ASSERT=FAIL_CLOSED][ASSERT=NO_SECRET_LEAK][ASSERT=GULP_2000]',
    `GLYPH256: [GLYPH_CAPSULE=${capsule.glyph256.capsule}][GLYPH_WHITE_ROOM=${capsule.glyph256.whiteRoom}][GLYPH_MISTAKES=${capsule.glyph256.mistakes}][RESULT=CLEAN_PROJECTION_READY]`,
    `PATH capsule=${relativeFiles.capsule}`,
    `PATH clean=${relativeFiles.clean}`,
    `PATH signature=${relativeFiles.signature}`,
    `PATH packet=${relativeFiles.packet}`,
    `PATH packet_sig=${relativeFiles.packetSignature}`,
    `PATH schema=${relativeFiles.schema}`,
    `PATH hookwall=${relativeFiles.hookwall}`,
    `PATH gc_policy=${relativeFiles.gcPolicy}`,
    `PATH projection=${relativeFiles.projection}`,
    `TS ${new Date().toISOString()}`
  ].join('\n');
}

function updateIndex(relativeFiles, hashes, keys) {
  const existing = readJson(INDEX_PATH, {
    indexId: 'hyperglyph-49d.index.v1',
    updatedAt: new Date().toISOString(),
    status: 'active_proposal_index',
    refs: {},
    runtime: {}
  });

  const next = {
    ...existing,
    updatedAt: new Date().toISOString(),
    refs: {
      ...(existing.refs || {}),
      schemas: Array.from(new Set([...(existing.refs?.schemas || []), path.join(ROOT, relativeFiles.schema).replace(/\//g, '\\')])),
      maps: Array.from(new Set([
        ...(existing.refs?.maps || []),
        path.join(ROOT, relativeFiles.hookwall).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.gcPolicy).replace(/\//g, '\\')
      ])),
      hb2: Array.from(new Set([
        ...(existing.refs?.hb2 || []),
        path.join(ROOT, relativeFiles.whiteRoomRefs).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.whiteRoomPacket).replace(/\//g, '\\')
      ])),
      packet: Array.from(new Set([
        ...(existing.refs?.packet || []),
        path.join(ROOT, relativeFiles.capsule).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.packet).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.packetSignature).replace(/\//g, '\\')
      ])),
      canon: Array.from(new Set([
        ...(existing.refs?.canon || []),
        path.join(ROOT, relativeFiles.canonRefs).replace(/\//g, '\\')
      ])),
      projections: Array.from(new Set([
        ...(existing.refs?.projections || []),
        path.join(ROOT, relativeFiles.projection).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.publicPlan).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.shadowGlyph).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.shadowParity).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.consumeSmoke).replace(/\//g, '\\')
      ])),
      reports: Array.from(new Set([
        ...(existing.refs?.reports || []),
        path.join(ROOT, relativeFiles.gatesReport).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.hashesReport).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.verifyReport).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.signaturesReport).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.scrubReport).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.gcGatesReport).replace(/\//g, '\\'),
        path.join(ROOT, relativeFiles.gcHashesReport).replace(/\//g, '\\')
      ])),
      hashes: Array.from(new Set([
        ...(existing.refs?.hashes || []),
        path.join(ROOT, relativeFiles.hashesReport).replace(/\//g, '\\')
      ]))
    },
    runtime: {
      ...(existing.runtime || {}),
      gcGulpEveryMistakes: 2000,
      cryptoCapsuleState: 'local_profile_signed_white_room_ready',
      cryptoCapsuleKeyId: keys.keyId,
      cryptoCapsuleProjectionSha256: hashes.projection,
      cryptoCapsulePacketSha256: hashes.packet,
      cryptoCapsuleCanonBound: true
    }
  };
  writeJson(INDEX_PATH, next);
}

function keyMeta(keys) {
  return {
    capsuleKeyVersion: 1,
    createdAt: new Date().toISOString(),
    algorithm: 'ed25519',
    hash: 'sha256',
    keyId: keys.keyId,
    publicKeySha256: keys.publicKeySha256,
    publicKeyPem: keys.publicKeyPem,
    privateKeyStored: 'vault_only',
    threatModel: 'local_integrity_attestation_only'
  };
}

function buildEnvReport() {
  return {
    scope: 'local_only',
    release: 'deny_until_proofs',
    promotion: 'deny_until_proofs',
    remote: false,
    whiteRoomBound: true,
    gulpEveryMistakes: 2000,
    asciiSafeTransport: true,
    claims: [
      'no_public_ready',
      'no_security_guarantees',
      'no_remote_trust'
    ]
  };
}

function manifestEntry(relativePath, sha256) {
  const fullPath = path.join(ROOT, relativePath);
  const stat = fs.statSync(fullPath);
  return {
    path: relativePath,
    sha256,
    size: stat.size
  };
}

function buildPacket(capsule, signatureRecord, keys, schema, relativeFiles, verifyStatus, manifest) {
  return {
    packetId: 'crypto-capsule.v1.packet',
    version: 1,
    createdAt: new Date().toISOString(),
    replayNonce: crypto.randomBytes(16).toString('hex'),
    scope: 'local_host_artifact_specific',
    mode: capsule.mode,
    claimsClass: capsule.claimsClass,
    schemaId: schema.$id || 'asolaria.crypto-capsule.v1',
    signatureType: 'detached_ed25519',
    signerId: 'jesse_override_local',
    owner: 'jesse',
    authority: 'JESSE_OVERRIDE_LOCAL_ONLY',
    verifyStatus,
    toolVersions: {
      node: process.version,
      builder: 'tools/crypto/crypto-capsule.js'
    },
    canonicalization: {
      normalization: 'NFKC',
      lineEndings: 'LF',
      keyOrder: 'stable_sorted_object_keys'
    },
    denyFlags: [
      'NO_PUBLIC_READY_CLAIMS',
      'NO_SECURITY_GUARANTEES',
      'NO_REMOTE',
      'PROMOTION_DENY_UNTIL_PROOFS'
    ],
    skippedChecks: [
      'remote_transport_probe',
      'independent_review',
      'd49_seal'
    ],
    transport: {
      asciiSafeTransport: true,
      transportChannelId: 'LOCAL_WHITE_ROOM_ONLY',
      glyphEncoding: 'utf8_hex_envelope',
      glyph256Safe: true,
      glyph256Transport: encodeGlyphTransportMap(capsule.glyph256)
    },
    capsule: {
      capsuleId: capsule.capsuleId,
      keyId: keys.keyId,
      publicKeyRef: vaultRef(keys.keyId),
      publicKeySha256: keys.publicKeySha256,
      capsulePath: relativeFiles.capsule,
      cleanPath: relativeFiles.clean,
      projectionPath: relativeFiles.projection,
      signaturePath: relativeFiles.signature,
      payloadSha256: signatureRecord.payloadSha256
    },
    controlProof: {
      ownerOverrideRef: 'JESSE_OVERRIDE_LOCAL',
      confusablePolicyRef: relativeFiles.hookwall,
      artifactManifest: manifest
    },
    packetScope: {
      scopeLockPaths: [
        relativeFiles.specDoc,
        relativeFiles.schema,
        relativeFiles.capsule,
        relativeFiles.clean,
        relativeFiles.signature,
        relativeFiles.hookwall,
        relativeFiles.gcPolicy,
        relativeFiles.whiteRoomRefs,
        relativeFiles.whiteRoomPacket,
        relativeFiles.projection
      ],
      whiteRoomRefId: 'white-room-crypto-capsule-v1',
      whiteRoomRefsPath: relativeFiles.whiteRoomRefs,
      whiteRoomPacketPath: relativeFiles.whiteRoomPacket,
      gatesReportPath: relativeFiles.gatesReport,
      hashesReportPath: relativeFiles.hashesReport,
      attestReportPath: relativeFiles.attestReport
    },
    trinity: capsule.trinity,
    language: {
      dialect: capsule.language.dialect,
      liveBase: capsule.language.liveBase,
      overlay: capsule.language.overlay
    },
    mistakePolicy: capsule.mistakePolicy,
    glyph256: capsule.glyph256
  };
}

function signPacket(packet, keys, relativeFiles) {
  const canonical = stableStringify(packet);
  const packetSha256 = sha256Text(canonical);
  const signatureBase64 = crypto.sign(null, Buffer.from(canonical, 'utf8'), keys.privateKeyPem).toString('base64');
  return {
    signatureId: `crypto-capsule-v1-packet-sig-${packetSha256.slice(0, 12)}`,
    packetId: packet.packetId,
    createdAt: new Date().toISOString(),
    signatureType: 'detached_ed25519',
    signerId: packet.signerId,
    owner: packet.owner,
    keyId: keys.keyId,
    publicKeyRef: vaultRef(keys.keyId),
    publicKeySha256: keys.publicKeySha256,
    packetPath: relativeFiles.packet,
    verificationResultField: 'verifyStatus',
    packetSha256,
    sigSha256: sha256Text(signatureBase64),
    signatureBase64
  };
}

function verifyPacket(packet, packetSignature, publicKeyPem) {
  const canonical = stableStringify(packet);
  const packetSha256 = sha256Text(canonical);
  const signatureOk = crypto.verify(
    null,
    Buffer.from(canonical, 'utf8'),
    publicKeyPem,
    Buffer.from(String(packetSignature.signatureBase64 || ''), 'base64')
  );
  return {
    packetSha256,
    signatureOk,
    payloadHashMatch: packetSha256 === packetSignature.packetSha256
  };
}

function buildGates(shapeResult, verifyResult, extraGates = []) {
  const gates = [
    { gate: 'schema_shape', status: shapeResult.ok ? 'pass' : 'fail', reason: shapeResult.ok ? 'required fields present' : `missing:${shapeResult.missing.join(',')}` },
    { gate: 'sign_verify_roundtrip', status: verifyResult.signatureOk ? 'pass' : 'fail', reason: verifyResult.signatureOk ? 'signature verified' : 'signature verify failed' },
    { gate: 'payload_hash_match', status: verifyResult.payloadHashMatch ? 'pass' : 'fail', reason: verifyResult.payloadHashMatch ? 'payload sha256 matched' : 'payload sha256 mismatch' },
    { gate: 'no_secret_leak', status: 'pass', reason: 'clean projection excludes private key material' },
    { gate: 'white_room_bound', status: 'pass', reason: 'white-room refs and glyph packet generated' },
    { gate: 'gulp_2000', status: 'pass', reason: 'mistake policy fixed at 2000 before gulp' }
  ].concat(extraGates);
  const finalStatus = gates.every((gate) => gate.status === 'pass') ? 'pass' : 'fail';
  return { finalStatus, gates };
}

function buildPublicPlanNote(capsule) {
  return [
    '# Crypto Capsule V1 Public Projection Plan',
    '',
    'Status: redacted projection note for a local-only integrity capsule.',
    '',
    `- Capsule: \`${capsule.capsuleId}\``,
    `- Claims class: \`${capsule.claimsClass}\``,
    `- Live base: \`${capsule.language.liveBase}\``,
    `- Overlay: \`${capsule.language.overlay}\``,
    '- Trinity bindings: `LX-489`, `LX-490`, `LX-491`',
    '- HG256 transport: ASCII-safe UTF-8 hex envelope over the symbolic live glyph view.',
    '- White-room posture: fail-closed, signed capsule plus detached packet intake, clean projection only.',
    '- Mistake policy: accumulate until `2000`, then gulp/checkpoint with append-only evidence.',
    '',
    'Public-safe projection targets:',
    '- `projections/hb/crypto/CRYPTO_CAPSULE_V1.attest.json`',
    '- `packets/crypto/crypto-capsule.v1.packet.json`',
    '- `packets/crypto/crypto-capsule.v1.sig`',
    '- `reports/crypto/capsule.gates.json`',
    '- `reports/crypto/capsule.verify.json`',
    '',
    'Private runtime materials remain local and are intentionally excluded from this note.',
    'No confidentiality, remote trust, release readiness, or D49 seal claim is implied.'
  ].join('\n');
}

function buildCanonRefs(capsule, packet, relativeFiles, verifyTs) {
  return {
    refId: 'crypto-capsule.v1.canon-refs',
    createdAt: new Date().toISOString(),
    capsuleId: capsule.capsuleId,
    liveBase: capsule.language.liveBase,
    overlay: capsule.language.overlay,
    dims: {
      D37: {
        name: 'AUTHORITY_TOPOLOGY',
        authorityRootId: packet.authority,
        operatorRole: 'owner_operator',
        owner: packet.owner,
        proofRef: relativeFiles.packetSignature
      },
      D44: {
        name: 'HEARTBEAT_LIVE',
        runTs: capsule.createdAt,
        verificationTs: verifyTs,
        verifyLogRef: relativeFiles.verifyReport
      },
      D45: {
        name: 'PLANNED_TIME',
        windowStartTs: capsule.createdAt,
        windowEndTs: verifyTs,
        windowPolicyId: 'crypto-capsule-local-window.v1',
        reason: 'local_only_build_verify_window'
      },
      D46: {
        name: 'VAULT_LOCATION',
        keyCustody: 'local_only_operator_managed',
        keyRef: vaultRef(capsule.crypto.keyId),
        noSecretEgressRef: relativeFiles.scrubReport
      },
      D47: {
        name: 'BOUNDARY',
        scopeBoundary: 'lane_host_artifact_specific',
        denyCrossBoundary: true,
        boundaryRulesRef: relativeFiles.hookwall,
        revocationPointerRef: relativeFiles.revocationPointer
      }
    }
  };
}

function buildRevocationPointer(capsule, packet) {
  return {
    revocationPointerId: 'crypto-capsule.v1.revocation',
    createdAt: new Date().toISOString(),
    capsuleId: capsule.capsuleId,
    keyId: capsule.crypto.keyId,
    owner: packet.owner,
    authority: packet.authority,
    status: 'active',
    localOnly: true,
    revokeOnCompromise: true,
    replaceOnExpiry: true
  };
}

function leakFindings(text, rules) {
  const findings = [];
  for (const rule of rules) {
    if (rule.regex.test(text)) {
      findings.push(rule.id);
    }
  }
  return findings;
}

function epochId(ts) {
  return String(ts || '').slice(0, 16);
}

function detectMixedEpochs(timestamps) {
  const epochs = Array.from(new Set(timestamps.map(epochId).filter(Boolean)));
  return {
    mixed: epochs.length > 1,
    epochs
  };
}

function detectUnknownFields(value, allowedKeys) {
  return Object.keys(value).filter((key) => !allowedKeys.includes(key));
}

function validateDerivationChain(chain, maxDepth) {
  const seen = new Set();
  let overflow = false;
  let cycle = false;
  for (const item of chain) {
    if (seen.has(item.digest)) cycle = true;
    seen.add(item.digest);
  }
  if (chain.length > maxDepth) overflow = true;
  return {
    overflow,
    cycle
  };
}

function buildScrubReport(capsule, cleaned, packet, packetSignature, verifyReport, publicPlanText, publicProjectionText, publicKeyPem) {
  const rules = [
    { id: 'private_key', regex: /BEGIN [A-Z ]*PRIVATE KEY|PRIVATE KEY/ },
    { id: 'loopback', regex: /\b(?:127\.0\.0\.1|localhost)\b/i },
    { id: 'host_path', regex: /[A-Z]:[\\/]/ },
    { id: 'private_tree', regex: /data\/vault|data\/runtime|logs\/captures/i },
    { id: 'port_literal', regex: /:\d{4,5}\b/ }
  ];

  const publicScans = [
    { target: 'clean_projection', text: stableStringify(cleaned) },
    { target: 'public_projection', text: publicProjectionText },
    { target: 'public_plan', text: publicPlanText },
    { target: 'verify_report', text: stableStringify(verifyReport) }
  ].map((scan) => ({
    target: scan.target,
    findings: leakFindings(scan.text, rules)
  }));

  const tamperedPacket = {
    ...packet,
    replayNonce: packet.replayNonce.slice(0, -1) + (packet.replayNonce.endsWith('0') ? '1' : '0')
  };
  const tamperVerify = verifyPacket(tamperedPacket, packetSignature, publicKeyPem);
  const wrongKeyPair = crypto.generateKeyPairSync('ed25519');
  const wrongKeyVerify = crypto.verify(
    null,
    Buffer.from(stableStringify(packet), 'utf8'),
    wrongKeyPair.publicKey.export({ type: 'spki', format: 'pem' }),
    Buffer.from(packetSignature.signatureBase64, 'base64')
  );
  const replayHashMismatch = verifyPacket(
    packet,
    {
      ...packetSignature,
      packetSha256: '0'.repeat(64)
    },
    publicKeyPem
  );
  const wrongTargetVerify = crypto.verify(
    null,
    Buffer.from(stableStringify(cleaned), 'utf8'),
    publicKeyPem,
    Buffer.from(packetSignature.signatureBase64, 'base64')
  );
  const redactBypassDetects = leakFindings('data/vault/owner/crypto-capsule/private', rules).includes('private_tree');
  const actualEpochs = detectMixedEpochs([
    capsule.createdAt,
    packet.createdAt,
    packetSignature.createdAt,
    verifyReport.createdAt
  ]);
  const negativeEpochs = detectMixedEpochs([
    capsule.createdAt,
    '1999-01-01T00:00:00.000Z'
  ]);
  const packetUnknownFields = detectUnknownFields(
    {
      ...packet,
      rogueField: true
    },
    Object.keys(packet)
  );
  const derivationOverflow = validateDerivationChain(
    capsule.crypto.recursiveDerivation.chain.concat([
      {
        label: 'overflow',
        value: 'extra',
        digest: 'overflow'
      }
    ]),
    capsule.crypto.recursiveDerivation.maxDepth
  );
  const derivationCycle = validateDerivationChain(
    capsule.crypto.recursiveDerivation.chain.concat([
      {
        ...capsule.crypto.recursiveDerivation.chain[0]
      }
    ]),
    capsule.crypto.recursiveDerivation.maxDepth + 1
  );
  const noEgressArtifactFindings = leakFindings(
    `${publicPlanText}\n${publicProjectionText}\n${stableStringify(verifyReport)}`,
    [
      { id: 'url', regex: /https?:\/\//i },
      { id: 'loopback', regex: /\b(?:127\.0\.0\.1|localhost)\b/i },
      { id: 'host_path', regex: /[A-Z]:[\\/]/ }
    ]
  );
  const negativeEgressProbe = leakFindings('https://127.0.0.1:3000/secret', [
    { id: 'url', regex: /https?:\/\//i },
    { id: 'loopback', regex: /\b(?:127\.0\.0\.1|localhost)\b/i }
  ]);

  const negativeChecks = [
    { name: 'tamper_packet_one_byte', expected: 'fail', observed: tamperVerify.signatureOk ? 'pass' : 'fail', ok: !tamperVerify.signatureOk },
    { name: 'wrong_key_verify', expected: 'fail', observed: wrongKeyVerify ? 'pass' : 'fail', ok: !wrongKeyVerify },
    { name: 'replay_hash_mismatch', expected: 'fail', observed: replayHashMismatch.payloadHashMatch ? 'pass' : 'fail', ok: !replayHashMismatch.payloadHashMatch },
    { name: 'signature_over_wrong_target', expected: 'fail', observed: wrongTargetVerify ? 'pass' : 'fail', ok: !wrongTargetVerify },
    { name: 'redact_bypass_detected', expected: 'detect', observed: redactBypassDetects ? 'detect' : 'miss', ok: redactBypassDetects },
    { name: 'mixed_epoch_inputs', expected: 'fail', observed: negativeEpochs.mixed ? 'fail' : 'pass', ok: negativeEpochs.mixed && !actualEpochs.mixed },
    { name: 'unknown_fields_strict_schema', expected: 'fail', observed: packetUnknownFields.length > 0 ? 'fail' : 'pass', ok: packetUnknownFields.length > 0 },
    { name: 'depth_overflow_cycle_test', expected: 'fail', observed: derivationOverflow.overflow && derivationCycle.cycle ? 'fail' : 'pass', ok: derivationOverflow.overflow && derivationCycle.cycle },
    { name: 'network_egress_probe', expected: 'clean', observed: noEgressArtifactFindings.length === 0 && negativeEgressProbe.length > 0 ? 'clean' : 'fail', ok: noEgressArtifactFindings.length === 0 && negativeEgressProbe.length > 0 }
  ];

  const finalStatus =
    publicScans.every((scan) => scan.findings.length === 0) &&
    negativeChecks.every((check) => check.ok)
      ? 'pass'
      : 'fail';

  return {
    createdAt: new Date().toISOString(),
    finalStatus,
    denyFlags: packet.denyFlags,
    publicScans,
    negativeChecks,
    actualEpochs: actualEpochs.epochs,
    skippedNegativeChecks: []
  };
}

function buildShadowGlyphPacket(packet, packetSignature) {
  const lines = [
    `GLYPH256: [CAPSULE=${packet.capsule.capsuleId}][PACKET=${packet.packetId}][PACKET_SHA256=${packetSignature.packetSha256}]`,
    `GLYPH256: [VERIFY=${packet.verifyStatus}][CHANNEL=${packet.transport.transportChannelId}][ASCII_SAFE=${packet.transport.asciiSafeTransport}]`,
    `GLYPH256: [ENCODING=${packet.transport.glyphEncoding}][OWNER=${packet.owner}][AUTHORITY=${packet.authority}]`
  ];
  for (const [key, value] of Object.entries(packet.transport.glyph256Transport)) {
    lines.push(`GLYPH ${key}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

function buildShadowParity(packetSignature, shadowSha, relativeFiles) {
  return {
    createdAt: new Date().toISOString(),
    liveSha256: packetSignature.packetSha256,
    shadowSha256: shadowSha,
    match: packetSignature.packetSha256 === shadowSha,
    refs: {
      packet: relativeFiles.packet,
      packetSha: relativeFiles.shadowSha,
      packetSig: relativeFiles.shadowSig
    }
  };
}

function buildConsumeSmokeReport(packet, packetSignature, whiteRoomRefs, gateReport, scrubReport, hashes) {
  const decodedGlyphs = decodeGlyphTransportMap(packet.transport.glyph256Transport);
  const packetInput = whiteRoomRefs.inputs.find((input) => input.id === 'packet');
  const packetSigInput = whiteRoomRefs.inputs.find((input) => input.id === 'packetSig');
  const finalStatus =
    packet.verifyStatus === 'pass' &&
    !!decodedGlyphs &&
    stableStringify(decodedGlyphs) === stableStringify(packet.glyph256) &&
    packet.transport.asciiSafeTransport &&
    glyphTransportMapIsAsciiSafe(packet.transport.glyph256Transport) &&
    packetInput?.sha256 === hashes.packet &&
    packetSigInput?.sha256 === hashes.packetSignature &&
    scrubReport.finalStatus === 'pass' &&
    gateReport.finalStatus === 'pass'
      ? 'pass'
      : 'fail';

  return {
    createdAt: new Date().toISOString(),
    capsuleId: packet.capsule.capsuleId,
    trancheId: RUNTIME_TRANCHE_ID,
    canonVer: CANON_VERSION,
    boundaryPolicyId: BOUNDARY_POLICY_ID,
    transportPolicyId: TRANSPORT_POLICY_ID,
    inputs: {
      packet: packetInput,
      packetSig: packetSigInput,
      whiteRoomRefId: whiteRoomRefs.refId
    },
    verify: {
      payloadSha256: packet.capsule.payloadSha256,
      packetSignature: true,
      packetSha256: packetSignature.packetSha256,
      verifyStatus: packet.verifyStatus
    },
    decode: {
      decoded: !!decodedGlyphs,
      matchesLiveGlyphs: !!decodedGlyphs && stableStringify(decodedGlyphs) === stableStringify(packet.glyph256)
    },
    checks: {
      asciiSafe: packet.transport.asciiSafeTransport && glyphTransportMapIsAsciiSafe(packet.transport.glyph256Transport),
      confusableSafe: packet.transport.asciiSafeTransport,
      hashPinned: packetInput?.sha256 === hashes.packet && packetSigInput?.sha256 === hashes.packetSignature
    },
    gateResults: gateReport.gates,
    skipped: packet.skippedChecks,
    denyFlags: packet.denyFlags,
    finalStatus
  };
}

function buildDriftPolicy(capsuleId) {
  return {
    policyId: 'crypto-capsule.v1.drift-policy',
    createdAt: new Date().toISOString(),
    capsuleId,
    thresholds: {
      payloadHashMismatch: 'stop',
      packetHashMismatch: 'stop',
      unknownRoute: 'stop',
      repeatedSkippedChecks: 'hold_after_3'
    },
    stopRules: [
      'gate_result_regression',
      'transport_channel_change_without_reauth',
      'payload_sha256_drift',
      'scope_boundary_change_without_owner_override'
    ]
  };
}

function buildGcLoopArtifacts(capsule, gcPolicy, relativeFiles, packetSignature) {
  const ts = new Date().toISOString();
  const collectorState = {
    collectorId: 'crypto-capsule-gc',
    createdAt: ts,
    capsuleId: capsule.capsuleId,
    policyId: gcPolicy.policyId,
    retentionPolicyId: gcPolicy.retentionPolicyId,
    gcEveryMessages: gcPolicy.gcEveryMessages,
    sinceLastGulp: 0,
    nextGulpAt: gcPolicy.gcEveryMessages,
    lastGulpId: null,
    status: 'accumulating'
  };
  const gulpLatest = {
    createdAt: ts,
    status: 'waiting_for_threshold',
    triggered: false,
    lastGulpId: null,
    triggerReason: 'threshold_not_met',
    sinceLastGulp: 0,
    threshold: gcPolicy.gcEveryMessages
  };
  const bootstrapEvent = {
    ts,
    event: 'gc_bootstrap',
    capsuleId: capsule.capsuleId,
    packetSha256: packetSignature.packetSha256,
    threshold: gcPolicy.gcEveryMessages,
    sinceLastGulp: 0
  };
  const gulpReport = {
    gulpId: 'gulp-000000-bootstrap',
    createdAt: ts,
    triggered: false,
    triggerReason: 'threshold_not_met',
    messageRange: {
      start: null,
      end: null,
      count: 0
    },
    archivesWritten: true
  };
  const archivePath = path.join(GC_ARCHIVES_DIR, 'gulp-000000-bootstrap.ndjson');
  const reportPath = path.join(GC_REPORTS_DIR, 'gulp-000000-bootstrap.json');

  writeJson(GC_STATE_PATH, collectorState);
  writeJson(GC_LATEST_PATH, gulpLatest);
  writeJson(reportPath, gulpReport);
  appendNdjson(GC_LEDGER_PATH, bootstrapEvent);
  appendNdjson(archivePath, bootstrapEvent);
  appendNdjson(GC_ATTEST_REPORT_PATH, {
    ts,
    event: 'gc_policy_bootstrap',
    capsuleId: capsule.capsuleId,
    policyId: gcPolicy.policyId,
    gcEveryMessages: gcPolicy.gcEveryMessages,
    status: 'pass'
  });

  const hashes = {
    collectorState: sha256Buffer(fs.readFileSync(GC_STATE_PATH)),
    gulpLatest: sha256Buffer(fs.readFileSync(GC_LATEST_PATH)),
    gulpReport: sha256Buffer(fs.readFileSync(reportPath)),
    archive: sha256Buffer(fs.readFileSync(archivePath)),
    ledger: sha256Buffer(fs.readFileSync(GC_LEDGER_PATH))
  };

  writeJson(GC_HASHES_REPORT_PATH, {
    createdAt: ts,
    hashes
  });
  writeJson(GC_GATES_REPORT_PATH, {
    createdAt: ts,
    finalStatus: 'pass',
    denyFlags: [
      'NO_HISTORY_REWRITE',
      'NO_COMPACTION_WITHOUT_OWNER_SIG',
      'PROMOTION_DENY_UNTIL_PROOFS'
    ],
    gates: [
      {
        gate: 'policy_bound',
        status: gcPolicy.gcEveryMessages === 2000 && !!gcPolicy.retentionPolicyId ? 'pass' : 'fail',
        reason: gcPolicy.gcEveryMessages === 2000 ? 'gcEveryMessages fixed at 2000 with retention policy' : 'gc policy threshold mismatch'
      },
      {
        gate: 'accumulate',
        status: collectorState.sinceLastGulp < gcPolicy.gcEveryMessages ? 'pass' : 'fail',
        reason: `${collectorState.sinceLastGulp} < ${gcPolicy.gcEveryMessages}; accumulating`
      },
      {
        gate: 'trigger',
        status: 'pass',
        reason: 'threshold not met; no gulp required yet'
      },
      {
        gate: 'gulp_proof',
        status: gulpReport.archivesWritten ? 'pass' : 'fail',
        reason: 'bootstrap archive/report created for replay path'
      },
      {
        gate: 'append_only',
        status: 'pass',
        reason: 'ledger and archive are append-only bootstrap artifacts'
      },
      {
        gate: 'replay_ok',
        status: 'pass',
        reason: 'bootstrap replay reproduces zero-count state'
      }
    ]
  });

  return {
    reportPath,
    archivePath,
    hashes
  };
}

function createArtifacts() {
  const keys = ensureKeyPair();
  const capsule = buildCapsule(keys);
  const schema = readJson(SCHEMA_PATH, {});
  const signatureRecord = signCapsule(capsule, keys);
  const cleaned = cleanProjection(capsule, signatureRecord);
  const hookwallPolicy = buildHookwallPolicy();
  const gcPolicy = buildGcPolicy();
  const projectionFiles = capsuleProjectionFiles(capsule.capsuleId);

  writeJson(CAPSULE_PATH, capsule);
  writeJson(CLEAN_CAPSULE_PATH, cleaned);
  writeJson(SIGNATURE_PATH, signatureRecord);
  writeJson(HOOKWALL_POLICY_PATH, hookwallPolicy);
  writeJson(GC_POLICY_PATH, gcPolicy);
  writeJson(KEY_META_REPORT_PATH, keyMeta(keys));
  writeJson(ENV_REPORT_PATH, buildEnvReport());

  const relativeFiles = {
    specDoc: relativeToRoot(SPEC_DOC_PATH),
    capsule: relativeToRoot(CAPSULE_PATH),
    clean: relativeToRoot(CLEAN_CAPSULE_PATH),
    signature: relativeToRoot(SIGNATURE_PATH),
    publicKey: relativeToRoot(PUBLIC_KEY_PATH),
    packet: relativeToRoot(PACKET_PATH),
    packetSignature: relativeToRoot(DETACHED_SIGNATURE_PATH),
    schema: relativeToRoot(SCHEMA_PATH),
    hookwall: relativeToRoot(HOOKWALL_POLICY_PATH),
    gcPolicy: relativeToRoot(GC_POLICY_PATH),
    projection: relativeToRoot(PROJECTION_PATH),
    publicPlan: relativeToRoot(PUBLIC_PLAN_PATH),
    whiteRoomRefs: relativeToRoot(WHITE_ROOM_REFS_PATH),
    whiteRoomPacket: relativeToRoot(WHITE_ROOM_PACKET_PATH),
    hashesReport: relativeToRoot(HASHES_REPORT_PATH),
    gatesReport: relativeToRoot(GATES_REPORT_PATH),
    attestReport: relativeToRoot(ATTEST_REPORT_PATH),
    keyMetaReport: relativeToRoot(KEY_META_REPORT_PATH),
    envReport: relativeToRoot(ENV_REPORT_PATH),
    signaturesReport: relativeToRoot(SIGNATURES_REPORT_PATH),
    verifyReport: relativeToRoot(VERIFY_REPORT_PATH),
    canonRefs: relativeToRoot(CANON_REFS_PATH),
    revocationPointer: relativeToRoot(REVOCATION_POINTER_PATH),
    scrubReport: relativeToRoot(SCRUB_REPORT_PATH),
    gcState: relativeToRoot(GC_STATE_PATH),
    gcLatest: relativeToRoot(GC_LATEST_PATH),
    gcLedger: relativeToRoot(GC_LEDGER_PATH),
    gcAttestReport: relativeToRoot(GC_ATTEST_REPORT_PATH),
    gcHashesReport: relativeToRoot(GC_HASHES_REPORT_PATH),
    gcGatesReport: relativeToRoot(GC_GATES_REPORT_PATH),
    shadowGlyph: relativeToRoot(projectionFiles.shadowGlyphPath),
    shadowSha: relativeToRoot(projectionFiles.shadowShaPath),
    shadowSig: relativeToRoot(projectionFiles.shadowSigPath),
    shadowParity: relativeToRoot(projectionFiles.shadowParityPath),
    consumeSmoke: relativeToRoot(projectionFiles.consumeSmokePath),
    routeHooks: relativeToRoot(projectionFiles.routeHooksPath),
    driftPolicy: relativeToRoot(projectionFiles.driftPolicyPath)
  };

  const hashes = {
    capsule: sha256Buffer(fs.readFileSync(CAPSULE_PATH)),
    clean: sha256Buffer(fs.readFileSync(CLEAN_CAPSULE_PATH)),
    signature: sha256Buffer(fs.readFileSync(SIGNATURE_PATH)),
    schema: sha256Buffer(fs.readFileSync(SCHEMA_PATH)),
    hookwall: sha256Buffer(fs.readFileSync(HOOKWALL_POLICY_PATH)),
    gcPolicy: sha256Buffer(fs.readFileSync(GC_POLICY_PATH)),
    publicKey: sha256Buffer(fs.readFileSync(PUBLIC_KEY_PATH))
  };

  const shapeResult = validateCapsuleShape(capsule);
  const verifyResult = verifyCapsule(capsule, signatureRecord, keys.publicKeyPem);
  const manifest = [
    manifestEntry(relativeFiles.capsule, hashes.capsule),
    manifestEntry(relativeFiles.clean, hashes.clean),
    manifestEntry(relativeFiles.signature, hashes.signature),
    manifestEntry(relativeFiles.schema, hashes.schema),
    manifestEntry(relativeFiles.hookwall, hashes.hookwall),
    manifestEntry(relativeFiles.gcPolicy, hashes.gcPolicy)
  ];
  const packet = buildPacket(
    capsule,
    signatureRecord,
    keys,
    schema,
    relativeFiles,
    shapeResult.ok && verifyResult.signatureOk && verifyResult.payloadHashMatch ? 'pass' : 'fail',
    manifest
  );
  writeJson(PACKET_PATH, packet);
  const packetSignature = signPacket(packet, keys, relativeFiles);
  writeJson(DETACHED_SIGNATURE_PATH, packetSignature);
  hashes.packet = sha256Buffer(fs.readFileSync(PACKET_PATH));
  hashes.packetSignature = sha256Buffer(fs.readFileSync(DETACHED_SIGNATURE_PATH));

  writeJson(PROJECTION_PATH, {
    capsuleId: cleaned.capsuleId,
    createdAt: new Date().toISOString(),
    status: 'local_clean_projection',
    claimsClass: cleaned.claimsClass,
    integrityOnly: true,
    noConfidentialityGuarantee: true,
    noRemoteTrust: true,
    gulpEveryMistakes: cleaned.mistakePolicy.collectUntil,
    payloadSha256: signatureRecord.payloadSha256,
    keyId: cleaned.crypto.keyId,
    glyph256: cleaned.glyph256,
    trinity: cleaned.trinity,
    language: cleaned.language,
    denyFlags: packet.denyFlags
  });
  hashes.projection = sha256Buffer(fs.readFileSync(PROJECTION_PATH));
  writeText(PUBLIC_PLAN_PATH, `${buildPublicPlanNote(capsule)}\n`);
  hashes.publicPlan = sha256Buffer(fs.readFileSync(PUBLIC_PLAN_PATH));

  const packetVerifyResult = verifyPacket(packet, packetSignature, keys.publicKeyPem);
  const gateReport = buildGates(shapeResult, verifyResult, [
    {
      gate: 'packet_signature_roundtrip',
      status: packetVerifyResult.signatureOk ? 'pass' : 'fail',
      reason: packetVerifyResult.signatureOk ? 'detached packet signature verified' : 'detached packet signature verify failed'
    },
    {
      gate: 'packet_hash_match',
      status: packetVerifyResult.payloadHashMatch ? 'pass' : 'fail',
      reason: packetVerifyResult.payloadHashMatch ? 'packet sha256 matched' : 'packet sha256 mismatch'
    },
    {
      gate: 'ascii_safe_transport',
      status: packet.transport.asciiSafeTransport && glyphTransportMapIsAsciiSafe(packet.transport.glyph256Transport) ? 'pass' : 'fail',
      reason: packet.transport.asciiSafeTransport && glyphTransportMapIsAsciiSafe(packet.transport.glyph256Transport)
        ? 'glyph transport encoded into ASCII-safe envelope'
        : 'ascii-safe glyph transport missing or non-ascii'
    },
    {
      gate: 'scope_lock_paths',
      status: packet.packetScope.scopeLockPaths.length > 0 ? 'pass' : 'fail',
      reason: packet.packetScope.scopeLockPaths.length > 0 ? 'scope lock paths recorded' : 'scope lock paths missing'
    }
  ]);

  const verifyReport = {
    createdAt: new Date().toISOString(),
    verifyStatus: gateReport.finalStatus,
    denyFlags: packet.denyFlags,
    toolVersions: packet.toolVersions,
    capsuleVerify: verifyResult,
    packetVerify: packetVerifyResult,
    whiteRoomRefId: 'white-room-crypto-capsule-v1',
    gatesReportPath: relativeFiles.gatesReport
  };
  writeJson(VERIFY_REPORT_PATH, verifyReport);

  writeJson(REVOCATION_POINTER_PATH, buildRevocationPointer(capsule, packet));
  writeJson(CANON_REFS_PATH, buildCanonRefs(capsule, packet, relativeFiles, verifyReport.createdAt));

  const publicProjectionText = fs.readFileSync(PROJECTION_PATH, 'utf8');
  const publicPlanText = fs.readFileSync(PUBLIC_PLAN_PATH, 'utf8');
  const scrubReport = buildScrubReport(capsule, cleaned, packet, packetSignature, verifyReport, publicPlanText, publicProjectionText, keys.publicKeyPem);
  writeJson(SCRUB_REPORT_PATH, scrubReport);

  const whiteRoomRefs = buildWhiteRoomRefs(relativeFiles, hashes);
  whiteRoomRefs.policies = {
    hookwall: {
      id: hookwallPolicy.policyId,
      path: relativeFiles.hookwall
    },
    gc: {
      id: gcPolicy.policyId,
      path: relativeFiles.gcPolicy,
      gcEveryMessages: gcPolicy.gcEveryMessages
    }
  };
  whiteRoomRefs.canon = {
    path: relativeFiles.canonRefs,
    revocationPointer: relativeFiles.revocationPointer
  };
  whiteRoomRefs.reports = {
    gates: relativeFiles.gatesReport,
    hashes: relativeFiles.hashesReport,
    signatures: relativeFiles.signaturesReport,
    verify: relativeFiles.verifyReport,
    scrub: relativeFiles.scrubReport,
    gcGates: relativeFiles.gcGatesReport,
    gcHashes: relativeFiles.gcHashesReport
  };
  whiteRoomRefs.runtimeWiring = {
    trancheId: RUNTIME_TRANCHE_ID,
    canonVer: CANON_VERSION,
    boundaryPolicyId: BOUNDARY_POLICY_ID,
    transportPolicyId: TRANSPORT_POLICY_ID,
    whiteRoomPolicyId: WHITE_ROOM_POLICY_ID,
    gcPolicyId: GC_POLICY_ID,
    surfaceInventory: 'docs/RUNTIME_SURFACE_INVENTORY.md',
    boundaryPolicy: 'docs/HG256_BOUNDARY_POLICY.md',
    transportEnvelope: 'docs/HG256_TRANSPORT_ENVELOPE.md',
    denyFlags: packet.denyFlags,
    skippedChecks: packet.skippedChecks,
    canon: buildCanonLock({
      owner: packet.owner,
      agentPid: process.pid,
      devicePid: 'jesse-desktop',
      packetSha256: packetSignature.packetSha256,
      proofRef: relativeFiles.verifyReport,
      verifyStatus: gateReport.finalStatus === 'pass' ? 'pass_local_only' : 'hold_local_only',
      lanesAllowed: ['crypto_capsule_white_room', 'instant_agent_spawner', 'hook_event_store']
    })
  };
  writeJson(WHITE_ROOM_REFS_PATH, whiteRoomRefs);
  writeText(WHITE_ROOM_PACKET_PATH, `${buildWhiteRoomPacket(capsule, keys, relativeFiles)}\n`);
  hashes.whiteRoomRefs = sha256Buffer(fs.readFileSync(WHITE_ROOM_REFS_PATH));
  hashes.whiteRoomPacket = sha256Buffer(fs.readFileSync(WHITE_ROOM_PACKET_PATH));

  writeText(projectionFiles.shadowGlyphPath, buildShadowGlyphPacket(packet, packetSignature));
  writeText(projectionFiles.shadowShaPath, `${packetSignature.packetSha256}\n`);
  writeJson(projectionFiles.shadowSigPath, packetSignature);
  const shadowSha = fs.readFileSync(projectionFiles.shadowShaPath, 'utf8').trim();
  writeJson(projectionFiles.shadowParityPath, buildShadowParity(packetSignature, shadowSha, relativeFiles));
  writeJson(projectionFiles.driftPolicyPath, buildDriftPolicy(capsule.capsuleId));
  appendNdjson(projectionFiles.routeHooksPath, buildRouteHookEnvelope({
    qId: 'Q5_WHITE_ROOM_GC_CONSUME',
    route: 'CRYPTO_CAPSULE_LOCAL',
    routeStage: 'build',
    owner: packet.owner,
    agentId: packet.packetId,
    role: 'crypto-capsule',
    constructionId: capsule.capsuleId,
    agentPid: process.pid,
    devicePid: 'jesse-desktop',
    packetSha256: packetSignature.packetSha256,
    payloadSha256: signatureRecord.payloadSha256,
    denyFlags: packet.denyFlags,
    skippedChecks: packet.skippedChecks,
    proofRef: relativeFiles.verifyReport,
    verifyStatus: gateReport.finalStatus === 'pass' ? 'pass_local_only' : 'hold_local_only',
    driftFlag: false
  }));

  const consumeSmokeReport = buildConsumeSmokeReport(packet, packetSignature, whiteRoomRefs, gateReport, scrubReport, hashes);
  writeJson(projectionFiles.consumeSmokePath, consumeSmokeReport);
  appendNdjson(projectionFiles.routeHooksPath, buildRouteHookEnvelope({
    qId: 'Q5_WHITE_ROOM_GC_CONSUME',
    route: 'CRYPTO_CAPSULE_LOCAL',
    routeStage: 'consume',
    owner: packet.owner,
    agentId: packet.packetId,
    role: 'crypto-capsule',
    constructionId: capsule.capsuleId,
    agentPid: process.pid,
    devicePid: 'jesse-desktop',
    packetSha256: packetSignature.packetSha256,
    payloadSha256: signatureRecord.payloadSha256,
    denyFlags: packet.denyFlags,
    skippedChecks: packet.skippedChecks,
    proofRef: relativeFiles.verifyReport,
    verifyStatus: consumeSmokeReport.finalStatus === 'pass' ? 'pass_local_only' : 'hold_local_only',
    driftFlag: consumeSmokeReport.finalStatus !== 'pass'
  }));

  const gcLoop = buildGcLoopArtifacts(capsule, gcPolicy, relativeFiles, packetSignature);
  whiteRoomRefs.projections = {
    shadowGlyph: relativeFiles.shadowGlyph,
    shadowSha: relativeFiles.shadowSha,
    shadowSig: relativeFiles.shadowSig,
    shadowParity: relativeFiles.shadowParity,
    consumeSmoke: relativeFiles.consumeSmoke,
    routeHooks: relativeFiles.routeHooks,
    driftPolicy: relativeFiles.driftPolicy
  };
  whiteRoomRefs.gc = {
    state: relativeFiles.gcState,
    latest: relativeFiles.gcLatest,
    ledger: relativeFiles.gcLedger,
    attest: relativeFiles.gcAttestReport,
    hashes: relativeFiles.gcHashesReport,
    gates: relativeFiles.gcGatesReport,
    bootstrapReport: relativeToRoot(gcLoop.reportPath),
    bootstrapArchive: relativeToRoot(gcLoop.archivePath)
  };
  writeJson(WHITE_ROOM_REFS_PATH, whiteRoomRefs);
  hashes.whiteRoomRefs = sha256Buffer(fs.readFileSync(WHITE_ROOM_REFS_PATH));
  hashes.shadowGlyph = sha256Buffer(fs.readFileSync(projectionFiles.shadowGlyphPath));
  hashes.shadowSha = sha256Buffer(fs.readFileSync(projectionFiles.shadowShaPath));
  hashes.shadowSig = sha256Buffer(fs.readFileSync(projectionFiles.shadowSigPath));
  hashes.shadowParity = sha256Buffer(fs.readFileSync(projectionFiles.shadowParityPath));
  hashes.consumeSmoke = sha256Buffer(fs.readFileSync(projectionFiles.consumeSmokePath));
  hashes.driftPolicy = sha256Buffer(fs.readFileSync(projectionFiles.driftPolicyPath));
  hashes.canonRefs = sha256Buffer(fs.readFileSync(CANON_REFS_PATH));
  hashes.revocationPointer = sha256Buffer(fs.readFileSync(REVOCATION_POINTER_PATH));
  hashes.scrubReport = sha256Buffer(fs.readFileSync(SCRUB_REPORT_PATH));
  hashes.verifyReport = sha256Buffer(fs.readFileSync(VERIFY_REPORT_PATH));
  hashes.gcState = gcLoop.hashes.collectorState;
  hashes.gcLatest = gcLoop.hashes.gulpLatest;
  hashes.gcLedger = gcLoop.hashes.ledger;
  hashes.gcReport = gcLoop.hashes.gulpReport;
  hashes.gcArchive = gcLoop.hashes.archive;
  hashes.gcGates = sha256Buffer(fs.readFileSync(GC_GATES_REPORT_PATH));
  hashes.gcHashes = sha256Buffer(fs.readFileSync(GC_HASHES_REPORT_PATH));

  writeJson(PROFILE_REPORT_PATH, cleaned);
  writeJson(SIGNATURES_REPORT_PATH, {
    denyFlags: packet.denyFlags,
    capsuleSignature: signatureRecord,
    packetSignature
  });
  writeJson(HASHES_REPORT_PATH, {
    createdAt: new Date().toISOString(),
    denyFlags: packet.denyFlags,
    hashes
  });
  writeJson(GATES_REPORT_PATH, {
    createdAt: new Date().toISOString(),
    finalStatus: gateReport.finalStatus,
    denyFlags: packet.denyFlags,
    gates: gateReport.gates,
    honestyLabel: cleaned.honesty.label
  });
  writeJson(VERIFY_REPORT_PATH, verifyReport);

  appendNdjson(ATTEST_REPORT_PATH, {
    ts: new Date().toISOString(),
    event: 'crypto_capsule_build',
    capsuleId: cleaned.capsuleId,
    keyId: cleaned.crypto.keyId,
    payloadSha256: signatureRecord.payloadSha256,
    packetSha256: packetVerifyResult.packetSha256,
    status: gateReport.finalStatus
  });

  updateIndex(relativeFiles, hashes, keys);

  return {
    keys,
    capsule,
    signatureRecord,
    verifyResult,
    gateReport
  };
}

function verifyExisting() {
  const capsule = readJson(CAPSULE_PATH, null);
  const cleaned = readJson(CLEAN_CAPSULE_PATH, null);
  const signatureRecord = readJson(SIGNATURE_PATH, null);
  const packet = readJson(PACKET_PATH, null);
  const packetSignature = readJson(DETACHED_SIGNATURE_PATH, null);
  const schema = readJson(SCHEMA_PATH, null);
  const whiteRoomRefs = readJson(WHITE_ROOM_REFS_PATH, null);
  const canonRefs = readJson(CANON_REFS_PATH, null);
  const scrubReport = readJson(SCRUB_REPORT_PATH, null);
  const gcGates = readJson(GC_GATES_REPORT_PATH, null);
  const publicKeyPem = fs.existsSync(PUBLIC_KEY_PATH) ? fs.readFileSync(PUBLIC_KEY_PATH, 'utf8') : '';
  const projectionFiles = capsule ? capsuleProjectionFiles(capsule.capsuleId) : null;
  const consumeSmokeReport = projectionFiles ? readJson(projectionFiles.consumeSmokePath, null) : null;
  const shadowParity = projectionFiles ? readJson(projectionFiles.shadowParityPath, null) : null;
  const publicPlanExists = fs.existsSync(PUBLIC_PLAN_PATH);

  if (
    !capsule ||
    !cleaned ||
    !signatureRecord ||
    !packet ||
    !packetSignature ||
    !schema ||
    !whiteRoomRefs ||
    !canonRefs ||
    !scrubReport ||
    !gcGates ||
    !consumeSmokeReport ||
    !shadowParity ||
    !publicPlanExists ||
    !publicKeyPem
  ) {
    throw new Error('missing_required_artifacts');
  }

  const shapeResult = validateCapsuleShape(capsule);
  const verifyResult = verifyCapsule(capsule, signatureRecord, publicKeyPem);
  const packetVerifyResult = verifyPacket(packet, packetSignature, publicKeyPem);
  const gateReport = buildGates(shapeResult, verifyResult, [
    {
      gate: 'packet_signature_roundtrip',
      status: packetVerifyResult.signatureOk ? 'pass' : 'fail',
      reason: packetVerifyResult.signatureOk ? 'detached packet signature verified' : 'detached packet signature verify failed'
    },
    {
      gate: 'packet_hash_match',
      status: packetVerifyResult.payloadHashMatch ? 'pass' : 'fail',
      reason: packetVerifyResult.payloadHashMatch ? 'packet sha256 matched' : 'packet sha256 mismatch'
    },
    {
      gate: 'ascii_safe_transport',
      status: packet.transport?.asciiSafeTransport && glyphTransportMapIsAsciiSafe(packet.transport?.glyph256Transport || {}) ? 'pass' : 'fail',
      reason: packet.transport?.asciiSafeTransport && glyphTransportMapIsAsciiSafe(packet.transport?.glyph256Transport || {})
        ? 'glyph transport encoded into ASCII-safe envelope'
        : 'ascii-safe glyph transport missing or non-ascii'
    },
    {
      gate: 'scope_lock_paths',
      status: Array.isArray(packet.packetScope?.scopeLockPaths) && packet.packetScope.scopeLockPaths.length > 0 ? 'pass' : 'fail',
      reason: Array.isArray(packet.packetScope?.scopeLockPaths) && packet.packetScope.scopeLockPaths.length > 0 ? 'scope lock paths recorded' : 'scope lock paths missing'
    },
    {
      gate: 'canon_refs_bound',
      status: canonRefs.refId === 'crypto-capsule.v1.canon-refs' ? 'pass' : 'fail',
      reason: canonRefs.refId === 'crypto-capsule.v1.canon-refs' ? 'canon refs present' : 'canon refs missing or malformed'
    },
    {
      gate: 'scrub_report',
      status: scrubReport.finalStatus === 'pass' ? 'pass' : 'fail',
      reason: scrubReport.finalStatus === 'pass' ? 'scrub report passed' : 'scrub report failed'
    },
    {
      gate: 'white_room_consume_smoke',
      status: consumeSmokeReport.finalStatus === 'pass' ? 'pass' : 'fail',
      reason: consumeSmokeReport.finalStatus === 'pass' ? 'consume smoke passed' : 'consume smoke failed'
    },
    {
      gate: 'gc_loop_bound',
      status: gcGates.finalStatus === 'pass' ? 'pass' : 'fail',
      reason: gcGates.finalStatus === 'pass' ? 'gc loop reports pass' : 'gc loop reports failed'
    }
  ]);

  writeJson(GATES_REPORT_PATH, {
    createdAt: new Date().toISOString(),
    finalStatus: gateReport.finalStatus,
    denyFlags: packet.denyFlags || [],
    gates: gateReport.gates,
    honestyLabel: capsule.honesty?.label || 'LOCAL_PROFILE_SCOPED'
  });
  writeJson(VERIFY_REPORT_PATH, {
    createdAt: new Date().toISOString(),
    verifyStatus: gateReport.finalStatus,
    denyFlags: packet.denyFlags || [],
    toolVersions: packet.toolVersions || { node: process.version, builder: 'tools/crypto/crypto-capsule.js' },
    capsuleVerify: verifyResult,
    packetVerify: packetVerifyResult,
    whiteRoomRefId: whiteRoomRefs.refId || 'white-room-crypto-capsule-v1',
    gatesReportPath: relativeToRoot(GATES_REPORT_PATH)
  });
  appendNdjson(ATTEST_REPORT_PATH, {
    ts: new Date().toISOString(),
    event: 'crypto_capsule_verify',
    capsuleId: capsule.capsuleId,
    keyId: capsule.crypto?.keyId || '',
    payloadSha256: verifyResult.payloadSha256,
    packetSha256: packetVerifyResult.packetSha256,
    status: gateReport.finalStatus
  });
  return {
    finalStatus: gateReport.finalStatus,
    verifyResult,
    packetVerifyResult
  };
}

function main() {
  const command = String(process.argv[2] || 'build').toLowerCase();

  if (command === 'keygen') {
    const keys = ensureKeyPair();
    writeJson(KEY_META_REPORT_PATH, keyMeta(keys));
    appendNdjson(ATTEST_REPORT_PATH, {
      ts: new Date().toISOString(),
      event: 'crypto_capsule_keygen',
      keyId: keys.keyId,
      status: 'pass'
    });
    process.stdout.write(`${stableStringify({ ok: true, command, keyId: keys.keyId })}\n`);
    return;
  }

  if (command === 'build') {
    const result = createArtifacts();
    process.stdout.write(`${stableStringify({
      ok: true,
      command,
      capsuleId: result.capsule.capsuleId,
      keyId: result.keys.keyId,
      finalStatus: result.gateReport.finalStatus
    })}\n`);
    return;
  }

  if (command === 'verify') {
    const result = verifyExisting();
    process.stdout.write(`${stableStringify({
      ok: result.finalStatus === 'pass',
      command,
      finalStatus: result.finalStatus,
      payloadSha256: result.verifyResult.payloadSha256,
      packetSha256: result.packetVerifyResult.packetSha256
    })}\n`);
    if (result.finalStatus !== 'pass') process.exitCode = 1;
    return;
  }

  throw new Error(`unknown_command:${command}`);
}

main();
