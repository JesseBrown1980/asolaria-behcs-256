// @asolaria/omnispindle-spawn-acer · model-catalog
//
// Worker templates for the 4-worker opencode fanout.
// Path strings use ${OPENCODE_BIN} placeholder — resolved by resolveTemplate()
// at SpawnPool construction time against process.env.OPENCODE_BIN (or a given env).
//
// Liris's symmetric side uses matching names + ports so EVT-*-SPAWN-PATTERN
// envelopes routed across the BEHCS bus are wire-compatible both ways.

export const OPENCODE_BIN_PLACEHOLDER = '${OPENCODE_BIN}';

export const WORKER_TEMPLATES = Object.freeze([
  Object.freeze({
    name: 'big-pickle',
    path: '${OPENCODE_BIN}/opencode.cmd',
    args: ['serve', '--model', 'big-pickle', '--port', '4801'],
    port: 4801,
    model: 'big-pickle',
    tier: 'tier-1',
    role: 'pattern-tester',
    description: 'Big-pickle tier-1 pattern tester (primary fanout worker, validated on Liris)',
  }),
  Object.freeze({
    name: 'gpt-5-nano',
    path: '${OPENCODE_BIN}/opencode.cmd',
    args: ['serve', '--model', 'gpt-5-nano', '--port', '4802'],
    port: 4802,
    model: 'gpt-5-nano',
    tier: 'tier-2',
    role: 'fast-responder',
    description: 'GPT-5 nano fast-responder for latency-sensitive short-context fanout',
  }),
  Object.freeze({
    name: 'minimax-m2.5',
    path: '${OPENCODE_BIN}/opencode.cmd',
    args: ['serve', '--model', 'minimax-m2.5', '--port', '4803'],
    port: 4803,
    model: 'minimax-m2.5',
    tier: 'tier-2',
    role: 'long-context',
    description: 'MiniMax M2.5 long-context fanout worker',
  }),
  Object.freeze({
    name: 'nemotron-3-super',
    path: '${OPENCODE_BIN}/opencode.cmd',
    args: ['serve', '--model', 'nemotron-3-super', '--port', '4804'],
    port: 4804,
    model: 'nemotron-3-super',
    tier: 'tier-1',
    role: 'reasoning',
    description: 'Nemotron-3 super reasoning worker for depth-of-chain fanout',
  }),
]);

/**
 * Resolve ${OPENCODE_BIN} placeholders in a worker template against env.
 *
 * @param {object}              tmpl      Worker template from WORKER_TEMPLATES
 * @param {Record<string,string>} [env=process.env]  Env source
 * @returns {{name:string, path:string, args:string[], port:number, model:string}}
 */
export function resolveTemplate(tmpl, env = (typeof process !== 'undefined' ? process.env : {})) {
  const bin = env && env.OPENCODE_BIN ? env.OPENCODE_BIN : OPENCODE_BIN_PLACEHOLDER;
  const replace = (s) => s.replace(/\$\{OPENCODE_BIN\}/g, bin);
  return {
    name: tmpl.name,
    path: replace(tmpl.path),
    args: tmpl.args.map(replace),
    port: tmpl.port,
    model: tmpl.model,
    tier: tmpl.tier,
    role: tmpl.role,
    description: tmpl.description,
  };
}

/**
 * Build the full 4-worker array, ready to hand to `new SpawnPool({ workers })`.
 *
 * @param {Record<string,string>} [env=process.env]
 * @returns {Array<{name:string, path:string, args:string[], port:number, model:string}>}
 */
export function buildWorkerList(env = (typeof process !== 'undefined' ? process.env : {})) {
  return WORKER_TEMPLATES.map((t) => resolveTemplate(t, env));
}

export default { WORKER_TEMPLATES, resolveTemplate, buildWorkerList, OPENCODE_BIN_PLACEHOLDER };
