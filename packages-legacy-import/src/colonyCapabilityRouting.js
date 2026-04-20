"use strict";

const { normalizeColonyCapabilities } = require("./colonyCapabilitySchema");

const TRANSPORT_LANES = Object.freeze(["bus-mqtt"]);
const DESKTOP_LANES = Object.freeze(["idx-search", "mem-brief", "tst-verify", "ops-run", "node-share"]);
const PHONE_LANES = Object.freeze(["ph-capture", "ph-action", "ph-comms"]);

function cleanText(value, max = 80) {
  return String(value || "").trim().slice(0, max);
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const token = cleanText(value, 40).toLowerCase();
  if (["true", "1", "yes", "on", "ready", "online"].includes(token)) return true;
  if (["false", "0", "no", "off", "offline"].includes(token)) return false;
  return fallback;
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function pickBool(source = {}, keys = [], fallback = false) {
  const object = source && typeof source === "object" ? source : {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      return asBool(object[key], fallback);
    }
  }
  return fallback;
}

function buildColonyLaneRouting(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const capabilities = normalizeColonyCapabilities(source.capabilities || source.colony || source, {
    nodeId: options.nodeId || source.nodeId || source.id,
    defaultRole: options.defaultRole || source.role || "sub_colony"
  });
  const online = cleanText(source.status || options.status || "offline", 40).toLowerCase() === "online";
  const computeWorkerReady = pickBool(source, ["computeWorkerReady"], false)
    || pickBool(source.readiness, ["computeWorkerReady"], false);
  const phoneOrbitalReady = pickBool(source, ["phoneOrbitalReady", "phoneReady"], false)
    || pickBool(source.readiness, ["phoneOrbitalReady", "phoneReady"], false);
  const reasons = [];
  const transportLaneIds = online ? TRANSPORT_LANES.slice() : [];
  let declaredLaneIds = [];
  let readyLaneIds = [];

  if (!online) reasons.push("node_offline");
  if (capabilities.role === "head_colony") {
    reasons.push("head_colony_not_dispatch_target");
  } else if (!capabilities.declared) {
    reasons.push("capabilities_not_declared");
  } else {
    if (capabilities.desktopAgents) {
      declaredLaneIds = declaredLaneIds.concat(DESKTOP_LANES);
      if (computeWorkerReady) {
        readyLaneIds = readyLaneIds.concat(DESKTOP_LANES);
      } else {
        reasons.push("compute_worker_not_ready");
      }
    }
    if (capabilities.phoneMode === "phone_enabled" || capabilities.phoneMode === "phone_only" || capabilities.phoneOrbital || capabilities.phoneAgents) {
      declaredLaneIds = declaredLaneIds.concat(PHONE_LANES);
      if (phoneOrbitalReady) {
        readyLaneIds = readyLaneIds.concat(PHONE_LANES);
      } else {
        reasons.push("phone_orbital_not_ready");
      }
    }
    if (capabilities.issues.length > 0) {
      reasons.push("capability_conflicts_present");
    }
  }

  declaredLaneIds = unique(declaredLaneIds);
  readyLaneIds = unique(readyLaneIds);
  if (capabilities.declared && capabilities.role !== "head_colony" && declaredLaneIds.length < 1) {
    reasons.push("no_dispatchable_lanes_declared");
  }

  return {
    schemaVersion: "1.0",
    sourceContract: "colony-capability-routing",
    role: capabilities.role,
    phoneMode: capabilities.phoneMode,
    declared: capabilities.declared,
    source: capabilities.source,
    transportLaneIds,
    declaredLaneIds,
    readyLaneIds,
    blockedLaneIds: declaredLaneIds.filter((laneId) => !readyLaneIds.includes(laneId)),
    dispatchReady: readyLaneIds.length > 0,
    readiness: {
      online,
      computeWorkerReady,
      phoneOrbitalReady
    },
    constraints: {
      headColony: capabilities.headColony,
      authorityMode: capabilities.authorityMode,
      languageVersion: capabilities.languageVersion,
      writePolicy: "bounded_sub_colony_only"
    },
    reasons: unique(reasons)
  };
}

module.exports = {
  buildColonyLaneRouting
};
