/**
 * Worker Runtime Routes — extracted from server.js (ADR-0001 strangler-fig)
 * Dashboard payload endpoints for worker-runtime.html and civilization preview.
 */
const express = require("express");
const { asBool, asInt, respondError, inferHttpStatusForError } = require("../../lib/helpers");

function createWorkerRuntimeRouter(ctx) {
  if (!ctx || typeof ctx !== "object") {
    throw new TypeError("workerRuntime route contract requires a ctx object");
  }
  const router = express.Router();
  const {
    resolveCachedRuntimePayload,
    workerRuntimeRouteCaches,
    buildWorkerRuntimeFastPayload,
    buildWorkerRuntimeColonyPayload,
    buildWorkerRuntimeSymphonyPayload,
    buildSuperCoderCockpitPayload,
    buildWorkerRuntimeAbacusPayload,
    buildWorkerRuntimeWorkPayload,
    getCachedWorkerRuntimePayload,
    getCachedTrustedEcosystemEntitiesPayload,
    buildCivilizationWorldBundle,
    buildSwarmDeskExportPayload,
    withWorkerRuntimeCacheMeta,
    emitWorkerRuntimeEvent,
    workerRuntimeSnapshotCache,
    WORKER_RUNTIME_FAST_ROUTE_TTL_MS,
    WORKER_RUNTIME_PANEL_TTL_MS,
    WORKER_RUNTIME_ABACUS_ROUTE_TTL_MS,
    SUPER_CODER_TTL_MS
  } = ctx;
  const requiredFns = {
    resolveCachedRuntimePayload,
    buildWorkerRuntimeFastPayload,
    buildWorkerRuntimeColonyPayload,
    buildWorkerRuntimeSymphonyPayload,
    buildSuperCoderCockpitPayload,
    buildWorkerRuntimeAbacusPayload,
    buildWorkerRuntimeWorkPayload,
    getCachedWorkerRuntimePayload,
    getCachedTrustedEcosystemEntitiesPayload,
    buildCivilizationWorldBundle,
    buildSwarmDeskExportPayload,
    withWorkerRuntimeCacheMeta
  };
  for (const [name, value] of Object.entries(requiredFns)) {
    if (typeof value !== "function") {
      throw new TypeError(`workerRuntime route contract missing ${name}()`);
    }
  }
  if (!workerRuntimeRouteCaches || typeof workerRuntimeRouteCaches !== "object") {
    throw new TypeError("workerRuntime route contract requires workerRuntimeRouteCaches");
  }
  if (!workerRuntimeSnapshotCache || typeof workerRuntimeSnapshotCache !== "object") {
    throw new TypeError("workerRuntime route contract requires workerRuntimeSnapshotCache");
  }
  for (const cacheName of ["fast", "colony", "symphony", "superCoder", "abacus", "work"]) {
    if (!workerRuntimeRouteCaches[cacheName] || typeof workerRuntimeRouteCaches[cacheName] !== "object") {
      throw new TypeError(`workerRuntime route contract missing cache bucket ${cacheName}`);
    }
  }
  const writeReadEvent = typeof emitWorkerRuntimeEvent === "function" ? emitWorkerRuntimeEvent : () => {};
  const buildCacheMeta = (cache, extras = {}) => ({
    stale: Boolean(cache?.payload) && Number(cache?.expiresAt || 0) <= Date.now(),
    partial: false,
    refreshing: Boolean(cache?.refreshPromise),
    lastError: String(cache?.lastError || "").trim(),
    ...extras
  });

  router.get("/fast", async (_req, res) => {
    try {
      const fastCache = workerRuntimeRouteCaches.fast;
      const payload = await resolveCachedRuntimePayload(
        fastCache,
        () => buildWorkerRuntimeFastPayload(),
        { ttlMs: WORKER_RUNTIME_FAST_ROUTE_TTL_MS }
      );
      return res.json(withWorkerRuntimeCacheMeta(payload, buildCacheMeta(fastCache, { partial: true })));
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/colony", async (_req, res) => {
    try { return res.json(await buildWorkerRuntimeColonyPayload()); }
    catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/symphony", async (_req, res) => {
    try {
      return res.json(await resolveCachedRuntimePayload(
        workerRuntimeRouteCaches.symphony,
        () => buildWorkerRuntimeSymphonyPayload(),
        { ttlMs: WORKER_RUNTIME_PANEL_TTL_MS }
      ));
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/super-coder", async (_req, res) => {
    try {
      return res.json(await resolveCachedRuntimePayload(
        workerRuntimeRouteCaches.superCoder,
        () => buildSuperCoderCockpitPayload(),
        { ttlMs: Math.max(SUPER_CODER_TTL_MS, WORKER_RUNTIME_PANEL_TTL_MS, 4000) }
      ));
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/abacus", async (_req, res) => {
    try {
      return res.json(await resolveCachedRuntimePayload(
        workerRuntimeRouteCaches.abacus,
        () => buildWorkerRuntimeAbacusPayload(),
        { ttlMs: WORKER_RUNTIME_ABACUS_ROUTE_TTL_MS }
      ));
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/work", async (_req, res) => {
    try {
      return res.json(await resolveCachedRuntimePayload(
        workerRuntimeRouteCaches.work,
        () => buildWorkerRuntimeWorkPayload(),
        { ttlMs: WORKER_RUNTIME_PANEL_TTL_MS }
      ));
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/status", async (_req, res) => {
    try {
      const payload = await getCachedWorkerRuntimePayload();
      return res.json(withWorkerRuntimeCacheMeta(payload, buildCacheMeta(workerRuntimeSnapshotCache)));
    }
    catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/trusted-entities", async (_req, res) => {
    try {
      const payload = await getCachedTrustedEcosystemEntitiesPayload();
      writeReadEvent({
        component: "worker_runtime", category: "ecosystem", action: "trusted_entities_snapshot",
        actor: { type: "runtime", id: "asolaria-core", label: "Asolaria Core", domain: "local", criticality: "medium" },
        target: { type: "entity_collection", id: "trusted-entities", label: "Trusted Ecosystem Entities", domain: "local" },
        context: { total: Number(payload?.summary?.total || 0), connected: Number(payload?.summary?.connected || 0) },
        policy: { approvalState: "not_required", mode: "trusted_owned_runtime", autonomous: true },
        status: "completed"
      });
      return res.json(payload);
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/civilization-world", async (req, res) => {
    try {
      const queryBool = (value, fallback) => {
        const normalized = String(value || "").trim().toLowerCase();
        if (normalized === "1") return true;
        if (normalized === "0") return false;
        return asBool(value, fallback);
      };
      const bundle = await buildCivilizationWorldBundle({
        includeTrusted: queryBool(req.query?.trusted, false),
        includeAdminCockpit: req.query?.admin === undefined ? true : queryBool(req.query?.admin, true),
        taskLimit: asInt(req.query?.taskLimit, 24, 4, 80),
        eventLimit: asInt(req.query?.eventLimit, 30, 4, 80),
        windowMinutes: asInt(req.query?.windowMinutes, 240, 15, 24 * 60),
        maxNodes: asInt(req.query?.maxNodes, 72, 12, 180),
        maxEdges: asInt(req.query?.maxEdges, 120, 12, 320),
        includeLowRisk: req.query?.includeLowRisk === undefined ? true : queryBool(req.query?.includeLowRisk, true)
      });
      writeReadEvent({
        component: "worker_runtime", category: "civilization_world", action: "snapshot_generated",
        actor: { type: "runtime", id: "asolaria-core", label: "Asolaria Core", domain: "local", criticality: "medium" },
        target: { type: "world_projection", id: "civilization-world", label: "Civilization World", domain: "local" },
        context: {
          entities: Number(bundle?.worldState?.summary?.entities || 0),
          routes: Number(bundle?.worldState?.summary?.routes || 0),
          packets: Number(bundle?.worldState?.summary?.packets || 0),
          trustedIncluded: Boolean(bundle?.trustedEntities)
        },
        policy: { approvalState: "not_required", mode: "trusted_owned_runtime", autonomous: true },
        status: "completed"
      });
      return res.json(bundle.worldState);
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  router.get("/swarmdesk-export", async (req, res) => {
    try {
      const useLiveTrustedEntities = String(req.query?.live || "").trim() === "1";
      const bundle = await buildCivilizationWorldBundle({
        includeTrusted: useLiveTrustedEntities, includeAdminCockpit: true,
        taskLimit: 24, eventLimit: 24, windowMinutes: 240, maxNodes: 72, maxEdges: 120, includeLowRisk: true
      });
      const payload = buildSwarmDeskExportPayload({
        trustedEntities: bundle.trustedEntities,
        worldState: bundle.worldState,
        graph: {
          generatedAt: bundle.graphSnapshot.generatedAt,
          nodes: bundle.graphSnapshot.graph?.nodes || [],
          edges: bundle.graphSnapshot.graph?.edges || [],
          observations: [
            `World entities: ${Number(bundle.worldState?.summary?.entities || 0)}`,
            `World routes: ${Number(bundle.worldState?.summary?.routes || 0)}`,
            `Open ledger tasks: ${Number(bundle.taskLedger?.summary?.openTasks || 0)}`,
            `Hot entities: ${Number(bundle.worldState?.summary?.hotEntities || 0)}`
          ]
        }
      });
      writeReadEvent({
        component: "worker_runtime", category: "swarmdesk", action: "export_snapshot",
        actor: { type: "runtime", id: "asolaria-core", label: "Asolaria Core", domain: "local", criticality: "medium" },
        target: { type: "export_packet", id: "swarmdesk-export", label: "SwarmDesk Export", domain: "local" },
        context: {
          nodes: Number(payload?.summary?.nodes || 0), edges: Number(payload?.summary?.edges || 0),
          worldEntities: Number(payload?.summary?.worldEntities || 0), worldRoutes: Number(payload?.summary?.worldRoutes || 0),
          agentResponses: Number(payload?.summary?.agentResponses || 0), liveTrustedEntities: useLiveTrustedEntities
        },
        policy: { approvalState: "not_required", mode: "trusted_owned_runtime", autonomous: true },
        status: "completed"
      });
      return res.json(payload);
    } catch (error) { return respondError(res, error, inferHttpStatusForError(error, 500)); }
  });

  return router;
}

module.exports = createWorkerRuntimeRouter;
