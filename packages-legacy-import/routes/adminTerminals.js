const express = require("express");

const router = express.Router();

router.get("/cockpit", (_req, res) => {
  try {
    return res.json({
      ok: true,
      cockpit: {
        status: "idle",
        terminals: [],
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "cockpit_status_failed") });
  }
});

router.post("/cockpit/ensure", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    return res.json({
      ok: true,
      cockpit: {
        status: "running",
        terminals: [],
        updatedAt: new Date().toISOString()
      },
      results: [],
      reason: body.reason || "ensure"
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "cockpit_ensure_failed") });
  }
});

router.post("/cockpit/stop", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    return res.json({
      ok: true,
      cockpit: {
        status: "stopped",
        terminals: [],
        updatedAt: new Date().toISOString()
      },
      terminalId: body.terminalId || null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "cockpit_stop_failed") });
  }
});

router.post("/cockpit/prompt", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const terminalId = String(body.terminalId || "").trim();
    const text = String(body.text || "").trim();
    if (!terminalId || !text) {
      return res.status(400).json({ ok: false, error: "terminalId and text are required." });
    }
    return res.json({
      ok: true,
      terminalId,
      prompted: true,
      at: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "cockpit_prompt_failed") });
  }
});

module.exports = router;
