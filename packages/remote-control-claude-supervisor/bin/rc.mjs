#!/usr/bin/env node
// CLI · remote-control supervisor
// Usage:
//   rc health <bridge>
//   rc proc <bridge>
//   rc probe <bridge>
//   rc exec <bridge> <cmd...>       (needs token)
//   rc read <bridge> <path>         (needs token)
//   rc ls   <bridge> <path>         (needs token)
//   rc write <bridge> <path> <content>  (needs token)
//   rc cache-token <bridge> <token>

import * as rc from "../src/index.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === "--help" || cmd === "-h") {
  console.log(`remote-control-claude-supervisor · CLI
  health <bridge>
  proc <bridge>
  probe <bridge>             full probe (health + proc + claude-detection)
  exec <bridge> <cmd...>     requires token
  read <bridge> <path>       requires token
  ls <bridge> <path>         requires token
  write <bridge> <path> <content>
  cache-token <bridge> <token>   cache jesse-relayed token to local file
  list-bridges               show configured bridges
`);
  process.exit(0);
}

try {
  if (cmd === "list-bridges") {
    console.log(JSON.stringify(rc.BRIDGES, null, 2));
    process.exit(0);
  }
  const bridge = argv[1];
  if (!bridge) { console.error("bridge required"); process.exit(2); }
  let r;
  if (cmd === "health") r = await rc.health(bridge);
  else if (cmd === "proc") r = await rc.proc(bridge);
  else if (cmd === "probe") r = await rc.probeBridge(bridge);
  else if (cmd === "exec") r = await rc.exec(bridge, argv.slice(2).join(" "));
  else if (cmd === "read") r = await rc.readFileRemote(bridge, argv[2]);
  else if (cmd === "ls") r = await rc.lsRemote(bridge, argv[2] || "");
  else if (cmd === "write") r = await rc.writeFile(bridge, argv[2], argv.slice(3).join(" "));
  else if (cmd === "cache-token") r = rc.cacheToken(bridge, argv[2]);
  else { console.error(`unknown command: ${cmd}`); process.exit(2); }
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok === false ? 1 : 0);
} catch (e) {
  console.error("ERROR:", String(e.message || e));
  process.exit(3);
}
