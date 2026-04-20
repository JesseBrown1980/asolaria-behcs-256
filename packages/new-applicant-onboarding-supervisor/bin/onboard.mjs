#!/usr/bin/env node
// CLI · onboard a new applicant with fresh bundle
// Usage:
//   onboard adb <name> <serial>                  → build fresh + adb push + kick
//   onboard smb <name> <smb-target-dir>          → build fresh + smb copy + kick
//   onboard bus <name>                            → build fresh + base64 envelope
//   onboard all                                   → re-onboard known federation (aether+falcon+liris)

import { onboardApplicant, reOnboardFederation, buildFreshBundle } from "../src/index.mjs";

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === "--help") {
  console.log(`onboard <kind> <name> [<serial|smb-dir>]
  kind: adb | smb | bus
  onboard all                           → re-onboard aether+falcon+liris with current packages/
  onboard build-only                    → just build bundle, no ship`);
  process.exit(0);
}

if (cmd === "build-only") {
  const r = await buildFreshBundle();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

if (cmd === "all") {
  const r = await reOnboardFederation();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}

const kind = cmd;
const name = argv[1];
if (!name) { console.error("name required"); process.exit(2); }

let applicant;
if (kind === "adb") applicant = { name, kind: "adb", serial: argv[2], kick_target: name };
else if (kind === "smb") applicant = { name, kind: "smb", smb_target_dir: argv[2], kick_target: name };
else if (kind === "bus") applicant = { name, kind: "bus-only" };
else { console.error("unknown kind:", kind); process.exit(2); }

const r = await onboardApplicant(applicant);
console.log(JSON.stringify(r, null, 2));
process.exit(r.ok ? 0 : 1);
