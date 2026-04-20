"use strict";

const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");
const { normalizeColonyId } = require("./gpuRuntime");
const { getGpuLanePolicy } = require("./gpuLanePolicy");

const LEDGER_VERSION = 1;
const ACTIVE_STATUSES = new Set(["queued", "active"]);

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function makeId(prefix, colonyId) {
  return `${prefix}_${normalizeColonyId(colonyId)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createGpuLeaseStore(deps = {}) {
  const ledgerPath = path.resolve(String(deps.ledgerPath || resolveDataPath("gpu-lease-ledger.json")));
  const readRuntimeStatus = typeof deps.getGpuRuntimeStatus === "function" ? deps.getGpuRuntimeStatus : () => ({ devices: [] });
  const resolvePolicy = typeof deps.getGpuLanePolicy === "function" ? deps.getGpuLanePolicy : getGpuLanePolicy;
  const env = deps.env || process.env;
  let cache = null;

  function ensureDir() {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  }

  function createInitialDoc() {
    const now = new Date().toISOString();
    return {
      version: LEDGER_VERSION,
      createdAt: now,
      updatedAt: now,
      leases: [],
      events: []
    };
  }

  function normalizeLease(raw = {}, nowIso = new Date().toISOString()) {
    const acquiredAt = toIsoDate(raw.acquiredAt, nowIso);
    const expiresAt = toIsoDate(raw.expiresAt, "");
    return {
      leaseId: cleanText(raw.leaseId || raw.id || "").slice(0, 120) || makeId("gpulease", raw.colonyId || env.ASOLARIA_NODE_ID || "sovereign"),
      colonyId: normalizeColonyId(raw.colonyId || env.ASOLARIA_NODE_ID || "sovereign"),
      licenseId: cleanText(raw.licenseId || "").slice(0, 120),
      holderId: cleanText(raw.holderId || "").slice(0, 120),
      holderType: cleanText(raw.holderType || "agent").slice(0, 40) || "agent",
      laneId: cleanText(raw.laneId || "").slice(0, 80),
      policyKey: cleanText(raw.policyKey || "").slice(0, 80),
      status: cleanText(raw.status || "active").toLowerCase() || "active",
      deviceId: cleanText(raw.deviceId || "").slice(0, 40),
      deviceUuid: cleanText(raw.deviceUuid || "").slice(0, 120),
      requestedMemoryMb: clampInt(raw.requestedMemoryMb, 0, 0, 1024 * 1024),
      grantedMemoryMb: clampInt(raw.grantedMemoryMb, 0, 0, 1024 * 1024),
      purpose: cleanText(raw.purpose || "").slice(0, 600),
      controllerPid: clampInt(raw.controllerPid, process.pid, 1, 2147483647),
      acquiredAt,
      expiresAt,
      releasedAt: toIsoDate(raw.releasedAt, ""),
      releasedBy: cleanText(raw.releasedBy || "").slice(0, 120),
      note: cleanText(raw.note || "").slice(0, 1200)
    };
  }

  function normalizeEvent(raw = {}, nowIso = new Date().toISOString()) {
    return {
      id: cleanText(raw.id || "").slice(0, 120) || makeId("gpulevt", raw.colonyId || env.ASOLARIA_NODE_ID || "sovereign"),
      leaseId: cleanText(raw.leaseId || "").slice(0, 120),
      type: cleanText(raw.type || "gpu_lease_event").toLowerCase().slice(0, 80) || "gpu_lease_event",
      actor: cleanText(raw.actor || "system").slice(0, 120) || "system",
      source: cleanText(raw.source || "gpu-ledger").slice(0, 80) || "gpu-ledger",
      colonyId: normalizeColonyId(raw.colonyId || env.ASOLARIA_NODE_ID || "sovereign"),
      at: toIsoDate(raw.at, nowIso),
      detail: raw.detail && typeof raw.detail === "object" ? raw.detail : {},
      note: cleanText(raw.note || "").slice(0, 1200)
    };
  }

  function normalizeDoc(parsed) {
    const now = new Date().toISOString();
    const source = parsed && typeof parsed === "object" ? parsed : {};
    return {
      version: LEDGER_VERSION,
      createdAt: toIsoDate(source.createdAt, now),
      updatedAt: toIsoDate(source.updatedAt, now),
      leases: (Array.isArray(source.leases) ? source.leases : []).map((row) => normalizeLease(row, now)),
      events: (Array.isArray(source.events) ? source.events : []).map((row) => normalizeEvent(row, now))
    };
  }

  function writeDoc(doc) {
    ensureDir();
    const normalized = normalizeDoc(doc);
    normalized.updatedAt = new Date().toISOString();
    const tempPath = `${ledgerPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
    fs.renameSync(tempPath, ledgerPath);
    cache = normalized;
    return normalized;
  }

  function loadDoc() {
    if (cache) return cache;
    ensureDir();
    if (!fs.existsSync(ledgerPath)) {
      cache = createInitialDoc();
      writeDoc(cache);
      return cache;
    }
    try {
      cache = normalizeDoc(JSON.parse(fs.readFileSync(ledgerPath, "utf8")));
      return cache;
    } catch {
      cache = createInitialDoc();
      writeDoc(cache);
      return cache;
    }
  }

  function appendEvent(doc, input = {}) {
    const event = normalizeEvent(input, new Date().toISOString());
    doc.events.push(event);
    if (doc.events.length > 8000) {
      doc.events = doc.events.slice(-8000);
    }
    doc.updatedAt = event.at;
    return event;
  }

  function summarizeDoc(doc) {
    const leases = Array.isArray(doc.leases) ? doc.leases : [];
    const activeLeases = leases.filter((lease) => ACTIVE_STATUSES.has(String(lease.status || "").toLowerCase()));
    return {
      totalLeases: leases.length,
      activeLeases: activeLeases.length,
      releasedLeases: leases.filter((lease) => lease.status === "released").length,
      expiredLeases: leases.filter((lease) => lease.status === "expired").length
    };
  }

  function listGpuLeases(options = {}) {
    const doc = loadDoc();
    const limit = clampInt(options.limit, 100, 1, 2000);
    const status = cleanText(options.status || "all").toLowerCase();
    const colonyId = cleanText(options.colonyId || "").toLowerCase();
    return doc.leases
      .filter((lease) => (status === "all" || lease.status === status) && (!colonyId || lease.colonyId === colonyId))
      .sort((a, b) => Date.parse(b.acquiredAt || 0) - Date.parse(a.acquiredAt || 0))
      .slice(0, limit)
      .map((lease) => JSON.parse(JSON.stringify(lease)));
  }

  function getGpuLease(leaseId) {
    const id = cleanText(leaseId);
    if (!id) return null;
    const lease = loadDoc().leases.find((row) => row.leaseId === id);
    return lease ? JSON.parse(JSON.stringify(lease)) : null;
  }

  function getGpuLeaseLedgerState(options = {}) {
    const doc = loadDoc();
    return {
      ledgerPath,
      summary: summarizeDoc(doc),
      leases: listGpuLeases({ limit: options.leaseLimit || 100, status: options.status || "all" }),
      events: doc.events.slice(-clampInt(options.eventLimit, 100, 1, 2000)).map((event) => JSON.parse(JSON.stringify(event)))
    };
  }

  function expireGpuLeases(options = {}) {
    const doc = loadDoc();
    const nowIso = toIsoDate(options.now, new Date().toISOString());
    const nowMs = Date.parse(nowIso);
    const expired = [];
    for (const lease of doc.leases) {
      if (!ACTIVE_STATUSES.has(lease.status)) continue;
      if (!lease.expiresAt) continue;
      if (Date.parse(lease.expiresAt) > nowMs) continue;
      lease.status = "expired";
      lease.releasedAt = nowIso;
      lease.releasedBy = cleanText(options.actor || "system") || "system";
      expired.push(lease.leaseId);
      appendEvent(doc, {
        leaseId: lease.leaseId,
        type: "gpu_lease_expired",
        actor: lease.releasedBy,
        source: cleanText(options.source || "gpu-ledger") || "gpu-ledger",
        colonyId: lease.colonyId,
        note: `Expired GPU lease ${lease.leaseId}.`,
        detail: {
          laneId: lease.laneId,
          deviceId: lease.deviceId
        }
      });
    }
    if (expired.length) {
      writeDoc(doc);
    }
    return { ok: true, expiredLeaseIds: expired, summary: summarizeDoc(doc) };
  }

  function pickDevice(runtimeStatus, doc, policy, input, requestedMemoryMb) {
    const devices = Array.isArray(runtimeStatus?.devices) ? runtimeStatus.devices : [];
    const deviceFilterId = cleanText(input.deviceId || "");
    const deviceFilterUuid = cleanText(input.deviceUuid || "");
    const activeLeases = doc.leases.filter((lease) => ACTIVE_STATUSES.has(lease.status));
    const candidates = devices
      .filter((device) => !deviceFilterId || String(device.index) === deviceFilterId)
      .filter((device) => !deviceFilterUuid || device.uuid === deviceFilterUuid)
      .map((device) => {
        const deviceLeases = activeLeases.filter((lease) => lease.deviceUuid === device.uuid || lease.deviceId === String(device.index));
        const hasExclusiveLease = deviceLeases.some((lease) => String(lease.policyKey || "").includes(".exclusive"));
        return {
          device,
          activeLeaseCount: deviceLeases.length,
          hasExclusiveLease
        };
      })
      .filter((entry) => {
        if (policy.access === "exclusive") return entry.activeLeaseCount === 0;
        if (entry.hasExclusiveLease) return false;
        return true;
      })
      .filter((entry) => Number(entry.device.memoryFreeMb || 0) >= requestedMemoryMb)
      .sort((a, b) => Number(b.device.memoryFreeMb || 0) - Number(a.device.memoryFreeMb || 0));
    return candidates[0] || null;
  }

  function createError(message, code, status = 400) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
  }

  function acquireGpuLease(input = {}, options = {}) {
    expireGpuLeases({ source: "gpu-ledger", actor: "system" });
    const doc = loadDoc();
    const laneId = cleanText(input.laneId || "").toLowerCase();
    const holderId = cleanText(input.holderId || "");
    if (!laneId) throw createError("Lane id is required.", "gpu_lane_required", 400);
    if (!holderId) throw createError("Holder id is required.", "gpu_holder_required", 400);
    const policy = resolvePolicy(laneId);
    if (!policy.allowAcquire) throw createError("Lane is not allowed to acquire GPU.", "gpu_lane_blocked", 403);

    const colonyId = normalizeColonyId(input.colonyId || env.ASOLARIA_NODE_ID || "sovereign");
    const licenseId = cleanText(input.licenseId || "");
    if (policy.requiresLicense && !licenseId) {
      throw createError("License id is required for GPU acquisition on this lane.", "gpu_license_required", 400);
    }

    const requestedMemoryMb = clampInt(
      input.requestedMemoryMb,
      Math.min(1024, Math.max(1024, policy.maxMemoryMb || 1024)),
      128,
      1024 * 1024
    );
    if (requestedMemoryMb > policy.maxMemoryMb) {
      throw createError(`Requested GPU memory exceeds lane cap (${policy.maxMemoryMb} MB).`, "gpu_memory_cap_exceeded", 400);
    }

    const runtimeStatus = options.runtimeStatus || readRuntimeStatus();
    if (!runtimeStatus?.detected || !Array.isArray(runtimeStatus.devices) || runtimeStatus.devices.length === 0) {
      throw createError("No GPU device is available for lease.", "gpu_device_unavailable", 409);
    }

    const chosen = pickDevice(runtimeStatus, doc, policy, input, requestedMemoryMb);
    if (!chosen) {
      throw createError("No GPU device satisfies the requested lease.", "gpu_no_capacity", 409);
    }

    const nowIso = new Date().toISOString();
    const leaseSeconds = clampInt(input.leaseSeconds, policy.maxLeaseSeconds, 30, Math.max(30, policy.maxLeaseSeconds || 30));
    const lease = normalizeLease({
      leaseId: makeId("gpulease", colonyId),
      colonyId,
      licenseId,
      holderId,
      holderType: input.holderType || "agent",
      laneId,
      policyKey: policy.policyKey,
      status: "active",
      deviceId: String(chosen.device.index),
      deviceUuid: chosen.device.uuid,
      requestedMemoryMb,
      grantedMemoryMb: requestedMemoryMb,
      purpose: input.purpose,
      controllerPid: process.pid,
      acquiredAt: nowIso,
      expiresAt: new Date(Date.parse(nowIso) + (leaseSeconds * 1000)).toISOString(),
      note: input.note
    }, nowIso);
    doc.leases.push(lease);
    appendEvent(doc, {
      leaseId: lease.leaseId,
      type: "gpu_lease_acquired",
      actor: cleanText(options.actor || holderId) || holderId,
      source: cleanText(options.source || "gpu-surface") || "gpu-surface",
      colonyId,
      note: `Acquired GPU lease ${lease.leaseId}.`,
      detail: {
        laneId,
        deviceId: lease.deviceId,
        deviceUuid: lease.deviceUuid,
        requestedMemoryMb,
        grantedMemoryMb: lease.grantedMemoryMb,
        licenseId
      }
    });
    writeDoc(doc);
    return {
      ok: true,
      lease: JSON.parse(JSON.stringify(lease)),
      policy,
      summary: summarizeDoc(doc)
    };
  }

  function releaseGpuLease(leaseId, patch = {}, options = {}) {
    const id = cleanText(leaseId || patch.leaseId || "");
    if (!id) throw createError("Lease id is required.", "gpu_lease_required", 400);
    const doc = loadDoc();
    const lease = doc.leases.find((row) => row.leaseId === id);
    if (!lease) throw createError("GPU lease not found.", "gpu_lease_not_found", 404);
    if (!ACTIVE_STATUSES.has(lease.status)) {
      return {
        ok: true,
        lease: JSON.parse(JSON.stringify(lease)),
        summary: summarizeDoc(doc)
      };
    }
    const nowIso = new Date().toISOString();
    lease.status = "released";
    lease.releasedAt = nowIso;
    lease.releasedBy = cleanText(patch.releasedBy || options.actor || "system") || "system";
    lease.note = cleanText(patch.note || lease.note).slice(0, 1200);
    appendEvent(doc, {
      leaseId: lease.leaseId,
      type: "gpu_lease_released",
      actor: lease.releasedBy,
      source: cleanText(options.source || "gpu-surface") || "gpu-surface",
      colonyId: lease.colonyId,
      note: `Released GPU lease ${lease.leaseId}.`,
      detail: {
        laneId: lease.laneId,
        deviceId: lease.deviceId
      }
    });
    writeDoc(doc);
    return {
      ok: true,
      lease: JSON.parse(JSON.stringify(lease)),
      summary: summarizeDoc(doc)
    };
  }

  return {
    acquireGpuLease,
    expireGpuLeases,
    getGpuLease,
    getGpuLeaseLedgerState,
    ledgerPath,
    listGpuLeases,
    releaseGpuLease
  };
}


// Governor law: gpu_cpu_watchers_may_pause_redeploy
function shouldPauseRedeploy(gpuStatus, cpuThreshold) {
  const threshold = Number(cpuThreshold) || 80;
  const gpuHigh = (gpuStatus?.summary?.usedMemoryMb || 0) / Math.max(1, gpuStatus?.summary?.totalMemoryMb || 1) > 0.9;
  // CPU check via process.cpuUsage is approximate
  const result = { pause: gpuHigh, reason: gpuHigh ? "gpu_memory_above_90_percent" : "resources_available" };
  return result;
}
module.exports = {
  shouldPauseRedeploy,
  createGpuLeaseStore
};
