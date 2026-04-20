/**
 * Jobs Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const { respondError } = require("../lib/helpers");
const { listJobs, getJob, stats } = require("../src/jobQueue");

router.get("/", (req, res) => {
  const limit = Number(req.query?.limit || 30);
  res.json({ ok: true, queue: stats(), jobs: listJobs(limit) });
});

router.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return respondError(res, "Job not found.", 404);
  res.json({ ok: true, job });
});

module.exports = router;
