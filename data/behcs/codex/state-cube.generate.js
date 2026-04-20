// codex/state-cube.generate.js — Agent state cube generator
// IX-720 | author: backline-sentinel-02 | spec: IX-700 extension
// Usage: node ~/sovereignty/ix/codex/state-cube.generate.js <agent-id>
// Creates ~/sovereignty/ix/cubes/agent-<id>-state.cube.js (<=35 LOC)
// plus an empty NDJSON log at ~/sovereignty/ix/state/agent-<id>-state.ndjson.
// Validates the identity cube exists first.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODEX_DIR = path.dirname(fileURLToPath(import.meta.url).replace(/^[/\\]+(?=[A-Za-z]:[\\/])/, ''));
const CUBES_DIR = path.join(CODEX_DIR, '..', 'cubes');
const STATE_DIR = path.join(CODEX_DIR, '..', 'state');

export function generateStateCube(agentId) {
  if (!agentId) throw new Error('agent id required');
  const idCubePath = path.join(CUBES_DIR, `agent-${agentId}.cube.js`);
  if (!fs.existsSync(idCubePath))
    throw new Error(`identity cube missing: ${idCubePath}`);

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const logPath = path.join(STATE_DIR, `agent-${agentId}-state.ndjson`);
  if (!fs.existsSync(logPath)) fs.writeFileSync(logPath, '');

  const cubePath = path.join(CUBES_DIR, `agent-${agentId}-state.cube.js`);
  const src = renderCube(agentId);
  fs.writeFileSync(cubePath, src);
  return { cubePath, logPath };
}

function renderCube(id) {
  return `// cube: agent-${id}-state | hilbert: (computed at launch)
// IX-720 | author: backline-sentinel-02 | spec: IX-700 state-companion
// primary catalog: D7 STATE (prime 17, cube 4913)
// touches: D1 ACTOR, D15 DEVICE, D16 PID, D17 PROFILE, D19 LOCATION, D20 TIME, D24 INTENT, D34 PRIORITY, D35 MEMORY, D44 LINEAGE
// gates: hookwall | waves: single, pulse | federation: falcon-local
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const LOG = fileURLToPath(new URL('../state/agent-${id}-state.ndjson', import.meta.url)).replace(/^[/\\\\]+(?=[A-Za-z]:[\\\\/])/, '');
let _seq = 0;
async function refresh() {
  const raw = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim() : '';
  const lines = raw ? raw.split('\\n') : [];
  const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  _seq = events.length ? events[events.length - 1].seq : 0;
  return { agent: '${id}', seq: _seq, count: events.length, latest: events[events.length - 1] || null, events };
}
async function record(event) {
  await refresh();
  const row = { seq: ++_seq, timestamp: new Date().toISOString(), ...event };
  fs.appendFileSync(LOG, JSON.stringify(row) + '\\n');
  return row;
}
export const CUBE = {
  id: 'agent-${id}-state',
  primaryCatalog: { D: 7, name: 'STATE', prime: 17 },
  touches: [1, 15, 16, 17, 19, 20, 24, 34, 35, 44],
  gates: ['hookwall'], waves: ['single', 'pulse'],
  connectors: { 'agent-${id}': 'state-of', 'ix-chain-heartbeat': 'time-peer' },
  payload: { kind: 'agent-state', agent: '${id}', logPath: LOG, schema: ['seq','timestamp','intent','verb','target','scope','proof'], refresh, record },
  translate: {
    human:  'State: ${id} — append-only NDJSON log, latest seq via refresh().',
    agent:  '(${id}, state.track, local.self, 2, agent, hookwall, executing, [feeds], single, FA, log, persistent, falcon-gw, light)',
    device: 'state.log=' + LOG
  }
};
`;
}

const argvId = process.argv[2];
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url).replace(/^[/\\]+(?=[A-Za-z]:[\\/])/, '');
if (argvId && isDirectRun) {
  const { cubePath, logPath } = generateStateCube(argvId);
  console.log(`[state-cube.generate] agent=${argvId}`);
  console.log(`  cube: ${cubePath}`);
  console.log(`  log:  ${logPath}`);
}
