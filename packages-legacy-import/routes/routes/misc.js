/**
 * Miscellaneous small routes — extracted from server.js (ADR-0001 strangler-fig)
 * Routes that are too small for their own file but clean enough to extract.
 */
const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const { asBool, respondError } = require("../lib/helpers");

function createMiscRouter({ getNatural20DailyDigest, serverDir }) {

  router.get("/daily-sites/natural20", async (req, res) => {
    try {
      const digest = await getNatural20DailyDigest({ force: asBool(req.query?.refresh, false) });
      return res.json({
        ok: true,
        checkedAt: digest.checkedAt, checkedDay: digest.checkedDay,
        title: digest.title, summary: digest.summary,
        url: digest.url, finalUrl: digest.finalUrl, lastError: digest.lastError
      });
    } catch (error) { return respondError(res, error, 500); }
  });

  router.get("/bootstrap/friend-codex-pack", (_req, res) => {
    try {
      const systemCardPath = path.join(serverDir, "tools", "Friend-Codex-Bootstrap-SystemCard.prompt.md");
      const taskPacketPath = path.join(serverDir, "tools", "Friend-Codex-Bootstrap-TaskPacket.template.md");
      if (!fs.existsSync(systemCardPath) || !fs.existsSync(taskPacketPath)) {
        return respondError(res, "Friend bootstrap pack files are missing.", 404);
      }
      return res.json({
        ok: true, title: "Friend Codex Bootstrap Pack",
        systemCardPath, taskPacketPath,
        systemCard: fs.readFileSync(systemCardPath, "utf8"),
        taskPacket: fs.readFileSync(taskPacketPath, "utf8")
      });
    } catch (error) { return respondError(res, error, 500); }
  });

  return router;
}

module.exports = createMiscRouter;
