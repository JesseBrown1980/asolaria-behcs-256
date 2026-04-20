/**
 * ASO Gateway Route — typed operations endpoint for the bridge.
 *
 * Accepts POST /op with { op, payload } and dispatches to the ASO runtime.
 * Gaia (and any agent with a valid gateway token) can send ops over the bridge
 * without racing to overwrite whole files.
 *
 * LX chain: LX-153, LX-154, LX-170
 */
const express = require("express");
const aso = require("../src/index-kernel/aso");

const router = express.Router();

const OP_DISPATCH = {
  "add-topic":        (p) => aso.addTopic(p),
  "revise-topic":     (p) => aso.reviseTopic(p),
  "add-observation":  (p) => aso.addObservation(p),
  "add-relation":     (p) => aso.addRelation(p),
  "resolve-conflict": (p) => aso.resolveConflict(p),
  "add-outcome":      (p) => aso.addOutcome(p),
  "add-surface":      (p) => aso.addSurface(p),
  "add-evidence":     (p) => aso.addEvidence(p),
  "add-conflict":     (p) => aso.addConflict(p)
};

const VALID_OPS = Object.keys(OP_DISPATCH);

router.post("/op", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const op = String(body.op || "").trim();

    if (!op) {
      return res.status(400).json({ ok: false, error: "op_required", validOps: VALID_OPS });
    }

    const handler = OP_DISPATCH[op];
    if (!handler) {
      return res.status(400).json({ ok: false, error: `unknown_op:${op}`, validOps: VALID_OPS });
    }

    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const result = handler(payload);

    if (!result.ok) {
      return res.status(422).json(result);
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "aso_op_failed") });
  }
});

router.get("/status", (_req, res) => {
  try {
    const result = aso.getAsoStatus();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "aso_status_failed") });
  }
});

router.get("/topics", (req, res) => {
  try {
    const filter = {};
    if (req.query?.type) filter.type = String(req.query.type).trim();
    if (req.query?.tier) filter.tier = String(req.query.tier).trim();
    if (req.query?.status) filter.status = String(req.query.status).trim();
    if (req.query?.scope) filter.scope = String(req.query.scope).trim();
    if (req.query?.tag) filter.tag = String(req.query.tag).trim();
    if (req.query?.chain) filter.chain = String(req.query.chain).trim();
    if (req.query?.canonicalKey) filter.canonicalKey = String(req.query.canonicalKey).trim();
    const rows = aso.listTopics(filter);
    return res.json({ ok: true, count: rows.length, rows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "list_topics_failed") });
  }
});

router.get("/topics/:asoId", (req, res) => {
  try {
    const topic = aso.getTopic(req.params.asoId);
    if (!topic) {
      return res.status(404).json({ ok: false, error: `not_found:${req.params.asoId}` });
    }
    return res.json({ ok: true, topic });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "get_topic_failed") });
  }
});

router.get("/search", (req, res) => {
  try {
    const q = String(req.query?.q || "").trim();
    if (!q) {
      return res.status(400).json({ ok: false, error: "q_required" });
    }

    const options = {};
    if (req.query?.type) options.type = String(req.query.type).trim();
    if (req.query?.tier) options.tier = String(req.query.tier).trim();
    if (req.query?.status) options.status = String(req.query.status).trim();
    if (req.query?.scope) options.scope = String(req.query.scope).trim();
    if (req.query?.tag) options.tag = String(req.query.tag).trim();
    if (req.query?.chain) options.chain = String(req.query.chain).trim();
    if (req.query?.limit) options.limit = parseInt(req.query.limit, 10);

    const result = aso.searchTopics(q, options);
    return res.json({ ok: true, query: result.query, tokens: result.tokens, count: result.count, matches: result.matches });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || "search_failed") });
  }
});

router.get("/ops", (_req, res) => {
  return res.json({ ok: true, validOps: VALID_OPS });
});

module.exports = router;
