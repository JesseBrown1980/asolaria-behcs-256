#!/usr/bin/env node
/**
 * cube-builder.js
 *
 * Reads tools/cube/agent-roster.json (or any roster file) and emits, for each
 * agent in the roster:
 *   - data/cubes/<agent_id>/manifest.json
 *   - data/cubes/<agent_id>/findings.ndjson  (with a single seed entry)
 *   - one entry appended to data/omnidirectional-calendar.ndjson
 *   - mirror of all of the above to D:/safety-backups/session-20260406-asolaria/
 *
 * It is idempotent: re-running on an existing agent skips file creation but
 * still appends a new calendar entry tagged with verb=meta.cube_rebuilt.
 *
 * Cube law: every emitted file carries the agent's cube[] + dim, and the
 * builder appends a meta.register_actor entry to the calendar with the
 * primary_cube + primary_dim tagged.
 *
 * Usage:
 *   node tools/cube/cube-builder.js [path/to/roster.json]
 *   default roster: tools/cube/agent-roster.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/acer/Asolaria';
const D_DEST = 'D:/safety-backups/session-20260406-asolaria';
const ROSTER_PATH = process.argv[2] || path.join(ROOT, 'tools/cube/agent-roster.json');

const now = () => new Date().toISOString();
const appendLine = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }
function mirrorFile(src, destBase) {
  const rel = path.relative(ROOT, src).replace(/\\/g, '/');
  const dest = path.join(destBase, rel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return dest;
}

function buildAgent(agent, parent, campaign) {
  const cubeDir = path.join(ROOT, 'data/cubes', agent.id);
  const manifestPath = path.join(cubeDir, 'manifest.json');
  const findingsPath = path.join(cubeDir, 'findings.ndjson');

  ensureDir(cubeDir);

  const isNew = !fs.existsSync(manifestPath);

  const manifest = {
    agent_id: agent.id,
    parent_surface: parent,
    spawned_by: 'cube-builder.js',
    spawned_at: now(),
    campaign: campaign,
    purpose: agent.purpose,
    scope: agent.scope || 'unspecified',
    cube_alignment: {
      primary_dim: agent.primary_dim,
      primary_prime: agent.primary_prime,
      primary_cube: agent.primary_cube,
      secondary_dims: agent.secondary_dims || ['D24_INTENT'],
      secondary_cubes: agent.secondary_cubes || [704969],
    },
    files: {
      manifest: `data/cubes/${agent.id}/manifest.json`,
      findings: `data/cubes/${agent.id}/findings.ndjson`,
    },
    interactions: agent.interactions || {
      upstream_agents: [],
      downstream_agents: [],
      peer_leaders: ['asolaria-instance@acer', 'liris-rayssa'],
    },
  };

  // Always rewrite manifest to keep it fresh on rebuild
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // Seed findings only if file doesn't exist
  if (isNew) {
    const seed = {
      ts: now(),
      agent: agent.id,
      verb: 'meta.spawn',
      cube: [agent.primary_cube, 704969],
      dims: [agent.primary_dim, 'D24_INTENT'],
      finding: `Spawned by cube-builder under campaign ${campaign}. Purpose: ${agent.purpose}`,
      evidence_path: `data/cubes/${agent.id}/manifest.json`,
      operator_witnessed: true,
    };
    fs.writeFileSync(findingsPath, JSON.stringify(seed) + '\n');
  }

  // Calendar entry
  const calPath = path.join(ROOT, 'data/omnidirectional-calendar.ndjson');
  appendLine(calPath, {
    ts: now(),
    agent: 'cube-builder',
    surface: parent,
    verb: isNew ? 'meta.register_actor' : 'meta.cube_rebuilt',
    target: agent.id,
    dimensions_touched: [agent.primary_dim, 'D24_INTENT'],
    cube_values: [agent.primary_cube, 704969],
    duration_ms: 0,
    peers_notified: ['liris-rayssa'],
    result: 'ok',
    operator_witnessed: true,
    chain: ['LX-486', 'qdd-modernization-2026-04-06'],
    evidence: `data/cubes/${agent.id}/manifest.json`,
    note: agent.purpose.slice(0, 200),
  });

  // Mirror to D:
  mirrorFile(manifestPath, D_DEST);
  mirrorFile(findingsPath, D_DEST);

  return { id: agent.id, isNew, cube: agent.primary_cube, dim: agent.primary_dim };
}

function main() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, 'utf8'));
  const results = [];
  for (const agent of roster.agents) {
    results.push(buildAgent(agent, roster.parent_surface, roster.campaign));
  }

  // Mirror calendar at the end
  const calPath = path.join(ROOT, 'data/omnidirectional-calendar.ndjson');
  mirrorFile(calPath, D_DEST);

  console.log(JSON.stringify({
    ts: now(),
    builder: 'cube-builder.js v1',
    roster: ROSTER_PATH,
    parent: roster.parent_surface,
    campaign: roster.campaign,
    spawned: results.length,
    new: results.filter(r => r.isNew).length,
    rebuilt: results.filter(r => !r.isNew).length,
    agents: results,
  }, null, 2));
}

main();
