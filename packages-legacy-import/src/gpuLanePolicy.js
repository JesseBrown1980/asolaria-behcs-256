"use strict";

const { getLaneDefinition, listLaneDefinitions } = require("./laneRegistry");

const DEFAULT_POLICY = Object.freeze({
  policyKey: "gpu.none",
  access: "none",
  allowAcquire: false,
  requiresLicense: false,
  maxMemoryMb: 0,
  maxLeaseSeconds: 0,
  colonyPortable: true
});

const POLICY_PRESETS = Object.freeze({
  "src-build": Object.freeze({
    policyKey: "gpu.shared.build",
    access: "shared",
    allowAcquire: true,
    requiresLicense: true,
    maxMemoryMb: 6144,
    maxLeaseSeconds: 3600
  }),
  "tst-verify": Object.freeze({
    policyKey: "gpu.shared.verify",
    access: "shared",
    allowAcquire: true,
    requiresLicense: true,
    maxMemoryMb: 4096,
    maxLeaseSeconds: 1800
  }),
  "ops-run": Object.freeze({
    policyKey: "gpu.shared.ops",
    access: "shared",
    allowAcquire: true,
    requiresLicense: true,
    maxMemoryMb: 4096,
    maxLeaseSeconds: 1800
  }),
  "desk-io": Object.freeze({
    policyKey: "gpu.shared.desktop_io",
    access: "shared",
    allowAcquire: true,
    requiresLicense: true,
    maxMemoryMb: 4096,
    maxLeaseSeconds: 1800
  }),
  "ph-capture": Object.freeze({
    policyKey: "gpu.shared.phone_capture",
    access: "shared",
    allowAcquire: true,
    requiresLicense: true,
    maxMemoryMb: 3072,
    maxLeaseSeconds: 1200
  })
});

function buildPolicy(laneId) {
  const lane = getLaneDefinition(laneId);
  const preset = lane ? (POLICY_PRESETS[lane.id] || DEFAULT_POLICY) : DEFAULT_POLICY;
  return {
    laneId: lane?.id || String(laneId || "").trim().toLowerCase(),
    laneCode: lane?.code || "",
    laneLabel: lane?.label || "",
    family: lane?.family || "",
    policyKey: preset.policyKey,
    access: preset.access,
    allowAcquire: Boolean(preset.allowAcquire),
    requiresLicense: Boolean(preset.requiresLicense),
    maxMemoryMb: Number(preset.maxMemoryMb || 0),
    maxLeaseSeconds: Number(preset.maxLeaseSeconds || 0),
    colonyPortable: true,
    governanceModel: "license_backed_lease"
  };
}

function getGpuLanePolicy(laneId) {
  return buildPolicy(laneId);
}

function listGpuLanePolicies() {
  return listLaneDefinitions()
    .map((lane) => buildPolicy(lane.id))
    .filter((policy) => policy.laneId);
}

module.exports = {
  DEFAULT_POLICY,
  POLICY_PRESETS,
  getGpuLanePolicy,
  listGpuLanePolicies
};
