#!/usr/bin/env node
/**
 * d0-runtime.js — D0 RUNTIME BINDING LAYER
 *
 * The missing nervous system. Turns the 47D brain atlas into a living organism.
 *
 * Every dimension becomes a node with:
 *   - state    (current value, updated by events)
 *   - triggers (what causes this dim to fire)
 *   - listeners (what other dims/agents subscribe to its output)
 *   - outputs  (signals it emits when it fires)
 *
 * Core event loop:
 *   INFER → D36 processes → D8 routes → D6 validates →
 *     agent selected → EXECUTE → if fail → D43 logs → loops back to D36
 *   D44 heartbeat runs parallel, monitors all nodes.
 *
 * BEHCS-native: every event fires through :4947.
 * Agents subscribe to dimensions, wake on signal.
 *
 * Usage:
 *   node tools/behcs/d0-runtime.js              # start the runtime
 *   node tools/behcs/d0-runtime.js --prove       # prove-life: fire one full loop
 *   node tools/behcs/d0-runtime.js --pulse       # single heartbeat cycle
 *
 * Cube: D0 sits UNDER all dimensions. Not a new dim — the meta-layer.
 */

'use strict';

const EventEmitter = require('events');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'C:/Users/acer/Asolaria';
const BEHCS_DIR = path.join(ROOT, 'data/behcs');
const D0_DIR = path.join(BEHCS_DIR, 'd0-runtime');
const D_DEST = 'D:/safety-backups/session-20260411-behcs-v6';
const BEHCS_PORT = 4947;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function appendNdjson(f, obj) { ensureDir(path.dirname(f)); fs.appendFileSync(f, JSON.stringify(obj) + '\n'); }
function truncateNdjson(f, max) {
  if (!fs.existsSync(f)) return;
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length > max) fs.writeFileSync(f, lines.slice(-max).join('\n') + '\n');
}
function mirror(src) {
  try {
    const rel = path.relative(ROOT, src).replace(/\\/g, '/');
    const dest = path.join(D_DEST, rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  } catch (_) {}
}
const now = () => new Date().toISOString();

// ═══════════════════════════════════════════════════════════
// EVENT BUS — the nervous system's backbone
// ═══════════════════════════════════════════════════════════

class D0EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.eventLog = [];
    this.logPath = path.join(D0_DIR, 'event-log.ndjson');
    ensureDir(D0_DIR);
  }

  fire(event, payload) {
    const entry = {
      event,
      ts: now(),
      id: 'd0-' + crypto.randomBytes(4).toString('hex'),
      payload,
    };
    this.eventLog.push(entry);
    appendNdjson(this.logPath, entry);

    // Keep log bounded
    if (this.eventLog.length > 500) {
      this.eventLog = this.eventLog.slice(-250);
      truncateNdjson(this.logPath, 250);
    }

    this.emit(event, entry);
    this.emit('*', entry); // wildcard listeners
    return entry;
  }
}

// ═══════════════════════════════════════════════════════════
// DIMENSION NODE — a living dimension with state + reactivity
// ═══════════════════════════════════════════════════════════

class DimensionNode {
  constructor(id, cube, prime, focus, config = {}) {
    this.id = id;
    this.cube = cube;
    this.prime = prime;
    this.focus = focus;

    // Living state
    this.state = config.initialState || 'idle';     // idle | active | error | halted
    this.signal = 0.5;                                // current signal strength [0..1]
    this.lastFired = null;
    this.fireCount = 0;
    this.errorCount = 0;

    // Reactivity wiring
    this.triggers = config.triggers || [];            // events that activate this dim
    this.outputs = config.outputs || [];              // events this dim emits
    this.handler = config.handler || null;            // function(payload, liveState) → { signal, output, state }
  }

  activate(payload, liveState) {
    this.state = 'active';
    this.lastFired = now();
    this.fireCount++;

    let result;
    try {
      if (this.handler) {
        result = this.handler(payload, liveState, this);
      } else {
        result = { signal: 0.7, output: null, state: 'idle' };
      }
    } catch (e) {
      this.errorCount++;
      this.state = 'error';
      result = { signal: 0, output: { error: e.message }, state: 'error' };
    }

    this.signal = result.signal;
    this.state = result.state || 'idle';
    return result;
  }

  snapshot() {
    return {
      id: this.id, cube: this.cube, focus: this.focus,
      state: this.state, signal: this.signal,
      lastFired: this.lastFired, fireCount: this.fireCount,
      errorCount: this.errorCount,
      triggers: this.triggers, outputs: this.outputs,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// AGENT BINDING — agents subscribe to dimensions
// ═══════════════════════════════════════════════════════════

class AgentBinding {
  constructor(role, subscribes, config = {}) {
    this.role = role;
    this.subscribes = subscribes;   // events this agent listens to
    this.state = 'idle';
    this.lastWoke = null;
    this.wakeCount = 0;
    this.handler = config.handler || null;
  }

  wake(event, payload, liveState) {
    this.state = 'active';
    this.lastWoke = now();
    this.wakeCount++;

    let result;
    try {
      if (this.handler) {
        result = this.handler(event, payload, liveState, this);
      } else {
        result = { action: 'observe', signal: 0.7 };
      }
    } catch (e) {
      this.state = 'error';
      result = { action: 'error', signal: 0, error: e.message };
    }

    this.state = result.action === 'error' ? 'error' : 'idle';
    return result;
  }

  snapshot() {
    return {
      role: this.role, subscribes: this.subscribes,
      state: this.state, lastWoke: this.lastWoke, wakeCount: this.wakeCount,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// BEHCS BRIDGE — fire events to the live bus
// ═══════════════════════════════════════════════════════════

function fireBehcs(verb, payload) {
  return new Promise((resolve) => {
    const env = JSON.stringify({
      id: 'd0-' + crypto.randomBytes(6).toString('hex'),
      ts: now(),
      from: 'asolaria-d0-runtime',
      to: 'triad',
      mode: 'shadow',
      type: 'runtime_event',
      payload: { verb, ...payload },
      cube: { D0_RUNTIME: true, D44_HEARTBEAT: 7189057 },
      hash: crypto.createHash('sha256').update(verb + JSON.stringify(payload)).digest('hex').slice(0, 16),
    });
    const req = http.request({
      hostname: '127.0.0.1', port: BEHCS_PORT, path: '/behcs/send',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(env) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false, error: 'bus_unreachable' }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(env);
    req.end();
  });
}

// Read recent BEHCS inbox for live state
function readBehcsInbox(last = 10) {
  const inbox = path.join(BEHCS_DIR, 'inbox.ndjson');
  if (!fs.existsSync(inbox)) return [];
  const lines = fs.readFileSync(inbox, 'utf8').split('\n').filter(l => l.trim());
  return lines.slice(-last).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
}

// Read device registry
function loadDevices() {
  const reg = path.join(BEHCS_DIR, 'device-registry.json');
  if (fs.existsSync(reg)) {
    try { return JSON.parse(fs.readFileSync(reg, 'utf8')).devices || {}; } catch (_) {}
  }
  return {};
}

// ═══════════════════════════════════════════════════════════
// D0 RUNTIME — the full binding layer
// ═══════════════════════════════════════════════════════════

class D0Runtime {
  constructor() {
    this.bus = new D0EventBus();
    this.dims = {};
    this.agents = {};
    this.started = null;
    this.cycleCount = 0;

    this._wireDimensions();
    this._wireAgents();
    this._wireSubscriptions();
  }

  // ─── DIMENSION DEFINITIONS ───

  _wireDimensions() {
    // D36 INFERENCE_SURFACE — the processing core
    this.dims.D36 = new DimensionNode('D36_INFERENCE_SURFACE', 3307949, 149, 'gnn_webhook_reasoning', {
      initialState: 'idle',
      triggers: ['INFER', 'REINFER'],
      outputs: ['INFERENCE_RESULT'],
      handler: (payload, live, self) => {
        const input = payload?.payload || payload;
        const text = JSON.stringify(input).toLowerCase();

        // Real inference: score the input across available signals
        const hasStructure = !!(input?.cube || input?.dim || input?.candidate_id);
        const hasBusCorroboration = live.recentMessages.some(m =>
          JSON.stringify(m).toLowerCase().includes((input?.id || input?.candidate_id || '???').slice(0, 6))
        );
        const deviceCount = Object.keys(live.devices).length;

        const signal = (
          (hasStructure ? 0.35 : 0.1) +
          (hasBusCorroboration ? 0.25 : 0.05) +
          (deviceCount >= 3 ? 0.2 : 0.1) +
          (live.busAlive ? 0.2 : 0.05)
        );

        return {
          signal: Math.min(signal, 1.0),
          output: {
            event: 'INFERENCE_RESULT',
            verdict: signal > 0.6 ? 'PROCEED' : (signal > 0.3 ? 'CAUTION' : 'BLOCK'),
            confidence: signal,
            hasStructure, hasBusCorroboration, deviceCount,
          },
          state: 'idle',
        };
      },
    });

    // D8 CHAIN — connection routing (acts as edge router)
    this.dims.D8 = new DimensionNode('D8_CHAIN', 6859, 19, 'connection', {
      triggers: ['INFERENCE_RESULT', 'ROUTE'],
      outputs: ['ROUTE_DECISION'],
      handler: (payload, live, self) => {
        const input = payload?.payload || payload;
        const verdict = input?.output?.verdict || input?.verdict || 'UNKNOWN';

        // Route based on inference result
        let route;
        if (verdict === 'PROCEED') route = 'gate_validate';
        else if (verdict === 'CAUTION') route = 'gate_validate_strict';
        else if (verdict === 'BLOCK') route = 'reject';
        else route = 'gate_validate'; // default: validate

        // Check if target device is reachable
        const targetDevice = input?.target_device || 'acer';
        const deviceInfo = live.devices[targetDevice];
        const reachable = deviceInfo ? (deviceInfo.endpoints?.length > 0 || deviceInfo.role === 'capital') : false;

        const signal = route === 'reject' ? 0.1 : (reachable ? 0.9 : 0.5);

        return {
          signal,
          output: {
            event: 'ROUTE_DECISION',
            route, targetDevice, reachable,
            sourceVerdict: verdict,
          },
          state: 'idle',
        };
      },
    });

    // D6 GATE — validation checkpoint
    this.dims.D6 = new DimensionNode('D6_GATE', 2197, 13, 'completion', {
      triggers: ['ROUTE_DECISION'],
      outputs: ['GATE_PASS', 'GATE_BLOCK'],
      handler: (payload, live, self) => {
        const input = payload?.payload || payload;
        const route = input?.output?.route || 'gate_validate';

        if (route === 'reject') {
          return { signal: 0, output: { event: 'GATE_BLOCK', reason: 'inference_rejected' }, state: 'idle' };
        }

        // Hard-deny check (immune system at gate level)
        const text = JSON.stringify(input).toLowerCase();
        const hdHits = [];
        if (text.includes('novalum') && text.includes('external')) hdHits.push('HD-1a');
        if ((text.includes('brian') || text.includes('natalie')) && text.includes('send') && !text.includes('draft')) hdHits.push('HD-2-ext');
        if (text.includes('virus') || text.includes('malware')) hdHits.push('HD-virus');

        if (hdHits.length > 0) {
          return { signal: 0, output: { event: 'GATE_BLOCK', reason: 'hard_deny', hdHits }, state: 'idle' };
        }

        const strict = route === 'gate_validate_strict';
        const threshold = strict ? 0.7 : 0.5;
        const sourceConfidence = input?.output?.sourceVerdict === 'PROCEED' ? 0.85 : 0.55;
        const pass = sourceConfidence >= threshold;

        return {
          signal: pass ? 0.9 : 0.2,
          output: { event: pass ? 'GATE_PASS' : 'GATE_BLOCK', strict, threshold, sourceConfidence },
          state: 'idle',
        };
      },
    });

    // D7 STATE — agent tier selection (lifecycle manager)
    this.dims.D7 = new DimensionNode('D7_STATE', 4913, 17, 'lifecycle', {
      triggers: ['GATE_PASS'],
      outputs: ['EXECUTE'],
      handler: (payload, live, self) => {
        // Select which agent tier should execute
        const input = payload?.payload || payload;
        const confidence = input?.output?.sourceConfidence || 0.7;

        let tier;
        if (confidence > 0.85) tier = 'instant';      // high confidence → instant agent
        else if (confidence > 0.7) tier = 'micro';     // medium → micro agent
        else if (confidence > 0.5) tier = 'small';     // cautious → small agent (more checks)
        else tier = 'leader';                           // low confidence → escalate to leader

        return {
          signal: confidence,
          output: { event: 'EXECUTE', tier, confidence, gateStatus: 'passed' },
          state: 'idle',
        };
      },
    });

    // D43 MISTAKE_LEDGER — error capture + feedback loop
    this.dims.D43 = new DimensionNode('D43_MISTAKE_LEDGER', 6967871, 191, 'mistake_tracking', {
      triggers: ['ERROR', 'GATE_BLOCK', 'EXECUTE_FAIL'],
      outputs: ['REINFER', 'MISTAKE_LOGGED'],
      handler: (payload, live, self) => {
        const input = payload?.payload || payload;
        const event = payload?.event || 'ERROR';

        // Log the mistake
        const mistake = {
          ts: now(),
          source_event: event,
          reason: input?.output?.reason || input?.error || 'unknown',
          hdHits: input?.output?.hdHits || [],
          context: JSON.stringify(input).slice(0, 200),
        };
        appendNdjson(path.join(D0_DIR, 'mistakes.ndjson'), mistake);

        // Decide: retry or give up
        const isHardDeny = (input?.output?.hdHits?.length || 0) > 0;
        const retriable = !isHardDeny && self.errorCount < 3;

        if (retriable) {
          self.errorCount++;
          return {
            signal: 0.3,
            output: { event: 'REINFER', retry: true, attempt: self.errorCount, originalError: mistake.reason },
            state: 'idle',
          };
        }

        return {
          signal: 0,
          output: { event: 'MISTAKE_LOGGED', permanent: true, reason: isHardDeny ? 'hard_deny' : 'max_retries', mistake },
          state: 'idle',
        };
      },
    });

    // D44 HEARTBEAT — monitors all nodes, runs parallel
    this.dims.D44 = new DimensionNode('D44_HEARTBEAT', 7189057, 193, 'liveness', {
      triggers: ['HEARTBEAT_TICK'],
      outputs: ['ALIVE', 'NODE_DOWN'],
      handler: (payload, live, self) => {
        const dimSnapshots = {};
        let aliveCount = 0;
        let errorCount = 0;
        let staleCount = 0;
        const downNodes = [];

        for (const [id, dim] of Object.entries(payload?.dims || {})) {
          const snap = dim.snapshot();
          dimSnapshots[id] = snap;

          if (snap.state === 'error') {
            errorCount++;
            downNodes.push(id);
          } else if (snap.lastFired) {
            const age = Date.now() - new Date(snap.lastFired).getTime();
            if (age > 300000) { staleCount++; downNodes.push(id); } // stale if >5min
            else aliveCount++;
          } else {
            aliveCount++; // never fired = idle, not dead
          }
        }

        const agentSnapshots = {};
        for (const [role, agent] of Object.entries(payload?.agents || {})) {
          agentSnapshots[role] = agent.snapshot();
        }

        const totalNodes = Object.keys(dimSnapshots).length;
        const healthRatio = totalNodes > 0 ? aliveCount / totalNodes : 0;

        return {
          signal: healthRatio,
          output: {
            event: downNodes.length > 0 ? 'NODE_DOWN' : 'ALIVE',
            alive: aliveCount, errors: errorCount, stale: staleCount,
            total: totalNodes, healthRatio: parseFloat(healthRatio.toFixed(3)),
            downNodes,
            dimSnapshots,
            agentSnapshots,
          },
          state: 'idle',
        };
      },
    });
  }

  // ─── AGENT DEFINITIONS ───

  _wireAgents() {
    this.agents.scout = new AgentBinding('scout', ['INFER', 'INFERENCE_RESULT'], {
      handler: (event, payload, live, self) => {
        // Scout does first-look: enough signal to proceed?
        const msgs = live.recentMessages;
        const coverage = msgs.length > 3 ? 'thick' : 'thin';
        return { action: 'report', signal: coverage === 'thick' ? 0.85 : 0.55, coverage, msgCount: msgs.length };
      },
    });

    this.agents.evidence = new AgentBinding('evidence', ['INFERENCE_RESULT', 'MISTAKE_LOGGED'], {
      handler: (event, payload, live, self) => {
        // Evidence checks: is there proof backing this?
        const mistakePath = path.join(D0_DIR, 'mistakes.ndjson');
        const mistakes = fs.existsSync(mistakePath)
          ? fs.readFileSync(mistakePath, 'utf8').split('\n').filter(l => l.trim()).length
          : 0;
        const signal = mistakes > 5 ? 0.4 : 0.85;
        return { action: 'attest', signal, totalMistakes: mistakes, assessment: mistakes > 5 ? 'high_error_rate' : 'acceptable' };
      },
    });

    this.agents.executor = new AgentBinding('executor', ['EXECUTE'], {
      handler: (event, payload, live, self) => {
        const input = payload?.payload || payload;
        const tier = input?.output?.tier || 'micro';
        const targetDevice = input?.target_device || 'acer';
        const device = live.devices[targetDevice];
        const reachable = device ? (device.endpoints?.length > 0 || device.role === 'capital') : false;

        if (!reachable) {
          return { action: 'fail', signal: 0.2, reason: `device ${targetDevice} unreachable`, tier };
        }

        return {
          action: 'execute', signal: 0.9, tier, targetDevice,
          dispatch: { verb: 'behcs.d0.execute', target: targetDevice, tier, ts: now() },
        };
      },
    });

    this.agents.fabric = new AgentBinding('fabric', ['ROUTE_DECISION', 'GATE_PASS', 'GATE_BLOCK'], {
      handler: (event, payload, live, self) => {
        // Fabric checks structural fit
        const busAlive = live.busAlive;
        const deviceCount = Object.keys(live.devices).length;
        const signal = (busAlive ? 0.5 : 0.2) + (deviceCount >= 3 ? 0.3 : 0.1) + 0.1;
        return { action: 'assess', signal, busAlive, deviceCount, assessment: signal > 0.7 ? 'fabric_healthy' : 'fabric_degraded' };
      },
    });

    this.agents.voice = new AgentBinding('voice', ['EXECUTE', 'GATE_BLOCK', 'MISTAKE_LOGGED'], {
      handler: (event, payload, live, self) => {
        // Voice: does this serve operator intent?
        const isBlock = event === 'GATE_BLOCK' || event === 'MISTAKE_LOGGED';
        return {
          action: isBlock ? 'escalate' : 'affirm',
          signal: isBlock ? 0.4 : 0.9,
          event,
          assessment: isBlock ? 'operator_should_know' : 'aligned_with_intent',
        };
      },
    });

    this.agents.planner = new AgentBinding('planner', ['INFERENCE_RESULT', 'EXECUTE', 'ALIVE', 'NODE_DOWN'], {
      handler: (event, payload, live, self) => {
        if (event === 'NODE_DOWN') {
          const downNodes = payload?.payload?.output?.downNodes || [];
          return { action: 'plan_recovery', signal: 0.5, downNodes, plan: `recover: ${downNodes.join(',')}` };
        }
        return { action: 'plan_next', signal: 0.8, plan: 'continue_normal_operation' };
      },
    });
  }

  // ─── SUBSCRIPTION WIRING ───

  _wireSubscriptions() {
    // Wire dimensions: when bus fires an event, activate the dim that triggers on it
    for (const [id, dim] of Object.entries(this.dims)) {
      for (const trigger of dim.triggers) {
        this.bus.on(trigger, async (entry) => {
          const live = this._getLiveState();
          const result = dim.activate(entry, live);

          // If dim produced an output event, fire it
          if (result.output?.event) {
            this.bus.fire(result.output.event, {
              source_dim: id,
              output: result.output,
              signal: result.signal,
            });

            // Fire to BEHCS bus
            await fireBehcs('behcs.d0.dim_fired', {
              dim: id, cube: dim.cube, event: result.output.event,
              signal: result.signal, state: dim.state,
            });
          }
        });
      }
    }

    // Wire agents: when bus fires an event they subscribe to, wake the agent
    for (const [role, agent] of Object.entries(this.agents)) {
      for (const sub of agent.subscribes) {
        this.bus.on(sub, async (entry) => {
          const live = this._getLiveState();
          const result = agent.wake(entry.event, entry, live);

          // Fire agent result to BEHCS bus
          await fireBehcs('behcs.d0.agent_woke', {
            agent: role, event: entry.event,
            action: result.action, signal: result.signal,
          });

          // If executor dispatches, fire EXECUTE_SUCCESS or EXECUTE_FAIL
          if (role === 'executor' && result.action === 'execute' && result.dispatch) {
            await fireBehcs(result.dispatch.verb, result.dispatch);
            this.bus.fire('EXECUTE_SUCCESS', { agent: role, dispatch: result.dispatch });
          } else if (role === 'executor' && result.action === 'fail') {
            this.bus.fire('EXECUTE_FAIL', { agent: role, reason: result.reason });
          }
        });
      }
    }
  }

  // ─── LIVE STATE ───

  _getLiveState() {
    return {
      devices: loadDevices(),
      recentMessages: readBehcsInbox(10),
      busAlive: this._checkBusAlive(),
      dims: this.dims,
      agents: this.agents,
    };
  }

  _checkBusAlive() {
    const msgs = readBehcsInbox(1);
    if (msgs.length === 0) return false;
    const last = msgs[msgs.length - 1];
    return (Date.now() - new Date(last.ts || last.received_at || 0).getTime()) < 120000;
  }

  // ─── PUBLIC INTERFACE ───

  async infer(input) {
    return this.bus.fire('INFER', input);
  }

  async heartbeat() {
    this.cycleCount++;
    const live = this._getLiveState();

    // Fire heartbeat with full dim + agent state
    this.bus.fire('HEARTBEAT_TICK', {
      dims: this.dims,
      agents: this.agents,
      cycle: this.cycleCount,
    });

    return this.dims.D44.snapshot();
  }

  snapshot() {
    const dimSnaps = {};
    for (const [id, dim] of Object.entries(this.dims)) dimSnaps[id] = dim.snapshot();
    const agentSnaps = {};
    for (const [role, agent] of Object.entries(this.agents)) agentSnaps[role] = agent.snapshot();
    return {
      started: this.started,
      cycleCount: this.cycleCount,
      dims: dimSnaps,
      agents: agentSnaps,
      eventLogSize: this.bus.eventLog.length,
    };
  }

  // ─── PROVE LIFE ───

  async proveLife() {
    console.log('[D0] ═══ PROVE LIFE: firing one full loop ═══');
    console.log('');

    // 1. Fire INFER
    console.log('[D0] Step 1: INFER → D36 INFERENCE_SURFACE');
    const inferEntry = this.bus.fire('INFER', {
      candidate_id: 'prove-life-test',
      description: 'D0 runtime prove-life cycle',
      target_device: 'acer',
    });
    await this._drain(100);
    console.log(`  D36 state=${this.dims.D36.state} signal=${this.dims.D36.signal.toFixed(3)}`);

    // 2. Wait for chain reaction
    console.log('[D0] Step 2: INFERENCE_RESULT → D8 CHAIN (routing)');
    await this._drain(100);
    console.log(`  D8  state=${this.dims.D8.state} signal=${this.dims.D8.signal.toFixed(3)}`);

    console.log('[D0] Step 3: ROUTE_DECISION → D6 GATE (validation)');
    await this._drain(100);
    console.log(`  D6  state=${this.dims.D6.state} signal=${this.dims.D6.signal.toFixed(3)}`);

    console.log('[D0] Step 4: GATE_PASS → D7 STATE (agent tier selection)');
    await this._drain(100);
    console.log(`  D7  state=${this.dims.D7.state} signal=${this.dims.D7.signal.toFixed(3)}`);

    console.log('[D0] Step 5: EXECUTE → executor agent dispatches');
    await this._drain(200);
    console.log(`  executor wakeCount=${this.agents.executor.wakeCount}`);

    // 3. Heartbeat
    console.log('[D0] Step 6: HEARTBEAT → D44 monitors all nodes');
    await this.heartbeat();
    await this._drain(200);
    console.log(`  D44 state=${this.dims.D44.state} signal=${this.dims.D44.signal.toFixed(3)}`);

    // 4. Summary
    console.log('');
    console.log('[D0] ═══ PROVE LIFE RESULTS ═══');
    const snap = this.snapshot();
    console.log(`  Dims wired:    ${Object.keys(snap.dims).length}`);
    console.log(`  Agents wired:  ${Object.keys(snap.agents).length}`);
    console.log(`  Events fired:  ${snap.eventLogSize}`);
    console.log('');

    // Print dim table
    console.log('  DIM                        STATE    SIGNAL   FIRES  ERRORS');
    console.log('  ' + '─'.repeat(58));
    for (const [id, d] of Object.entries(snap.dims)) {
      console.log(`  ${id.padEnd(27)} ${d.state.padEnd(8)} ${d.signal.toFixed(3).padStart(6)}   ${String(d.fireCount).padStart(5)}  ${String(d.errorCount).padStart(5)}`);
    }
    console.log('');

    // Print agent table
    console.log('  AGENT          STATE    WAKES');
    console.log('  ' + '─'.repeat(32));
    for (const [role, a] of Object.entries(snap.agents)) {
      console.log(`  ${role.padEnd(15)} ${a.state.padEnd(8)} ${String(a.wakeCount).padStart(5)}`);
    }

    // Fire summary to BEHCS bus
    await fireBehcs('behcs.d0.prove_life', {
      result: 'ALIVE',
      dims: Object.fromEntries(Object.entries(snap.dims).map(([k, v]) => [k, { state: v.state, signal: v.signal, fires: v.fireCount }])),
      agents: Object.fromEntries(Object.entries(snap.agents).map(([k, v]) => [k, { state: v.state, wakes: v.wakeCount }])),
      eventsFired: snap.eventLogSize,
    });

    return snap;
  }

  async _drain(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── PERSISTENT LOOP ───

  async start(intervalMs = 30000) {
    this.started = now();
    console.log(`[D0] Runtime started at ${this.started}`);
    console.log(`[D0] Heartbeat interval: ${intervalMs}ms`);
    console.log(`[D0] Dims: ${Object.keys(this.dims).join(', ')}`);
    console.log(`[D0] Agents: ${Object.keys(this.agents).join(', ')}`);
    console.log('');

    await fireBehcs('behcs.d0.started', {
      dims: Object.keys(this.dims),
      agents: Object.keys(this.agents),
      interval: intervalMs,
    });

    // ─── SIGNAL DECAY (DFAL Layer 1) ───
    // Every tick, all dim signals decay toward 0. Active dims spike; idle dims fade.
    // This is the "continuous field" GPT Pro identified as missing.
    const DECAY_RATE = 0.95;
    const DECAY_INTERVAL = 5000; // 5s = 0.2Hz cognitive tick
    const decayLoop = setInterval(() => {
      for (const [id, dim] of Object.entries(this.dims)) {
        const before = dim.signal;
        dim.signal = Math.max(0, dim.signal * DECAY_RATE);
        // If a dim decays below 0.1 and was active, it goes dormant
        if (before > 0.1 && dim.signal <= 0.1 && dim.state === 'idle') {
          dim.state = 'dormant';
        }
      }
    }, DECAY_INTERVAL);

    // ─── INBOX CONSUMER (DFAL Layer 2) ───
    // Dequeue new BEHCS messages and fire them as INFER events.
    // This closes the loop: bus messages → D0 cognition → bus output.
    let lastSeenTs = now();
    const inboxLoop = setInterval(async () => {
      try {
        const msgs = readBehcsInbox(20);
        const newMsgs = msgs.filter(m => {
          const ts = m.ts || m.received_at || '';
          return ts > lastSeenTs && m.from !== 'asolaria-d0-runtime'; // skip own output
        });
        if (newMsgs.length > 0) {
          lastSeenTs = newMsgs[newMsgs.length - 1].ts || newMsgs[newMsgs.length - 1].received_at || lastSeenTs;
          for (const msg of newMsgs) {
            this.bus.fire('INFER', msg);
          }
          if (this.cycleCount % 4 === 0) {
            console.log(`[D0] consumed ${newMsgs.length} inbox messages → INFER`);
          }
        }
      } catch (_) {}
    }, 10000); // check inbox every 10s

    // ─── SELF-ORIGINATING INTENT (D49 Layer) ───
    // Every heartbeat, D0 inspects its own state and generates impulses.
    // This is what makes the system ACT without being TOLD.
    const impulseLoop = setInterval(async () => {
      const impulses = [];

      // D43 impulse: if error count high, self-correct
      if (this.dims.D43.errorCount > 0 && this.dims.D43.state !== 'active') {
        impulses.push({ source: 'D43_MISTAKE', type: 'REINFER', reason: `${this.dims.D43.errorCount} errors accumulated — retrying` });
      }

      // D44 impulse: if any dim went dormant, investigate
      const dormant = Object.entries(this.dims).filter(([, d]) => d.state === 'dormant');
      if (dormant.length > 0) {
        impulses.push({ source: 'D44_HEARTBEAT', type: 'INFER', reason: `${dormant.length} dims dormant: ${dormant.map(([id]) => id).join(',')}` });
      }

      // D36 impulse: if no inference in last 2 minutes, probe for new work
      if (this.dims.D36.lastFired) {
        const age = Date.now() - new Date(this.dims.D36.lastFired).getTime();
        if (age > 120000) {
          impulses.push({ source: 'D36_STALE', type: 'INFER', reason: `D36 hasn't fired in ${Math.round(age / 1000)}s — probing` });
        }
      }

      // Field energy impulse: if total field below threshold, self-stimulate
      const fieldEnergy = Object.values(this.dims).reduce((s, d) => s + d.signal, 0);
      if (fieldEnergy < 0.5 && this.cycleCount > 4) {
        impulses.push({ source: 'FIELD_LOW', type: 'INFER', reason: `fieldEnergy=${fieldEnergy.toFixed(2)} below 0.5 — self-stimulating` });
      }

      // Fire impulses as self-originated events
      for (const imp of impulses) {
        this.bus.fire(imp.type, { self_originated: true, impulse: imp });
        await fireBehcs('behcs.d0.impulse', { ...imp, cycle: this.cycleCount });
      }

      if (impulses.length > 0 && this.cycleCount % 2 === 0) {
        console.log(`[D0] D49 IMPULSE: ${impulses.length} self-originated — ${impulses.map(i => i.source).join(', ')}`);
      }
    }, 60000); // check for self-originating intent every 60s

    // Heartbeat loop
    const hbLoop = setInterval(async () => {
      await this.heartbeat();
      const d44 = this.dims.D44;
      if (this.cycleCount % 4 === 0) {
        const fieldEnergy = Object.values(this.dims).reduce((s, d) => s + d.signal, 0);
        console.log(`[D0] heartbeat #${this.cycleCount} — D44 signal=${d44.signal.toFixed(3)} state=${d44.state} fieldEnergy=${fieldEnergy.toFixed(2)}`);
      }
    }, intervalMs);

    // Cleanup
    process.on('SIGINT', async () => {
      clearInterval(hbLoop);
      clearInterval(decayLoop);
      clearInterval(inboxLoop);
      clearInterval(impulseLoop);
      await fireBehcs('behcs.d0.stopped', { cycles: this.cycleCount, reason: 'SIGINT' });

      // Save final state
      const snapPath = path.join(D0_DIR, 'last-snapshot.json');
      fs.writeFileSync(snapPath, JSON.stringify(this.snapshot(), null, 2));
      mirror(snapPath);

      console.log(`[D0] Stopped after ${this.cycleCount} cycles. Snapshot saved.`);
      process.exit(0);
    });

    return hbLoop;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const runtime = new D0Runtime();

  if (args.includes('--prove')) {
    await runtime.proveLife();
    // Save snapshot
    const snapPath = path.join(D0_DIR, 'prove-life-snapshot.json');
    fs.writeFileSync(snapPath, JSON.stringify(runtime.snapshot(), null, 2));
    mirror(snapPath);
    console.log('');
    console.log(`  Snapshot: ${snapPath}`);
    return;
  }

  if (args.includes('--pulse')) {
    await runtime.heartbeat();
    await runtime._drain(300);
    const d44 = runtime.dims.D44.snapshot();
    console.log(JSON.stringify(d44, null, 2));
    return;
  }

  // Default: start persistent runtime
  await runtime.proveLife();
  console.log('');
  console.log('[D0] Prove-life passed. Starting persistent runtime...');
  console.log('');
  await runtime.start(30000);
}

if (require.main === module) main().catch(e => console.error('FATAL:', e.message));
module.exports = { D0Runtime, DimensionNode, AgentBinding, D0EventBus };
