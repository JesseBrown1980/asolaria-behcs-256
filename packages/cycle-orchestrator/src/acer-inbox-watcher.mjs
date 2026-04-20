// ACER-INBOX-WATCHER · the reciprocal direction (liris→acer file-drop path)
// 2026-04-20 — complements visual-verify.mjs's acer→liris drop.
//
// Design:
//   - Local folder C:/Users/acer/Asolaria/data/acer-inbox/ (owned by acer; liris writes via SMB share)
//   - Poll every 5s (fs.watch is unreliable over SMB so polling is the floor; fs.watch added as an optional wake-up)
//   - Pick up LIRIS-KICK-*.json or FALCON-KICK-*.json files
//   - Validate shape {id,from,to,verb,ts,text,...}
//   - Emit each via callback, then move to acer-inbox-processed/${ts-date}/ subfolder
//
// To unblock liris→acer TODAY without requiring Rayssa to create a Windows share,
// acer just shares C:/Users/acer/Asolaria/data/acer-inbox/ from her side (one-click
// Windows Explorer → Properties → Sharing → Share… → rayss/everyone → Read/Write).

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  watch,
} from "node:fs";
import path from "node:path";

export const ACER_INBOX_DEFAULT = "C:/Users/acer/Asolaria/data/acer-inbox";
export const ACER_INBOX_PROCESSED_DEFAULT = "C:/Users/acer/Asolaria/data/acer-inbox-processed";

const KICK_PATTERNS = [/^LIRIS-KICK-.*\.json$/i, /^FALCON-KICK-.*\.json$/i];

function isKickFile(name) {
  return KICK_PATTERNS.some(r => r.test(name));
}

export function mkdirIfMissing(dir = ACER_INBOX_DEFAULT) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    return { ok: true, created: true, path: dir };
  }
  return { ok: true, created: false, path: dir };
}

function validateShape(obj) {
  if (!obj || typeof obj !== "object") return { ok: false, error: "not an object" };
  const required = ["id", "from", "to", "verb", "ts", "text"];
  for (const k of required) {
    if (!(k in obj)) return { ok: false, error: `missing field: ${k}` };
  }
  if (typeof obj.id !== "string" || !obj.id) return { ok: false, error: "id must be non-empty string" };
  if (typeof obj.from !== "string" || !obj.from) return { ok: false, error: "from must be non-empty string" };
  if (typeof obj.to !== "string" || !obj.to) return { ok: false, error: "to must be non-empty string" };
  if (typeof obj.verb !== "string" || !obj.verb) return { ok: false, error: "verb must be non-empty string" };
  if (typeof obj.ts !== "string" || !obj.ts) return { ok: false, error: "ts must be non-empty string" };
  if (typeof obj.text !== "string") return { ok: false, error: "text must be string" };
  return { ok: true };
}

function datePartition(isoOrNow) {
  // "2026-04-20T12:34:56.789Z" → "2026-04-20"
  let d;
  try {
    d = new Date(isoOrNow);
    if (isNaN(d.getTime())) d = new Date();
  } catch (_) { d = new Date(); }
  return d.toISOString().slice(0, 10);
}

export class AcerInboxWatcher {
  constructor({
    inboxDir = ACER_INBOX_DEFAULT,
    processedDir = ACER_INBOX_PROCESSED_DEFAULT,
    pollMs = 5000,
    useFsWatch = true,
  } = {}) {
    this.inboxDir = inboxDir;
    this.processedDir = processedDir;
    this.pollMs = pollMs;
    this.useFsWatch = useFsWatch;
    this._timer = null;
    this._fsWatcher = null;
    this._running = false;
    this._onKick = null;
    this._processedCount = 0;
    this._errorCount = 0;
    this._lastError = null;
    this._seenIds = new Set(); // within-session dedupe guard
  }

  start(onKick) {
    if (this._running) return { ok: false, error: "already running" };
    if (typeof onKick !== "function") return { ok: false, error: "onKick must be a function" };
    this._onKick = onKick;
    this._running = true;

    mkdirIfMissing(this.inboxDir);
    mkdirIfMissing(this.processedDir);

    // immediate first sweep
    this._tick();

    // polling floor (SMB fs.watch is unreliable)
    this._timer = setInterval(() => this._tick(), this.pollMs);

    // optional fs.watch wake-up (non-SMB local path only)
    if (this.useFsWatch) {
      try {
        this._fsWatcher = watch(this.inboxDir, { persistent: false }, () => {
          // debounce: let tick handle it on next iteration; fs.watch just triggers sooner
          this._tick();
        });
        this._fsWatcher.on && this._fsWatcher.on("error", () => {
          // swallow — polling continues regardless
        });
      } catch (_) {
        // fs.watch unsupported (SMB) — fine, polling handles it
        this._fsWatcher = null;
      }
    }

    return { ok: true, inbox: this.inboxDir, processed: this.processedDir, poll_ms: this.pollMs };
  }

  stop() {
    if (!this._running) return { ok: false, error: "not running" };
    this._running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._fsWatcher) {
      try { this._fsWatcher.close(); } catch (_) {}
      this._fsWatcher = null;
    }
    return { ok: true, processed_count: this._processedCount };
  }

  snapshot() {
    return {
      running: this._running,
      inbox: this.inboxDir,
      processed_dir: this.processedDir,
      poll_ms: this.pollMs,
      processed_count: this._processedCount,
      error_count: this._errorCount,
      last_error: this._lastError,
      seen_ids: this._seenIds.size,
    };
  }

  // sweep the inbox once, process all matching files
  _tick() {
    if (!this._running) return;
    let entries;
    try {
      entries = readdirSync(this.inboxDir, { withFileTypes: true });
    } catch (e) {
      this._errorCount++;
      this._lastError = `readdir: ${e.code || e.message}`;
      return;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!isKickFile(ent.name)) continue;
      const full = path.join(this.inboxDir, ent.name);
      try { statSync(full); } catch (_) { continue; /* racing-delete */ }
      this._processOne(full, ent.name);
    }
  }

  _processOne(full, name) {
    let body;
    try {
      body = readFileSync(full, "utf8");
    } catch (e) {
      this._errorCount++;
      this._lastError = `read ${name}: ${e.code || e.message}`;
      return;
    }
    let obj;
    try {
      obj = JSON.parse(body);
    } catch (e) {
      this._errorCount++;
      this._lastError = `parse ${name}: ${e.message}`;
      this._quarantine(full, name, "parse-error");
      return;
    }
    const v = validateShape(obj);
    if (!v.ok) {
      this._errorCount++;
      this._lastError = `shape ${name}: ${v.error}`;
      this._quarantine(full, name, "shape-invalid");
      return;
    }
    // dedupe within session
    if (this._seenIds.has(obj.id)) {
      // already emitted — just move again (possibly re-dropped)
      this._move(full, name, obj.ts);
      return;
    }
    this._seenIds.add(obj.id);

    // emit
    try {
      this._onKick(obj);
    } catch (e) {
      this._errorCount++;
      this._lastError = `onKick ${name}: ${e.message}`;
      // still move — don't re-emit on every tick
    }
    this._move(full, name, obj.ts);
    this._processedCount++;
  }

  _move(full, name, isoTs) {
    const datePart = datePartition(isoTs);
    const destDir = path.join(this.processedDir, datePart);
    try {
      mkdirIfMissing(destDir);
      const dest = path.join(destDir, name);
      renameSync(full, dest);
    } catch (e) {
      this._errorCount++;
      this._lastError = `move ${name}: ${e.code || e.message}`;
    }
  }

  _quarantine(full, name, reason) {
    const qDir = path.join(this.processedDir, "_quarantine", reason);
    try {
      mkdirIfMissing(qDir);
      renameSync(full, path.join(qDir, name));
    } catch (_) { /* best-effort */ }
  }
}
