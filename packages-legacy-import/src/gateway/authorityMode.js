const path = require("path");
const { createAuthorityModeStore } = require("./authorityModeStore");

const MODES = ["operator_primary", "shared_control", "asolaria_primary"];

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeMode(value, fallback = "operator_primary") {
  const raw = String(value || "").trim().toLowerCase();
  return MODES.includes(raw) ? raw : fallback;
}

function parseList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPattern(value, pattern) {
  const rawPattern = String(pattern || "").trim();
  if (!rawPattern) return false;
  if (rawPattern === "*") return true;
  const regexBody = rawPattern.split("*").map((part) => escapeRegex(part)).join(".*");
  const re = new RegExp(`^${regexBody}$`);
  return re.test(String(value || "").trim());
}

function buildPolicy(config = {}, repoRoot = "") {
  const authority = config?.authority || {};
  return {
    defaultMode: normalizeMode(authority.defaultMode, "operator_primary"),
    storePath: path.resolve(repoRoot, String(authority.storeFile || "data/gateway-authority-state.json")),
    transitionTtlMs: clampInt(authority.transitionTtlMs, 10 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    confirmationPhrase: String(authority.confirmationPhrase || "ASSUME_COMMAND").trim() || "ASSUME_COMMAND",
    sharedControlAllowTools: parseList(authority.sharedControlAllowTools || ["github.status", "github.repos", "browser.task"]),
    asolariaActorPatterns: parseList(authority.asolariaActorPatterns || ["asolaria*", "scheduler*", "auto*"]),
    maxHistory: clampInt(authority.maxHistory, 500, 50, 5000),
    maxTransitions: clampInt(authority.maxTransitions, 500, 50, 5000)
  };
}

function toAuthorityError(message, status = 400, code = "authority_request_failed") {
  const err = new Error(String(message || "authority_request_failed"));
  err.status = status;
  err.code = code;
  return err;
}

function isAsolariaActor(actor, patterns) {
  const value = String(actor || "").trim().toLowerCase();
  if (!value) return false;
  return patterns.some((pattern) => matchesPattern(value, String(pattern || "").trim().toLowerCase()));
}

function createAuthorityModeManager(input = {}) {
  const repoRoot = String(input.repoRoot || "").trim();
  if (!repoRoot) throw new Error("repoRoot is required.");
  const config = input.config || {};
  const onEvent = typeof input.onEvent === "function" ? input.onEvent : null;
  const policy = buildPolicy(config, repoRoot);

  function emit(type, payload) {
    if (!onEvent) return;
    try {
      onEvent(type, payload);
    } catch {}
  }
  const store = createAuthorityModeStore({
    storePath: policy.storePath,
    defaultMode: policy.defaultMode,
    transitionTtlMs: policy.transitionTtlMs,
    maxHistory: policy.maxHistory,
    maxTransitions: policy.maxTransitions,
    normalizeMode,
    errorFactory: toAuthorityError,
    emit
  });

  function requestTransition(inputRequest = {}) {
    const targetMode = normalizeMode(inputRequest.targetMode, "");
    if (!targetMode) {
      throw toAuthorityError(
        "targetMode must be operator_primary, shared_control, or asolaria_primary.",
        400,
        "authority_target_mode_invalid"
      );
    }
    const actor = String(inputRequest.actor || "api").trim().slice(0, 120);
    const reason = String(inputRequest.reason || "").trim().slice(0, 260);
    const ttlMs = clampInt(inputRequest.ttlMs, policy.transitionTtlMs, 60 * 1000, 24 * 60 * 60 * 1000);
    const result = store.requestTransition({ targetMode, actor, reason, ttlMs });
    result.transition.confirmationPhraseHint = policy.confirmationPhrase.slice(0, 2) + "***";
    return {
      mode: result.mode,
      transition: result.transition,
      confirmationPhraseRequired: policy.confirmationPhrase
    };
  }

  function confirmTransition(inputConfirm = {}) {
    const id = String(inputConfirm.id || "").trim();
    const actor = String(inputConfirm.actor || "api").trim().slice(0, 120);
    const reason = String(inputConfirm.reason || "").trim().slice(0, 260);
    const confirmText = String(inputConfirm.confirmText || "").trim();
    if (!id) {
      throw toAuthorityError("Transition id is required.", 400, "authority_transition_id_required");
    }
    if (confirmText !== policy.confirmationPhrase) {
      throw toAuthorityError(
        `Confirmation phrase mismatch. Expected "${policy.confirmationPhrase}".`,
        400,
        "authority_confirmation_mismatch"
      );
    }
    return store.confirmTransition({ id, actor, reason });
  }

  function rollback(inputRollback = {}) {
    return store.rollback({
      actor: String(inputRollback.actor || "api").trim().slice(0, 120),
      reason: String(inputRollback.reason || "manual rollback").trim().slice(0, 260)
    });
  }

  function getStatus() {
    const status = store.getStatus();
    return {
      mode: status.mode,
      updatedAt: status.updatedAt,
      updatedBy: status.updatedBy,
      confirmationPhrase: policy.confirmationPhrase,
      pendingTransitions: status.pendingTransitions,
      history: status.history,
      policy: {
        sharedControlAllowTools: policy.sharedControlAllowTools,
        asolariaActorPatterns: policy.asolariaActorPatterns
      }
    };
  }

  function evaluateInvocation(inputInvoke = {}) {
    const mode = store.getMode();
    const actor = String(inputInvoke.actor || "").trim();
    const tool = String(inputInvoke.tool || "").trim();
    const autonomous = isAsolariaActor(actor, policy.asolariaActorPatterns);

    if (!autonomous) {
      return {
        allowed: true,
        mode,
        autonomous: false
      };
    }

    if (mode === "operator_primary") {
      return {
        allowed: false,
        mode,
        autonomous: true,
        reason: "Autonomous actors are blocked in operator_primary mode."
      };
    }

    if (mode === "shared_control") {
      const allowed = policy.sharedControlAllowTools.some((pattern) => matchesPattern(tool, pattern));
      if (!allowed) {
        return {
          allowed: false,
          mode,
          autonomous: true,
          reason: `Tool "${tool}" is not allowed for autonomous actor in shared_control mode.`,
          allowedTools: policy.sharedControlAllowTools
        };
      }
    }

    return {
      allowed: true,
      mode,
      autonomous: true
    };
  }

  function getMode() {
    return store.getMode();
  }

  function getPolicySummary() {
    return {
      defaultMode: policy.defaultMode,
      transitionTtlMs: policy.transitionTtlMs,
      confirmationPhrase: policy.confirmationPhrase,
      sharedControlAllowTools: policy.sharedControlAllowTools,
      asolariaActorPatterns: policy.asolariaActorPatterns
    };
  }

  return {
    requestTransition,
    confirmTransition,
    rollback,
    getStatus,
    evaluateInvocation,
    getMode,
    getPolicySummary
  };
}

module.exports = {
  MODES,
  createAuthorityModeManager
};
