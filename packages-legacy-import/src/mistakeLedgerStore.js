const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");
const { recordMistakePatternFromLedger } = require("./mistakePatternStore");

const MISTAKE_LEDGER_PATH = resolveDataPath("mistake-ledger.ndjson");
const TEXT_MAX = 320;
const CODE_MAX = 120;
const CONTEXT_KEYS_MAX = 24;
const ID_MAX = 80;

function normalizeIdentifier(value) {
  const normalized = String(value || "").trim().toLowerCase().slice(0, ID_MAX);
  if (!normalized) {
    return "";
  }
  return /^[a-z0-9][a-z0-9._:-]{0,79}$/.test(normalized) ? normalized : "";
}

function normalizeClassificationCode(value) {
  const code = String(value || "").trim().slice(0, 40);
  if (!code) {
    return "";
  }
  return /^\d{1,3}(?:\.\d{1,3}){1,4}$/.test(code) ? code : "";
}

function clip(value, max = TEXT_MAX) {
  return String(value || "").trim().slice(0, Math.max(1, Number(max) || TEXT_MAX));
}

function sanitizeContextValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return clip(value, TEXT_MAX);
}

function isBlockedContextKey(key) {
  const name = String(key || "").trim().toLowerCase();
  if (!name) {
    return true;
  }
  return /(secret|token|password|apikey|api_key|auth|cookie|session|credential|bearer|private)/i.test(name);
}

function sanitizeContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return {};
  }
  const out = {};
  const keys = Object.keys(context).slice(0, CONTEXT_KEYS_MAX);
  for (const key of keys) {
    if (isBlockedContextKey(key)) {
      continue;
    }
    out[clip(key, 80)] = sanitizeContextValue(context[key]);
  }
  return out;
}

function normalizeSeverity(value) {
  const level = clip(value, 20).toLowerCase();
  if (level === "critical" || level === "high" || level === "medium" || level === "low") {
    return level;
  }
  return "medium";
}

function normalizeRecord(input = {}) {
  const nowIso = new Date().toISOString();
  return {
    at: clip(input.at || nowIso, 40),
    feature: clip(input.feature || "unknown", 80).toLowerCase(),
    operation: clip(input.operation || "unknown", 80).toLowerCase(),
    type: clip(input.type || "mistake", 80).toLowerCase(),
    severity: normalizeSeverity(input.severity),
    actor: clip(input.actor || "", 80).toLowerCase(),
    laneId: clip(input.laneId || "", 80).toLowerCase(),
    message: clip(input.message || "mistake", TEXT_MAX),
    code: clip(input.code || "", CODE_MAX),
    classificationCode: normalizeClassificationCode(
      input.classificationCode
      || input.mistakeCode
      || input.taxonomyCode
    ),
    activityType: normalizeIdentifier(input.activityType || input.activity || input.operation),
    skillId: normalizeIdentifier(input.skillId || input.skill),
    toolId: normalizeIdentifier(input.toolId || input.tool),
    rootCause: clip(input.rootCause || "", 220),
    avoidance: clip(input.avoidance || input.preventiveAction || "", 220),
    context: sanitizeContext(input.context || {})
  };
}

function appendMistakeLedger(record = {}) {
  const entry = normalizeRecord(record);
  const line = `${JSON.stringify(entry)}\n`;
  try {
    fs.mkdirSync(path.dirname(MISTAKE_LEDGER_PATH), { recursive: true });
    fs.appendFileSync(MISTAKE_LEDGER_PATH, line, "utf8");
    try {
      recordMistakePatternFromLedger(entry, { enabled: true });
    } catch (_error) {
      // Best-effort sync to mistake taxonomy store; ledger write remains primary.
    }
    return {
      ok: true,
      path: MISTAKE_LEDGER_PATH
    };
  } catch (error) {
    return {
      ok: false,
      path: MISTAKE_LEDGER_PATH,
      error: clip(error?.message || error || "append_failed", 200)
    };
  }
}

function appendMistakeLedgerBatch(items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length < 1) {
    return {
      ok: true,
      path: MISTAKE_LEDGER_PATH,
      count: 0
    };
  }
  const lines = rows.map((item) => `${JSON.stringify(normalizeRecord(item))}\n`).join("");
  const normalizedRows = rows.map((item) => normalizeRecord(item));
  try {
    fs.mkdirSync(path.dirname(MISTAKE_LEDGER_PATH), { recursive: true });
    fs.appendFileSync(MISTAKE_LEDGER_PATH, lines, "utf8");
    try {
      for (const entry of normalizedRows) {
        recordMistakePatternFromLedger(entry, { enabled: true });
      }
    } catch (_error) {
      // Best effort only.
    }
    return {
      ok: true,
      path: MISTAKE_LEDGER_PATH,
      count: rows.length
    };
  } catch (error) {
    return {
      ok: false,
      path: MISTAKE_LEDGER_PATH,
      count: 0,
      error: clip(error?.message || error || "append_failed", 200)
    };
  }
}

module.exports = {
  MISTAKE_LEDGER_PATH,
  appendMistakeLedger,
  appendMistakeLedgerBatch
};
