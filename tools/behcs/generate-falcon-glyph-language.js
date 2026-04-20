#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BEHCS_DIR = path.join(ROOT, 'data', 'behcs');
const CODEX_DIR = path.join(BEHCS_DIR, 'codex');
const OUTPUT_DIR = path.join(CODEX_DIR, 'glyph-language');
const FALCON_PROFILE_PATH = path.join(ROOT, 'sovereignty', 'ix', 'grammar', 'profiles', 'falcon-phone.json');
const bridge = require('./codex-bridge');

const SPEC_ID = 'IX-769';
const PLAN_ID = 'IX-770';
const TABLE_ID = 'behcs.falcon.hotpath.32.v1';
const ENVELOPE_ID = 'behcs.transport.falcon.v1';
const BOOTSTRAP_PACKET_ID = 'behcs.bootstrap.falcon.v1';

const SUPPORT_PLAN_ANCHORS = Object.freeze({
  26: 'OMNIDIRECTIONAL',
  31: 'SHADOW_MIRROR',
  34: 'CROSS_COLONY',
  35: 'HYPERLANGUAGE',
  38: 'ENCRYPTION',
  44: 'HEARTBEAT'
});

const HOTPATH_TUPLES = Object.freeze([
  { dimensionId: 1, value: 'falcon', role: 'actor', reason: 'bootstrap device actor' },
  { dimensionId: 1, value: 'asolaria', role: 'actor', reason: 'primary sovereign receiver' },
  { dimensionId: 1, value: 'gaia', role: 'actor', reason: 'colony orchestration actor' },
  { dimensionId: 1, value: 'helm', role: 'actor', reason: 'admin terminal actor' },
  { dimensionId: 2, value: 'heartbeat', role: 'verb', reason: 'liveness pulse action' },
  { dimensionId: 2, value: 'relay', role: 'verb', reason: 'bus relay action' },
  { dimensionId: 2, value: 'type', role: 'verb', reason: 'mirror typing action' },
  { dimensionId: 2, value: 'ack', role: 'verb', reason: 'round-trip acknowledgement action' },
  { dimensionId: 3, value: 'asolaria', role: 'target', reason: 'primary sovereign target' },
  { dimensionId: 3, value: 'falcon', role: 'target', reason: 'bootstrap phone target' },
  { dimensionId: 3, value: 'behcs_bus', role: 'target', reason: 'bus transport target' },
  { dimensionId: 11, value: 'screen', role: 'proof', reason: 'visual verification proof' },
  { dimensionId: 11, value: 'log', role: 'proof', reason: 'text log proof' },
  { dimensionId: 24, value: 'bootstrap', role: 'intent', reason: 'bootstrap packet intent' },
  { dimensionId: 24, value: 'operational', role: 'intent', reason: 'live lane intent' },
  { dimensionId: 15, value: 'sm-s721u1', role: 'device', reason: 'Falcon hardware identifier' },
  { dimensionId: 15, value: 'acer_host', role: 'device', reason: 'Acer host identifier' },
  { dimensionId: 22, value: 'tuple', role: 'translation', reason: 'full tuple fallback mode' },
  { dimensionId: 22, value: 'glyph', role: 'translation', reason: 'glyph transport mode' },
  { dimensionId: 7, value: 'ready', role: 'state', reason: 'healthy ready state' },
  { dimensionId: 7, value: 'retry', role: 'state', reason: 'requeue retry state' },
  { dimensionId: 7, value: 'roundtrip_verified', role: 'state', reason: 'verified round-trip state' },
  { dimensionId: 6, value: 'hookwall_gnn_shannon', role: 'gate', reason: 'required gate chain' },
  { dimensionId: 13, value: 'phone_mirror', role: 'surface', reason: 'Falcon proving surface' },
  { dimensionId: 5, value: 'bridge', role: 'layer', reason: 'bridge lane layer' },
  { dimensionId: 4, value: 'low', role: 'risk', reason: 'default safe bootstrap risk' },
  { dimensionId: 26, value: 'omnidirectional', role: 'support', reason: 'IX-769/770 support anchor' },
  { dimensionId: 31, value: 'shadow_mirror', role: 'support', reason: 'IX-769/770 support anchor' },
  { dimensionId: 34, value: 'cross_colony', role: 'support', reason: 'IX-769/770 support anchor' },
  { dimensionId: 35, value: 'hyperlanguage', role: 'support', reason: 'IX-769/770 support anchor' },
  { dimensionId: 38, value: 'encryption', role: 'support', reason: 'IX-769/770 support anchor' },
  { dimensionId: 44, value: 'heartbeat', role: 'support', reason: 'IX-769/770 support anchor' }
]);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function tupleKey(dimensionId, value) {
  return `D${dimensionId}:${normalizeValue(value)}`;
}

function buildConflictRecord(dimensionId) {
  const catalogName = String(bridge.catalogByD[dimensionId]?.name || '').trim();
  const planAnchorName = String(SUPPORT_PLAN_ANCHORS[dimensionId] || '').trim();
  if (!planAnchorName || !catalogName || planAnchorName === catalogName) {
    return null;
  }
  return {
    dimensionId,
    catalogName,
    planAnchorName,
    status: 'conflict',
    note: 'Task/plan anchor name differs from the current BEHCS codex catalog label on disk.'
  };
}

function buildEntry(tuple, index) {
  const dimensionId = Number(tuple.dimensionId);
  const catalogName = String(bridge.catalogByD[dimensionId]?.name || `D${dimensionId}`).trim();
  const normalized = normalizeValue(tuple.value);
  const key = tupleKey(dimensionId, tuple.value);
  const glyph = bridge.hilbertAddress(key);
  const planAnchorName = SUPPORT_PLAN_ANCHORS[dimensionId] || null;
  const conflict = planAnchorName && planAnchorName !== catalogName
    ? buildConflictRecord(dimensionId)
    : null;
  return {
    entryId: `g${String(index + 1).padStart(2, '0')}`,
    index: index + 1,
    dimensionId,
    catalogDimensionName: catalogName,
    planAnchorName,
    value: String(tuple.value),
    normalizedValue: normalized,
    tupleKey: key,
    glyph,
    glyphWidth: glyph.length,
    role: tuple.role,
    reason: tuple.reason,
    status: 'draft_hot_path',
    derivation: {
      ruleId: 'behcs_tuple_v1',
      source: '(dimensionId, normalizedValue)',
      template: 'D{dimensionId}:{normalizedValue}',
      hash: 'sha256',
      addressWidth: bridge.alphabet.canonical_width
    },
    conflict
  };
}

function buildSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'behcs.glyph_table.schema.v1',
    title: 'BEHCS Glyph Table Schema V1',
    description: 'Machine-readable schema for deterministic BEHCS glyph tables derived from (dimensionId, value) pairs.',
    type: 'object',
    required: [
      'tableId',
      'spec',
      'plan',
      'version',
      'status',
      'generatedAt',
      'alphabet',
      'derivation',
      'promotion',
      'entries'
    ],
    properties: {
      tableId: { type: 'string' },
      spec: { type: 'string' },
      plan: { type: 'string' },
      version: { type: 'integer', minimum: 1 },
      status: { type: 'string' },
      generatedAt: { type: 'string' },
      alphabet: {
        type: 'object',
        required: ['spec', 'base', 'canonicalWidth'],
        properties: {
          spec: { type: 'string' },
          base: { type: 'integer', minimum: 2 },
          canonicalWidth: { type: 'integer', minimum: 1 }
        }
      },
      derivation: {
        type: 'object',
        required: ['ruleId', 'input', 'template', 'hash', 'addressWidth'],
        properties: {
          ruleId: { type: 'string' },
          input: { type: 'string' },
          template: { type: 'string' },
          hash: { type: 'string' },
          addressWidth: { type: 'integer', minimum: 1 }
        }
      },
      promotion: {
        type: 'object',
        required: ['bootstrapTranche', 'promotionGate'],
        properties: {
          bootstrapTranche: { type: 'integer', minimum: 1 },
          promotionGate: { type: 'string' }
        }
      },
      conflicts: {
        type: 'array',
        items: {
          type: 'object',
          required: ['dimensionId', 'catalogName', 'planAnchorName', 'status'],
          properties: {
            dimensionId: { type: 'integer', minimum: 1 },
            catalogName: { type: 'string' },
            planAnchorName: { type: 'string' },
            status: { type: 'string' },
            note: { type: 'string' }
          }
        }
      },
      entries: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: [
            'entryId',
            'index',
            'dimensionId',
            'catalogDimensionName',
            'value',
            'normalizedValue',
            'tupleKey',
            'glyph',
            'glyphWidth',
            'role',
            'status',
            'derivation'
          ],
          properties: {
            entryId: { type: 'string' },
            index: { type: 'integer', minimum: 1 },
            dimensionId: { type: 'integer', minimum: 1 },
            catalogDimensionName: { type: 'string' },
            planAnchorName: { type: ['string', 'null'] },
            value: { type: 'string' },
            normalizedValue: { type: 'string' },
            tupleKey: { type: 'string' },
            glyph: { type: 'string' },
            glyphWidth: { type: 'integer', minimum: 1 },
            role: { type: 'string' },
            reason: { type: 'string' },
            status: { type: 'string' },
            derivation: { type: 'object' },
            conflict: { type: ['object', 'null'] }
          }
        }
      }
    }
  };
}

function buildGlyphTable(entries, generatedAt) {
  const conflicts = entries
    .map((entry) => entry.conflict)
    .filter(Boolean)
    .reduce((acc, item) => {
      if (!acc.some((existing) => existing.dimensionId === item.dimensionId)) {
        acc.push(item);
      }
      return acc;
    }, []);
  const status = conflicts.length > 0 ? 'draft_conflict_annotated' : 'draft_bootstrap_ready';

  return {
    $schema: './schema.v1.json',
    tableId: TABLE_ID,
    spec: SPEC_ID,
    plan: PLAN_ID,
    version: 1,
    status,
    generatedAt,
    alphabet: {
      spec: String(bridge.alphabet.spec || 'IX-700'),
      base: Number(bridge.alphabet.base || 256),
      canonicalWidth: Number(bridge.alphabet.canonical_width || 8)
    },
    derivation: {
      ruleId: 'behcs_tuple_v1',
      input: '(dimensionId, normalizedValue)',
      template: 'D{dimensionId}:{normalizedValue}',
      hash: 'sha256',
      addressWidth: Number(bridge.alphabet.canonical_width || 8)
    },
    promotion: {
      bootstrapTranche: 32,
      promotionGate: 'Falcon and Acer must round-trip the tranche without semantic drift before any expansion toward 256 entries.'
    },
    conflicts,
    entries
  };
}

function buildTransportEnvelope(table, generatedAt) {
  const status = table.conflicts.length > 0 ? 'draft_conflict_annotated' : 'draft_bootstrap_ready';
  return {
    envelopeId: ENVELOPE_ID,
    spec: SPEC_ID,
    plan: PLAN_ID,
    version: 1,
    status,
    generatedAt,
    tableRef: table.tableId,
    transportModes: ['real', 'shadow', 'stealth'],
    wireFormat: {
      canonical: 'json_object',
      mirrorSafe: true,
      busSafe: true,
      rationale: 'Avoid raw delimiter parsing because the base-256 alphabet includes common separator characters.'
    },
    fields: [
      { key: 'packetId', required: true, type: 'string' },
      { key: 'mode', required: true, type: 'enum', values: ['real', 'shadow', 'stealth'] },
      { key: 'actor', required: true, type: 'glyph_entry_ref' },
      { key: 'verb', required: true, type: 'glyph_entry_ref' },
      { key: 'target', required: true, type: 'glyph_entry_ref' },
      { key: 'state', required: true, type: 'glyph_entry_ref' },
      { key: 'proof', required: true, type: 'glyph_entry_ref' },
      { key: 'intent', required: true, type: 'glyph_entry_ref' },
      { key: 'support', required: true, type: 'object' },
      { key: 'payload', required: true, type: 'object' },
      { key: 'fallbackTuples', required: true, type: 'array' }
    ],
    fallbackRule: {
      unknownGlyph: 'Preserve the raw glyph, append its tuple candidate into fallbackTuples, and do not collapse the original field.',
      unknownTuple: 'Transmit the full tupleKey plus raw value without assigning a draft glyph.',
      receiverBehavior: 'Receivers must prefer glyph entries when known and tuple fallbacks when unknown.'
    },
    escaping: {
      json: 'UTF-8 JSON serialization with stable key order for mirror typing and bus relay.',
      rawGlyphString: 'Optional only; never authoritative without the JSON envelope.'
    },
    conflicts: table.conflicts
  };
}

function buildBootstrapPacket(table, envelope, falconProfile, generatedAt) {
  const byTupleKey = new Map(table.entries.map((entry) => [entry.tupleKey, entry]));
  const status = table.conflicts.length > 0 ? 'draft_conflict_annotated' : 'draft_bootstrap_ready';
  const getEntry = (dimensionId, value) => {
    const entry = byTupleKey.get(tupleKey(dimensionId, value));
    if (!entry) {
      throw new Error(`Missing glyph entry for D${dimensionId}:${value}`);
    }
    return entry;
  };

  const packet = {
    packetId: BOOTSTRAP_PACKET_ID,
    spec: SPEC_ID,
    plan: PLAN_ID,
    version: 1,
    status,
    generatedAt,
    tableRef: table.tableId,
    envelopeRef: envelope.envelopeId,
    source: {
      profileId: falconProfile.profileId,
      agentName: falconProfile.agentName,
      role: falconProfile.role,
      deviceModel: falconProfile.D15_device?.model || '',
      serial: falconProfile.D15_device?.serial || '',
      locationIp: falconProfile.D19_location?.ip || '',
      timezone: falconProfile.D20_time?.timezone || ''
    },
    route: {
      actor: getEntry(1, 'falcon'),
      verb: getEntry(2, 'heartbeat'),
      target: getEntry(3, 'asolaria'),
      state: getEntry(7, 'roundtrip_verified')
    },
    payload: {
      proof: getEntry(11, 'screen'),
      intent: getEntry(24, 'bootstrap'),
      device: getEntry(15, 'sm-s721u1'),
      translation: getEntry(22, 'glyph'),
      surface: getEntry(13, 'phone_mirror'),
      gate: getEntry(6, 'hookwall_gnn_shannon'),
      layer: getEntry(5, 'bridge'),
      risk: getEntry(4, 'low')
    },
    support: {
      D26: getEntry(26, 'omnidirectional'),
      D31: getEntry(31, 'shadow_mirror'),
      D34: getEntry(34, 'cross_colony'),
      D35: getEntry(35, 'hyperlanguage'),
      D38: getEntry(38, 'encryption'),
      D44: getEntry(44, 'heartbeat')
    },
    fallbackTuples: [],
    roundTripProof: {
      required: true,
      expectedUnknownGlyphs: 0,
      verifier: 'Falcon and Acer must compare glyph refs plus tuple fallback arrays.',
      successStateTuple: getEntry(7, 'roundtrip_verified').tupleKey
    }
  };

  const wireJson = {
    packetId: packet.packetId,
    mode: 'real',
    tableRef: packet.tableRef,
    envelopeRef: packet.envelopeRef,
    actor: packet.route.actor.glyph,
    verb: packet.route.verb.glyph,
    target: packet.route.target.glyph,
    state: packet.route.state.glyph,
    proof: packet.payload.proof.glyph,
    intent: packet.payload.intent.glyph,
    device: packet.payload.device.glyph,
    translation: packet.payload.translation.glyph,
    surface: packet.payload.surface.glyph,
    gate: packet.payload.gate.glyph,
    layer: packet.payload.layer.glyph,
    risk: packet.payload.risk.glyph,
    support: Object.fromEntries(
      Object.entries(packet.support).map(([key, entry]) => [key, entry.glyph])
    ),
    fallbackTuples: packet.fallbackTuples
  };

  packet.wire = {
    json: wireJson,
    compactMirrorText: JSON.stringify(wireJson)
  };

  return packet;
}

function main() {
  ensureDir(OUTPUT_DIR);
  const generatedAt = nowIso();
  const falconProfile = readJson(FALCON_PROFILE_PATH);
  const entries = HOTPATH_TUPLES.map(buildEntry);
  const schema = buildSchema();
  const table = buildGlyphTable(entries, generatedAt);
  const envelope = buildTransportEnvelope(table, generatedAt);
  const bootstrap = buildBootstrapPacket(table, envelope, falconProfile, generatedAt);

  writeJson(path.join(OUTPUT_DIR, 'schema.v1.json'), schema);
  writeJson(path.join(OUTPUT_DIR, 'falcon-hotpath-32.v1.json'), table);
  writeJson(path.join(OUTPUT_DIR, 'transport-envelope.v1.json'), envelope);
  writeJson(path.join(OUTPUT_DIR, 'falcon-bootstrap-packet.v1.json'), bootstrap);

  console.log(JSON.stringify({
    ok: true,
    generatedAt,
    outputDir: OUTPUT_DIR,
    files: [
      'schema.v1.json',
      'falcon-hotpath-32.v1.json',
      'transport-envelope.v1.json',
      'falcon-bootstrap-packet.v1.json'
    ],
    conflictCount: table.conflicts.length,
    tableId: table.tableId
  }, null, 2));
}

main();
