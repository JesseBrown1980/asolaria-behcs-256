"use strict";

function createCompat4781SummaryBuilders(input = {}) {
  const bind = String(input.bind || "").trim();
  const port = Number(input.port || 0) || 0;
  const httpsPort = Number(input.httpsPort || 0) || 0;
  const gatewayBaseUrl = String(input.gatewayBaseUrl || "").trim();
  const runtimeState = input.runtimeState || {};
  const resolveRequestedChannel = typeof input.resolveRequestedChannel === "function" ? input.resolveRequestedChannel : () => "";
  const resolveViewer = typeof input.resolveViewer === "function" ? input.resolveViewer : () => "liris";
  const buildConnectionRouting = typeof input.buildConnectionRouting === "function" ? input.buildConnectionRouting : () => ({});
  const buildUiControl = typeof input.buildUiControl === "function" ? input.buildUiControl : () => ({ enabled: false });
  const buildUiPaths = typeof input.buildUiPaths === "function" ? input.buildUiPaths : () => ({});
  const remoteBaseUrlFromState = typeof input.remoteBaseUrlFromState === "function" ? input.remoteBaseUrlFromState : () => "";
  const phoneBridgeKeeperStatus = typeof input.phoneBridgeKeeperStatus === "function" ? input.phoneBridgeKeeperStatus : () => ({});
  const phoneTunnelMonitorStatus = typeof input.phoneTunnelMonitorStatus === "function" ? input.phoneTunnelMonitorStatus : () => ({});
  const mobilePushState = typeof input.mobilePushState === "function" ? input.mobilePushState : () => ({ enabled: false });
  const guardianState = typeof input.guardianState === "function" ? input.guardianState : () => ({});
  const workOrgState = typeof input.workOrgState === "function" ? input.workOrgState : () => ({});
  const approvalState = typeof input.approvalState === "function" ? input.approvalState : () => ({});
  const buildMobileInboxState = typeof input.buildMobileInboxState === "function" ? input.buildMobileInboxState : () => ({});
  const clampNumber = typeof input.clampNumber === "function" ? input.clampNumber : (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const getSemanticKnowledgeStatus = typeof input.getSemanticKnowledgeStatus === "function" ? input.getSemanticKnowledgeStatus : () => ({ ok: false });
  const getMqttIntegrationStatus = typeof input.getMqttIntegrationStatus === "function"
    ? input.getMqttIntegrationStatus
    : (() => {
      try {
        const mqttConnector = require("../connectors/mqttConnector");
        return typeof mqttConnector.getMqttIntegrationStatus === "function"
          ? mqttConnector.getMqttIntegrationStatus
          : null;
      } catch (_error) {
        return null;
      }
    })();
  const readJson = typeof input.readJson === "function" ? input.readJson : async () => ({ ok: false });

  function updateControlExpiry() {
    if (runtimeState.control?.armedUntilMs > 0 && runtimeState.control.armedUntilMs <= Date.now()) {
      runtimeState.control.armedUntilMs = 0;
      runtimeState.control.updatedAt = new Date().toISOString();
      if (!runtimeState.control.lastAction) {
        runtimeState.control.lastAction = "expired";
      }
    }
  }

  function buildControlStatus() {
    updateControlExpiry();
    const remainingMs = Math.max(0, Number(runtimeState.control?.armedUntilMs || 0) - Date.now());
    return {
      armed: remainingMs > 0,
      remainingMs,
      expiresAt: remainingMs > 0 ? new Date(runtimeState.control.armedUntilMs).toISOString() : "",
      by: String(runtimeState.control?.armedBy || ""),
      lastAction: String(runtimeState.control?.lastAction || ""),
      lastError: String(runtimeState.control?.lastError || ""),
      updatedAt: String(runtimeState.control?.updatedAt || "")
    };
  }

  function buildControlAuthority() {
    return {
      superMasterControlAllowed: true,
      reason: "",
      actorId: "proxy_4781",
      role: "compat_local"
    };
  }

  function networkPolicySnapshot(requestedChannel = "") {
    return {
      http: {
        bind,
        port
      },
      https: {
        enabled: true,
        port: httpsPort
      },
      phoneBridgeKeeper: phoneBridgeKeeperStatus(),
      phoneTunnelMonitor: phoneTunnelMonitorStatus(),
      mobilePush: mobilePushState(),
      connectionRouting: buildConnectionRouting(requestedChannel)
    };
  }

  function workspaceIndexStatus() {
    return {
      ok: true,
      compatListener: true,
      compatSurface: "proxy_4781",
      gatewayBaseUrl,
      semantic: getSemanticKnowledgeStatus()
    };
  }

  function colonyMemoryStatus() {
    return {
      ok: true,
      compatListener: true,
      compatSurface: "proxy_4781",
      available: false,
      enabled: false,
      reason: "colony_memory_slice_not_present_in_rayssa_checkout",
      source: "local_checkout_gap"
    };
  }

  function buildMqttStatusSummary(status = {}) {
    const connection = status && typeof status.connection === "object" ? status.connection : {};
    const topics = status && typeof status.topics === "object" ? status.topics : {};
    return {
      enabled: Boolean(status.enabled),
      configured: Boolean(status.configured),
      source: String(status.source || ""),
      brokerUrl: String(status.brokerUrl || ""),
      baseTopic: String(status.baseTopic || ""),
      retainState: Boolean(status.retainState),
      includeHealth: Boolean(status.includeHealth),
      includeColony: Boolean(status.includeColony),
      includeWorld: Boolean(status.includeWorld),
      controlEnabled: Boolean(status.controlEnabled),
      computeWorkerEnabled: Boolean(status.computeWorkerEnabled),
      topics: {
        root: String(topics.root || ""),
        runtimeHealth: String(topics.runtimeHealth || ""),
        runtimePresence: String(topics.runtimePresence || ""),
        colonyStatus: String(topics.colonyStatus || ""),
        worldState: String(topics.worldState || "")
      },
      connection: {
        ok: Boolean(connection.ok),
        state: String(connection.state || ""),
        lastError: String(connection.lastError || ""),
        lastConnectedAt: String(connection.lastConnectedAt || ""),
        lastDisconnectedAt: String(connection.lastDisconnectedAt || ""),
        lastPublishedAt: String(connection.lastPublishedAt || ""),
        lastInboundAt: String(connection.lastInboundAt || ""),
        reconnectCount: Number(connection.reconnectCount || 0),
        publishedCount: Number(connection.publishedCount || 0),
        inboundCount: Number(connection.inboundCount || 0),
        droppedCount: Number(connection.droppedCount || 0)
      }
    };
  }

  function buildInboxPayload(req) {
    const requestedChannel = resolveRequestedChannel(req);
    const connectionRouting = buildConnectionRouting(requestedChannel);
    const control = buildControlStatus();
    return buildMobileInboxState({
      approvalLimit: clampNumber(req?.query?.approvalLimit, 6, 1, 40),
      taskLimit: clampNumber(req?.query?.taskLimit, 6, 1, 40),
      noteLimit: clampNumber(req?.query?.noteLimit, 4, 1, 24),
      connectionRouting,
      control,
      guardian: guardianState(),
      approvals: approvalState(),
      push: mobilePushState(),
      workOrgs: workOrgState()
    });
  }

  function buildMobileSession(req) {
    const requestedChannel = resolveRequestedChannel(req);
    const viewer = resolveViewer(req);
    const connectionRouting = buildConnectionRouting(requestedChannel);
    const control = buildControlStatus();
    const push = mobilePushState();
    const guardian = guardianState();
    const approvals = approvalState();
    const workOrgs = workOrgState();
    const inbox = buildMobileInboxState({
      connectionRouting,
      control,
      guardian,
      approvals,
      push,
      workOrgs
    });

    return {
      ok: true,
      compatListener: true,
      compatSurface: "proxy_4781",
      viewer,
      sessionId: `proxy_4781:${viewer}:${connectionRouting?.selected?.channel || "none"}`,
      pendingCount: Number(inbox?.summary?.pendingApprovals || 0),
      approvals,
      guardian,
      connectionRouting,
      control,
      push,
      workOrgs
    };
  }

  function buildMobileSettings() {
    return {
      ok: true,
      compatListener: true,
      compatSurface: "proxy_4781",
      settings: {
        approvalMode: String(runtimeState.settings?.approvalMode || ""),
        approvalPreference: String(runtimeState.settings?.approvalPreference || ""),
        viewerDefault: String(runtimeState.settings?.viewerDefault || ""),
        connectionRemoteBaseUrl: String(runtimeState.connection?.remoteBaseUrl || ""),
        connectionResolvedRemoteBaseUrl: remoteBaseUrlFromState(),
        voiceEnabled: Boolean(runtimeState.settings?.voiceEnabled),
        voiceOutputMode: String(runtimeState.settings?.voiceOutputMode || ""),
        voiceAutoSpeakReplies: Boolean(runtimeState.settings?.voiceAutoSpeakReplies),
        voiceWakeWord: String(runtimeState.settings?.voiceWakeWord || "")
      }
    };
  }

  function buildMobileBootstrap(req) {
    const viewer = resolveViewer(req);
    return {
      ok: true,
      compatListener: true,
      compatSurface: "proxy_4781",
      token: String(runtimeState.mobileToken || ""),
      tokenHint: String(input.maskToken ? input.maskToken(runtimeState.mobileToken) : ""),
      viewer,
      urls: buildUiPaths(viewer),
      connection: {
        remoteBaseUrl: remoteBaseUrlFromState(),
        preference: runtimeState.connection?.preference || [],
        available: runtimeState.connection?.available || [],
        allowPublicInternet: Boolean(runtimeState.connection?.allowPublicInternet),
        publicInternetPrivate: Boolean(runtimeState.connection?.publicInternetPrivate),
        remoteAuthRequired: Boolean(runtimeState.connection?.remoteAuthRequired),
        requireEncryptedRemote: Boolean(runtimeState.connection?.requireEncryptedRemote),
        stealthDeny: Boolean(runtimeState.connection?.stealthDeny)
      }
    };
  }

  async function buildHealthPayload(req, includeGatewayHealth = true) {
    const requestedChannel = resolveRequestedChannel(req);
    const viewer = resolveViewer(req);
    const payload = {
      ok: true,
      service: "asolaria-compat-4781",
      compatListener: true,
      compatSurface: "proxy_4781",
      bind,
      port,
      gatewayBaseUrl,
      uiControl: buildUiControl(viewer),
      connectionRouting: buildConnectionRouting(requestedChannel),
      networkPolicy: networkPolicySnapshot(requestedChannel)
    };

    if (typeof getMqttIntegrationStatus === "function") {
      const mqttStatus = await Promise.resolve(getMqttIntegrationStatus());
      if (mqttStatus) {
        payload.mqtt = buildMqttStatusSummary(mqttStatus);
      }
    }

    if (includeGatewayHealth) {
      payload.gatewayHealth = await readJson("/health");
    }

    return payload;
  }

  return {
    buildControlStatus,
    buildControlAuthority,
    networkPolicySnapshot,
    workspaceIndexStatus,
    colonyMemoryStatus,
    buildInboxPayload,
    buildMobileSession,
    buildMobileSettings,
    buildMobileBootstrap,
    buildMqttStatusSummary,
    buildHealthPayload
  };
}

module.exports = {
  createCompat4781SummaryBuilders
};
