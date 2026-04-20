// FIB-L01 · ledger-rotate-gzip-30m
// My interpretation from axis label ("storage · ledger-rotate-gzip-30m") — NOT viewing liris's impl.
// Contract (inferred):
//   - a rolling ledger (ndjson) where every 30 minutes (or N-bytes cap) the active file is rotated
//   - the rotated file is gzipped into an archives/ dir with deterministic name by window-start-ts
//   - no loss of tail-end writes during rotate (atomic close of old, open of new)
//   - no metadata leaks (no ts inside signed hash)

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const ROTATE_WINDOW_MS_DEFAULT = 30 * 60 * 1000; // 30 min

function windowStart(ms, windowMs = ROTATE_WINDOW_MS_DEFAULT) {
  return Math.floor(ms / windowMs) * windowMs;
}

function archiveName(windowStartMs) {
  // Deterministic name by window-start — stable across rotations
  const iso = new Date(windowStartMs).toISOString().replace(/[:.]/g, "-");
  return `ledger-${iso}.ndjson.gz`;
}

function createRotator({ active_path, archive_dir, window_ms = ROTATE_WINDOW_MS_DEFAULT, clock = () => Date.now() }) {
  if (!fs.existsSync(archive_dir)) fs.mkdirSync(archive_dir, { recursive: true });
  let currentWindow = windowStart(clock(), window_ms);

  function rotateIfNeeded() {
    const nowWin = windowStart(clock(), window_ms);
    if (nowWin === currentWindow) return { rotated: false };
    // Rotate: atomic-close, gzip, open-new
    if (!fs.existsSync(active_path)) { currentWindow = nowWin; return { rotated: false, reason: "no-active" }; }
    const raw = fs.readFileSync(active_path);
    const gz = zlib.gzipSync(raw);
    const name = archiveName(currentWindow);
    const target = path.join(archive_dir, name);
    fs.writeFileSync(target, gz);
    fs.writeFileSync(active_path, ""); // reset active
    const sha = crypto.createHash("sha256").update(gz).digest("hex");
    currentWindow = nowWin;
    return { rotated: true, archive: target, sha256: sha, bytes_gz: gz.length, bytes_raw: raw.length };
  }

  function write(line) {
    rotateIfNeeded();
    const s = (typeof line === "string" ? line : JSON.stringify(line));
    fs.appendFileSync(active_path, s + "\n");
  }

  function forceRotate() {
    // Advance current window by one (for testing)
    currentWindow -= window_ms;
    return rotateIfNeeded();
  }

  return { write, rotateIfNeeded, forceRotate, currentWindow: () => currentWindow };
}

module.exports = { createRotator, windowStart, archiveName, ROTATE_WINDOW_MS_DEFAULT };
