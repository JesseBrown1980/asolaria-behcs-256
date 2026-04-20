"use strict";

const http = require("http");
const path = require("path");
const express = require("express");

const remoteNodeRegistry = require("../remoteNodeRegistry");
const { getLocalComputeReadinessStatus } = require("../localComputeReadiness");
const { getSemanticKnowledgeStatus } = require("../semanticKnowledgeStore");
const { buildMobileInboxState } = require("../mobileInbox");
const { normalizeChannels } = require("../connectionPolicy");
const createWorkerRouterPublic = require("../../routes/routes/workerRouterPublic");
const createWorkerRuntimeRouter = require("../../routes/routes/workerRuntime");
const { createWorkerRuntimeCompatContext } = require("../workerRuntimeCompatContext");
const { createCompat4781Runtime } = require("./compat4781Runtime");
const { registerCompat4781ApiRoutes } = require("./compat4781Surface");
const { createCompat4781SummaryBuilders } = require("./compat4781Summary");
const { registerCompat4781WebRoutes } = require("./compat4781WebSurface");

const repoRoot = path.resolve(__dirname, "..", "..");
const runtime = createCompat4781Runtime({ repoRoot });

const {
  bind,
  port,
  gatewayBaseUrl,
  httpsPort,
  publicRoot,
  workerRouterHtmlPath,
  workerRuntimeHtmlPath,
  civilizationPreviewHtmlPath,
  runtimeState,
  clampNumber,
  normalizeBaseUrl,
  localCompatBaseUrl,
  remoteBaseUrlFromState,
  readJson,
  maskToken,
  resolveViewer,
  resolveRequestedChannel,
  buildConnectionRouting,
  buildUiPaths,
  buildUiControl,
  phoneBridgeKeeperStatus,
  phoneTunnelMonitorStatus,
  mobilePushState,
  guardianState,
  workOrgState,
  approvalState
} = runtime;

const compatSummary = createCompat4781SummaryBuilders({
  bind,
  port,
  httpsPort,
  gatewayBaseUrl,
  runtimeState,
  resolveRequestedChannel,
  resolveViewer,
  buildConnectionRouting,
  buildUiControl,
  buildUiPaths,
  remoteBaseUrlFromState,
  phoneBridgeKeeperStatus,
  phoneTunnelMonitorStatus,
  mobilePushState,
  guardianState,
  workOrgState,
  approvalState,
  buildMobileInboxState,
  clampNumber,
  getSemanticKnowledgeStatus,
  readJson,
  maskToken
});

async function main() {
  const app = express();
  app.use(express.json({ limit: "128kb" }));
  app.use("/api/worker-router", createWorkerRouterPublic);
  app.use("/api/worker-runtime", createWorkerRuntimeRouter(createWorkerRuntimeCompatContext({
    repoRoot,
    runtimeState,
    phoneBridgeKeeperStatus,
    phoneTunnelMonitorStatus
  })));

  registerCompat4781ApiRoutes(app, {
    compatSurface: "proxy_4781",
    gatewayBaseUrl,
    runtimeState,
    compatSummary,
    remoteNodeRegistry,
    getLocalComputeReadinessStatus,
    normalizeBaseUrl,
    remoteBaseUrlFromState,
    localCompatBaseUrl,
    resolveRequestedChannel,
    buildConnectionRouting,
    phoneBridgeKeeperStatus,
    phoneTunnelMonitorStatus,
    workOrgState,
    clampNumber,
    normalizeChannels
  });

  registerCompat4781WebRoutes(app, {
    publicRoot,
    workerRouterHtmlPath,
    workerRuntimeHtmlPath,
    civilizationPreviewHtmlPath,
    pageMode: "read-only"
  });

  const server = http.createServer(app);
  server.listen(port, bind, () => {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        compatSurface: "proxy_4781",
        bind,
        port,
        gatewayBaseUrl,
        publicRoot
      })}\n`
    );
  });
}

main().catch((error) => {
  process.stderr.write(`${String(error?.stack || error || "compat4781_failed")}\n`);
  process.exit(1);
});
