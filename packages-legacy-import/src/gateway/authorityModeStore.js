const fs = require("fs");
const path = require("path");

function createDefaultError(message, status = 400, code = "authority_request_failed") {
  const error = new Error(String(message || "authority_request_failed"));
  error.status = status;
  error.code = code;
  return error;
}

function createAuthorityModeStore(input = {}) {
  const storePath = String(input.storePath || "").trim();
  if (!storePath) throw new Error("storePath is required.");
  const defaultMode = String(input.defaultMode || "operator_primary").trim() || "operator_primary";
  const normalizeMode = typeof input.normalizeMode === "function"
    ? input.normalizeMode
    : (value, fallback = defaultMode) => String(value || fallback || defaultMode).trim() || defaultMode;
  const transitionTtlMs = Number.isFinite(Number(input.transitionTtlMs))
    ? Math.max(60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Math.round(Number(input.transitionTtlMs))))
    : 10 * 60 * 1000;
  const maxHistory = Number.isFinite(Number(input.maxHistory))
    ? Math.max(50, Math.min(5000, Math.round(Number(input.maxHistory))))
    : 500;
  const maxTransitions = Number.isFinite(Number(input.maxTransitions))
    ? Math.max(50, Math.min(5000, Math.round(Number(input.maxTransitions))))
    : 500;
  const emit = typeof input.emit === "function" ? input.emit : null;
  const toError = typeof input.errorFactory === "function" ? input.errorFactory : createDefaultError;

  function emitEvent(type, payload) {
    if (!emit) return;
    try {
      emit(type, payload);
    } catch {}
  }

  function ensureStore() {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    if (!fs.existsSync(storePath)) {
      const now = new Date().toISOString();
      const fresh = {
        version: 1,
        mode: defaultMode,
        updatedAt: now,
        updatedBy: "bootstrap",
        history: [
          {
            id: `ev_${Date.now()}_bootstrap`,
            type: "bootstrap",
            from: "",
            to: defaultMode,
            actor: "bootstrap",
            reason: "initialized",
            at: now
          }
        ],
        transitions: []
      };
      fs.writeFileSync(storePath, JSON.stringify(fresh, null, 2), "utf8");
    }
  }

  function readStore() {
    ensureStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
      if (parsed && typeof parsed === "object") {
        return {
          version: 1,
          mode: normalizeMode(parsed.mode, defaultMode),
          updatedAt: String(parsed.updatedAt || ""),
          updatedBy: String(parsed.updatedBy || ""),
          history: Array.isArray(parsed.history) ? parsed.history : [],
          transitions: Array.isArray(parsed.transitions) ? parsed.transitions : []
        };
      }
    } catch {}
    return {
      version: 1,
      mode: defaultMode,
      updatedAt: "",
      updatedBy: "",
      history: [],
      transitions: []
    };
  }

  function writeStore(doc) {
    const safe = {
      version: 1,
      mode: normalizeMode(doc?.mode, defaultMode),
      updatedAt: String(doc?.updatedAt || ""),
      updatedBy: String(doc?.updatedBy || ""),
      history: Array.isArray(doc?.history) ? doc.history.slice(-maxHistory) : [],
      transitions: Array.isArray(doc?.transitions) ? doc.transitions.slice(-maxTransitions) : []
    };
    fs.writeFileSync(storePath, JSON.stringify(safe, null, 2), "utf8");
  }

  function loadDoc() {
    const doc = readStore();
    const nowIso = new Date().toISOString();
    let changed = false;
    for (const transition of doc.transitions) {
      if (String(transition.status || "") !== "pending") continue;
      const expiresAtMs = Date.parse(String(transition.expiresAt || ""));
      if (Number.isFinite(expiresAtMs) && Date.parse(nowIso) > expiresAtMs) {
        transition.status = "expired";
        transition.updatedAt = nowIso;
        transition.decidedAt = nowIso;
        transition.decisionBy = "system";
        transition.decisionReason = "expired";
        changed = true;
      }
    }
    if (changed) {
      writeStore(doc);
    }
    return doc;
  }

  function pushHistory(doc, item) {
    doc.history.push({
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...item
    });
  }

  function requestTransition(inputRequest = {}) {
    const targetMode = normalizeMode(inputRequest.targetMode, "");
    const actor = String(inputRequest.actor || "api").trim().slice(0, 120);
    const reason = String(inputRequest.reason || "").trim().slice(0, 260);
    const ttlMsRaw = Number(inputRequest.ttlMs);
    const ttlMs = Number.isFinite(ttlMsRaw)
      ? Math.max(60 * 1000, Math.min(24 * 60 * 60 * 1000, Math.round(ttlMsRaw)))
      : transitionTtlMs;
    const doc = loadDoc();
    if (doc.mode === targetMode) {
      throw toError(`Mode is already "${targetMode}".`, 409, "authority_mode_already_active");
    }

    const inputFingerprint = `${targetMode}|${actor}|${reason}`;
    const existing = doc.transitions.find((item) => (
      item.status === "pending"
      && `${item.targetMode}|${item.requestedBy}|${item.reason || ""}` === inputFingerprint
    ));
    if (existing) {
      return {
        mode: doc.mode,
        transition: existing
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const transition = {
      id: `amreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "pending",
      targetMode,
      requestedBy: actor,
      reason,
      requestedAt: nowIso,
      updatedAt: nowIso,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      decisionBy: "",
      decisionReason: "",
      decidedAt: ""
    };
    doc.transitions.push(transition);
    writeStore(doc);
    emitEvent("authority.transition_requested", { transition, mode: doc.mode });
    return {
      mode: doc.mode,
      transition
    };
  }

  function confirmTransition(inputConfirm = {}) {
    const id = String(inputConfirm.id || "").trim();
    const actor = String(inputConfirm.actor || "api").trim().slice(0, 120);
    const reason = String(inputConfirm.reason || "").trim().slice(0, 260);
    const doc = loadDoc();
    const nowIso = new Date().toISOString();
    const transition = doc.transitions.find((item) => item.id === id);
    if (!transition) {
      throw toError("Transition request not found.", 404, "authority_transition_not_found");
    }
    if (transition.status !== "pending") {
      return {
        mode: doc.mode,
        transition
      };
    }
    if (Date.parse(String(transition.expiresAt || "")) < Date.parse(nowIso)) {
      transition.status = "expired";
      transition.updatedAt = nowIso;
      transition.decidedAt = nowIso;
      transition.decisionBy = "system";
      transition.decisionReason = "expired";
      writeStore(doc);
      throw toError("Transition request expired.", 409, "authority_transition_expired");
    }

    const fromMode = doc.mode;
    doc.mode = normalizeMode(transition.targetMode, doc.mode);
    doc.updatedAt = nowIso;
    doc.updatedBy = actor;
    transition.status = "confirmed";
    transition.updatedAt = nowIso;
    transition.decidedAt = nowIso;
    transition.decisionBy = actor;
    transition.decisionReason = reason || "confirmed";
    pushHistory(doc, {
      type: "mode_confirmed",
      from: fromMode,
      to: doc.mode,
      actor,
      reason: transition.decisionReason,
      at: nowIso,
      transitionId: transition.id
    });
    writeStore(doc);
    emitEvent("authority.mode_changed", { from: fromMode, to: doc.mode, actor, transition });
    return {
      mode: doc.mode,
      transition
    };
  }

  function rollback(inputRollback = {}) {
    const actor = String(inputRollback.actor || "api").trim().slice(0, 120);
    const reason = String(inputRollback.reason || "manual rollback").trim().slice(0, 260);
    const doc = loadDoc();
    const nowIso = new Date().toISOString();
    const fromMode = doc.mode;
    if (fromMode === "operator_primary") {
      return {
        mode: doc.mode,
        changed: false
      };
    }
    doc.mode = "operator_primary";
    doc.updatedAt = nowIso;
    doc.updatedBy = actor;
    pushHistory(doc, {
      type: "mode_rollback",
      from: fromMode,
      to: doc.mode,
      actor,
      reason,
      at: nowIso
    });
    writeStore(doc);
    emitEvent("authority.mode_changed", { from: fromMode, to: doc.mode, actor, reason, rollback: true });
    return {
      mode: doc.mode,
      changed: true
    };
  }

  function getStatus() {
    const doc = loadDoc();
    return {
      mode: doc.mode,
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy,
      pendingTransitions: doc.transitions.filter((item) => item.status === "pending").slice(-20).reverse(),
      history: doc.history.slice(-50).reverse()
    };
  }

  function getMode() {
    return loadDoc().mode;
  }

  return {
    requestTransition,
    confirmTransition,
    rollback,
    getStatus,
    getMode
  };
}

module.exports = {
  createAuthorityModeStore
};
