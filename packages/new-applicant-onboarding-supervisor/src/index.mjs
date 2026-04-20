// New-Applicant Onboarding Supervisor
// Ships the FRESH full toolkit to any node joining the federation.
// Builds bundle from LIVE packages/ dir at call time — so applicants always get current-version.
//
// Transport auto-detection:
//   - adb device (serial): adb push to /sdcard/asolaria/
//   - SMB share (unc path): fs.copyFile into share
//   - remote-control bridge (http url): /write (requires token)
//   - bus-only (fallback): base64 in envelope (slow but universal)
//
// Kick auto-detection:
//   - if adb device: adb input text → extract instruction
//   - if liris-like: pid-targeted-kick-supervisor kickLiris
//   - if bus-only: OP-APPLICANT-EXTRACT verb for daemon on applicant side

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { emitEnvelope } from "../../pid-targeted-kick-supervisor/src/bus-fire-with-retry.mjs";
import { kick } from "../../pid-targeted-kick-supervisor/src/index.mjs";

const ACER_PACKAGES_DIR = "C:/asolaria-acer/packages";
const BUNDLE_CACHE_DIR  = "C:/asolaria-acer/tmp/onboarding-bundles";
if (!existsSync(BUNDLE_CACHE_DIR)) mkdirSync(BUNDLE_CACHE_DIR, { recursive: true });

function runCmd(exe, args, opts = {}) {
  return new Promise((resolve) => {
    const cp = spawn(exe, args, { shell: false, windowsHide: true,
      env: { ...process.env, MSYS_NO_PATHCONV: "1", ...(opts.env || {}) } });
    let out = "", err = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve({ ok: false, out, err: err + "\nTIMEOUT" }); }, opts.timeoutMs || 60_000);
    cp.stdout.on("data", d => out += d.toString());
    cp.stderr.on("data", d => err += d.toString());
    cp.on("close", code => { clearTimeout(t); resolve({ ok: code === 0, code, out, err }); });
    cp.on("error", e => { clearTimeout(t); resolve({ ok: false, out, err: e.message }); });
  });
}

/**
 * Build a FRESH bundle from live packages/ dir.
 * Bundle is acer-full-supervisor-bundle-<timestamp>.tar.gz with sha manifest.
 */
export async function buildFreshBundle({ version_suffix } = {}) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = version_suffix || ts;
  const outPath = `${BUNDLE_CACHE_DIR}/acer-full-supervisor-bundle-${suffix}.tar.gz`;
  // tar on Windows/MSYS can treat "C:/..." as a remote ssh target.
  // Use --force-local to disable that behavior.
  const r = await runCmd("tar", [
    "--force-local",
    "-czf", outPath,
    "--exclude=node_modules", "--exclude=.git",
    "-C", "C:/asolaria-acer",
    "packages",
  ], { timeoutMs: 120_000 });
  if (!r.ok) return { ok: false, error: r.err, outPath };
  const buf = readFileSync(outPath);
  const sha = createHash("sha256").update(buf).digest("hex");
  const bytes = buf.length;
  // Sidecar manifest JSON
  const manifestPath = outPath + ".manifest.json";
  const manifest = {
    bundle_name: `acer-full-supervisor-bundle-${suffix}`,
    built_at: new Date().toISOString(),
    built_from: ACER_PACKAGES_DIR,
    bytes, sha256: sha,
    path: outPath,
    extraction_cmd: `tar -xzf <bundle-path> -C <target-asolaria-root>/`,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { ok: true, bundle_path: outPath, manifest_path: manifestPath, bytes, sha256: sha };
}

/**
 * Ship bundle to an adb device (serial).
 */
export async function shipViaAdb(serial, bundlePath, { targetDir = "/sdcard/asolaria" } = {}) {
  const mkdir = await runCmd("adb", ["-s", serial, "shell", `mkdir -p ${targetDir}`]);
  if (!mkdir.ok) return { ok: false, phase: "mkdir", err: mkdir.err };
  const basename = bundlePath.split(/[\\/]/).pop();
  const remotePath = `${targetDir}/${basename}`;
  const push = await runCmd("adb", ["-s", serial, "push", bundlePath, remotePath], { timeoutMs: 90_000 });
  if (!push.ok) return { ok: false, phase: "push", err: push.err };
  return { ok: true, remote_path: remotePath, bytes: statSync(bundlePath).size };
}

/**
 * Ship bundle to an SMB share path.
 */
export async function shipViaSmb(bundlePath, smbTargetDir) {
  const basename = bundlePath.split(/[\\/]/).pop();
  const dst = `${smbTargetDir}/${basename}`.replace(/\\/g, "/");
  const dir = dirname(dst);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  copyFileSync(bundlePath, dst);
  return { ok: true, smb_path: dst, bytes: statSync(dst).size };
}

/**
 * High-level onboarding flow.
 * @param {object} applicant
 *   { name, kind: "adb"|"smb"|"bus-only", serial?, smb_target_dir?, kick_target? }
 */
export async function onboardApplicant(applicant) {
  const log = { applicant_name: applicant.name, started_at: new Date().toISOString(), steps: [] };

  // Step 1: build fresh
  const build = await buildFreshBundle();
  log.steps.push({ step: "build", ok: build.ok, bytes: build.bytes, sha: build.sha256 });
  if (!build.ok) return { ...log, ok: false, fail_at: "build", error: build.error };

  // Step 2: ship
  let ship;
  if (applicant.kind === "adb") ship = await shipViaAdb(applicant.serial, build.bundle_path, { targetDir: applicant.target_dir });
  else if (applicant.kind === "smb") ship = await shipViaSmb(build.bundle_path, applicant.smb_target_dir);
  else if (applicant.kind === "bus-only") {
    // Universal fallback — attach base64 in OP envelope
    const buf = readFileSync(build.bundle_path);
    const env = await emitEnvelope({
      verb: "OP-APPLICANT-BUNDLE-DELIVERY-BASE64",
      payload: `bundle for ${applicant.name} · sha ${build.sha256.slice(0,16)} · bytes ${build.bytes}`,
      body: {
        applicant_name: applicant.name,
        bundle_sha256: build.sha256,
        bundle_bytes: build.bytes,
        base64: buf.toString("base64"),
        extraction_cmd: "echo <base64> | base64 -d > bundle.tar.gz && tar -xzf bundle.tar.gz -C ~/asolaria",
      },
    });
    ship = { ok: env.ok, transport: "bus-only-base64", bus_results: env.results };
  } else {
    return { ...log, ok: false, fail_at: "unknown-kind", kind: applicant.kind };
  }
  log.steps.push({ step: "ship", transport: applicant.kind, ok: ship.ok, details: ship });
  if (!ship.ok) return { ...log, ok: false, fail_at: "ship", ship };

  // Step 3: kick
  const extractionPath = ship.remote_path || ship.smb_path || "bundle.tar.gz";
  const kickMsg = `ACER-ONBOARDING-BUNDLE-LANDED · ${extractionPath} · sha ${build.sha256.slice(0,16)} · bytes ${build.bytes} · extract tar -xzf ${extractionPath} -C ~/asolaria · report EVT-${applicant.name.toUpperCase()}-SUPERVISOR-BUNDLE-IMPORTED · this is the FRESH current-version toolkit every applicant receives on join`;
  const kickTarget = applicant.kick_target || applicant.name;
  let kickResult;
  try { kickResult = await kick(kickTarget, kickMsg); }
  catch (e) { kickResult = { ok: false, error: e.message }; }
  log.steps.push({ step: "kick", target: kickTarget, ok: kickResult.ok, typed: kickResult.typed_chars, sha: kickResult.screencap?.sha256?.slice(0,16) });

  // Step 4: announce
  const announce = await emitEnvelope({
    verb: "EVT-ACER-NEW-APPLICANT-ONBOARDED",
    payload: `applicant ${applicant.name} onboarded · transport=${applicant.kind} · bundle sha ${build.sha256.slice(0,16)} · bytes ${build.bytes} · kick ${kickResult.ok ? "OK" : "FAIL"} · awaiting EVT-${applicant.name.toUpperCase()}-SUPERVISOR-BUNDLE-IMPORTED`,
    body: {
      applicant: applicant.name,
      transport: applicant.kind,
      bundle: { sha: build.sha256, bytes: build.bytes, path: build.bundle_path },
      ship, kick_result: kickResult,
      timestamp: new Date().toISOString(),
    },
    glyph_sentence: `NEW-APPLICANT-ONBOARDED · ${applicant.name} · ${build.sha256.slice(0,8)} @ M-IMPERATIVE .`,
  });
  log.steps.push({ step: "announce", ok: announce.ok, bus_results: announce.results });

  log.ok = ship.ok && kickResult.ok;
  log.ended_at = new Date().toISOString();
  log.bundle = build;
  log.kick_result = kickResult;
  return log;
}

/**
 * Re-onboard all known federation peers with fresh bundle.
 * Useful when core supervisors updated and all nodes need current version.
 */
export async function reOnboardFederation(peerList = null) {
  const defaultPeers = [
    { name: "aether", kind: "adb", serial: "R9QY205KAKJ", kick_target: "aether" },
    { name: "falcon", kind: "adb", serial: "R5CXA4MGQXV", kick_target: "falcon" },
    { name: "liris",  kind: "smb", smb_target_dir: "//DESKTOP-J99VCNH/Users/rayss/Asolaria/data/cubes", kick_target: "liris" },
  ];
  const peers = peerList || defaultPeers;
  const results = [];
  for (const p of peers) results.push(await onboardApplicant(p));
  return { ok: results.every(r => r.ok), applicants: peers.length, results };
}
