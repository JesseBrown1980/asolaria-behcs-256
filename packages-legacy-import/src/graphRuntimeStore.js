const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { resolveDataPath } = require("./runtimePaths");
const { scoreEdgeRisk } = require("./edgeRiskEngine");

const graphRuntimeEventsPath = resolveDataPath("graph-runtime-events.ndjson");
const graphRuntimeManifestsPath = resolveDataPath("graph-runtime-manifests.ndjson");
const graphRuntimeEmitter = new EventEmitter();
graphRuntimeEmitter.setMaxListeners(64);

function ensureDir() {
  fs.mkdirSync(path.dirname(graphRuntimeEventsPath), { recursive: true });
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, " ").trim();
}

function clipText(value, maxChars = 240) {
  const text = cleanText(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function normalizeNodeRef(input = {}, fallbackType = "unknown") {
  const source = input && typeof input === "object" ? input : {};
  const type = cleanText(source.type || fallbackType).toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 48) || fallbackType;
  const id = clipText(source.id || source.name || "", 120);
  const label = clipText(source.label || source.title || "", 160);
  const domain = clipText(source.domain || "", 40).toLowerCase();
  const criticality = clipText(source.criticality || source.priority || "", 24).toLowerCase();
  const out = { type, id, label, domain, criticality };
  if (!out.id) delete out.id;
  if (!out.label) delete out.label;
  if (!out.domain) delete out.domain;
  if (!out.criticality) delete out.criticality;
  return out;
}

function normalizeFlatObject(input = {}, maxKeys = 20) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = {};
  for (const [key, value] of Object.entries(source).slice(0, maxKeys)) {
    const safeKey = clipText(key, 48).replace(/[^a-zA-Z0-9_:-]/g, "_");
    if (!safeKey) continue;
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      out[safeKey] = clipText(value, 240);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[safeKey] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[safeKey] = value.slice(0, 10).map((item) => clipText(typeof item === "string" ? item : JSON.stringify(item), 120));
      continue;
    }
    if (typeof value === "object") {
      out[safeKey] = clipText(JSON.stringify(value), 320);
    }
  }
  return out;
}

function normalizePolicy(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const approvalState = clipText(source.approvalState || "", 24).toLowerCase();
  const mode = clipText(source.mode || "", 32).toLowerCase();
  const rollback = Boolean(source.rollbackRequired);
  const autonomous = Boolean(source.autonomous);
  const out = {
    approvalState,
    mode,
    rollbackRequired: rollback,
    autonomous
  };
  if (!out.approvalState) delete out.approvalState;
  if (!out.mode) delete out.mode;
  if (!out.rollbackRequired) delete out.rollbackRequired;
  if (!out.autonomous) delete out.autonomous;
  return out;
}

function buildGraphEvent(input = {}) {
  const at = toIsoDate(input.at, new Date().toISOString()) || new Date().toISOString();
  const component = clipText(input.component || "unknown", 64).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  const category = clipText(input.category || "runtime", 48).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  const action = clipText(input.action || "event", 64).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  const actor = normalizeNodeRef(input.actor, "system_actor");
  const subject = normalizeNodeRef(input.subject, "subject");
  const target = normalizeNodeRef(input.target, "target");
  const context = normalizeFlatObject(input.context);
  const detail = normalizeFlatObject(input.detail, 32);
  const policy = normalizePolicy(input.policy);
  const status = clipText(input.status || "", 24).toLowerCase();
  const risk = scoreEdgeRisk({
    action,
    category,
    tool: context.tool || context.routeAction || "",
    status,
    actor,
    target,
    policy,
    context
  });
  const event = {
    schemaVersion: "1.0",
    kind: "graph_event",
    id: clipText(input.id || makeId("gevt"), 80),
    at,
    component,
    category,
    action,
    actor,
    subject,
    target,
    context,
    policy,
    detail,
    risk
  };
  if (!status) {
    delete event.status;
  } else {
    event.status = status;
  }
  return event;
}

function buildActionManifest(input = {}) {
  const createdAt = toIsoDate(input.createdAt, new Date().toISOString()) || new Date().toISOString();
  const component = clipText(input.component || "unknown", 64).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  const action = clipText(input.action || "unknown_action", 72).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  const status = clipText(input.status || "proposed", 24).toLowerCase();
  const actor = normalizeNodeRef(input.actor, "system_actor");
  const target = normalizeNodeRef(input.target, "target");
  const policy = normalizePolicy(input.policy);
  const context = normalizeFlatObject(input.context);
  const rollback = normalizeFlatObject(input.rollback);
  const evidence = normalizeFlatObject(input.evidence, 24);
  const reason = clipText(input.reason || "", 400);
  const risk = scoreEdgeRisk({
    action,
    category: "action_manifest",
    tool: context.tool || action,
    status,
    actor,
    target,
    policy,
    context
  });
  return {
    schemaVersion: "1.0",
    kind: "action_manifest",
    id: clipText(input.id || makeId("gman"), 80),
    createdAt,
    component,
    action,
    status,
    actor,
    target,
    reason,
    context,
    policy,
    rollback,
    evidence,
    risk
  };
}

function appendLine(filePath, payload) {
  ensureDir();
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

function appendGraphEvent(input = {}) {
  try {
    const payload = appendLine(graphRuntimeEventsPath, buildGraphEvent(input));
    graphRuntimeEmitter.emit("graph_event", payload);
    return payload;
  } catch (error) {
    console.warn("[graph-runtime] failed to append event:", error?.message || error);
    return null;
  }
}

function appendActionManifest(input = {}) {
  try {
    const payload = appendLine(graphRuntimeManifestsPath, buildActionManifest(input));
    graphRuntimeEmitter.emit("action_manifest", payload);
    return payload;
  } catch (error) {
    console.warn("[graph-runtime] failed to append action manifest:", error?.message || error);
    return null;
  }
}


// RU11: drift_creates_language — immune system of the omnilanguage
// When 2+ sources confirm drift, create a new language entry at the drift point
function evaluateDriftCreation(observation, allObservations) {
  if (!observation || !observation.tags || !observation.tags.includes("drift")) return null;
  const driftId = observation.driftId || observation.id;
  const confirming = (allObservations || []).filter(o =>
    o.id !== observation.id && o.driftId === driftId && o.tags && o.tags.includes("drift")
  );
  if (confirming.length < 1) return null; // need 2+ sources (this + 1 more)
  return {
    rule: "RU11",
    action: "create_language_entry",
    driftId,
    sourceCount: confirming.length + 1,
    tuple: observation.tuple || {},
    reason: "drift_confirmed_by_" + (confirming.length + 1) + "_sources",
    createdAt: new Date().toISOString()
  };
}
module.exports = {
  evaluateDriftCreation,
  graphRuntimeEventsPath,
  graphRuntimeManifestsPath,
  graphRuntimeEmitter,
  buildGraphEvent,
  appendGraphEvent,
  buildActionManifest,
  appendActionManifest
};
