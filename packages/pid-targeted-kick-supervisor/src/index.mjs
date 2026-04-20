// PID-Targeted Kick Supervisor · unified entry point
// Usage:
//   import { kick, verifyPid, emitEnvelope } from "@asolaria/pid-targeted-kick-supervisor";
//   await kick("falcon", "ACER-KICK message");
//   await kick("aether", "ACER-KICK message");
//   await kick("liris",  "ACER-KICK message");
//   await verifyPid(17988);   // acer-local non-intrusive
//   await verifyPid("falcon", 3474);  // device pid-targeted
//   await emitEnvelope({ verb, payload, body });

import { kickNode as adbKick, probeTermuxPid, findPidLocation, listAuthorizedDevices, NODES } from "./adb-kick.mjs";
import { kickLiris, probeLirisWindows, loadLirisConfig } from "./liris-kick.mjs";
import { verifyAcerLocalPid } from "./acer-local-verify.mjs";
import { emitEnvelope, fireWithRetry } from "./bus-fire-with-retry.mjs";

export { NODES, listAuthorizedDevices, probeTermuxPid, findPidLocation };
export { probeLirisWindows, loadLirisConfig };
export { verifyAcerLocalPid };
export { emitEnvelope, fireWithRetry };

/**
 * Unified kick across all 3 node types.
 * @param {"falcon"|"aether"|"liris"} target
 * @param {string} text
 * @param {object} opts
 */
export async function kick(target, text, opts = {}) {
  if (target === "liris") return kickLiris(text, opts);
  if (target === "falcon" || target === "aether") return adbKick(target, text, opts);
  throw new Error(`unknown kick target: ${target}`);
}

/**
 * Unified verify.
 *   verifyPid(17988)              → acer-local non-intrusive
 *   verifyPid("falcon", 3474)     → adb device pid-targeted
 *   verifyPid("aether", 10646)    → adb device pid-targeted
 */
export async function verifyPid(nodeOrPid, maybePid) {
  if (typeof nodeOrPid === "number") return verifyAcerLocalPid(nodeOrPid);
  if (NODES[nodeOrPid]) {
    const pid = maybePid;
    if (!pid) throw new Error("pid required when node name given");
    const loc = await findPidLocation(pid, [nodeOrPid]);
    return {
      node: nodeOrPid,
      pid,
      location: loc[nodeOrPid],
      verdict: loc[nodeOrPid]?.pid_exists ? "FOUND" : "NOT_FOUND",
    };
  }
  throw new Error(`unknown node: ${nodeOrPid}`);
}

/**
 * Locate an unknown pid across all devices + acer-local.
 */
export async function locatePid(pid) {
  const adbLoc = await findPidLocation(pid);
  // acer-local
  const acerLocal = await verifyAcerLocalPid(pid, { dwell_ms: 0 });
  const winner = Object.entries(adbLoc).find(([_, v]) => v.pid_exists);
  return {
    pid,
    adb_devices: adbLoc,
    acer_local: acerLocal.ok ? { found: true, process_name: acerLocal.process_name, main_window_title: acerLocal.main_window_title } : { found: false },
    resolved: winner ? { kind: "adb", node: winner[0], serial: winner[1].serial } : (acerLocal.ok ? { kind: "acer-local", process_name: acerLocal.process_name } : null),
  };
}
