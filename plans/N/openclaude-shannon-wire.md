# Item 174 · OpenClaude → Shannon civ (tier 3) integration

## Wiring contract
OpenClaude bias-correction runs between Shannon stages S16 (structural-8-verb) and S17 (cosign-request).

## Code path
```js
const { biasCorrect } = require("src/openclaude/bias-correction.js");
// Shannon handler for S16.5 (inserted tier):
handlers["structural-8-verb"] = async (env, ctx) => {
  const judge = env.body?.judge_output;
  const peers = env.body?.peer_observations || [];
  const correction = biasCorrect(judge, peers);
  env.body.bias_correction = correction;
  return { LCR: correction.corrected ? 0.6 : 0.8, env };
};
```

## Status
Scaffolded in this commit; activation requires operator flip of handlers in runtime config.
