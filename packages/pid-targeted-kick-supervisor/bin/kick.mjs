#!/usr/bin/env node
// CLI · reusable kick
// Usage:
//   node bin/kick.mjs <target> <message>
//   node bin/kick.mjs falcon "hello"
//   node bin/kick.mjs aether "hello"
//   node bin/kick.mjs liris  "hello"
//   node bin/kick.mjs verify 17988              → acer-local
//   node bin/kick.mjs verify falcon 3474        → adb-device
//   node bin/kick.mjs locate 17988              → search all
//   node bin/kick.mjs emit   <verb> "<payload>" → bus envelope with retry

import { kick, verifyPid, locatePid, emitEnvelope } from "../src/index.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`pid-targeted-kick-supervisor · CLI
  kick <target> <message...>    falcon | aether | liris
  verify <pid-or-node> [<pid>]  acer-local pid | node+pid
  locate <pid>                   search across falcon+aether+acer
  emit <verb> <payload...>       bus envelope with liris-retry
`);
  process.exit(0);
}

try {
  if (cmd === "verify") {
    const a = argv[1];
    const b = argv[2];
    const n = Number(a);
    const r = await verifyPid(Number.isInteger(n) && !b ? n : a, b ? Number(b) : undefined);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.verdict === "PASS" || r.verdict === "FOUND" ? 0 : 1);
  }
  if (cmd === "locate") {
    const r = await locatePid(Number(argv[1]));
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.resolved ? 0 : 1);
  }
  if (cmd === "emit") {
    const verb = argv[1];
    const payload = argv.slice(2).join(" ");
    const r = await emitEnvelope({ verb, payload, body: { cli_emit: true } });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }
  // Default: kick
  const target = argv[0];
  const msg = argv.slice(1).join(" ");
  if (!msg) { console.error("message required"); process.exit(2); }
  const r = await kick(target, msg);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok === false ? 1 : (r.verdict === "PASS" ? 0 : 0));
} catch (e) {
  console.error("ERROR:", String(e.message || e));
  process.exit(3);
}
