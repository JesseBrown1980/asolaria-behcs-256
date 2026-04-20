/**
 * Omnispindle Routes — extracted from server.js (ADR-0001 strangler-fig)
 *
 * Routes:
 *   GET  /status                    — get omnispindle status
 *   POST /start                     — start all or specific lanes
 *   POST /stop                      — stop all lanes
 *   POST /agent/:laneId/start       — start specific lane
 *   POST /agent/:laneId/stop        — stop specific lane
 *   POST /agent/:laneId/prompt      — send prompt to lane
 *   POST /broadcast                 — broadcast to all lanes
 */

const express = require("express");
const router = express.Router();

const { getOmnispindle, LANE_DEFINITIONS } = require("../../src/omnispindle");

const VALID_LANE_IDS = Object.keys(LANE_DEFINITIONS);

function buildIssuedControllerPreview(req, issueControllerId) {
  return VALID_LANE_IDS.map((laneId) => {
    const issuedControllerId = typeof issueControllerId === "function"
      ? String(issueControllerId({
          laneId,
          laneDefinition: LANE_DEFINITIONS[laneId] || null,
          request: req,
          body: {}
        }) || "").trim()
      : "";
    return {
      laneId,
      issuedControllerId,
      activationAvailable: Boolean(issuedControllerId)
    };
  });
}

function createOmnispindleRouter({ resolveToolPaths, respondError, serverDir, issueControllerId, getControllerIssuanceStatus }) {

  router.get("/status", (req, res) => {
    try {
      const omnispindle = getOmnispindle({
        executable: resolveToolPaths().claudePath || "claude",
        workingDir: serverDir
      });
      const issuanceStatus = typeof getControllerIssuanceStatus === "function"
        ? getControllerIssuanceStatus()
        : null;
      return res.json({
        ok: true,
        ...omnispindle.getStatus(),
        activationAuthority: issuanceStatus,
        issuedControllers: buildIssuedControllerPreview(req, issueControllerId)
      });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  router.post("/start", (req, res) => {
    try {
      const lanes = req.body?.lanes || null;
      const model = String(req.body?.model || "").trim();
      const maxBudgetUsd = Number(req.body?.maxBudgetUsd) || 0;
      const omnispindle = getOmnispindle({
        executable: resolveToolPaths().claudePath || "claude",
        workingDir: serverDir,
        model,
        maxBudgetUsd
      });
      if (model) omnispindle.model = model;
      if (maxBudgetUsd > 0) omnispindle.maxBudgetUsd = maxBudgetUsd;
      const validLanes = Array.isArray(lanes)
        ? lanes.filter((id) => VALID_LANE_IDS.includes(String(id || "").trim().toLowerCase()))
        : null;
      const result = omnispindle.startAll(validLanes && validLanes.length > 0 ? validLanes : null);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  router.post("/stop", (_req, res) => {
    try {
      const omnispindle = getOmnispindle();
      const result = omnispindle.stopAll();
      return res.json({ ok: true, ...result });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  router.post("/agent/:laneId/start", (req, res) => {
    try {
      const laneId = String(req.params.laneId || "").trim().toLowerCase();
      if (!VALID_LANE_IDS.includes(laneId)) {
        return respondError(res, `Unknown lane: ${laneId}`, 400);
      }
      const issuedControllerId = typeof issueControllerId === "function"
        ? String(issueControllerId({
            laneId,
            laneDefinition: LANE_DEFINITIONS[laneId] || null,
            request: req,
            body: req.body || {}
          }) || "").trim()
        : "";
      const omnispindle = getOmnispindle({
        executable: resolveToolPaths().claudePath || "claude",
        workingDir: serverDir
      });
      const result = omnispindle.startAgent(laneId, {
        activateOwnedTask: Boolean(req.body?.activateOwnedTask),
        controllerId: issuedControllerId,
        mission: req.body?.mission,
        extraContext: req.body?.extraContext,
        includeBody: Boolean(req.body?.includeBody),
        widenMarkdown: Boolean(req.body?.widenMarkdown),
        extraIxTypes: Array.isArray(req.body?.extraIxTypes) ? req.body.extraIxTypes : undefined
      });
      return res.json({ ok: true, laneId, ...result });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  router.post("/agent/:laneId/stop", (req, res) => {
    try {
      const laneId = String(req.params.laneId || "").trim().toLowerCase();
      const omnispindle = getOmnispindle();
      const result = omnispindle.stopAgent(laneId);
      return res.json({ ok: true, laneId, ...result });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  router.post("/agent/:laneId/prompt", (req, res) => {
    try {
      const laneId = String(req.params.laneId || "").trim().toLowerCase();
      const text = String(req.body?.text || req.body?.prompt || "").trim();
      if (!text) {
        return respondError(res, "Prompt text is required.", 400);
      }
      const omnispindle = getOmnispindle();
      const result = omnispindle.sendPrompt(laneId, text);
      return res.json({ ok: true, laneId, ...result });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  router.post("/broadcast", (req, res) => {
    try {
      const text = String(req.body?.text || req.body?.prompt || "").trim();
      if (!text) {
        return respondError(res, "Broadcast text is required.", 400);
      }
      const omnispindle = getOmnispindle();
      const result = omnispindle.broadcast(text);
      return res.json({ ok: true, ...result });
    } catch (error) {
      return respondError(res, error, 500);
    }
  });

  return router;
}

module.exports = createOmnispindleRouter;
