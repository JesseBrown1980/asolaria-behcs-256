const jobs = new Map();
const pending = [];

let running = 0;
const concurrency = Math.max(1, Number(process.env.ASOLARIA_CONCURRENCY || 2));

function newJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function copyPublic(job) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    payload: job.payload,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    elapsedMs: job.elapsedMs,
    result: job.result,
    error: job.error
  };
}

function stats() {
  return {
    queued: pending.length,
    running,
    total: jobs.size,
    concurrency
  };
}

function pruneOldJobs() {
  const maxJobs = 500;
  if (jobs.size <= maxJobs) {
    return;
  }

  const ordered = Array.from(jobs.values()).sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const removeCount = jobs.size - maxJobs;
  for (let index = 0; index < removeCount; index += 1) {
    jobs.delete(ordered[index].id);
  }
}

function onJobFinish() {
  running -= 1;
  processQueue();
}

async function runJob(job) {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  try {
    const result = await job.run();
    job.status = "completed";
    job.result = result;
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
    job.elapsedMs = new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime();
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
    job.elapsedMs = new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime();
  } finally {
    onJobFinish();
  }
}

function processQueue() {
  while (running < concurrency && pending.length > 0) {
    const job = pending.shift();
    running += 1;
    runJob(job);
  }
}

function enqueue(type, payload, runner) {
  if (typeof runner !== "function") {
    throw new Error("Runner must be a function.");
  }

  const now = new Date().toISOString();
  const job = {
    id: newJobId(),
    type,
    status: "queued",
    payload: payload || {},
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    elapsedMs: null,
    result: null,
    error: null,
    run: runner
  };

  jobs.set(job.id, job);
  pending.push(job);
  pruneOldJobs();
  processQueue();

  return copyPublic(job);
}

function getJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return null;
  }
  return copyPublic(job);
}

function listJobs(limit = 30) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 30));
  return Array.from(jobs.values())
    .sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, safeLimit)
    .map(copyPublic);
}

module.exports = {
  enqueue,
  getJob,
  listJobs,
  stats
};
