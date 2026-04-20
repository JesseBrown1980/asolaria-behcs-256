#!/usr/bin/env node
/**
 * behcs-memory-bridge.js — Memory files as BEHCS cubes.
 *
 * Every memory file gets a hilbertAddress and becomes queryable via bus.
 * Self-healing: missing memory referenced by cube → auto-create from finding.
 *
 * Usage:
 *   node behcs-memory-bridge.js --index     # index all memory files
 *   node behcs-memory-bridge.js --query <id> # query memory by id or keyword
 *   node behcs-memory-bridge.js --heal       # find broken refs, auto-create
 *   node behcs-memory-bridge.js --serve      # HTTP endpoint for bus queries
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const MEMORY_DIR = 'C:/Users/acer/.claude/projects/E--/memory';
const BEHCS_DIR = 'C:/Users/acer/Asolaria/data/behcs';
const INDEX_PATH = path.join(BEHCS_DIR, 'memory-cube-index.json');
const BEHCS_PORT = 4947;

let codex;
try { codex = require('./codex-bridge'); } catch (_) {
  codex = { hilbertAddress: k => crypto.createHash('sha256').update(k).digest('hex').slice(0, 16) };
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ═══ INDEX — scan all memory files, assign hilbertAddress ═══
function indexMemories() {
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
  const index = {};

  for (const f of files) {
    const content = fs.readFileSync(path.join(MEMORY_DIR, f), 'utf8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const typeMatch = content.match(/^type:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);

    const id = f.replace('.md', '');
    index[id] = {
      file: f,
      hilbert: codex.hilbertAddress('memory-' + id),
      name: nameMatch?.[1]?.trim() || id,
      type: typeMatch?.[1]?.trim() || 'unknown',
      description: descMatch?.[1]?.trim() || '',
      size: content.length,
      lines: content.split('\n').length,
    };
  }

  ensureDir(BEHCS_DIR);
  fs.writeFileSync(INDEX_PATH, JSON.stringify({ ts: new Date().toISOString(), count: Object.keys(index).length, memories: index }, null, 2));
  return index;
}

// ═══ QUERY — search by id, keyword, or hilbert address ═══
function queryMemory(query) {
  if (!fs.existsSync(INDEX_PATH)) indexMemories();
  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const q = query.toLowerCase();

  // Exact id match
  if (idx.memories[query]) {
    const m = idx.memories[query];
    const content = fs.readFileSync(path.join(MEMORY_DIR, m.file), 'utf8');
    return { found: true, ...m, content: content.slice(0, 2000) };
  }

  // Hilbert match
  for (const [id, m] of Object.entries(idx.memories)) {
    if (m.hilbert === query) {
      const content = fs.readFileSync(path.join(MEMORY_DIR, m.file), 'utf8');
      return { found: true, ...m, content: content.slice(0, 2000) };
    }
  }

  // Keyword search
  const results = Object.entries(idx.memories).filter(([id, m]) =>
    id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  ).map(([id, m]) => ({ id, ...m }));

  return { found: results.length > 0, results: results.slice(0, 10) };
}

// ═══ HEAL — find broken refs, auto-create ═══
function healMemories() {
  if (!fs.existsSync(INDEX_PATH)) indexMemories();
  const idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const memoryMd = path.join(MEMORY_DIR, 'MEMORY.md');
  const healed = [];

  if (fs.existsSync(memoryMd)) {
    const content = fs.readFileSync(memoryMd, 'utf8');
    const refs = content.match(/\[.*?\]\((.*?\.md)\)/g) || [];
    for (const ref of refs) {
      const file = ref.match(/\((.*?\.md)\)/)?.[1];
      if (file && !fs.existsSync(path.join(MEMORY_DIR, file))) {
        // Auto-create stub
        const id = file.replace('.md', '');
        const stub = `---\nname: ${id} (auto-healed)\ndescription: Auto-created by BEHCS memory bridge — referenced but missing\ntype: project\n---\n\nThis memory was referenced in MEMORY.md but did not exist. Auto-healed by BEHCS-LAW-006.\n`;
        fs.writeFileSync(path.join(MEMORY_DIR, file), stub);
        healed.push(file);
      }
    }
  }

  return { healed: healed.length, files: healed };
}

// ═══ SEND to bus ═══
function sendToBus(payload) {
  const env = JSON.stringify({
    from: 'acer', to: 'triad', mode: 'shadow', type: 'memory_query',
    id: 'mem-' + crypto.randomBytes(4).toString('hex'),
    ts: new Date().toISOString(), payload,
  });
  const req = http.request({
    hostname: '127.0.0.1', port: BEHCS_PORT, path: '/behcs/send',
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(env) },
  });
  req.on('error', () => {});
  req.write(env);
  req.end();
}

// ═══ MAIN ═══
const args = process.argv.slice(2);

if (args.includes('--index')) {
  const idx = indexMemories();
  const count = Object.keys(idx).length;
  console.log('Indexed ' + count + ' memory files');
  Object.entries(idx).slice(0, 5).forEach(([id, m]) => console.log('  ' + m.hilbert + ' ' + id + ' [' + m.type + ']'));
  if (count > 5) console.log('  ... +' + (count - 5) + ' more');
  sendToBus({ verb: 'memory.indexed', count, ts: new Date().toISOString() });
} else if (args.includes('--query')) {
  const q = args[args.indexOf('--query') + 1];
  const result = queryMemory(q);
  console.log(JSON.stringify(result, null, 2));
  sendToBus({ verb: 'memory.query', query: q, found: result.found });
} else if (args.includes('--heal')) {
  const result = healMemories();
  console.log('Healed ' + result.healed + ' missing memories');
  result.files.forEach(f => console.log('  HEALED: ' + f));
  sendToBus({ verb: 'memory.healed', count: result.healed, files: result.files });
} else {
  console.log('Usage: --index | --query <id> | --heal');
}
