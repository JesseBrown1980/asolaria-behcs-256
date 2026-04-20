"use strict";

const PHONE_MODE_VALUES = new Set(["phone_enabled", "phone_only", "no_phone"]);
const SUB_COLONY_CLASS_VALUES = new Set(["desktop_sub", "hybrid_sub", "phone_only_sub", "no_phone_sub"]);
const ROLE_VALUES = new Set(["head_colony", "sub_colony"]);
const CAPABILITY_KEYS = ["role", "headColony", "authorityMode", "languageVersion", "phoneMode", "phoneOrbital", "desktopAgents", "phoneAgents", "subColonyClass"];

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function normalizeToken(value) {
  return cleanText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function pickObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined;
}

function pickDeclared(source, nested, key) {
  if (hasOwn(source, key)) return source[key];
  if (hasOwn(nested, key)) return nested[key];
  return undefined;
}

function asBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const token = normalizeToken(value);
  if (["1", "true", "yes", "on", "enabled"].includes(token)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(token)) return false;
  return Boolean(value);
}

function normalizeRole(value, fallback = "sub_colony") {
  const token = normalizeToken(value);
  if (!token) return fallback;
  if (["head", "head_colony", "head_node", "main", "sovereign"].includes(token)) return "head_colony";
  if (["sub", "sub_colony", "worker", "satellite"].includes(token)) return "sub_colony";
  return ROLE_VALUES.has(token) ? token : fallback;
}

function normalizePhoneMode(value) {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["phone", "phone_enabled", "hybrid", "with_phone"].includes(token)) return "phone_enabled";
  if (["phone_only", "phoneonly"].includes(token)) return "phone_only";
  if (["no_phone", "nophone", "desktop_only", "desktop"].includes(token)) return "no_phone";
  return PHONE_MODE_VALUES.has(token) ? token : "";
}

function normalizeSubColonyClass(value) {
  const token = normalizeToken(value);
  if (!token) return "";
  if (["desktop_sub", "desktop"].includes(token)) return "desktop_sub";
  if (["hybrid_sub", "hybrid"].includes(token)) return "hybrid_sub";
  if (["phone_only_sub", "phone_only", "phoneonly_sub"].includes(token)) return "phone_only_sub";
  if (["no_phone_sub", "no_phone", "nophone_sub"].includes(token)) return "no_phone_sub";
  return SUB_COLONY_CLASS_VALUES.has(token) ? token : "";
}

function inferSubColonyClass(phoneMode, desktopAgents, phoneOrbital) {
  if (phoneMode === "phone_only" || (!desktopAgents && phoneOrbital)) return "phone_only_sub";
  if (phoneMode === "phone_enabled" && desktopAgents && phoneOrbital) return "hybrid_sub";
  if (phoneMode === "no_phone") return desktopAgents ? "desktop_sub" : "no_phone_sub";
  return desktopAgents ? "desktop_sub" : "no_phone_sub";
}

function buildDeclaredFlag(source, nested) {
  return CAPABILITY_KEYS.some((key) => hasOwn(source, key) || hasOwn(nested, key));
}

function normalizeColonyCapabilities(input = {}, options = {}) {
  const source = pickObject(input);
  const nested = pickObject(source.capabilities);
  const nodeId = cleanText(options.nodeId || source.nodeId || source.id, 80);
  const issues = [];
  const declared = buildDeclaredFlag(source, nested);
  const rawRole = pickDeclared(source, nested, "role");
  const role = normalizeRole(rawRole || options.defaultRole, options.defaultRole || "sub_colony");
  const authorityMode = cleanText(pickDeclared(source, nested, "authorityMode") || options.defaultAuthorityMode || "task_lease_bound", 80);
  const languageVersion = cleanText(pickDeclared(source, nested, "languageVersion") || options.defaultLanguageVersion || "starting-language-v1", 80);
  let headColony = cleanText(pickDeclared(source, nested, "headColony") || options.defaultHeadColony || "", 80);
  let phoneMode = normalizePhoneMode(pickDeclared(source, nested, "phoneMode"));
  let phoneOrbital = asBool(pickDeclared(source, nested, "phoneOrbital"), false);
  let desktopAgents = asBool(pickDeclared(source, nested, "desktopAgents"), role === "head_colony");
  let phoneAgents = asBool(pickDeclared(source, nested, "phoneAgents"), false);
  const explicitClass = normalizeSubColonyClass(pickDeclared(source, nested, "subColonyClass"));

  if (!phoneMode) {
    if (explicitClass === "phone_only_sub") phoneMode = "phone_only";
    else if (explicitClass === "hybrid_sub") phoneMode = "phone_enabled";
    else if (explicitClass === "desktop_sub" || explicitClass === "no_phone_sub") phoneMode = "no_phone";
    else if (phoneAgents || phoneOrbital) phoneMode = desktopAgents ? "phone_enabled" : "phone_only";
    else phoneMode = "no_phone";
  }

  if (!desktopAgents && role === "head_colony") {
    desktopAgents = true;
    issues.push("head_colony_requires_desktop_agents");
  }
  if (role === "head_colony" && phoneMode === "phone_only") {
    phoneMode = phoneOrbital || phoneAgents ? "phone_enabled" : "no_phone";
    issues.push("head_colony_cannot_be_phone_only");
  }
  if (role === "head_colony" && !headColony) {
    headColony = nodeId || "self";
  }

  if (phoneMode === "phone_only") {
    if (desktopAgents) issues.push("phone_only_disables_desktop_agents");
    if (!phoneOrbital) issues.push("phone_only_requires_phone_orbital");
    desktopAgents = false;
    phoneOrbital = true;
    phoneAgents = true;
  } else if (phoneMode === "phone_enabled") {
    if (!desktopAgents) issues.push("phone_enabled_without_desktop_agents");
    if (!phoneOrbital && phoneAgents) {
      phoneOrbital = true;
      issues.push("phone_agents_require_phone_orbital");
    }
    if (!phoneOrbital) phoneOrbital = true;
    if (!phoneAgents) phoneAgents = phoneOrbital;
    if (!desktopAgents && role !== "head_colony") {
      phoneMode = "phone_only";
      issues.push("phone_enabled_normalized_to_phone_only");
      phoneAgents = true;
    }
  } else {
    if (phoneOrbital) issues.push("no_phone_disables_phone_orbital");
    if (phoneAgents) issues.push("no_phone_disables_phone_agents");
    phoneMode = "no_phone";
    phoneOrbital = false;
    phoneAgents = false;
    if (!desktopAgents) desktopAgents = role === "head_colony" || !declared;
  }

  const derivedClass = role === "head_colony" ? "" : inferSubColonyClass(phoneMode, desktopAgents, phoneOrbital);
  if (explicitClass && explicitClass !== derivedClass) {
    issues.push("sub_colony_class_normalized");
  }

  return {
    nodeId,
    role,
    headColony,
    authorityMode,
    languageVersion,
    phoneMode,
    phoneOrbital,
    desktopAgents,
    phoneAgents,
    subColonyClass: derivedClass,
    declared,
    source: declared ? "declared" : "inferred",
    issues,
    supports: {
      desktopLanes: desktopAgents,
      phoneLanes: phoneAgents,
      phoneOrbital
    }
  };
}

function summarizeRemoteNodeCapabilities(nodes = []) {
  const summary = {
    total: 0,
    declared: 0,
    roles: { head_colony: 0, sub_colony: 0 },
    phoneModes: { phone_enabled: 0, phone_only: 0, no_phone: 0 },
    subColonyClasses: { desktop_sub: 0, hybrid_sub: 0, phone_only_sub: 0, no_phone_sub: 0 }
  };
  for (const row of Array.isArray(nodes) ? nodes : []) {
    const capabilities = pickObject(row?.capabilities);
    if (!row || !capabilities.role) continue;
    summary.total += 1;
    if (capabilities.declared) summary.declared += 1;
    if (summary.roles[capabilities.role] !== undefined) summary.roles[capabilities.role] += 1;
    if (summary.phoneModes[capabilities.phoneMode] !== undefined) summary.phoneModes[capabilities.phoneMode] += 1;
    if (summary.subColonyClasses[capabilities.subColonyClass] !== undefined) {
      summary.subColonyClasses[capabilities.subColonyClass] += 1;
    }
  }
  return summary;
}

module.exports = {
  normalizeColonyCapabilities,
  summarizeRemoteNodeCapabilities
};
