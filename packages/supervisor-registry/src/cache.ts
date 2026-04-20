// Supervisor corpus cache — writes compiled corpora to ~/.asolaria-workers/supervisors/
// for instant (<10ms) recall by any agent that POSTs OP-SUMMON{PROF-*} to the router.
// TTL: a compiled corpus is considered fresh for N minutes; after that, recompile.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { compileSupervisor, type SupervisorCorpus, listSupervisors } from "./compile.ts";

const CACHE_DIR = join(homedir(), ".asolaria-workers", "supervisors");
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min

mkdirSync(CACHE_DIR, { recursive: true });

function cachePath(profile: string): string {
  return join(CACHE_DIR, `${profile.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.json`);
}

export interface SummonOptions {
  forceRefresh?: boolean;
  ttlMs?: number;
}

export interface SummonResult {
  corpus: SupervisorCorpus;
  source: "cache" | "fresh";
  age_ms: number;
}

export function summonSupervisor(profile: string, opts: SummonOptions = {}): SummonResult {
  const file = cachePath(profile);
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;

  if (!opts.forceRefresh && existsSync(file)) {
    try {
      const stat = statSync(file);
      const age = Date.now() - stat.mtimeMs;
      if (age < ttl) {
        const raw = readFileSync(file, "utf-8");
        const corpus = JSON.parse(raw) as SupervisorCorpus;
        return { corpus, source: "cache", age_ms: Math.floor(age) };
      }
    } catch { /* fall through to fresh compile */ }
  }

  const corpus = compileSupervisor(profile);
  writeFileSync(file, JSON.stringify(corpus, null, 2), "utf-8");
  return { corpus, source: "fresh", age_ms: 0 };
}

export function refreshAllSupervisors(): SummonResult[] {
  return listSupervisors().map((p) => summonSupervisor(p, { forceRefresh: true }));
}

export function listCachedSupervisors(): Array<{ profile: string; age_ms: number; bytes: number }> {
  return listSupervisors().map((p) => {
    const f = cachePath(p);
    if (!existsSync(f)) return { profile: p, age_ms: -1, bytes: 0 };
    const s = statSync(f);
    return { profile: p, age_ms: Date.now() - s.mtimeMs, bytes: s.size };
  });
}
