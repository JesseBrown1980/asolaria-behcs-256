// Smoke tests for @asolaria/whiteroom-consumer
// Target: node tests/smoke.test.mjs => exit 0 on success.

import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WhiteroomConsumer,
  isWhiteroomEnvelope,
  deriveCubeAddress,
  buildDigestionEnvelope,
  loadState,
  saveState,
} from '../src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_STATE = resolve(__dirname, '..', 'tmp', 'whiteroom-consumer.smoke.state.json');
mkdirSync(dirname(TMP_STATE), { recursive: true });
if (existsSync(TMP_STATE)) rmSync(TMP_STATE);

let passed = 0;
let failed = 0;

async function t(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    console.error('  FAIL ' + name + ' -> ' + (e?.stack || e?.message || e));
  }
}

await (async () => {
  // 1
  await t('detects room:whiteroom via body.tags', () => {
    const env = { verb: 'EVT-PATTERN-SHADOW', body: { tags: ['room:whiteroom', 'other'] } };
    assert.equal(isWhiteroomEnvelope(env), true);
  });

  // 2
  await t('detects room:whiteroom via body.room', () => {
    const env = { verb: 'EVT-PATTERN', body: { room: 'whiteroom' } };
    assert.equal(isWhiteroomEnvelope(env), true);
  });

  // 3
  await t('detects EVT-WHITEROOM- verb prefix', () => {
    const env = { verb: 'EVT-WHITEROOM-MUSCULO-HIT', body: {} };
    assert.equal(isWhiteroomEnvelope(env), true);
  });

  // 4
  await t('rejects unrelated envelope', () => {
    const env = { verb: 'EVT-HEARTBEAT', body: { tags: ['room:other'] } };
    assert.equal(isWhiteroomEnvelope(env), false);
  });

  // 5
  await t('rejects null/non-object/empty envelopes', () => {
    assert.equal(isWhiteroomEnvelope(null), false);
    assert.equal(isWhiteroomEnvelope('hi'), false);
    assert.equal(isWhiteroomEnvelope({}), false);
  });

  // 6
  await t('cube address is deterministic for same payload', () => {
    const payload = { pattern: 'musculo.spindle.overshoot', amp: 0.73, loc: 'P1-Q' };
    const a = deriveCubeAddress(payload);
    const b = deriveCubeAddress(payload);
    assert.equal(a.pattern_sha, b.pattern_sha);
    assert.deepEqual(a.cube_address, b.cube_address);
  });

  // 7
  await t('cube address shape and bounds (3x6x6)', () => {
    const { cube_address, pattern_sha } = deriveCubeAddress({ foo: 'bar' });
    assert.equal(cube_address.length, 3);
    assert.ok(Number.isInteger(cube_address[0]) && cube_address[0] >= 0 && cube_address[0] < 3);
    assert.ok(Number.isInteger(cube_address[1]) && cube_address[1] >= 0 && cube_address[1] < 6);
    assert.ok(Number.isInteger(cube_address[2]) && cube_address[2] >= 0 && cube_address[2] < 6);
    assert.equal(typeof pattern_sha, 'string');
    assert.equal(pattern_sha.length, 64);
  });

  // 8
  await t('cube address diverges across distinct payloads', () => {
    const p1 = deriveCubeAddress({ a: 1 });
    const p2 = deriveCubeAddress({ a: 2 });
    assert.notEqual(p1.pattern_sha, p2.pattern_sha);
  });

  // 9
  await t('digestion envelope has required fields', () => {
    const src = {
      id: 'src-123',
      verb: 'EVT-PATTERN-SHADOW',
      body: { tags: ['room:whiteroom'], pattern: { kind: 'musculo', sig: 'abc' } },
    };
    const out = buildDigestionEnvelope(src, '2026-04-19T12:00:00.000Z');
    assert.equal(out.verb, 'EVT-WHITEROOM-DIGESTED');
    assert.equal(out.actor, 'acer');
    assert.equal(out.target, 'liris');
    assert.equal(out.body.source_envelope_id, 'src-123');
    assert.equal(out.body.source_verb, 'EVT-PATTERN-SHADOW');
    assert.equal(out.body.acer_cosign_append, true);
    assert.equal(out.body.digested_at, '2026-04-19T12:00:00.000Z');
    assert.equal(out.body.room, 'whiteroom');
    assert.ok(Array.isArray(out.body.cube_address) && out.body.cube_address.length === 3);
    assert.equal(typeof out.body.pattern_sha, 'string');
    assert.equal(out.body.pattern_sha.length, 64);
  });

  // 10
  await t('digestion envelope tags include room:whiteroom + digested', () => {
    const out = buildDigestionEnvelope({ verb: 'EVT-WHITEROOM-X', body: {} });
    assert.ok(out.body.tags.includes('room:whiteroom'));
    assert.ok(out.body.tags.includes('digested'));
  });

  // 11
  await t('state save/load round-trip', () => {
    const state = { last_ts: '2026-04-19T00:00:00Z', processed_ids: ['a', 'b'], digested_count: 5 };
    saveState(state, TMP_STATE);
    const loaded = loadState(TMP_STATE);
    assert.equal(loaded.last_ts, state.last_ts);
    assert.deepEqual(loaded.processed_ids, state.processed_ids);
    assert.equal(loaded.digested_count, 5);
  });

  // 12
  await t('loadState returns defaults when file missing', () => {
    if (existsSync(TMP_STATE)) rmSync(TMP_STATE);
    const s = loadState(TMP_STATE);
    assert.equal(s.last_ts, null);
    assert.deepEqual(s.processed_ids, []);
    assert.equal(s.digested_count, 0);
  });

  // 13
  await t('consumer tick: polls, filters whiteroom only, persists state', async () => {
    if (existsSync(TMP_STATE)) rmSync(TMP_STATE);
    const whiteroomMsg = {
      id: 'wr-1',
      verb: 'EVT-PATTERN-SHADOW',
      body: { tags: ['room:whiteroom'], pattern: { x: 1 } },
      ts: '2026-04-19T10:00:00Z',
    };
    const nonMsg = {
      id: 'noise-1',
      verb: 'EVT-HEARTBEAT',
      body: { tags: ['room:other'] },
      ts: '2026-04-19T10:01:00Z',
    };
    const sent = [];
    const mockFetch = async (url, init) => {
      if (!init) {
        return { ok: true, async json() { return { messages: [whiteroomMsg, nonMsg] }; } };
      }
      sent.push({ url, body: JSON.parse(init.body) });
      return { ok: true };
    };
    const c = new WhiteroomConsumer({
      busUrl: 'http://x/send',
      pollUrl: 'http://x/inbox',
      statePath: TMP_STATE,
      fetchFn: mockFetch,
      logger: { log() {}, warn() {}, error() {} },
    });
    await c._tick();
    assert.equal(sent.length, 1, 'should have sent exactly 1 digestion');
    assert.equal(sent[0].body.verb, 'EVT-WHITEROOM-DIGESTED');
    assert.equal(sent[0].body.body.source_envelope_id, 'wr-1');
    const state = loadState(TMP_STATE);
    assert.equal(state.digested_count, 1);
    assert.ok(state.processed_ids.includes('wr-1'));
  });

  // 14
  await t('consumer dedups envelopes by id across ticks', async () => {
    if (existsSync(TMP_STATE)) rmSync(TMP_STATE);
    const msg = {
      id: 'dup-1',
      verb: 'EVT-WHITEROOM-X',
      body: { pattern: { k: 'v' } },
      ts: '2026-04-19T11:00:00Z',
    };
    const sent = [];
    const mockFetch = async (url, init) => {
      if (!init) return { ok: true, async json() { return { messages: [msg] }; } };
      sent.push(JSON.parse(init.body));
      return { ok: true };
    };
    const c = new WhiteroomConsumer({
      busUrl: 'http://x/send',
      pollUrl: 'http://x/inbox',
      statePath: TMP_STATE,
      fetchFn: mockFetch,
      logger: { log() {}, warn() {}, error() {} },
    });
    await c._tick();
    await c._tick();
    assert.equal(sent.length, 1, 'second tick should skip already-processed id');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (existsSync(TMP_STATE)) rmSync(TMP_STATE);
  process.exit(failed === 0 ? 0 : 1);
})();
