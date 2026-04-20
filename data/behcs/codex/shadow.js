// codex/shadow.js — cube shadow management | IX-702 | ≤35 LOC
// ops: shadow(id) | diff(id) | promote(id) | discard(id) | list()
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url).replace(/^[/\\]+(?=[A-Za-z]:[\\/])/, ''));
const CUBES = path.join(HERE, '..', 'cubes');
const SHADOWS = path.join(CUBES, '.shadows');
const cubePath = id => path.join(CUBES, `${id}.cube.js`);
const shadowPath = id => path.join(SHADOWS, `${id}.cube.js`);
export function shadow(id) {
  fs.mkdirSync(SHADOWS, { recursive: true });
  if (!fs.existsSync(cubePath(id))) throw new Error(`no cube: ${id}`);
  fs.copyFileSync(cubePath(id), shadowPath(id));
  return shadowPath(id);
}
export function diff(id) {
  try { return execSync(`diff -u "${cubePath(id)}" "${shadowPath(id)}"`, { encoding: 'utf8' }); }
  catch (e) { return e.stdout || e.message; }
}
export function promote(id) {
  if (!fs.existsSync(shadowPath(id))) throw new Error(`no shadow: ${id}`);
  fs.copyFileSync(shadowPath(id), cubePath(id));
  fs.unlinkSync(shadowPath(id));
  return cubePath(id);
}
export function discard(id) { if (fs.existsSync(shadowPath(id))) fs.unlinkSync(shadowPath(id)); }
export function list() { return fs.existsSync(SHADOWS) ? fs.readdirSync(SHADOWS).filter(f=>f.endsWith('.cube.js')).map(f=>f.replace('.cube.js','')) : []; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url).replace(/^[/\\]+(?=[A-Za-z]:[\\/])/, '')) {
  const [,, op, id] = process.argv;
  const ops = { shadow, diff, promote, discard, list };
  if (!ops[op]) { console.error('usage: shadow.js <shadow|diff|promote|discard|list> [cube-id]'); process.exit(1); }
  const r = ops[op](id); if (r !== undefined) console.log(typeof r === 'string' ? r : JSON.stringify(r));
}
