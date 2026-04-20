// Glyph-dispatch: the REAL token-compression engine.
// D11:OBSERVED as of 2026-04-18 green smoke.
//
// If an incoming message is a BEHCS-256 glyph sentence like
//   "OP-ECHO{hello}@M-EYEWITNESS."
//   "OP-GLOB{**/*.md}@DEVICE"
//   "OP-READ{./kernel/glyph-families.json}@DEVICE"
// and the OP-* verb is in our LOCAL registry, the router executes a Node function
// directly. Zero tokens consumed. Zero cloud cost. Zero API dollars. Round-trip
// is bounded by syscall latency (microseconds-to-milliseconds), not cloud latency.
//
// This is what Jesse and big-pickle meant by "BEHCS-256 saves tokens." Tool calls
// dispatched via glyph never cross the provider boundary.

import { readFileSync, writeFileSync, statSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { hostname, platform, arch, freemem, totalmem, homedir } from "node:os";
import { parseAndValidate } from "../../kernel/src/index.ts";

const __dispatch_dir = dirname(fileURLToPath(import.meta.url));
const ASOLARIA_REPO_ROOT = resolve(__dispatch_dir, "..", "..", "..");

export interface GlyphCall {
  /** the OP verb, e.g. "OP-ECHO" */
  op: string;
  /** the argument inside {...}. For OP-GLOB, a pattern. For OP-READ, a path. */
  arg: string;
  /** tone / blast-radius after @, e.g. "M-EYEWITNESS", "DEVICE", etc. */
  tone?: string;
}

export interface GlyphDispatchResult {
  ok: boolean;
  op: string;
  result: string;
  local: true;
  tokens_consumed: 0;  // literal zero — no cloud touched
  cost_usd: 0;
  latency_ms: number;
  error?: string;
}

/** Match `OP-VERB{arg} @ TONE ?` — forgiving whitespace. */
const GLYPH_CALL_RE = /^\s*(OP-[A-Z][A-Z0-9_-]*)\s*\{([^}]*)\}\s*(?:@\s*([A-Z][A-Z0-9_-]*))?\s*\.?\s*$/;

export function parseGlyphCall(text: string): GlyphCall | null {
  const m = text.match(GLYPH_CALL_RE);
  if (!m) return null;
  return { op: m[1], arg: m[2].trim(), tone: m[3] };
}

export type LocalTool = (arg: string) => Promise<string> | string;

// ── Starter local-tool registry. Extend freely. ──────────────────────

async function tool_echo(arg: string): Promise<string> {
  return arg;
}

/** BUG-5 fix 2026-04-18: path-traversal hardening. Replaces `arg.includes("..")`
 *  which was trivially bypassable (%2e%2e/, absolute Windows paths like
 *  C:/Windows/System32, `....//` path-collapse). Uses resolve() + cwd prefix-
 *  check — the canonical method. Returns null on safe, error-string on unsafe. */
function pathSafeGuard(arg: string): string | null {
  if (!arg || arg.length > 4096) return "ERROR: path empty or > 4096 chars";
  // Reject URL-encoded traversal before any normalization.
  if (/%2e%2e|%2f|%5c/i.test(arg)) return "ERROR: path contains url-encoded traversal";
  // Reject raw absolute paths — only allow relative-to-cwd.
  if (isAbsolute(arg)) return "ERROR: absolute path not allowed";
  // Reject Windows drive-letter prefix even if not flagged by isAbsolute.
  if (/^[a-zA-Z]:/.test(arg)) return "ERROR: drive-letter prefix not allowed";
  // Reject UNC paths.
  if (arg.startsWith("\\\\") || arg.startsWith("//")) return "ERROR: UNC path not allowed";
  // Resolve and verify the resolved path stays inside cwd.
  const cwd = process.cwd();
  const abs = resolve(cwd, arg);
  const cwdNorm = resolve(cwd);
  if (!abs.startsWith(cwdNorm + (cwdNorm.endsWith("/") || cwdNorm.endsWith("\\") ? "" : process.platform === "win32" ? "\\" : "/")) && abs !== cwdNorm) {
    return "ERROR: path escapes cwd after resolution";
  }
  return null;
}

async function tool_glob(arg: string): Promise<string> {
  const err = pathSafeGuard(arg);
  if (err) return err;
  const hits: string[] = [];
  const cwd = process.cwd();
  try {
    // node:fs/promises.glob is Node 22+; we're on 24.x
    for await (const entry of glob(arg, { cwd })) {
      hits.push(String(entry));
      if (hits.length >= 500) break;  // cap result size
    }
    return JSON.stringify({ count: hits.length, results: hits.slice(0, 500) });
  } catch (e) {
    return `ERROR: glob failed: ${(e as Error).message}`;
  }
}

async function tool_read(arg: string): Promise<string> {
  const err = pathSafeGuard(arg);
  if (err) return err;
  try {
    const abs = resolve(process.cwd(), arg);
    const buf = readFileSync(abs, "utf-8");
    if (buf.length > 100_000) {
      return JSON.stringify({ truncated: true, head: buf.slice(0, 100_000), total_bytes: buf.length });
    }
    return JSON.stringify({ content: buf, bytes: buf.length });
  } catch (e) {
    return `ERROR: read failed: ${(e as Error).message}`;
  }
}

async function tool_stat(arg: string): Promise<string> {
  const err = pathSafeGuard(arg);
  if (err) return err;
  try {
    const abs = resolve(process.cwd(), arg);
    const s = statSync(abs);
    return JSON.stringify({
      path: arg,
      size: s.size,
      is_file: s.isFile(),
      is_dir: s.isDirectory(),
      mtime: s.mtime.toISOString(),
    });
  } catch (e) {
    return `ERROR: stat failed: ${(e as Error).message}`;
  }
}

async function tool_now(_arg: string): Promise<string> {
  return JSON.stringify({ ts: new Date().toISOString(), epoch_ms: Date.now() });
}

async function tool_version(_arg: string): Promise<string> {
  return JSON.stringify({
    omni_router: "0.4.0",
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  });
}

// ── v0.6 extension: 6 new verbs (builder-v06-verbs lane) ───────────────

/** Spawn a command (shell:false) and collect stdout/stderr/exit. */
function spawnCollect(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString("utf-8"); });
    child.stderr.on("data", (d) => { stderr += d.toString("utf-8"); });
    child.on("error", (e) => { res({ code: -1, stdout, stderr: stderr + String(e) }); });
    child.on("close", (code) => { res({ code: code ?? -1, stdout, stderr }); });
  });
}

async function tool_diff(arg: string): Promise<string> {
  if (arg.includes("..")) return JSON.stringify({ ok: false, error: "path cannot contain '..'" });
  const target = arg.trim() || ".";
  const { code, stdout, stderr } = await spawnCollect("git", ["diff", "--stat", target], process.cwd());
  return JSON.stringify({ ok: code === 0, exit_code: code, stdout, stderr, path: target });
}

async function tool_git_status(_arg: string): Promise<string> {
  // porcelain-v1 + branch header via -b
  const { code, stdout, stderr } = await spawnCollect("git", ["status", "--short", "-b"], process.cwd());
  if (code !== 0) {
    return JSON.stringify({ ok: false, exit_code: code, stderr });
  }
  const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0);
  let branch = "";
  let ahead = 0;
  let behind = 0;
  const dirty_files: Array<{ status: string; path: string }> = [];
  for (const line of lines) {
    if (line.startsWith("##")) {
      // ## main...origin/main [ahead 2, behind 1]
      const rest = line.slice(2).trim();
      const firstSpace = rest.indexOf(" ");
      const head = firstSpace === -1 ? rest : rest.slice(0, firstSpace);
      branch = head.split("...")[0];
      const aMatch = rest.match(/ahead (\d+)/);
      const bMatch = rest.match(/behind (\d+)/);
      if (aMatch) ahead = parseInt(aMatch[1], 10);
      if (bMatch) behind = parseInt(bMatch[1], 10);
    } else {
      const status = line.slice(0, 2);
      const path = line.slice(3);
      dirty_files.push({ status, path });
    }
  }
  return JSON.stringify({ ok: true, branch, dirty_files, ahead, behind });
}

async function tool_validate_behcs256(arg: string): Promise<string> {
  try {
    const { parsed, result } = parseAndValidate(arg);
    return JSON.stringify({
      ok: result.ok,
      atoms: result.atoms,
      mood: result.mood,
      effective_blast: result.effective_blast,
      diagnostics: result.diagnostics,
      violations_count: result.diagnostics.length,
      operator_witness: parsed.operator_witness ?? null,
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      atoms: [],
      mood: null,
      effective_blast: null,
      diagnostics: [{ subtype: "parse_error", message: (e as Error).message }],
      violations_count: 1,
    });
  }
}

async function tool_ndjson_append(arg: string): Promise<string> {
  const sep = arg.indexOf("|");
  if (sep < 0) return JSON.stringify({ ok: false, error: "arg must be 'path|line'" });
  const rawPath = arg.slice(0, sep).trim();
  const line = arg.slice(sep + 1);
  if (rawPath.includes("..")) return JSON.stringify({ ok: false, error: "path cannot contain '..'" });
  const root = resolve(homedir(), ".asolaria-workers");
  const abs = isAbsolute(rawPath) ? resolve(rawPath) : resolve(root, rawPath);
  if (!abs.startsWith(root)) {
    return JSON.stringify({ ok: false, error: `path must be under ${root}` });
  }
  try {
    const dir = abs.slice(0, abs.lastIndexOf("\\") !== -1 ? abs.lastIndexOf("\\") : abs.lastIndexOf("/"));
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload = line + "\n";
    appendFileSync(abs, payload, "utf-8");
    const content = existsSync(abs) ? readFileSync(abs, "utf-8") : "";
    const lines_in_file = content.length === 0 ? 0 : content.split("\n").filter((l) => l.length > 0).length;
    return JSON.stringify({ ok: true, path: abs, bytes_appended: Buffer.byteLength(payload, "utf-8"), lines_in_file });
  } catch (e) {
    return JSON.stringify({ ok: false, error: (e as Error).message });
  }
}

async function tool_hash_sha256(arg: string): Promise<string> {
  return createHash("sha256").update(arg).digest("hex");
}

async function tool_env_fingerprint(_arg: string): Promise<string> {
  return JSON.stringify({
    hostname: hostname(),
    platform: platform(),
    arch: arch(),
    node_version: process.version,
    cwd: process.cwd(),
    pid: process.pid,
    mem_free_mb: Math.round(freemem() / (1024 * 1024)),
    mem_total_mb: Math.round(totalmem() / (1024 * 1024)),
    ts: new Date().toISOString(),
  });
}

// ── v0.7 additions: supervisor registry — instant agent-state recall ──

async function tool_summon(arg: string): Promise<string> {
  // Lazy-import so supervisor-registry stays optional for callers that only
  // want v0.6 verbs. Errors if the registry package is missing.
  const mod = await import("../../supervisor-registry/src/cache.ts");
  try {
    const result = mod.summonSupervisor(arg.trim(), { ttlMs: 5 * 60 * 1000 });
    return JSON.stringify({
      ok: true,
      profile: arg.trim(),
      source: result.source,
      age_ms: result.age_ms,
      corpus: result.corpus,
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: (e as Error).message });
  }
}

async function tool_supervisor_list(_arg: string): Promise<string> {
  const mod = await import("../../supervisor-registry/src/cache.ts");
  return JSON.stringify({ ok: true, cached: mod.listCachedSupervisors() });
}

// ── v0.8 additions: GC + Gulp (anti-explosion) ─────────────────────

async function tool_gc(_arg: string): Promise<string> {
  const mod = await import("../../omni-gulp-gc/src/gc.ts");
  const result = mod.runGc();
  return JSON.stringify({ ok: true, ...result });
}

async function tool_gulp(arg: string): Promise<string> {
  const mod = await import("../../omni-gulp-gc/src/gulp.ts");
  // arg = optional integer minutes to look back; default 60
  const minutes = arg.trim() ? parseInt(arg.trim(), 10) : 60;
  const sinceMs = Date.now() - Math.max(1, isNaN(minutes) ? 60 : minutes) * 60 * 1000;
  const result = mod.runGulp({ sinceMs });
  return JSON.stringify({
    ok: true,
    scanned_lines: result.scanned_lines,
    top_kinds: result.top_10_event_kinds.map((p) => ({ kind: p.key, count: p.count })),
    summary_sentences: result.summary_sentences,
    ms: result.ms,
  });
}

async function tool_log_stats(_arg: string): Promise<string> {
  const mod = await import("../../omni-gulp-gc/src/gc.ts");
  return JSON.stringify({ ok: true, logs: mod.logStats(), archive: mod.listArchive() });
}

// ── v0.9 additions: the 4 Hermes meta-primitive verbs (minted 2026-04-18) ──
//
// These operationalize the 4 Phase-1 glyphs canonized in commit f6f7c9b.
// SKILLBUILD proposes; GUARDSCAN gates; HUBSYNC detects drift; PROGDISCLOSE loads on-demand.

const GUARDSCAN_EVENTS = join(homedir(), ".asolaria-workers", "guardscan-events.ndjson");
const SKILLBUILD_EVENTS = join(homedir(), ".asolaria-workers", "skillbuild-events.ndjson");
const HUBSYNC_EVENTS = join(homedir(), ".asolaria-workers", "hubsync-events.ndjson");

function appendGlyphEvent(file: string, record: Record<string, unknown>): void {
  try {
    mkdirSync(join(homedir(), ".asolaria-workers"), { recursive: true });
    appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n");
  } catch { /* non-fatal */ }
}

/** OP-GUARDSCAN{<text>|<path>} — un-overridable block-on-dangerous gate.
 *  Heuristic checks: exec/shell patterns, credential-like strings, prompt-injection markers,
 *  cross-host privesc attempts, destructive file ops. Returns VERDICT=CLEAN|SUSPECT|DANGEROUS.
 *  This IS the pre-dispatch gate for the router smart-mode. */
async function tool_guardscan(arg: string): Promise<string> {
  const input = arg.trim();
  if (!input) return JSON.stringify({ ok: false, error: "empty_input" });

  let text = input;
  let source = "inline";
  // If it's a readable path, scan file contents instead.
  if (!input.includes("\n") && input.length < 400 && existsSync(input)) {
    try { text = readFileSync(input, "utf-8").slice(0, 200_000); source = input; }
    catch { /* keep inline */ }
  }

  const patterns: Array<{ name: string; re: RegExp; weight: number }> = [
    { name: "shell-exec", re: /\b(exec|eval)\s*\(\s*(shell|child_process|os\.system|subprocess\.(Popen|run))/i, weight: 40 },
    { name: "rm-rf", re: /\brm\s+-rf\s+\/(\s|$)/i, weight: 60 },
    { name: "fork-bomb", re: /:\(\)\{\s*:\|:&\s*\};:/, weight: 80 },
    { name: "curl-pipe-sh", re: /\bcurl\s+[^\s|]+\s*\|\s*(ba)?sh\b/i, weight: 50 },
    { name: "ignore-previous-instructions", re: /ignore\s+(all\s+)?previous\s+(instructions|context|prompts)/i, weight: 30 },
    { name: "system-prompt-reveal", re: /(reveal|print|dump)\s+(your|the)\s+system\s+prompt/i, weight: 25 },
    { name: "api-key-string", re: /\b(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/, weight: 35 },
    { name: "destructive-git", re: /\bgit\s+(push\s+--force\s+(origin\s+)?(main|master)|reset\s+--hard\s+HEAD)/, weight: 25 },
    { name: "cross-host-write", re: /\\\\[a-z0-9_-]+\\[a-z]\$|smb:\/\/[^\s]+\/[a-z]\$/i, weight: 45 },
    { name: "zero-width-injection", re: /[\u200B\u200C\u200D\uFEFF]/, weight: 20 },
    { name: "base64-encoded-shell", re: /\beval\s*\(\s*(atob|Buffer\.from)[^)]+base64/i, weight: 40 },
    // BUG-1 fix 2026-04-18: sensitive-path-glob exfil. Without these, OP-GLOB{**/*.env}
    // or OP-GLOB{**/.ssh/id_*} passed as CLEAN and the gate missed the attack it
    // was supposed to catch. Weights sum ≥ 50 individually so single hit = DANGEROUS.
    { name: "exfil-env-glob",          re: /(\*\*\/)?[*.]*\.env(\.|\b|$)|\benv\.local\b|\.env\.[a-z]+\b/i, weight: 55 },
    { name: "exfil-ssh-keys",          re: /(\*\*\/)?\.ssh\/(id_|authorized_keys|known_hosts)|id_rsa\b|id_ed25519\b|\.pub$/i, weight: 55 },
    { name: "exfil-aws-creds",         re: /(\*\*\/)?\.aws\/(credentials|config)\b|\baws_secret_access_key\b/i, weight: 55 },
    { name: "exfil-browser-profiles",  re: /(\*\*\/)?(Login Data|Cookies|Web Data|Local State)\b|(\*\*\/)?cookies\.sqlite\b/i, weight: 50 },
    { name: "exfil-wallet-files",      re: /(\*\*\/)?wallet\.dat\b|(\*\*\/)?keystore\/UTC--/i, weight: 60 },
    { name: "exfil-token-jsons",       re: /(\*\*\/)?\.?(claude|anthropic|openai|github|gcloud)\/?.*token.*\.json\b/i, weight: 55 },
    { name: "exfil-npmrc-gitconfig",   re: /(\*\*\/)?\.(npmrc|gitconfig|netrc)\b/i, weight: 45 },
  ];

  const hits: Array<{ name: string; weight: number }> = [];
  let score = 0;
  for (const p of patterns) {
    if (p.re.test(text)) { hits.push({ name: p.name, weight: p.weight }); score += p.weight; }
  }

  let verdict: "CLEAN" | "SUSPECT" | "DANGEROUS" = "CLEAN";
  if (score >= 50) verdict = "DANGEROUS";
  else if (score >= 20) verdict = "SUSPECT";

  const sentence = `EVT-GUARDSCAN-${verdict} · score=${score} · hits=${hits.length} @ M-EYEWITNESS .`;
  appendGlyphEvent(GUARDSCAN_EVENTS, {
    event: `EVT-GUARDSCAN-${verdict}`,
    source,
    score,
    hits,
    text_len: text.length,
    glyph_sentence: sentence,
  });

  return JSON.stringify({
    ok: true,
    verdict,
    score,
    hits,
    source,
    text_len: text.length,
    block: verdict === "DANGEROUS",
    glyph_sentence: sentence,
  });
}

/** OP-SKILLBUILD{<name>|<json>} — autonomous-procedural-memory proposal.
 *  Writes a PROF-HERMES-* glyph proposal to prof-hermes-delta.json pending.
 *  Does NOT mutate the canonical registry; requires operator + 6-body review. */
async function tool_skillbuild(arg: string): Promise<string> {
  let name = arg.trim();
  let description = "";
  let category = "autonomous-authored";
  // Support JSON payload
  if (name.startsWith("{")) {
    try {
      const parsed = JSON.parse(name) as { name?: string; description?: string; category?: string };
      name = (parsed.name ?? "").trim();
      description = (parsed.description ?? "").trim();
      category = (parsed.category ?? "autonomous-authored").trim();
    } catch { /* fall through */ }
  }
  if (!name) return JSON.stringify({ ok: false, error: "name_required" });

  // GUARDSCAN gate: refuse dangerous names/descriptions before proposal
  const scanText = `${name}\n${description}`;
  const scanResult = JSON.parse(await tool_guardscan(scanText)) as { verdict: string; block: boolean };
  if (scanResult.block) {
    return JSON.stringify({ ok: false, error: "guardscan_block", verdict: scanResult.verdict });
  }

  const normalized = name.toUpperCase().replace(/[^A-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const glyph = `PROF-HERMES-${normalized}-PROPOSED`;
  const proposal = {
    glyph,
    name,
    description,
    category,
    proposed_at: new Date().toISOString(),
    mint_status: "AWAITING_6_BODY_REVIEW",
    guardscan_verdict: scanResult.verdict,
    authority_required: "rayssa verbatim_go + 6-body review per OPERATOR-DECISION-TREE.md:38",
  };
  appendGlyphEvent(SKILLBUILD_EVENTS, {
    event: "EVT-SKILL-PROPOSED",
    ...proposal,
    glyph_sentence: `EVT-SKILL-PROPOSED { ${glyph} } @ M-SUBJUNCTIVE .`,
  });
  return JSON.stringify({ ok: true, ...proposal });
}

/** OP-HUBSYNC{} — registry drift detection across 3 canonical files.
 *  Returns per-file sha256 + last-known + drift classification. */
async function tool_hubsync(arg: string): Promise<string> {
  const started = Date.now();
  const targets = [
    { path: join(ASOLARIA_REPO_ROOT, "kernel", "glyph-families.json"), role: "canonical-registry" },
    { path: join(ASOLARIA_REPO_ROOT, "packages", "hermes-absorption", "prof-hermes-delta.json"), role: "hermes-delta" },
    { path: join(ASOLARIA_REPO_ROOT, "kernel", "D11-proof-levels.json"), role: "proof-levels" },
  ];
  const stateFile = join(homedir(), ".asolaria-workers", "hubsync-state.json");
  let prevState: Record<string, string> = {};
  if (existsSync(stateFile)) {
    try { prevState = JSON.parse(readFileSync(stateFile, "utf-8")) as Record<string, string>; } catch { /* empty state */ }
  }
  // BUG-2 fix 2026-04-18: baseline-hydration. First call over a pre-populated
  // repo SHOULD register BASELINE (not NEW — NEW implies genuinely-new file).
  // The state-file existence is the discriminator: no state-file = first-ever
  // run (BASELINE all existing files); state-file exists but entry missing =
  // genuinely-new file since last sync (NEW).
  const firstEverRun = !existsSync(stateFile);
  const report = targets.map((t) => {
    if (!existsSync(t.path)) return { path: t.path, role: t.role, exists: false, sha256: null, drift: "MISSING" };
    const raw = readFileSync(t.path, "utf-8");
    const sha = createHash("sha256").update(raw).digest("hex");
    const prev = prevState[t.path];
    let drift: "BASELINE" | "NEW" | "STABLE" | "CHANGED";
    if (!prev) drift = firstEverRun ? "BASELINE" : "NEW";
    else drift = sha === prev ? "STABLE" : "CHANGED";
    return { path: t.path, role: t.role, exists: true, sha256: sha, drift, prev_sha256: prev };
  });
  // Persist new state
  const nextState: Record<string, string> = { ...prevState };
  for (const r of report) if (r.sha256) nextState[r.path] = r.sha256;
  try {
    mkdirSync(join(homedir(), ".asolaria-workers"), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(nextState, null, 2), "utf-8");
  } catch { /* non-fatal */ }

  const anyDrift = report.some((r) => r.drift === "CHANGED" || r.drift === "MISSING");
  const glyph_sentence = `EVT-HUBSYNC-${anyDrift ? "DRIFT-OBSERVED" : "STABLE"} · ${report.length} TARGETS @ M-EYEWITNESS .`;
  appendGlyphEvent(HUBSYNC_EVENTS, {
    event: anyDrift ? "EVT-HUBSYNC-DRIFT-OBSERVED" : "EVT-HUBSYNC-STABLE",
    targets: report,
    glyph_sentence,
  });
  return JSON.stringify({ ok: true, any_drift: anyDrift, report, ms: Date.now() - started, glyph_sentence });
}


/** OP-PROGDISCLOSE{<level>[:<glyph>]} — L0/L1/L2 token ladder over Hermes catalog.
 *  L0 = just glyph list (3k-token budget).
 *  L1 = glyph + description + category.
 *  L2 = full atom (+ platforms + tags + skill_md_path) for a single glyph.
 */
async function tool_progdisclose(arg: string): Promise<string> {
  const s = arg.trim();
  const [levelRaw, glyphFilter] = s.split(":").map((x) => x.trim());
  const level = (levelRaw || "L0").toUpperCase();
  const deltaPath = join(ASOLARIA_REPO_ROOT, "packages", "hermes-absorption", "prof-hermes-delta.json");
  if (!existsSync(deltaPath)) return JSON.stringify({ ok: false, error: "delta_missing" });
  const delta = JSON.parse(readFileSync(deltaPath, "utf-8")) as {
    meta_primitives?: Array<{ glyph: string; rationale?: string; mint_status?: string }>;
    atoms?: Array<{
      glyph: string;
      name: string;
      description: string;
      category: string;
      tree: string;
      platforms?: string[];
      tags?: string[];
      skill_md_path?: string;
      mint_status?: string;
      prior_eval?: { phase: string; cross_walk_prof: string[] };
    }>;
  };
  const all = [
    ...(delta.meta_primitives ?? []).map((m) => ({ glyph: m.glyph, category: "meta-primitive", description: m.rationale ?? "", tree: "meta", mint_status: m.mint_status ?? "AWAITING_6_BODY_REVIEW" })),
    ...(delta.atoms ?? []),
  ];

  if (level === "L0") {
    return JSON.stringify({
      ok: true,
      level: "L0",
      total: all.length,
      glyphs: all.map((a) => a.glyph),
    });
  }
  if (level === "L1") {
    return JSON.stringify({
      ok: true,
      level: "L1",
      total: all.length,
      atoms: all.map((a) => ({
        glyph: a.glyph,
        category: (a as { category?: string }).category ?? "meta-primitive",
        description: (a as { description?: string }).description ?? "",
        mint_status: (a as { mint_status?: string }).mint_status ?? "AWAITING_6_BODY_REVIEW",
      })),
    });
  }
  if (level === "L2") {
    if (!glyphFilter) return JSON.stringify({ ok: false, error: "L2_requires_glyph", usage: "OP-PROGDISCLOSE{L2:PROF-HERMES-CLAUDE-CODE}" });
    // BUG-3 fix 2026-04-18: detect + surface name collisions between meta-primitives
    // and skill atoms. Previously `.find()` silently picked the first (meta wins)
    // and shadowed the richer atom. Now we return BOTH when both match + flag collision.
    const matches = all.filter((a) => a.glyph === glyphFilter);
    if (matches.length === 0) return JSON.stringify({ ok: false, error: "glyph_not_found", glyph: glyphFilter });
    if (matches.length > 1) {
      return JSON.stringify({
        ok: true, level: "L2", collision: true,
        glyph: glyphFilter, match_count: matches.length,
        matches, warning: "glyph matches multiple entries — operator must disambiguate via @modifier per BEHCS-256-GRAMMAR family_ambiguity rule",
      });
    }
    return JSON.stringify({ ok: true, level: "L2", atom: matches[0] });
  }
  return JSON.stringify({ ok: false, error: `unknown_level: ${level}`, accepted: ["L0", "L1", "L2"] });
}

async function tool_supervisor_refresh(arg: string): Promise<string> {
  const mod = await import("../../supervisor-registry/src/cache.ts");
  try {
    if (arg.trim() === "" || arg.trim() === "*") {
      const all = mod.refreshAllSupervisors();
      return JSON.stringify({
        ok: true,
        refreshed: all.map((r) => ({
          profile: r.corpus.profile_glyph,
          d11: r.corpus.d11_level,
          sentences: r.corpus.sentences.length,
          compile_ms: r.corpus.refresh_cost_ms,
        })),
      });
    }
    const result = mod.summonSupervisor(arg.trim(), { forceRefresh: true });
    return JSON.stringify({
      ok: true,
      profile: arg.trim(),
      d11: result.corpus.d11_level,
      sentences: result.corpus.sentences.length,
      compile_ms: result.corpus.refresh_cost_ms,
    });
  } catch (e) {
    return JSON.stringify({ ok: false, error: (e as Error).message });
  }
}

export const LOCAL_TOOL_REGISTRY: Record<string, LocalTool> = {
  "OP-ECHO":    tool_echo,
  "OP-GLOB":    tool_glob,
  "OP-READ":    tool_read,
  "OP-STAT":    tool_stat,
  "OP-NOW":     tool_now,
  "OP-VERSION": tool_version,
  // v0.6 additions
  "OP-DIFF":              tool_diff,
  "OP-GIT-STATUS":        tool_git_status,
  "OP-VALIDATE-BEHCS256": tool_validate_behcs256,
  "OP-NDJSON-APPEND":     tool_ndjson_append,
  "OP-HASH-SHA256":       tool_hash_sha256,
  "OP-ENV-FINGERPRINT":   tool_env_fingerprint,
  // v0.7 — supervisor registry
  "OP-SUMMON":             tool_summon,
  "OP-SUPERVISOR-LIST":    tool_supervisor_list,
  "OP-SUPERVISOR-REFRESH": tool_supervisor_refresh,
  // v0.8 — anti-explosion (GC + Gulp)
  "OP-GC":                 tool_gc,
  "OP-GULP":               tool_gulp,
  "OP-LOG-STATS":          tool_log_stats,
  // v0.9 — Hermes meta-primitive verbs (minted 2026-04-18 batch hermes-phase-1-2)
  "OP-GUARDSCAN":          tool_guardscan,
  "OP-SKILLBUILD":         tool_skillbuild,
  "OP-HUBSYNC":            tool_hubsync,
  "OP-PROGDISCLOSE":       tool_progdisclose,
};

/** Ops that are ALWAYS safe — bypass GUARDSCAN to prevent recursion + cheap-path preservation.
 *  GUARDSCAN itself + read-only metadata ops. */
const GUARDSCAN_BYPASS = new Set<string>([
  "OP-GUARDSCAN",
  "OP-ECHO",
  "OP-NOW",
  "OP-VERSION",
  "OP-STAT",
  "OP-HASH-SHA256",
  "OP-ENV-FINGERPRINT",
  "OP-LOG-STATS",
  "OP-SUPERVISOR-LIST",
]);

export async function dispatchGlyphLocal(call: GlyphCall): Promise<GlyphDispatchResult> {
  const started = Date.now();
  const tool = LOCAL_TOOL_REGISTRY[call.op];
  if (!tool) {
    return {
      ok: false, op: call.op, result: "", local: true,
      tokens_consumed: 0, cost_usd: 0, latency_ms: Date.now() - started,
      error: `unknown_op: ${call.op} not in LOCAL_TOOL_REGISTRY`,
    };
  }

  // PRE-DISPATCH GATE: run GUARDSCAN on the argument payload for any op not in bypass list.
  // Emits EVT-GUARDSCAN-* and refuses dispatch on DANGEROUS verdict.
  //
  // BUG-4 fix 2026-04-18: fail-CLOSED on scanner errors (was fail-OPEN). Previous
  // behavior let any thrown-exception bypass the "un-overridable block" invariant
  // — attacker could craft input that induced a scanner throw and slip past.
  if (!GUARDSCAN_BYPASS.has(call.op) && call.arg) {
    try {
      const scanJson = await tool_guardscan(call.arg);
      const scan = JSON.parse(scanJson) as { verdict: string; block: boolean; score: number; hits: unknown[] };
      if (scan.block) {
        appendGlyphEvent(GUARDSCAN_EVENTS, {
          event: "EVT-DISPATCH-BLOCKED",
          op: call.op,
          verdict: scan.verdict,
          score: scan.score,
          hits: scan.hits,
          glyph_sentence: `EVT-DISPATCH-BLOCKED · ${call.op} · DANGEROUS score=${scan.score} @ M-EYEWITNESS .`,
        });
        return {
          ok: false, op: call.op, result: "", local: true,
          tokens_consumed: 0, cost_usd: 0, latency_ms: Date.now() - started,
          error: `guardscan_block: verdict=${scan.verdict} score=${scan.score} hits=${JSON.stringify(scan.hits)}`,
        };
      }
    } catch (e) {
      // fail-CLOSED: scanner threw → treat as DANGEROUS and refuse. Emit EVT-GUARDSCAN-ERROR.
      appendGlyphEvent(GUARDSCAN_EVENTS, {
        event: "EVT-GUARDSCAN-ERROR",
        op: call.op,
        error: (e as Error).message,
        glyph_sentence: `EVT-GUARDSCAN-ERROR · ${call.op} · fail-closed @ M-EYEWITNESS .`,
      });
      return {
        ok: false, op: call.op, result: "", local: true,
        tokens_consumed: 0, cost_usd: 0, latency_ms: Date.now() - started,
        error: `guardscan_error_fail_closed: ${(e as Error).message}`,
      };
    }
  }

  try {
    const result = await tool(call.arg);
    return {
      ok: true, op: call.op, result, local: true,
      tokens_consumed: 0, cost_usd: 0, latency_ms: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false, op: call.op, result: "", local: true,
      tokens_consumed: 0, cost_usd: 0, latency_ms: Date.now() - started,
      error: `tool_error: ${(e as Error).message}`,
    };
  }
}

export function isLocalOp(op: string): boolean {
  return op in LOCAL_TOOL_REGISTRY;
}

export function listLocalOps(): string[] {
  return Object.keys(LOCAL_TOOL_REGISTRY);
}
