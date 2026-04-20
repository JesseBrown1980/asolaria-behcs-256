const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const { dataDir, resolveDataPath } = require("./runtimePaths");
const { getLocalComputeReadinessStatus } = require("./localComputeReadiness");
const { getTaskLease, updateTaskLease } = require("./taskLeaseLedgerStore");
const { updateTaskLedgerTask, addTaskLedgerEvent } = require("./taskLedgerStore");

const COMPUTE_ROOT = resolveDataPath("integrations", "shared-compute");
const JOB_ROOT = path.join(COMPUTE_ROOT, "jobs");
const CAPABILITY_ROOT = path.join(COMPUTE_ROOT, "capabilities");
const ALLOWED_EXECUTORS = Object.freeze({
  node: { command: "node" },
  python: { command: "python" },
  python3: { command: "python3" },
  npm: { command: "npm" },
  npx: { command: "npx" },
  pnpm: { command: "pnpm" },
  pytest: { command: "pytest" },
  jest: { command: "jest" },
  tsc: { command: "tsc" },
  rg: { command: "rg" },
  git: { command: "git" }
});

function cleanText(value, maxLen = 4000) {
  const text = String(value || "").replace(/\r/g, "").trim();
  return text.slice(0, maxLen);
}

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function ensureDir(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true });
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeWriteJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function toDataArtifactPath(artifactRef) {
  const ref = cleanText(artifactRef, 600);
  if (!ref) return "";
  if (path.isAbsolute(ref)) return ref;
  return path.join(dataDir, ref.replace(/\//g, path.sep));
}

function normalizeExecutor(value) {
  const normalized = cleanText(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  return ALLOWED_EXECUTORS[normalized] ? normalized : "";
}

function normalizeArgs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 800)).filter(Boolean).slice(0, 40);
}

function normalizeWorkingDirectory(value) {
  const target = cleanText(value, 1200);
  if (!target) return "";
  if (!path.isAbsolute(target)) {
    throw new Error("Shared compute workingDirectory must be an absolute path.");
  }
  return path.resolve(target);
}

function getFederatedNodeIdFromBaseTopic(baseTopic = "") {
  const scoped = cleanText(baseTopic, 240).match(/(?:^|\/)nodes\/([^/]+)$/i);
  if (scoped?.[1]) {
    return cleanText(scoped[1], 120).toLowerCase();
  }
  const readiness = getLocalComputeReadinessStatus();
  return cleanText(readiness?.node?.nodeId, 120).toLowerCase();
}

function buildComputeCapabilitiesPacket(baseTopic = "") {
  const readiness = getLocalComputeReadinessStatus();
  const nodeId = getFederatedNodeIdFromBaseTopic(baseTopic);
  if (!nodeId) return null;
  return {
    topic: `${cleanText(baseTopic, 240) || `asolaria/nodes/${nodeId}`}/compute/capabilities`,
    payload: {
      nodeId,
      ok: true,
      at: nowIso(),
      computeWorkerReady: Boolean(readiness?.advertisedContract?.computeWorkerReady),
      executors: Object.keys(ALLOWED_EXECUTORS),
      readiness: readiness?.advertisedContract || {},
      federationRouting: readiness?.federationRouting || {},
      workerSurface: readiness?.workerSurface || {}
    }
  };
}

function writeJobArtifact(nodeId, jobId, kind, payload) {
  const safeNodeId = cleanText(nodeId, 120).toLowerCase() || "unknown-node";
  const safeJobId = cleanText(jobId, 160) || "job";
  const filePath = path.join(JOB_ROOT, safeNodeId, safeJobId, `${kind}.json`);
  safeWriteJson(filePath, payload);
  return filePath;
}

function updateDispatchArtifactFromLease(leaseId, patch = {}) {
  const lease = getTaskLease(leaseId);
  const artifactPath = toDataArtifactPath(lease?.artifactRef || "");
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    return;
  }
  const current = safeReadJson(artifactPath, {}) || {};
  const next = {
    ...current,
    ...patch
  };
  if (lease?.leaseId) {
    next.leaseId = lease.leaseId;
  }
  next.leaseStatus = cleanText(patch.leaseStatus || lease?.status || current.leaseStatus, 80);
  next.lease = {
    ...(current.lease && typeof current.lease === "object" ? current.lease : {}),
    ...(lease && typeof lease === "object" ? {
      leaseId: cleanText(lease.leaseId, 80),
      taskId: cleanText(lease.taskId, 80),
      holderId: cleanText(lease.holderId, 120),
      holderType: cleanText(lease.holderType, 80),
      status: cleanText(lease.status, 80),
      acquiredAt: cleanText(lease.acquiredAt, 80),
      heartbeatAt: cleanText(lease.heartbeatAt, 80),
      expiresAt: cleanText(lease.expiresAt, 80),
      releasedAt: cleanText(lease.releasedAt, 80),
      dispatchId: cleanText(lease.dispatchId, 120),
      runId: cleanText(lease.runId, 120),
      artifactRef: cleanText(lease.artifactRef, 260)
    } : {})
  };
  safeWriteJson(artifactPath, next);
}

function recordFederatedComputeCapabilities(nodeId, payload, ingress = {}) {
  const targetNodeId = cleanText(nodeId, 120).toLowerCase();
  if (!targetNodeId) return null;
  const doc = {
    nodeId: targetNodeId,
    recordedAt: nowIso(),
    ingress: ingress && typeof ingress === "object" ? ingress : {},
    payload: payload && typeof payload === "object" ? payload : {}
  };
  const filePath = path.join(CAPABILITY_ROOT, `${targetNodeId}.json`);
  safeWriteJson(filePath, doc);
  return { filePath, doc };
}

function recordFederatedComputeResult(nodeId, payload, ingress = {}) {
  const targetNodeId = cleanText(nodeId, 120).toLowerCase() || "unknown-node";
  const jobId = cleanText(payload?.jobId, 160) || "job";
  const recordedAt = nowIso();
  const resultDoc = {
    recordedAt,
    nodeId: targetNodeId,
    ingress: ingress && typeof ingress === "object" ? ingress : {},
    payload: payload && typeof payload === "object" ? payload : {}
  };
  const filePath = writeJobArtifact(targetNodeId, jobId, "result", resultDoc);
  const taskId = cleanText(payload?.taskId, 80);
  const leaseId = cleanText(payload?.leaseId, 80);
  const ok = Boolean(payload?.ok);
  const currentLease = leaseId ? getTaskLease(leaseId) : null;
  const dispatchArtifactPath = toDataArtifactPath(currentLease?.artifactRef || "");

  if (leaseId) {
    updateTaskLease(leaseId, {
      status: ok ? "completed" : "failed",
      runId: jobId,
      artifactRef: path.relative(dataDir, filePath).replace(/\\/g, "/"),
      handoffReason: ok ? "" : cleanText(payload?.error || "remote_compute_failed", 240)
    }, {
      actor: "shared-compute",
      source: "shared-compute",
      type: ok ? "lease_completed" : "lease_failed",
      note: ok
        ? `Federated compute result received from ${targetNodeId}.`
        : `Federated compute failed on ${targetNodeId}: ${cleanText(payload?.error || "remote_compute_failed", 240)}`
    });
    if (dispatchArtifactPath && fs.existsSync(dispatchArtifactPath)) {
      const nextLease = getTaskLease(leaseId);
      const currentDispatch = safeReadJson(dispatchArtifactPath, {}) || {};
      safeWriteJson(dispatchArtifactPath, {
        ...currentDispatch,
        completedAt: ok ? recordedAt : "",
        failedAt: ok ? "" : recordedAt,
        result: payload?.result && typeof payload.result === "object" ? payload.result : {},
        error: ok ? "" : cleanText(payload?.error || "remote_compute_failed", 240),
        workerId: "shared_compute",
        dispatchMode: "federated_request",
        leaseId,
        leaseStatus: cleanText(nextLease?.status || currentDispatch.leaseStatus, 80),
        lease: nextLease && typeof nextLease === "object" ? {
          leaseId: cleanText(nextLease.leaseId, 80),
          taskId: cleanText(nextLease.taskId, 80),
          holderId: cleanText(nextLease.holderId, 120),
          holderType: cleanText(nextLease.holderType, 80),
          status: cleanText(nextLease.status, 80),
          acquiredAt: cleanText(nextLease.acquiredAt, 80),
          heartbeatAt: cleanText(nextLease.heartbeatAt, 80),
          expiresAt: cleanText(nextLease.expiresAt, 80),
          releasedAt: cleanText(nextLease.releasedAt, 80),
          dispatchId: cleanText(nextLease.dispatchId, 120),
          runId: cleanText(nextLease.runId, 120),
          artifactRef: cleanText(nextLease.artifactRef, 260)
        } : currentDispatch.lease
      });
    }
  }

  if (taskId) {
    addTaskLedgerEvent(taskId, {
      type: ok ? "worker_completed" : "worker_failed",
      actor: "shared-compute",
      source: "shared-compute",
      note: ok
        ? `Federated compute result received from ${targetNodeId}.`
        : `Federated compute failed on ${targetNodeId}: ${cleanText(payload?.error || "remote_compute_failed", 240)}`,
      detail: {
        workerId: "shared_compute",
        nodeId: targetNodeId,
        jobId,
        leaseId,
        resultPath: path.relative(dataDir, filePath).replace(/\\/g, "/")
      }
    });
    updateTaskLedgerTask(taskId, {
      status: ok ? "review" : "blocked",
      progress: ok ? 100 : 0,
      lastLeaseId: leaseId || "",
      completedAt: ok ? recordedAt : ""
    }, {
      actor: "shared-compute",
      source: "shared-compute",
      type: ok ? "task_review_ready" : "task_blocked",
      note: ok
        ? `Federated compute result ready for review from ${targetNodeId}.`
        : `Federated compute failed on ${targetNodeId}.`
    });
  }

  return { filePath, resultDoc };
}

async function runBoundedExecutor(spec = {}) {
  const executor = normalizeExecutor(spec.executor);
  if (!executor) {
    throw new Error("Shared compute executor is required and must be allowlisted.");
  }
  const args = normalizeArgs(spec.args);
  if (args.length < 1) {
    throw new Error("Shared compute args are required for bounded execution.");
  }
  const workingDirectory = spec.workingDirectory ? normalizeWorkingDirectory(spec.workingDirectory) : process.cwd();
  const timeoutMs = clampInt(spec.timeoutMs, 60000, 1000, 900000);
  const command = ALLOWED_EXECUTORS[executor].command;
  const startedAt = Date.now();

  return await new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, {
      cwd: workingDirectory,
      windowsHide: true,
      shell: false,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const completedAt = Date.now();
      resolve({
        ok: !timedOut && Number(code) === 0,
        executor,
        command,
        args,
        exitCode: Number.isInteger(code) ? code : null,
        signal: cleanText(signal, 80),
        timeoutMs,
        timedOut,
        workingDirectory,
        startedAt: new Date(startedAt).toISOString(),
        completedAt: new Date(completedAt).toISOString(),
        durationMs: completedAt - startedAt,
        stdout: cleanText(stdout, 12000),
        stderr: cleanText(stderr, 12000)
      });
    });
  });
}

async function executeFederatedComputeRequest(payload = {}, options = {}) {
  const readiness = getLocalComputeReadinessStatus();
  if (!readiness?.advertisedContract?.computeWorkerReady) {
    throw new Error("Shared compute worker is not ready on this node.");
  }
  const baseTopic = cleanText(options.baseTopic, 240) || `asolaria/nodes/${cleanText(readiness?.node?.nodeId, 120).toLowerCase()}`;
  const nodeId = getFederatedNodeIdFromBaseTopic(baseTopic);
  if (!nodeId) {
    throw new Error("Federated node id is unavailable.");
  }
  const jobId = cleanText(payload?.jobId, 160) || `job_${Date.now()}`;
  const spec = payload?.spec && typeof payload.spec === "object" ? payload.spec : {};
  writeJobArtifact(nodeId, jobId, "request", {
    recordedAt: nowIso(),
    nodeId,
    payload
  });

  try {
    const result = await runBoundedExecutor(spec);
    const replyPayload = {
      jobId,
      ok: Boolean(result.ok),
      at: nowIso(),
      taskId: cleanText(payload?.taskId, 80),
      leaseId: cleanText(payload?.leaseId, 80),
      dispatchId: cleanText(payload?.dispatchId, 120),
      requestedBy: cleanText(payload?.requestedBy, 120),
      request: {
        laneId: cleanText(spec.laneId, 80),
        title: cleanText(spec.title, 220),
        objective: cleanText(spec.objective, 1200),
        executor: result.executor
      },
      worker: {
        nodeId,
        computeWorkerReady: true
      },
      result
    };
    writeJobArtifact(nodeId, jobId, "local-result", replyPayload);
    return {
      topic: `${baseTopic}/compute/result`,
      payload: replyPayload
    };
  } catch (error) {
    const replyPayload = {
      jobId,
      ok: false,
      at: nowIso(),
      taskId: cleanText(payload?.taskId, 80),
      leaseId: cleanText(payload?.leaseId, 80),
      dispatchId: cleanText(payload?.dispatchId, 120),
      requestedBy: cleanText(payload?.requestedBy, 120),
      worker: {
        nodeId,
        computeWorkerReady: true
      },
      error: cleanText(error?.message || error, 240)
    };
    writeJobArtifact(nodeId, jobId, "local-result", replyPayload);
    return {
      topic: `${baseTopic}/compute/result`,
      payload: replyPayload
    };
  }
}

module.exports = {
  ALLOWED_EXECUTORS,
  getFederatedNodeIdFromBaseTopic,
  buildComputeCapabilitiesPacket,
  executeFederatedComputeRequest,
  recordFederatedComputeCapabilities,
  recordFederatedComputeResult
};
