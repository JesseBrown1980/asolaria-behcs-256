const fs = require("fs");
const express = require("express");
const { respondError, inferHttpStatusForError } = require("../lib/helpers");

function createSlackIntegrationRouter({
  getSlackPolicy,
  setSlackPolicy,
  getSlackIntegrationStatus,
  listSlackChannels,
  reviewSlackConversation,
  setSlackConfig,
  sendSlackMessage,
  createSlackEventPoller,
  defaultEventChannels = [],
  eventLogPath = ""
}) {
  const router = express.Router();
  let slackPoller = null;

  function readPolicy() {
    return typeof getSlackPolicy === "function" ? getSlackPolicy() : {};
  }

  function savePolicy(input) {
    if (typeof setSlackPolicy === "function") {
      return setSlackPolicy(input);
    }
    return readPolicy();
  }

  function normalizeEventChannels(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    }
    const single = String(value || "").trim();
    return single ? [single] : [];
  }

  function appendSlackEvent(entry) {
    if (!eventLogPath) {
      return;
    }
    try {
      fs.appendFileSync(eventLogPath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (_error) {
      // Event logging is best-effort only.
    }
  }

  router.get("/status", async (_req, res) => {
    try {
      const policy = readPolicy();
      const status = await getSlackIntegrationStatus(policy);
      return res.json({ ok: true, status });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  router.post("/config", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const shouldUpdateConfig = body.clear === true
        || Object.prototype.hasOwnProperty.call(body, "botToken")
        || Object.prototype.hasOwnProperty.call(body, "token")
        || Object.prototype.hasOwnProperty.call(body, "defaultChannel");

      let config = null;
      if (shouldUpdateConfig) {
        config = setSlackConfig({
          clear: body.clear === true,
          botToken: body.botToken,
          token: body.token,
          defaultChannel: body.defaultChannel
        });
      }

      const policyInput = body.policy && typeof body.policy === "object" ? body.policy : body;
      const policy = savePolicy(policyInput);
      const status = await getSlackIntegrationStatus(policy);
      return res.json({
        ok: true,
        config,
        policy,
        status
      });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  router.post("/send", async (req, res) => {
    if (typeof sendSlackMessage !== "function") {
      return respondError(res, new Error("slack_send_unavailable"), 501);
    }

    try {
      const policy = readPolicy();
      const input = req.body && typeof req.body === "object" ? req.body : {};
      const result = await sendSlackMessage(input, policy);
      return res.json({ ok: true, result, policy });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  router.get("/channels", async (req, res) => {
    try {
      const policy = readPolicy();
      const result = await listSlackChannels(req.query || {}, policy);
      return res.json({
        ok: true,
        channels: result.channels || [],
        nextCursor: String(result.nextCursor || ""),
        hasMore: Boolean(result.hasMore),
        policy
      });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  router.post("/review", async (req, res) => {
    try {
      const policy = readPolicy();
      const input = req.body && typeof req.body === "object" ? req.body : {};
      const review = await reviewSlackConversation(input, policy);
      return res.json({ ok: true, review, policy });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  router.post("/events/start", async (req, res) => {
    if (typeof createSlackEventPoller !== "function") {
      return respondError(res, new Error("slack_event_poller_unavailable"), 501);
    }

    try {
      const policy = readPolicy();
      const input = req.body && typeof req.body === "object" ? req.body : {};
      const channels = normalizeEventChannels(input.channels).length
        ? normalizeEventChannels(input.channels)
        : normalizeEventChannels(defaultEventChannels);
      if (!channels.length) {
        throw new Error("At least one event channel is required.");
      }

      if (!slackPoller) {
        slackPoller = createSlackEventPoller({
          channels,
          intervalMs: input.intervalMs,
          policy,
          onMessage({ channelId, message }) {
            appendSlackEvent({
              at: new Date().toISOString(),
              channelId,
              user: String(message?.user || ""),
              text: String(message?.text || "").slice(0, 500),
              ts: String(message?.ts || "")
            });
          }
        });
      }

      slackPoller.start();
      return res.json({
        ok: true,
        status: "started",
        ...slackPoller.status()
      });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  router.post("/events/stop", async (_req, res) => {
    try {
      if (slackPoller) {
        slackPoller.stop();
      }
      return res.json({
        ok: true,
        status: "stopped",
        ...(slackPoller ? slackPoller.status() : { running: false })
      });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  router.get("/events/status", async (_req, res) => {
    try {
      return res.json({
        ok: true,
        ...(slackPoller
          ? slackPoller.status()
          : {
            running: false,
            pollCount: 0,
            channels: normalizeEventChannels(defaultEventChannels),
            intervalMs: 8000,
            lastTs: {},
            recentErrors: []
          })
      });
    } catch (error) {
      const code = inferHttpStatusForError(error);
      return respondError(res, error, code);
    }
  });

  return router;
}

module.exports = createSlackIntegrationRouter;
