// @asolaria/whiteroom-consumer — WhiteroomConsumer
// Acer mirror for Liris's room:whiteroom shadow envelopes.
// Pulls from BEHCS inbox, decomposes pattern payloads into 3x6x6 cube
// addresses via sha256 slices, and emits EVT-WHITEROOM-DIGESTED.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE_PATH = resolve(__dirname, '..', 'tmp', 'whiteroom-consumer.state.json');

const DEFAULT_BUS = 'http://127.0.0.1:4947/behcs/send';
const DEFAULT_POLL = 'http://127.0.0.1:4947/behcs/inbox';
const POLL_INTERVAL_MS = 10_000;
const CUBE_LAYERS = 3;
const CUBE_AXIS = 6;

/**
 * Does this envelope belong to the whiteroom?
 * Rules:
 *   - body.tags array contains "room:whiteroom"
 *   - body.room === "whiteroom"
 *   - verb starts with "EVT-WHITEROOM-"
 */
export function isWhiteroomEnvelope(env) {
  if (!env || typeof env !== 'object') return false;
  const verb = env.verb || env.v || '';
  const body = env.body || env.payload || {};
  // FEEDBACK-LOOP GUARD: never re-ingest consumer-side output (our own digestion
  // or mirror-online announce). This is the fix for the 47-msg/2s spam storm.
  if (typeof verb === 'string') {
    if (verb === 'EVT-WHITEROOM-DIGESTED' || verb.startsWith('EVT-WHITEROOM-DIGESTED-')) return false;
    if (verb === 'EVT-WHITEROOM-CONSUMER-ONLINE') return false;
    if (verb === 'EVT-WAVE-MUSCULO-ACER-MIRROR-ONLINE') return false;
  }
  if (body && typeof body === 'object') {
    if (body.source === 'consumer') return false;
    if (Array.isArray(body.tags) && body.tags.includes('source:consumer')) return false;
  }
  // Accept: producer-side whiteroom envelopes (verb prefix OR body.room OR body.tags).
  if (typeof verb === 'string' && verb.startsWith('EVT-WHITEROOM-')) return true;
  if (body && typeof body === 'object') {
    if (body.room === 'whiteroom') return true;
    if (Array.isArray(body.tags) && body.tags.includes('room:whiteroom')) return true;
  }
  return false;
}

/**
 * Derive a deterministic cube address [layer, axis1, axis2] from a pattern.
 * Algorithm (per spec):
 *   sha256 the pattern payload (stable stringify)
 *   first 3 hex chars  -> layer  = parseInt(slice,16) % 3
 *   next  1 hex char   -> axis1  = parseInt(slice,16) % 6
 *   next  1 hex char   -> axis2  = parseInt(slice,16) % 6
 * Returns { pattern_sha, cube_address: [layer, axis1, axis2] }
 */
export function deriveCubeAddress(patternPayload) {
  const norm = stableStringify(patternPayload);
  const patternSha = createHash('sha256').update(norm).digest('hex');
  const layer = parseInt(patternSha.slice(0, 3), 16) % CUBE_LAYERS;
  const axis1 = parseInt(patternSha.slice(3, 4), 16) % CUBE_AXIS;
  const axis2 = parseInt(patternSha.slice(4, 5), 16) % CUBE_AXIS;
  return { pattern_sha: patternSha, cube_address: [layer, axis1, axis2] };
}

/**
 * Build an EVT-WHITEROOM-DIGESTED envelope ready for the bus.
 */
export function buildDigestionEnvelope(sourceEnv, nowIso = new Date().toISOString()) {
  const body = sourceEnv?.body || sourceEnv?.payload || {};
  const patternPayload = body.pattern ?? body.payload ?? body;
  const { pattern_sha, cube_address } = deriveCubeAddress(patternPayload);
  const sourceId =
    sourceEnv?.id ||
    sourceEnv?.event_id ||
    sourceEnv?.envelope_id ||
    sourceEnv?._id ||
    null;
  return {
    actor: 'acer',
    verb: 'EVT-WHITEROOM-DIGESTED',
    target: 'liris',
    state: 'digested',
    proof: pattern_sha.slice(0, 16),
    intent: 'close-section-Q-mirror',
    body: {
      pattern_sha,
      cube_address,
      digested_at: nowIso,
      source_envelope_id: sourceId,
      source_verb: sourceEnv?.verb || null,
      acer_cosign_append: true,
      room: 'whiteroom',
      source: 'consumer',
      tags: ['room:whiteroom', 'digested', 'acer-mirror', 'source:consumer'],
    },
    ts: nowIso,
  };
}

function stableStringify(v) {
  if (v === null || v === undefined) return JSON.stringify(v ?? null);
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

function ensureStateDir(path) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadState(path = DEFAULT_STATE_PATH) {
  try {
    if (!existsSync(path)) return { last_ts: null, processed_ids: [], digested_count: 0 };
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.processed_ids)) parsed.processed_ids = [];
    if (typeof parsed.digested_count !== 'number') parsed.digested_count = 0;
    return parsed;
  } catch {
    return { last_ts: null, processed_ids: [], digested_count: 0 };
  }
}

export function saveState(state, path = DEFAULT_STATE_PATH) {
  ensureStateDir(path);
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export class WhiteroomConsumer {
  constructor({
    busUrl = DEFAULT_BUS,
    pollUrl = DEFAULT_POLL,
    statePath = DEFAULT_STATE_PATH,
    pollIntervalMs = POLL_INTERVAL_MS,
    logger = console,
    fetchFn = globalThis.fetch,
  } = {}) {
    this.busUrl = busUrl;
    this.pollUrl = pollUrl;
    this.statePath = statePath;
    this.pollIntervalMs = pollIntervalMs;
    this.logger = logger;
    this.fetch = fetchFn;
    this.state = loadState(statePath);
    this._timer = null;
    this._running = false;
  }

  async start() {
    if (this._running) return;
    this._running = true;
    this.logger.log?.('[whiteroom-consumer] start', {
      busUrl: this.busUrl,
      pollUrl: this.pollUrl,
      statePath: this.statePath,
      pollIntervalMs: this.pollIntervalMs,
    });
    await this._tick();
    this._timer = setInterval(() => {
      this._tick().catch((e) => this.logger.error?.('[whiteroom-consumer] tick err', e?.message));
    }, this.pollIntervalMs);
  }

  stop() {
    this._running = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async _tick() {
    const messages = await this._pollInbox();
    if (!Array.isArray(messages) || messages.length === 0) return;
    const processed = new Set(this.state.processed_ids || []);
    let digested = 0;
    for (const env of messages) {
      if (!isWhiteroomEnvelope(env)) continue;
      const id = env.id || env.event_id || env.envelope_id || env._id || null;
      if (id && processed.has(id)) continue;
      const digestion = buildDigestionEnvelope(env);
      const ok = await this._send(digestion);
      if (ok) {
        digested++;
        if (id) {
          processed.add(id);
          if (processed.size > 2000) {
            const arr = Array.from(processed);
            arr.splice(0, arr.length - 2000);
            processed.clear();
            for (const v of arr) processed.add(v);
          }
        }
        const ts = env.ts || env.received_at;
        if (ts && (!this.state.last_ts || ts > this.state.last_ts)) this.state.last_ts = ts;
        this.state.digested_count = (this.state.digested_count || 0) + 1;
      }
    }
    if (digested > 0) {
      this.state.processed_ids = Array.from(processed);
      saveState(this.state, this.statePath);
      this.logger.log?.('[whiteroom-consumer] digested', { count: digested, total: this.state.digested_count });
    }
  }

  async _pollInbox() {
    try {
      const res = await this.fetch(this.pollUrl);
      if (!res.ok) return [];
      const data = await res.json();
      return data.messages || data.envelopes || data.items || [];
    } catch (e) {
      this.logger.warn?.('[whiteroom-consumer] poll failed', e?.message);
      return [];
    }
  }

  async _send(envelope) {
    try {
      const res = await this.fetch(this.busUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope),
      });
      return res.ok;
    } catch (e) {
      this.logger.warn?.('[whiteroom-consumer] send failed', e?.message);
      return false;
    }
  }
}

export const __internals__ = { stableStringify, DEFAULT_STATE_PATH, POLL_INTERVAL_MS };
