// FIB-L01 tests · 5 green gates
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { createRotator, windowStart, archiveName } = require("../src/ledger-rotate-gzip-30m.js");

const TMP = path.join(__dirname, "..", "tmp-test");
if (fs.existsSync(TMP)) fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let pass = 0, fail = 0;
function t(n, c, d="") { c ? (pass++, console.log("[PASS]", n, d)) : (fail++, console.log("[FAIL]", n, d)); }

// T1 windowStart is deterministic
{
  const a = windowStart(1776720000000, 30 * 60 * 1000);
  const b = windowStart(1776720000000 + 1000, 30 * 60 * 1000);
  t("01-window-start-same-bucket", a === b);
  const c = windowStart(1776720000000 + 30 * 60 * 1000, 30 * 60 * 1000);
  t("02-window-start-advances", c > a);
}

// T2 write + rotate produces gz archive + resets active
{
  let clock = 1776720000000; // fixed start
  const r = createRotator({
    active_path: path.join(TMP, "active.ndjson"),
    archive_dir: path.join(TMP, "archives"),
    window_ms: 30 * 60 * 1000,
    clock: () => clock,
  });
  for (let i = 0; i < 100; i++) r.write({ i, data: `event-${i}` });
  t("03-active-has-writes", fs.statSync(path.join(TMP, "active.ndjson")).size > 0);
  clock += 30 * 60 * 1000 + 1; // cross window boundary
  const rot = r.rotateIfNeeded();
  t("04-rotation-fires", rot.rotated === true);
  t("05-archive-file-gzipped", fs.existsSync(rot.archive));
  const gz = fs.readFileSync(rot.archive);
  const raw = zlib.gunzipSync(gz).toString();
  const lines = raw.split("\n").filter(Boolean);
  t("06-archive-has-100-lines", lines.length === 100);
  t("07-active-reset-after-rotate", fs.statSync(path.join(TMP, "active.ndjson")).size === 0);
}

// T3 archive name is window-start-derived (deterministic)
{
  const n1 = archiveName(1776720000000);
  const n2 = archiveName(1776720000000);
  t("08-archive-name-deterministic", n1 === n2);
}

// T4 no loss during rotate (writes after rotate go to fresh active)
{
  let clock = 1776720000000;
  const r = createRotator({
    active_path: path.join(TMP, "noloss.ndjson"),
    archive_dir: path.join(TMP, "noloss-archives"),
    window_ms: 30 * 60 * 1000,
    clock: () => clock,
  });
  r.write("pre-rotate-line");
  clock += 30 * 60 * 1000 + 1;
  r.write("post-rotate-line");
  const active = fs.readFileSync(path.join(TMP, "noloss.ndjson"), "utf8");
  t("09-post-rotate-writes-to-new-active", active.includes("post-rotate-line") && !active.includes("pre-rotate-line"));
}

// T5 sha-determinism (same content → same sha)
{
  let clock = 1776720000000;
  const r = createRotator({
    active_path: path.join(TMP, "sha.ndjson"),
    archive_dir: path.join(TMP, "sha-archives"),
    clock: () => clock,
  });
  for (let i = 0; i < 10; i++) r.write({ i });
  clock += 30 * 60 * 1000 + 1;
  const rot1 = r.rotateIfNeeded();
  // Redo identical run into a fresh dir
  const tmp2 = path.join(TMP, "sha2");
  fs.mkdirSync(tmp2, { recursive: true });
  let clock2 = 1776720000000;
  const r2 = createRotator({
    active_path: path.join(tmp2, "sha.ndjson"),
    archive_dir: path.join(tmp2, "archives"),
    clock: () => clock2,
  });
  for (let i = 0; i < 10; i++) r2.write({ i });
  clock2 += 30 * 60 * 1000 + 1;
  const rot2 = r2.rotateIfNeeded();
  t("10-sha-determinism-identical-runs", rot1.sha256 === rot2.sha256);
}

console.log(`\nsummary: pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
