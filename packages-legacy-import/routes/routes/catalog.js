const express = require("express");
const { respondError: defaultRespondError, inferHttpStatusForError: defaultInferHttpStatusForError } = require("../../lib/helpers");

function loadCatalogDependencies() {
  let selectorRegistry = {};
  let modelLaneTumbler = {};

  try {
    selectorRegistry = require("../../src/selectorCatalogRegistry");
  } catch (_error) {
    selectorRegistry = {};
  }

  try {
    modelLaneTumbler = require("../../src/modelLaneTumbler");
  } catch (_error) {
    modelLaneTumbler = {};
  }

  const inlineSelectors = [
    {
      id: "messaging.slack.asolaria",
      label: "Slack Asolaria Dispatch",
      category: "messaging",
      profile: "dispatch",
      accessLevel: "trusted"
    }
  ];

  const clone = (value) => value && typeof value === "object" ? { ...value } : null;
  const listInline = () => inlineSelectors.map(clone);

  return {
    getCatalogSummary: typeof selectorRegistry.getCatalogSummary === "function"
      ? selectorRegistry.getCatalogSummary
      : () => ({ selectorCount: listInline().length, categoryCount: 1, profileCount: 1, accessLevelCount: 1 }),
    listCategories: typeof selectorRegistry.listCategories === "function"
      ? selectorRegistry.listCategories
      : () => ["messaging"],
    listProfiles: typeof selectorRegistry.listProfiles === "function"
      ? selectorRegistry.listProfiles
      : () => ["dispatch"],
    listAccessLevels: typeof selectorRegistry.listAccessLevels === "function"
      ? selectorRegistry.listAccessLevels
      : () => ["trusted"],
    listSelectors: typeof selectorRegistry.listSelectors === "function"
      ? selectorRegistry.listSelectors
      : listInline,
    getSelector: typeof selectorRegistry.getSelector === "function"
      ? selectorRegistry.getSelector
      : (id) => listInline().find((item) => item.id === String(id || "").trim()) || null,
    dryRunSelector: typeof selectorRegistry.dryRunSelector === "function"
      ? selectorRegistry.dryRunSelector
      : (id, input = {}) => ({ selectorId: String(id || "").trim(), accepted: true, normalizedInput: { ...input } }),
    listTumblers: typeof modelLaneTumbler.listTumblers === "function"
      ? modelLaneTumbler.listTumblers
      : () => [],
    acquireTumbler: typeof modelLaneTumbler.acquireTumbler === "function"
      ? modelLaneTumbler.acquireTumbler
      : (input = {}) => ({ id: String(input.tumblerId || "").trim(), status: "leased", lease: null }),
    releaseTumbler: typeof modelLaneTumbler.releaseTumbler === "function"
      ? modelLaneTumbler.releaseTumbler
      : (input = {}) => ({ id: String(input.tumblerId || "").trim(), status: "available", lease: null })
  };
}

function buildCatalogSummaryPayload(deps) {
  return {
    ok: true,
    summary: deps.getCatalogSummary()
  };
}

function createCatalogRouter(options = {}) {
  const router = express.Router();
  const respondError = typeof options.respondError === "function" ? options.respondError : defaultRespondError;
  const inferHttpStatusForError = typeof options.inferHttpStatusForError === "function"
    ? options.inferHttpStatusForError
    : defaultInferHttpStatusForError;
  const deps = loadCatalogDependencies();

  router.get("/summary", (_req, res) => {
    try {
      return res.json(buildCatalogSummaryPayload(deps));
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/categories", (_req, res) => {
    try {
      return res.json({ ok: true, categories: deps.listCategories() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/profiles", (_req, res) => {
    try {
      return res.json({ ok: true, profiles: deps.listProfiles() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/access-levels", (_req, res) => {
    try {
      return res.json({ ok: true, accessLevels: deps.listAccessLevels() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/selectors", (_req, res) => {
    try {
      return res.json({ ok: true, selectors: deps.listSelectors() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/selectors/:id", (req, res) => {
    try {
      const selector = deps.getSelector(req.params.id);
      if (!selector) {
        const error = new Error("Selector not found.");
        error.statusCode = 404;
        throw error;
      }
      return res.json({ ok: true, selector });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/selectors/:id/dry-run", (req, res) => {
    try {
      return res.json({ ok: true, result: deps.dryRunSelector(req.params.id, req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.get("/tumblers", (_req, res) => {
    try {
      return res.json({ ok: true, tumblers: deps.listTumblers() });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/tumblers/acquire", (req, res) => {
    try {
      return res.json({ ok: true, tumbler: deps.acquireTumbler(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  router.post("/tumblers/release", (req, res) => {
    try {
      return res.json({ ok: true, tumbler: deps.releaseTumbler(req.body || {}) });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 400));
    }
  });

  return router;
}

module.exports = createCatalogRouter;
module.exports.buildCatalogSummaryPayload = buildCatalogSummaryPayload;
module.exports.loadCatalogDependencies = loadCatalogDependencies;
