/**
 * Policy Routes — extracted from server.js (ADR-0001 strangler-fig)
 */
const express = require("express");
const router = express.Router();
const { normalizeChannels, noteChannelHeartbeat } = require("../../src/connectionPolicy");

function createPolicyRouter({ respondError, inferHttpStatusForError, getWorkLinkPolicySummary, getWorkOrgPolicySummary, setActiveWorkOrg, CLAWBOT_CAUTION, getConnectionRoutingState }) {

  router.get("/clawbot", (_req, res) => {
    res.json({ ok: true, caution: CLAWBOT_CAUTION });
  });

  router.get("/work-links", (_req, res) => {
    res.json({
      ok: true,
      workLinks: getWorkLinkPolicySummary(),
      workOrgs: getWorkOrgPolicySummary({ includeProfiles: false }),
      connectionRouting: getConnectionRoutingState()
    });
  });

  router.post("/channel/heartbeat", (req, res) => {
    const rawChannel = String(req.body?.channel || req.query?.channel || req.headers["x-asolaria-channel"] || "").trim();
    const channel = normalizeChannels([rawChannel])[0];
    if (!channel) return respondError(res, "Channel is required (usb|vpn|private_internet|public_internet).", 400);
    noteChannelHeartbeat(channel);
    return res.json({ ok: true, channel, at: new Date().toISOString(), connectionRouting: getConnectionRoutingState() });
  });

  router.get("/work-orgs", (_req, res) => {
    res.json({ ok: true, workOrgs: getWorkOrgPolicySummary() });
  });

  router.post("/work-org/select", (req, res) => {
    try {
      const rawOrg = String(req.body?.organization || req.body?.org || "").trim();
      if (!rawOrg) return respondError(res, "Organization is required.", 400);
      const selected = setActiveWorkOrg(rawOrg);
      return res.json({
        ok: true,
        selected: { organization: selected.key, label: selected.profile?.label || selected.key },
        workOrgs: getWorkOrgPolicySummary({ includeProfiles: false })
      });
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 400)); }
  });

  return router;
}

module.exports = createPolicyRouter;
