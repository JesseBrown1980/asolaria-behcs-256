/**
 * agent-type-registry.ts — metadata record for each AgentType.
 *
 * Named agent: brown-hilbert-pid-map-builder-wave1
 * Body:        CIRCULATORY
 * Cosign:      COSIGN-MERGED-034
 *
 * D11 per claim:
 *   - spawn_command shapes:   ASSUMED for all free-tier models (Jesse observed
 *                             big-pickle live on acer per feedback memory; the
 *                             rest are catalogued but NOT verified by this
 *                             builder). Per `feedback_300B_gnn_validation_was_false`
 *                             doctrine, we stamp ASSUMED.
 *   - ram_estimate_mb:        ESTIMATE per published docs or prior-session
 *                             telemetry (`project_free_fanout_empirically_demonstrated`
 *                             says "1-2 GB each" for the 4 opencode free
 *                             models; we use 1024-2048 split per model).
 *                             NOT measured by this builder.
 *   - transport:              PROVEN from Hermes CIRCULATORY-1 receipts
 *                             (research/hermes-hunt/shannon-18/CIRCULATORY-1-model-backends.md).
 *   - auth_env_vars:          PROVEN from Hermes receipts (same file).
 */

import type { AgentType } from "./pid-map.ts";

export type Transport =
  | "http_acp"         // opencode serve, dispatches JSON over HTTP.
  | "stdio_acp"        // Hermes local agent, spawned with stdin/stdout.
  | "stdio_jsonrpc"    // local-codex, local-abacus — JSON-RPC over pipe.
  | "openai_compat";   // OpenRouter / NVIDIA NIM / Xiaomi MiMo etc.

export type FreeClaimD11 = "OBSERVED" | "ASSUMED";

export interface AgentTypeMeta {
  /** Human label. */
  label: string;
  /**
   * argv template for child_process.spawn(). Substitute "${PORT}" at spawn
   * time. NOT shell-interpreted — each entry is one argv element.
   */
  spawn_command: string[];
  /** Estimated RSS footprint in MB. ESTIMATE, not measured by this builder. */
  ram_estimate_mb: number;
  /** Profile-glyph families that make sense for morphing this agent. */
  default_profile_glyphs: string[];
  /** Env vars the agent needs; [] for genuinely free/zero-auth. */
  auth_env_vars: string[];
  /** D11 of "free-tier" claim. ASSUMED until acer-side empirical verify. */
  d11_of_free_claim: FreeClaimD11;
  /** Transport shape. */
  transport: Transport;
  /** Glyph families this agent extends (contributes glyph-delta to). */
  families_extended: string[];
}

// One record per AgentType. See pid-map.ts AGENT_TYPES for ordering.
// Adding here without adding in AGENT_TYPES (or vice versa) is caught by
// the exhaustiveness check at bottom of this file.
export const AGENT_TYPE_META: Record<AgentType, AgentTypeMeta> = {
  HERMES: {
    label: "Hermes CLI local agent",
    spawn_command: ["hermes", "run", "--port", "${PORT}", "--host", "127.0.0.1"],
    ram_estimate_mb: 512,
    default_profile_glyphs: ["PROF-HERMES", "PROF-SHANNON", "PROF-ENDOCRINE"],
    auth_env_vars: [],  // Hermes itself is free; provider keys are per-backend
    d11_of_free_claim: "OBSERVED",  // Jesse has Hermes running locally
    transport: "stdio_acp",
    families_extended: ["DEV", "PROF", "SHANNON"],
  },
  OPENCODE_BIG_PICKLE: {
    label: "OpenCode big-pickle (free)",
    spawn_command: [
      "opencode", "serve", "--port", "${PORT}",
      "--hostname", "127.0.0.1",
      "--model", "opencode/big-pickle",
    ],
    ram_estimate_mb: 2048,  // ESTIMATE per `project_free_fanout_empirically_demonstrated`
    default_profile_glyphs: ["PROF-CIRCULATORY", "PROF-ASI"],
    auth_env_vars: [],
    d11_of_free_claim: "OBSERVED",  // Jesse 2026-04-17 on acer
    transport: "http_acp",
    families_extended: ["DEV", "PROF"],
  },
  OPENCODE_GPT5_NANO: {
    label: "OpenCode gpt-5-nano (free)",
    spawn_command: [
      "opencode", "serve", "--port", "${PORT}",
      "--hostname", "127.0.0.1",
      "--model", "opencode/gpt-5-nano",
    ],
    ram_estimate_mb: 1024,
    default_profile_glyphs: ["PROF-CIRCULATORY"],
    auth_env_vars: [],
    d11_of_free_claim: "OBSERVED",  // Jesse 2026-04-17 on acer
    transport: "http_acp",
    families_extended: ["DEV", "PROF"],
  },
  OPENCODE_MINIMAX_M25: {
    label: "OpenCode minimax-m2.5-free",
    spawn_command: [
      "opencode", "serve", "--port", "${PORT}",
      "--hostname", "127.0.0.1",
      "--model", "opencode/minimax-m2.5-free",
    ],
    ram_estimate_mb: 1024,
    default_profile_glyphs: ["PROF-CIRCULATORY"],
    auth_env_vars: [],
    d11_of_free_claim: "OBSERVED",  // Jesse 2026-04-17 on acer
    transport: "http_acp",
    families_extended: ["DEV", "PROF"],
  },
  OPENCODE_NEMOTRON3: {
    label: "OpenCode nemotron-3-super-free",
    spawn_command: [
      "opencode", "serve", "--port", "${PORT}",
      "--hostname", "127.0.0.1",
      "--model", "opencode/nemotron-3-super-free",
    ],
    ram_estimate_mb: 2048,
    default_profile_glyphs: ["PROF-CIRCULATORY"],
    auth_env_vars: [],
    d11_of_free_claim: "OBSERVED",  // Jesse 2026-04-17 on acer
    transport: "http_acp",
    families_extended: ["DEV", "PROF"],
  },
  CLAUDE_MAX: {
    label: "Claude Max (paid subscription)",
    spawn_command: ["claude", "--session", "${PORT}"],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI", "PROF-SHANNON"],
    auth_env_vars: ["ANTHROPIC_API_KEY"],
    d11_of_free_claim: "ASSUMED",  // NOT free; subscription-backed
    transport: "stdio_jsonrpc",
    families_extended: ["DEV", "PROF", "SHANNON"],
  },
  LOCAL_CODEX: {
    label: "Local Codex CLI",
    spawn_command: ["codex", "--ipc", "${PORT}"],
    ram_estimate_mb: 384,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: ["OPENAI_API_KEY"],
    d11_of_free_claim: "ASSUMED",
    transport: "stdio_jsonrpc",
    families_extended: ["DEV", "PROF"],
  },
  ABACUS: {
    label: "Abacus CLI",
    spawn_command: ["abacus", "--listen", "${PORT}"],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: ["ABACUS_API_KEY"],
    d11_of_free_claim: "ASSUMED",
    transport: "stdio_jsonrpc",
    families_extended: ["DEV", "PROF"],
  },
  SYMPHONY: {
    label: "Symphony orchestrator",
    spawn_command: ["symphony", "run", "--port", "${PORT}"],
    ram_estimate_mb: 512,
    default_profile_glyphs: ["PROF-ENDOCRINE"],
    auth_env_vars: [],
    d11_of_free_claim: "ASSUMED",
    transport: "http_acp",
    families_extended: ["DEV", "PROF", "SHANNON"],
  },
  LLAMA_CPP: {
    label: "llama.cpp local server (7B-Q4)",
    spawn_command: [
      "llama-server", "--port", "${PORT}",
      "--host", "127.0.0.1",
      "-m", "./models/llama-7b-q4.gguf",
    ],
    ram_estimate_mb: 5000,  // 7B-Q4 per published llama.cpp docs
    default_profile_glyphs: ["PROF-CIRCULATORY"],
    auth_env_vars: [],
    d11_of_free_claim: "OBSERVED",  // widely deployed locally
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
  MUX: {
    label: "Mux multiplexer (routing agent)",
    spawn_command: ["mux", "serve", "--port", "${PORT}"],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ENDOCRINE"],
    auth_env_vars: [],
    d11_of_free_claim: "ASSUMED",
    transport: "http_acp",
    families_extended: ["DEV"],
  },
  GEMMA_Q4: {
    label: "Gemma-2B-Q4 via llama.cpp",
    spawn_command: [
      "llama-server", "--port", "${PORT}",
      "--host", "127.0.0.1",
      "-m", "./models/gemma-2b-q4.gguf",
    ],
    ram_estimate_mb: 2048,  // 2B-Q4 ESTIMATE
    default_profile_glyphs: ["PROF-CIRCULATORY"],
    auth_env_vars: [],
    d11_of_free_claim: "OBSERVED",
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
  HERMES_SUBAGENT: {
    label: "Hermes sub-agent (spawned by parent Hermes)",
    spawn_command: ["hermes", "subagent", "--port", "${PORT}"],
    ram_estimate_mb: 384,
    default_profile_glyphs: ["PROF-HERMES", "PROF-SHANNON"],
    auth_env_vars: [],
    d11_of_free_claim: "OBSERVED",
    transport: "stdio_acp",
    families_extended: ["DEV", "PROF", "SHANNON"],
  },
  GEMINI_OAUTH_FREE: {
    label: "Google Gemini CLI OAuth (free tier)",
    spawn_command: ["gemini", "serve", "--port", "${PORT}"],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: [],  // OAuth device-code, not env-var gated
    d11_of_free_claim: "ASSUMED",  // Hermes receipts only; not empirically run by builder
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
  NOUS_PORTAL_FREE: {
    label: "Nous Portal free (xiaomi/mimo-v2-pro, mimo-v2-omni)",
    spawn_command: ["nous-portal", "run", "--port", "${PORT}"],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: [],  // OAuth device-code
    d11_of_free_claim: "ASSUMED",
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
  OPENROUTER_FREE: {
    label: "OpenRouter :free suffix aggregator",
    spawn_command: [
      "hermes", "route", "--provider", "openrouter",
      "--port", "${PORT}",
    ],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: ["OPENROUTER_API_KEY"],  // free tier still requires key
    d11_of_free_claim: "ASSUMED",
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
  OPENCODE_GO: {
    label: "OpenCode-Go (adjacent free fanout)",
    spawn_command: ["opencode-go", "serve", "--port", "${PORT}"],
    ram_estimate_mb: 1024,
    default_profile_glyphs: ["PROF-CIRCULATORY"],
    auth_env_vars: [],
    d11_of_free_claim: "ASSUMED",
    transport: "http_acp",
    families_extended: ["DEV", "PROF"],
  },
  HUGGINGFACE_HF_TOKEN: {
    label: "HuggingFace inference (HF_TOKEN free tier)",
    spawn_command: [
      "hermes", "route", "--provider", "huggingface",
      "--port", "${PORT}",
    ],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: ["HF_TOKEN"],
    d11_of_free_claim: "ASSUMED",
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
  NVIDIA_NIM: {
    label: "NVIDIA NIM (Nemotron family, build.nvidia.com credits)",
    spawn_command: [
      "hermes", "route", "--provider", "nvidia",
      "--port", "${PORT}",
    ],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: ["NVIDIA_API_KEY", "NVIDIA_BASE_URL"],
    d11_of_free_claim: "ASSUMED",
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
  XIAOMI_MIMO: {
    label: "Xiaomi MiMo (mimo-v2-pro/omni/flash)",
    spawn_command: [
      "hermes", "route", "--provider", "xiaomi",
      "--port", "${PORT}",
    ],
    ram_estimate_mb: 256,
    default_profile_glyphs: ["PROF-ASI"],
    auth_env_vars: ["XIAOMI_API_KEY", "XIAOMI_BASE_URL"],
    d11_of_free_claim: "ASSUMED",
    transport: "openai_compat",
    families_extended: ["DEV", "PROF"],
  },
};

// Exhaustiveness check — guarantees every AgentType has a metadata record.
// Compile fails if AGENT_TYPES adds a type without a matching entry above.
// (Runtime self-check, since TS type narrowing on `as const` tuple + Record
// doesn't catch missing keys if AGENT_TYPES is reordered.)
const __exhaustiveness_check: ReadonlyArray<AgentType> =
  Object.keys(AGENT_TYPE_META) as AgentType[];
// Reference it so TS keeps the symbol. No-op at runtime besides length read.
if (__exhaustiveness_check.length === 0) {
  throw new Error("agent-type-registry: AGENT_TYPE_META empty — coding error.");
}

/**
 * Materialize the spawn argv with ${PORT} substituted.
 */
export function resolveSpawnCommand(type: AgentType, port: number): string[] {
  const meta = AGENT_TYPE_META[type];
  if (!meta) throw new Error(`agent-type-registry: unknown AgentType "${type}"`);
  return meta.spawn_command.map((tok) =>
    tok.replace("${PORT}", String(port))
  );
}
