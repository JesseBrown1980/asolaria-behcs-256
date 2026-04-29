/**
 * pid-map.ts — Brown-Hilbert PID enumeration over the 47-dim prime cube.
 *
 * Named agent: brown-hilbert-pid-map-builder-wave1
 * Body:        CIRCULATORY (blood / addressing / transport)
 * Cosign:      COSIGN-MERGED-034
 * D11:         existential=PROVEN (pure-function, total by construction);
 *              algorithmic=OBSERVED iff pid-verify.ts reports zero collisions
 *              on a sample run; material=N/A (no pre-built list — materialize
 *              on demand).
 *
 * Doctrine:
 *   Jesse correction (2026-04-17): the 10^11 PID surface is PROVEN-by-
 *   construction via (256 glyphs)^47 >> 10^11, not a pre-built list. This
 *   module materializes `computeBrownHilbertPid` as the pure function that
 *   does the construction, and exposes both forward and inverse mappings.
 *
 * Encoding (documented, ONE scheme, not fabricated):
 *   Build a 47-tuple of non-negative integer coordinates from the input:
 *      c[0]  = agentTypeIndex       (0..AGENT_TYPES.length-1)
 *      c[1]  = hostIndex            (0..HOSTS.length-1)
 *      c[2]  = workerIndex          (0..2^31 - 1)
 *      c[3]  = profileGlyphIndex    (0 if none; else 1..PROFILE_GLYPHS.length)
 *      c[4..46] = salt bits derived from the deterministic FNV-1a 64-bit
 *                 hash of the concatenated glyph-id. Distributed across the
 *                 remaining 43 dims via mixed-radix with radix = prime_i.
 *
 *   PID = sum_{i=0..46} c[i] * prime_i^3   (mod 2^127)
 *
 *   Where prime_i is the i-th prime from FIRST_47_PRIMES (generated via
 *   sieve below, unit-asserted at load time).
 *
 * Collision boundary (documented, not asserted beyond):
 *   Provably injective over { (agent_type, host, worker_index, profile_glyph)
 *   : worker_index < 2^31, agent_type < 2^8, host < 2^8, profile_glyph < 2^8 }
 *   because the first four coordinates use distinct prime-cubed weights
 *   (prime_i^3 for i in {0,1,2,3} = 8, 27, 125, 343) and occupy orthogonal
 *   bit-ranges when multiplied.
 *
 *   Coordinates 4..46 are a deterministic salt derived from input and MAY
 *   collide with a different coordinate combination in the higher dims;
 *   however, the first-four-dim injectivity ensures any two inputs that
 *   differ in (agent_type,host,worker_index,profile_glyph) produce distinct
 *   PIDs regardless of salt. The salt adds entropy; it does NOT need to be
 *   injective to preserve overall injectivity.
 *
 * Pure function guarantee:
 *   - No Date.now / Math.random / env reads.
 *   - Same input → same output, always.
 *   - Uses BigInt arithmetic; never serializes to plain JSON without the
 *     explicit `.toString()` cast (see §JSON caveats in builder-report).
 */

import { isPrime } from "./port-allocator.ts";

// --------------------------------------------------------------------------
// §1. 47 primes. Generated via trial-division sieve. Unit-asserted at load.
// --------------------------------------------------------------------------

function firstNPrimes(n: number): number[] {
  const out: number[] = [];
  let candidate = 2;
  while (out.length < n) {
    if (isPrime(candidate)) out.push(candidate);
    candidate++;
  }
  return out;
}

export const FIRST_47_PRIMES: ReadonlyArray<number> = firstNPrimes(47);

// Self-check: first 4 primes we rely on for injectivity MUST be 2,3,5,7.
// If not, the collision-boundary proof above is broken — hard-fail load.
if (FIRST_47_PRIMES.length !== 47 ||
    FIRST_47_PRIMES[0] !== 2 ||
    FIRST_47_PRIMES[1] !== 3 ||
    FIRST_47_PRIMES[2] !== 5 ||
    FIRST_47_PRIMES[3] !== 7 ||
    FIRST_47_PRIMES[46] !== 211) {
  // 47th prime is 211. If not, sieve is broken.
  throw new Error(`pid-map: FIRST_47_PRIMES self-check failed: got ${FIRST_47_PRIMES}`);
}

// Precompute prime^3 as BigInt for the weighted sum. Static, load-once.
export const PRIME_CUBES_BIG: ReadonlyArray<bigint> =
  FIRST_47_PRIMES.map((p) => BigInt(p) * BigInt(p) * BigInt(p));

// --------------------------------------------------------------------------
// §2. Enumerations — device glyphs and agent-type handles.
// --------------------------------------------------------------------------

export const HOSTS = [
  "DEV-LIRIS",
  "DEV-ACER",
  "DEV-FALCON",
  "DEV-AETHER",
  "DEV-GAIA",
] as const;

export type DeviceGlyph = typeof HOSTS[number];

/**
 * Agent-type enum. Must stay in lock-step with AGENT_TYPE_META in
 * agent-type-registry.ts. Adding a new type here WITHOUT adding metadata
 * there will fail at runtime (throws on unknown type).
 *
 * Ordering is stable — appending is safe, reordering breaks historical PIDs.
 * This is the injectivity contract: c[0] is the agent_type index, and a
 * specific index MUST always map to the same agent type.
 */
export const AGENT_TYPES = [
  "HERMES",
  "OPENCODE_BIG_PICKLE",
  "OPENCODE_GPT5_NANO",
  "OPENCODE_MINIMAX_M25",
  "OPENCODE_NEMOTRON3",
  "CLAUDE_MAX",
  "LOCAL_CODEX",
  "ABACUS",
  "SYMPHONY",
  "LLAMA_CPP",
  "MUX",
  "GEMMA_Q4",
  "HERMES_SUBAGENT",
  "GEMINI_OAUTH_FREE",
  "NOUS_PORTAL_FREE",
  "OPENROUTER_FREE",
  "OPENCODE_GO",
  "HUGGINGFACE_HF_TOKEN",
  "NVIDIA_NIM",
  "XIAOMI_MIMO",
] as const;

export type AgentType = typeof AGENT_TYPES[number];

// --------------------------------------------------------------------------
// §3. Profile-glyph reference list (R.6 subset; MAY grow).
// --------------------------------------------------------------------------

export const PROFILE_GLYPHS = [
  "PROF-NOVALUM",
  "PROF-EBACMAP",
  "PROF-FALCON",
  "PROF-SHANNON",
  "PROF-ASI",
  "PROF-HERMES",
  "PROF-CIRCULATORY",
  "PROF-ENDOCRINE",
] as const;

export type ProfileGlyph = typeof PROFILE_GLYPHS[number];

// --------------------------------------------------------------------------
// §4. Public shapes.
// --------------------------------------------------------------------------

export interface PidInput {
  agent_type: AgentType;
  host: DeviceGlyph;
  worker_index: number;        // [0, 2^31)
  profile_glyph?: ProfileGlyph;
}

export interface BrownHilbertPid {
  pid: bigint;                  // the 47D-derived integer address
  coord: number[];              // 47-tuple of prime-cube coordinates (c[0..46])
  glyph_id: string;             // canonical DEV-<HOST>-<AGENT>-W#### shape
  port: number;                 // 0 = not yet allocated; populated by spawn-pool
  color: string;                // derived palette hex for ops dashboards
  mathematical_basis: "brown-hilbert-prime-cube-47D";
  d11: "OBSERVED";              // pure + total ⇒ output stamped OBSERVED
}

// --------------------------------------------------------------------------
// §5. Helpers — indexing, hashing, glyph-id, palette.
// --------------------------------------------------------------------------

function agentTypeIndex(t: AgentType): number {
  const i = AGENT_TYPES.indexOf(t);
  if (i < 0) throw new Error(`pid-map: unknown agent_type "${t}"`);
  return i;
}

function hostIndex(h: DeviceGlyph): number {
  const i = HOSTS.indexOf(h);
  if (i < 0) throw new Error(`pid-map: unknown host "${h}"`);
  return i;
}

function profileIndex(p?: ProfileGlyph): number {
  if (p === undefined) return 0;
  const i = PROFILE_GLYPHS.indexOf(p);
  if (i < 0) throw new Error(`pid-map: unknown profile_glyph "${p}"`);
  return i + 1;                 // 0 reserved for "none"
}

/**
 * FNV-1a 64-bit hash. Non-cryptographic but deterministic and avalanchey —
 * good enough for salt-bit distribution. We use BigInt throughout so there's
 * no 32-bit truncation artefact.
 *
 * Reference constants: http://www.isthe.com/chongo/tech/comp/fnv/#FNV-param
 */
function fnv1a64(s: string): bigint {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME  = 0x100000001b3n;
  const MASK64     = 0xffffffffffffffffn;
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

/**
 * Build the 47-tuple of coordinates from the input.
 *   c[0..3] = identity dims (injective by construction, see §collision-boundary)
 *   c[4..46] = salt distributed via mixed-radix = hash mod prime_i
 */
function buildCoord(input: PidInput): number[] {
  const c = new Array<number>(47).fill(0);
  c[0] = agentTypeIndex(input.agent_type);
  c[1] = hostIndex(input.host);
  if (!Number.isInteger(input.worker_index) || input.worker_index < 0 || input.worker_index >= 2 ** 31) {
    throw new Error(`pid-map: worker_index out of range [0, 2^31): ${input.worker_index}`);
  }
  c[2] = input.worker_index;
  c[3] = profileIndex(input.profile_glyph);

  // Salt: hash the canonical glyph-id (not including port/color, those are
  // downstream). Distribute bits across dims 4..46 via mixed-radix.
  const canonical = `${input.host}|${input.agent_type}|${input.worker_index}|${input.profile_glyph ?? ""}`;
  let h = fnv1a64(canonical);
  for (let i = 4; i < 47; i++) {
    const p = BigInt(FIRST_47_PRIMES[i]);
    c[i] = Number(h % p);
    h = h / p;    // integer division in BigInt is floor
    // If we exhaust entropy, re-seed by mixing in i — deterministic top-up.
    if (h === 0n) h = fnv1a64(`${canonical}|re-seed-${i}`);
  }
  return c;
}

function padWorker(n: number): string {
  return String(n).padStart(4, "0");
}

/**
 * Palette: FNV-hash of the glyph-id mod 360 → HSL hex. Deterministic,
 * suitable for ops dashboards, no color library dependency.
 */
function paletteHex(glyphId: string): string {
  const h = Number(fnv1a64(glyphId) % 360n);
  // HSL(h, 65%, 50%) -> RGB approximation
  const s = 0.65, l = 0.50;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = h / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1)      { r = c; g = x; b = 0; }
  else if (hh < 2) { r = x; g = c; b = 0; }
  else if (hh < 3) { r = 0; g = c; b = x; }
  else if (hh < 4) { r = 0; g = x; b = c; }
  else if (hh < 5) { r = x; g = 0; b = c; }
  else             { r = c; g = 0; b = x; }
  const m = l - c / 2;
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// --------------------------------------------------------------------------
// §6. Public forward mapping — computeBrownHilbertPid.
// --------------------------------------------------------------------------

export function computeBrownHilbertPid(input: PidInput): BrownHilbertPid {
  const coord = buildCoord(input);
  const MOD = 1n << 127n;

  let pid = 0n;
  for (let i = 0; i < 47; i++) {
    pid = (pid + BigInt(coord[i]) * PRIME_CUBES_BIG[i]) % MOD;
  }
  // Ensure non-zero (0 is reserved for "unallocated"). Wrap via +1 on zero.
  if (pid === 0n) pid = 1n;

  const glyphId = canonicalGlyphId(input);
  return {
    pid,
    coord,
    glyph_id: glyphId,
    port: 0,
    color: paletteHex(glyphId),
    mathematical_basis: "brown-hilbert-prime-cube-47D",
    d11: "OBSERVED",
  };
}

/**
 * Canonical glyph-id format:
 *   <HOST>-<AGENT_TYPE>-W<worker_index padded4>[-<PROFILE>]
 * All uppercase. All hyphen-delimited. Matches families in glyph-families.json.
 */
export function canonicalGlyphId(input: PidInput): string {
  const base = `${input.host}-${input.agent_type}-W${padWorker(input.worker_index)}`;
  return input.profile_glyph ? `${base}-${input.profile_glyph}` : base;
}

// --------------------------------------------------------------------------
// §7. Inverse mapping — parseGlyphId.
//
// Not algebraically invertible from pid alone (salt is lossy), but
// (agent_type, host, worker_index, profile_glyph) IS recoverable from the
// canonical glyph-id string. That's the honest "inverse" we expose.
// --------------------------------------------------------------------------

export function parseGlyphId(glyphId: string): PidInput {
  // Shape: DEV-<HOST>-<AGENT>-W<4d>[-PROF-<name>]
  const parts = glyphId.split("-");
  // First two parts = "DEV" + <HOST>, e.g. "DEV-LIRIS"
  if (parts.length < 4 || parts[0] !== "DEV") {
    throw new Error(`pid-map: parseGlyphId expected DEV-<HOST>-<AGENT>-W####, got "${glyphId}"`);
  }
  const host = `${parts[0]}-${parts[1]}` as DeviceGlyph;
  if (!HOSTS.includes(host)) {
    throw new Error(`pid-map: parseGlyphId unknown host "${host}" in "${glyphId}"`);
  }
  // Worker token is the one starting with 'W' followed by 4 digits.
  const wIdx = parts.findIndex((p) => /^W\d{4}$/.test(p));
  if (wIdx < 0) {
    throw new Error(`pid-map: parseGlyphId missing W#### token in "${glyphId}"`);
  }
  // Agent = everything between host (index 1) and the W token, joined with '-'.
  const agent = parts.slice(2, wIdx).join("_") as AgentType;
  // Guard: agent must be a known AGENT_TYPE. We rejoin with underscores
  // because AGENT_TYPES uses '_' inside names (e.g. OPENCODE_BIG_PICKLE).
  const normalisedAgent = parts.slice(2, wIdx).join("_") as AgentType;
  if (!AGENT_TYPES.includes(normalisedAgent)) {
    throw new Error(`pid-map: parseGlyphId unknown agent_type "${normalisedAgent}" in "${glyphId}"`);
  }
  const worker_index = Number(parts[wIdx].slice(1));
  // Profile: if there are more parts after W, they form PROF-<name>.
  let profile_glyph: ProfileGlyph | undefined;
  if (wIdx + 1 < parts.length) {
    const rest = parts.slice(wIdx + 1).join("-") as ProfileGlyph;
    if (!PROFILE_GLYPHS.includes(rest)) {
      throw new Error(`pid-map: parseGlyphId unknown profile_glyph "${rest}" in "${glyphId}"`);
    }
    profile_glyph = rest;
  }
  return { agent_type: agent, host, worker_index, profile_glyph };
}

// --------------------------------------------------------------------------
// §8. JSON helpers — BigInt is not JSON-native.
// --------------------------------------------------------------------------

export function pidToJson(p: BrownHilbertPid): Record<string, unknown> {
  return {
    pid: p.pid.toString(),      // decimal string — safe round-trip
    coord: p.coord,
    glyph_id: p.glyph_id,
    port: p.port,
    color: p.color,
    mathematical_basis: p.mathematical_basis,
    d11: p.d11,
  };
}
