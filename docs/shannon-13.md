# Item 104 · Shannon 13-role operator playbook

## Boot
```js
const { runStages, civilizationVerdict } = require("asolaria-behcs-256/src/shannon/stage-runner.js");
const { ROLES } = require("asolaria-behcs-256/src/shannon/roles.js");
const handlers = {}; // stage-name → async (env, ctx) => ({ LCR, env?, halt? })
```

## Running a civilization pass
```js
const { envelope, trace } = await runStages(incomingEnv, handlers);
const verdict = civilizationVerdict(trace);
```

## Role assignment
Use `roleForStage(stageId)` to resolve. Each role may be backed by a different agent (local LLM, cloud, or rule-based module).

## Pentest
```js
const { pentestTarget } = require("asolaria-behcs-256/src/shannon/pentest.js");
const report = await pentestTarget(target, async (role, t) => runRoleAgainst(role, t));
```

## Cube addressing
```js
const { addr } = require("asolaria-behcs-256/src/shannon/cube-addr.js");
const cell = addr({ lens: "signal", role_band: "R1-R2", stage_band: "S01-S04" });
// → CUBE-0-0-0
```

## Anti-hack
Always run `checkConvergentTrap(trace)` before sealing. If `tripped`, operator reviews before cosign.
