const { appendGraphEvent } = require("../graphRuntimeStore");

const sessions = new Map();
const events = [];

function nowIso() {
  return new Date().toISOString();
}

function ensureSession(id) {
  const sessionId = String(id || "default").trim() || "default";
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      id: sessionId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      contextSources: [],
      transcriptBackups: []
    });
  }
  return sessions.get(sessionId);
}

function pushEvent(event) {
  events.push(event);
  if (events.length > 500) {
    events.splice(0, events.length - 500);
  }
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeEventAction(value, fallback = "event") {
  const text = cleanText(value || fallback).toLowerCase();
  return text.replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

function mirrorHookEventToGraph(input = {}, event = {}) {
  if (typeof appendGraphEvent !== "function") {
    return null;
  }

  try {
    const payload = input && typeof input === "object" ? input : {};
    const payloadKeys = Object.keys(payload).slice(0, 24);
    return appendGraphEvent({
      component: "hooks-connector",
      category: "hook-ingest",
      action: normalizeEventAction(event.type || event.name || payload.type || payload.eventType, "event"),
      status: cleanText(payload.status || ""),
      actor: payload.actor || {
        type: "hook-source",
        id: cleanText(payload.source || payload.origin || payload.channel || "unknown")
      },
      subject: payload.subject || {
        type: "hook-session",
        id: cleanText(event.sessionId || payload.sessionId || payload.session_id || "default")
      },
      target: payload.target || {},
      context: {
        hookEventId: cleanText(event.id || ""),
        sessionId: cleanText(event.sessionId || payload.sessionId || payload.session_id || "default"),
        source: cleanText(payload.source || payload.origin || ""),
        channel: cleanText(payload.channel || ""),
        tool: cleanText(payload.toolName || payload.tool_name || "")
      },
      policy: {
        mode: "hook_ingest",
        approvalState: cleanText(payload.approvalState || ""),
        autonomous: Boolean(payload.autonomous)
      },
      detail: {
        hookType: cleanText(event.type || event.name || ""),
        payloadKeys
      }
    });
  } catch (_error) {
    return null;
  }
}

function emitEvent(name, data = {}) {
  const event = {
    id: `hook_${Date.now()}_${events.length + 1}`,
    name: String(name || "event").trim() || "event",
    data: data && typeof data === "object" ? data : {},
    at: nowIso()
  };
  pushEvent(event);
  mirrorHookEventToGraph(data, event);
  return { ok: true, event };
}

function ingestHookEvent(input = {}) {
  const session = ensureSession(input.sessionId || input.session_id || "default");
  session.updatedAt = nowIso();
  const event = {
    id: `hook_${Date.now()}_${events.length + 1}`,
    sessionId: session.id,
    type: String(input.type || input.eventType || "event").trim() || "event",
    payload: input,
    at: nowIso()
  };
  pushEvent(event);
  mirrorHookEventToGraph(input, event);
  return { ok: true, event };
}

function getDashboard() {
  return {
    totalEvents: events.length,
    activeSessions: sessions.size,
    latestEventAt: events.length ? events[events.length - 1].at : ""
  };
}

function getHookDashboard() {
  return getDashboard();
}

function listSessions() {
  return Array.from(sessions.values()).map((session) => ({ ...session }));
}

function listActiveSessions() {
  return listSessions();
}

function getSession(id) {
  const session = sessions.get(String(id || "").trim());
  return session ? { ...session } : null;
}

function getSessionDetail(id) {
  const session = getSession(id);
  if (!session) {
    return { session: null, summary: null };
  }
  return {
    session,
    summary: {
      eventCount: events.filter((event) => event.sessionId === session.id).length
    }
  };
}

function injectSessionContext(id, source = "startup") {
  const session = ensureSession(id);
  const cleanSource = String(source || "startup").trim() || "startup";
  if (!session.contextSources.includes(cleanSource)) {
    session.contextSources.push(cleanSource);
  }
  session.updatedAt = nowIso();
  return {
    session: { ...session },
    source: cleanSource
  };
}

function guardAction(action = "") {
  const cleanAction = String(action || "").trim();
  return {
    allowed: true,
    action: cleanAction,
    reason: cleanAction ? "stub_allow" : "no_action"
  };
}

function getGuardVerdict(toolName = "", toolInput = {}) {
  const verdict = guardAction(toolName);
  return {
    verdict: verdict.allowed ? "allow" : "deny",
    toolName: String(toolName || ""),
    toolInput,
    reason: verdict.reason
  };
}

function getStats() {
  return {
    events: events.length,
    sessions: sessions.size
  };
}

function getHookEventStats() {
  return getStats();
}

function queryHookEvents(filters = {}) {
  const sessionId = String(filters.sessionId || "").trim();
  const eventType = String(filters.eventType || "").trim();
  const limit = Math.max(1, Math.min(500, Number(filters.limit || 200) || 200));
  let rows = events.slice();
  if (sessionId) {
    rows = rows.filter((event) => String(event.sessionId || "") === sessionId);
  }
  if (eventType) {
    rows = rows.filter((event) => String(event.type || event.name || "") === eventType);
  }
  return rows.slice(-limit).map((event) => ({ ...event }));
}

function backupTranscript(sessionId, transcriptPath = "", trigger = "manual") {
  const session = ensureSession(sessionId || "default");
  const row = {
    transcriptPath: String(transcriptPath || "").trim(),
    trigger: String(trigger || "manual").trim() || "manual",
    at: nowIso()
  };
  session.transcriptBackups.push(row);
  session.updatedAt = row.at;
  return {
    ok: true,
    sessionId: session.id,
    backup: row
  };
}

module.exports = {
  emitEvent,
  ingestHookEvent,
  getDashboard,
  getHookDashboard,
  listSessions,
  listActiveSessions,
  getSession,
  getSessionDetail,
  injectSessionContext,
  guardAction,
  getGuardVerdict,
  getStats,
  getHookEventStats,
  queryHookEvents,
  backupTranscript
};
