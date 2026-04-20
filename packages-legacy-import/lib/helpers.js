/**
 * Shared helper functions extracted from server.js (ADR-0001 Phase 3)
 *
 * These are the most commonly used utility functions across route handlers.
 * Extracting them here allows route modules to import directly instead of
 * receiving them as factory dependencies.
 */

function asBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return fallback;
}

function asEnum(value, allowed, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  if (allowed.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function asInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function sanitizeUserVisibleErrorMessage(value) {
  let text = String(value || "").trim();
  if (!text) return "Request failed.";
  text = text.replace(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g, "[path]");
  text = text.replace(/(^|[\s(])\/(?:Users|home|data|private|var|tmp)\/[^\s)\]]+/g, "$1[path]");
  text = text.replace(/\b[a-f0-9]{32,}\b/gi, "[secret]");
  text = text.replace(/https?:\/\/[^\s)\]]+/gi, (rawUrl) => {
    try {
      const parsed = new URL(rawUrl);
      const host = String(parsed.hostname || "").trim().toLowerCase();
      const isPrivate = host === "localhost" || host === "127.0.0.1" || host === "::1"
        || /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(host)
        || /^(100\.(6[4-9]|[7-9]\d|1[0-2]\d)|169\.254\.)/.test(host);
      if (!isPrivate) return rawUrl;
      const portPart = parsed.port ? `:${parsed.port}` : "";
      return `${parsed.protocol}//[private-host]${portPart}`;
    } catch (_) { return rawUrl; }
  });
  return text;
}

function respondError(res, error, statusCode = 500) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = sanitizeUserVisibleErrorMessage(rawMessage);
  res.status(statusCode).json({ ok: false, error: message });
}

function inferHttpStatusForError(error, fallback = 500) {
  const message = String(error?.message || error || "").toLowerCase();
  if (message.includes("work-link policy blocked")) return 403;
  if (message.includes("unknown work organization")) return 400;
  return fallback;
}

function queueReply(job, message) {
  return { mode: "queued", reply: message, job };
}

module.exports = {
  asBool,
  asEnum,
  asInt,
  sanitizeUserVisibleErrorMessage,
  respondError,
  inferHttpStatusForError,
  queueReply
};
