const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const body = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${body.join(",")}}`;
}

function toSafePayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return { raw: String(payload) };
  }
}

function parseDateMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function buildPolicy(config = {}, repoRoot = "") {
  const audit = config?.audit || {};
  return {
    enabled: audit.enabled !== false,
    filePath: path.resolve(repoRoot, String(audit.eventsFile || "data/gateway-audit.ndjson")),
    maxListLimit: clampInt(audit.maxListLimit, 500, 10, 5000)
  };
}

function createAuditLogManager(input = {}) {
  const repoRoot = String(input.repoRoot || "").trim();
  if (!repoRoot) throw new Error("repoRoot is required.");
  const config = input.config || {};
  const policy = buildPolicy(config, repoRoot);

  const state = {
    loadedAt: new Date().toISOString(),
    totalEvents: 0,
    lastHash: "GENESIS",
    lastEventAt: "",
    integrity: {
      ok: true,
      checkedAt: "",
      errorCount: 0,
      firstError: ""
    },
    lastAppendAt: "",
    lastError: ""
  };

  function ensureFile() {
    fs.mkdirSync(path.dirname(policy.filePath), { recursive: true });
    if (!fs.existsSync(policy.filePath)) {
      fs.writeFileSync(policy.filePath, "", "utf8");
    }
  }

  function computeEntryHash(entry) {
    const base = [
      String(entry.prevHash || "GENESIS"),
      String(entry.id || ""),
      String(entry.at || ""),
      String(entry.type || ""),
      String(entry.payloadHash || "")
    ].join("|");
    return sha256(base);
  }

  function parseLines() {
    ensureFile();
    const raw = fs.readFileSync(policy.filePath, "utf8");
    const lines = raw.split(/\r?\n/g).filter((line) => String(line || "").trim().length > 0);
    const events = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object") events.push(parsed);
      } catch {}
    }
    return events;
  }

  function verify() {
    if (!policy.enabled) {
      return {
        ok: true,
        disabled: true
      };
    }
    const nowIso = new Date().toISOString();
    const events = parseLines();
    let prevHash = "GENESIS";
    let ok = true;
    let errorCount = 0;
    let firstError = "";

    for (let index = 0; index < events.length; index += 1) {
      const entry = events[index];
      const expectedPrev = prevHash;
      const actualPrev = String(entry.prevHash || "");
      if (actualPrev !== expectedPrev) {
        ok = false;
        errorCount += 1;
        if (!firstError) firstError = `entry ${index + 1} prevHash mismatch`;
      }
      const expectedHash = computeEntryHash(entry);
      if (String(entry.hash || "") !== expectedHash) {
        ok = false;
        errorCount += 1;
        if (!firstError) firstError = `entry ${index + 1} hash mismatch`;
      }
      prevHash = String(entry.hash || expectedHash);
    }

    state.totalEvents = events.length;
    state.lastHash = prevHash || "GENESIS";
    state.lastEventAt = events.length > 0 ? String(events[events.length - 1].at || "") : "";
    state.integrity = {
      ok,
      checkedAt: nowIso,
      errorCount,
      firstError
    };
    return {
      ...state.integrity,
      totalEvents: state.totalEvents,
      lastHash: state.lastHash
    };
  }

  function append(inputEvent = {}) {
    if (!policy.enabled) {
      return {
        ok: true,
        disabled: true
      };
    }
    ensureFile();
    const nowIso = new Date().toISOString();
    const payload = toSafePayload(inputEvent.payload || {});
    const entry = {
      id: String(inputEvent.id || `gaev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      at: String(inputEvent.at || nowIso),
      type: String(inputEvent.type || "event"),
      actor: String(inputEvent.actor || "").slice(0, 120),
      payload,
      payloadHash: sha256(stableStringify(payload)),
      prevHash: state.lastHash || "GENESIS"
    };
    entry.hash = computeEntryHash(entry);
    const line = `${JSON.stringify(entry)}\n`;
    try {
      fs.appendFileSync(policy.filePath, line, "utf8");
      state.totalEvents += 1;
      state.lastHash = entry.hash;
      state.lastEventAt = entry.at;
      state.lastAppendAt = nowIso;
      state.lastError = "";
      return {
        ok: true,
        entry
      };
    } catch (error) {
      state.lastError = String(error && error.message ? error.message : error);
      return {
        ok: false,
        error: state.lastError
      };
    }
  }

  function list(options = {}) {
    if (!policy.enabled) {
      return [];
    }
    const wantedType = String(options.type || "").trim().toLowerCase();
    const sinceMs = parseDateMs(options.since);
    const limit = clampInt(options.limit, 100, 1, policy.maxListLimit);
    let events = parseLines();
    if (wantedType) {
      events = events.filter((item) => String(item.type || "").trim().toLowerCase() === wantedType);
    }
    if (sinceMs > 0) {
      events = events.filter((item) => parseDateMs(item.at) >= sinceMs);
    }
    return events.slice(-limit).reverse();
  }

  function getStatus() {
    return {
      enabled: policy.enabled,
      filePath: policy.filePath,
      totalEvents: state.totalEvents,
      lastHash: state.lastHash,
      lastEventAt: state.lastEventAt,
      lastAppendAt: state.lastAppendAt,
      integrity: state.integrity,
      lastError: state.lastError
    };
  }

  // Warm state from existing file.
  verify();

  return {
    append,
    list,
    verify,
    getStatus
  };
}

module.exports = {
  createAuditLogManager
};
