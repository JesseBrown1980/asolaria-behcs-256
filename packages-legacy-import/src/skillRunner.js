const fs = require("fs");
const path = require("path");
const { getSkillDefinition } = require("./skillRegistry");
const { loadSkill } = require("./skill-aso-loader");
const { evaluateRisk } = require("./riskEngine");
const { resolveToolPaths } = require("./connectors/systemPaths");
const { getGoogleIntegrationStatus } = require("./connectors/googleConnector");
const { getGcpConfigSummary, listEnabledServices } = require("./connectors/gcpConnector");
const { getVertexConfigSummary, getVertexBudgetStatus } = require("./connectors/vertexConnector");
const { getGeminiApiConfigSummary } = require("./connectors/geminiApiConnector");
const { invokeDesktopInput } = require("./connectors/desktopControlConnector");
const {
  captureDesktopSnapshot,
  safeDesktopFileName,
  safeCaptureTag,
  captureDesktopLayoutAndWindow
} = require("./connectors/desktopCaptureConnector");
const {
  getCapturesPolicy,
  collectCapturesStats,
  pruneDesktopAutoCaptures,
  pruneImportantCaptures,
  pruneTrashCaptures,
  markCaptureImportant
} = require("./connectors/capturesConnector");
const { runUiVisualAudit } = require("./connectors/uiVisualAuditConnector");
const { runPhoneBrowserHistoryCheck } = require("./connectors/phoneBrowserHistoryConnector");
const { launchChromeUrl, listManagedChromeProfiles, listManagedChromeProfilesWithExtension } = require("./connectors/chromeConnector");
const { inspectPage, runBrowserTask } = require("./connectors/screenshotConnector");
const {
  buildMistakeAvoidanceHints,
  getMistakePatternSummary
} = require("./mistakePatternStore");
const { generateAvatarNpcRepresentation } = require("./connectors/avatarNpcConnector");
const { generateLocalRebuildPlan } = require("./connectors/localRebuildConnector");
const { discoverCodexSkills } = require("./codexSkillCatalog");

const SKILL_ACTION_CATALOG = Object.freeze([
  { action: "tools_status", title: "Tools status", description: "Show local tool path detection, OpenClaw mode, swarm mode, and mistake-taxonomy flags.", permissions: [] },
  { action: "swarm_mode_status", title: "Swarm mode status", description: "Show whether swarm mode is enabled and summarize colony/watchdog status.", permissions: ["swarm.read"] },
  { action: "mistake_avoidance_hints", title: "Mistake avoidance hints", description: "Return compact numbered mistake-avoidance hints for tool/skill/activity context.", permissions: ["mistakes.read"] },
  { action: "local_rebuild_plan", title: "Local rebuild plan", description: "Analyze local evidence and produce a secure local-first rebuild blueprint.", permissions: ["analysis.read"] },
  { action: "codex_skill_reference", title: "Codex skill reference", description: "Expose metadata for a Codex wrapper skill.", permissions: [] },
  { action: "google_status", title: "Google status", description: "Show Google connector integration status.", permissions: ["google.read"] },
  { action: "gcp_status", title: "GCP status", description: "Show Google Cloud policy/config summary.", permissions: ["gcp.read"] },
  { action: "gcp_services_enabled", title: "GCP enabled services", description: "List enabled services for a project.", permissions: ["gcp.read"] },
  { action: "vertex_status", title: "Vertex status", description: "Show Vertex configuration summary.", permissions: ["vertex.read"] },
  { action: "vertex_budget_status", title: "Vertex budget status", description: "Show Vertex budget guardrail usage.", permissions: ["vertex.read"] },
  { action: "gemini_api_status", title: "Gemini API status", description: "Show Gemini API connector summary.", permissions: ["gemini.read"] },
  { action: "avatar_npc_generate", title: "Avatar NPC generate", description: "Generate a measurement-specific, business-attire NPC avatar package and optional web-API render call.", permissions: ["avatar.generate", "web.run"] },
  { action: "captures_stats", title: "Capture stats", description: "Show captures policy and usage stats.", permissions: ["desktop.read"] },
  { action: "captures_prune", title: "Capture prune", description: "Prune desktop auto-captures, important, and trash folders.", permissions: ["desktop.write"] },
  { action: "captures_mark_important", title: "Mark capture important", description: "Promote a capture into important folder.", permissions: ["desktop.write"] },
  { action: "desktop_window_list", title: "Desktop window list", description: "List windows visible to desktop control bridge.", permissions: ["desktop.read"] },
  { action: "desktop_window_active", title: "Desktop active window", description: "Read current active window info.", permissions: ["desktop.read"] },
  { action: "desktop_window_focus", title: "Desktop focus window", description: "Bring a window to foreground.", permissions: ["desktop.control"] },
  { action: "desktop_click", title: "Desktop click", description: "Send mouse click to desktop.", permissions: ["desktop.control"] },
  { action: "desktop_double_click", title: "Desktop double click", description: "Send double click to desktop.", permissions: ["desktop.control"] },
  { action: "desktop_scroll", title: "Desktop scroll", description: "Send mouse wheel action to desktop.", permissions: ["desktop.control"] },
  { action: "desktop_type", title: "Desktop type", description: "Type text in focused window.", permissions: ["desktop.control"] },
  { action: "desktop_key", title: "Desktop key", description: "Send keyboard key chord to focused window.", permissions: ["desktop.control"] },
  { action: "desktop_move", title: "Desktop move mouse", description: "Move pointer to target coordinates.", permissions: ["desktop.control"] },
  { action: "desktop_capture", title: "Desktop capture", description: "Capture one screen or all screens.", permissions: ["desktop.read", "desktop.capture"] },
  { action: "desktop_dual_capture", title: "Desktop dual capture", description: "Capture full layout and focused window evidence.", permissions: ["desktop.read", "desktop.capture"] },
  { action: "ui_visual_audit", title: "UI visual audit", description: "Run browser/device visual audit flow.", permissions: ["web.read"] },
  { action: "phone_browser_history_check", title: "Phone browser history check", description: "Collect phone browser history with optional screenshot.", permissions: ["phone.read"] },
  { action: "chrome_profiles_list", title: "Chrome profiles list", description: "List managed Chrome profiles and resolved default profile.", permissions: ["chrome.read"] },
  { action: "chrome_open_url", title: "Chrome open URL", description: "Open URL in managed Chrome profile (defaults to plasmatoid).", permissions: ["chrome.open"] },
  { action: "contactout_status", title: "ContactOut status", description: "List ContactOut-enabled Chrome profiles and free-tier browser integration status.", permissions: ["chrome.read"] },
  { action: "contactout_open", title: "ContactOut open", description: "Open ContactOut in one or all Chrome profiles that have the extension installed.", permissions: ["chrome.open"] },
  { action: "web_mcp_inspect", title: "Web MCP inspect", description: "Headless page inspect without screenshot dependency.", permissions: ["web.read", "mcp.web"] },
  { action: "web_mcp_task", title: "Web MCP task", description: "Run constrained headless browser steps and return extracted data.", permissions: ["web.run", "mcp.web"] }
]);

const CONTACTOUT_EXTENSION_ID = "jjdemeiffadmmjhkbbpglgnlgeafomjo";
const CONTACTOUT_DEFAULT_URL = "https://contactout.com/login";

function getSkillActionCatalog() {
  return SKILL_ACTION_CATALOG.map((entry) => {
    const risk = evaluateRisk({ action: entry.action, message: entry.description || "" });
    return {
      action: entry.action,
      title: entry.title,
      description: entry.description,
      permissions: Array.isArray(entry.permissions) ? entry.permissions.slice(0, 24) : [],
      riskLevel: risk.level,
      riskScore: risk.score
    };
  });
}

function normalizeStepPayload(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (Array.isArray(payload)) return {};
  return payload;
}

function normalizeLabelList(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    const label = String(raw || "").trim().toLowerCase();
    if (!label) continue;
    if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(label)) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function normalizeStepAction(action) {
  const value = String(action || "").trim().toLowerCase();
  if (!value) return "";
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(value)) return "";
  return value;
}

function normalizeInput(input) {
  if (input === undefined || input === null) return {};
  if (typeof input === "string") return { text: input };
  if (typeof input === "number" || typeof input === "boolean") return { value: input };
  if (typeof input === "object" && !Array.isArray(input)) return input;
  return { value: input };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalBool(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return undefined;
}

function normalizeDesktopPoint(payload = {}) {
  const xNormRaw = Number(payload.xNorm);
  const yNormRaw = Number(payload.yNorm);
  const hasNorm = Number.isFinite(xNormRaw) && Number.isFinite(yNormRaw);
  if (hasNorm) {
    return {
      xNorm: clampFloat(xNormRaw, 0.5, 0, 1),
      yNorm: clampFloat(yNormRaw, 0.5, 0, 1)
    };
  }

  const xRaw = Number(payload.x);
  const yRaw = Number(payload.y);
  const hasAbsolute = Number.isFinite(xRaw) && Number.isFinite(yRaw);
  if (hasAbsolute) {
    return {
      x: clampInt(xRaw, 0, 0, 32767),
      y: clampInt(yRaw, 0, 0, 32767)
    };
  }

  return {};
}

function defaultGcpProject(policies = {}) {
  try {
    const summary = getGcpConfigSummary(policies.gcp || {});
    return summary.defaultProject || summary.projectId || "";
  } catch (_error) {
    return "";
  }
}

function resolveCodexReferenceMetadata(payload = {}) {
  const codexId = String(payload.codexId || payload.id || "").trim().toLowerCase();
  const codexName = String(payload.codexName || payload.name || "").trim();
  const relativePath = String(payload.relativePath || "").trim();
  const scope = String(payload.scope || "").trim().toLowerCase() || "custom";
  const wrapperSkillId = String(payload.wrapperSkillId || "").trim().toLowerCase();
  const integration = String(payload.integration || "").trim().toLowerCase() || "wrapper";
  const labels = normalizeLabelList(payload.labels);

  let resolved = null;
  try {
    const catalog = discoverCodexSkills();
    const relativePathKey = relativePath.toLowerCase();
    const items = Array.isArray(catalog.items) ? catalog.items : [];
    resolved = (wrapperSkillId
      ? items.find((item) => String(item.wrapperSkillId || "").trim().toLowerCase() === wrapperSkillId)
      : null)
      || (relativePathKey
        ? items.find((item) => String(item.relativePath || "").trim().toLowerCase() === relativePathKey)
        : null)
      || (codexId
        ? items.find((item) => String(item.id || "").trim().toLowerCase() === codexId)
        : null)
      || (codexId
        ? items.find((item) => path.basename(String(item.relativePath || "")).trim().toLowerCase() === codexId)
        : null)
      || null;
  } catch (_) {
    resolved = null;
  }

  const fullPath = String(resolved?.fullPath || "").trim();
  const pathExists = Boolean(fullPath) && fs.existsSync(fullPath);

  return {
    codexId: String(resolved?.id || codexId || "").trim().toLowerCase(),
    codexName: String(resolved?.name || codexName || "").trim(),
    relativePath: String(resolved?.relativePath || relativePath || "").trim(),
    fullPath,
    scope: String(resolved?.scope || scope).trim().toLowerCase() || "custom",
    wrapperSkillId: String(resolved?.wrapperSkillId || wrapperSkillId || "").trim().toLowerCase(),
    integration,
    labels: Array.isArray(resolved?.labels) && resolved.labels.length > 0 ? resolved.labels.slice(0, 24) : labels,
    pathExists,
    hasSkillMarkdown: pathExists ? fs.existsSync(path.join(fullPath, "SKILL.md")) : false
  };
}

async function runStep(action, payload, context) {
  const policies = context?.policies || {};
  const settings = context?.settings || {};

  switch (action) {
    case "tools_status": {
      const hintsMax = Math.max(1, Number(settings.mistakeTaxonomyHintsMax || settings.mistakeHintsMax || 8));
      return {
        toolPaths: resolveToolPaths(),
        swarmModeEnabled: Boolean(settings.swarmModeEnabled),
        mistakeTaxonomyEnabled: Boolean(settings.mistakeTaxonomyEnabled),
        mistakeTaxonomyHintsMax: hintsMax,
        mistakeHintsMax: hintsMax,
        mistakeTaxonomySummary: getMistakePatternSummary().counts || {
          total: 0,
          active: 0,
          archived: 0,
          obsolete: 0
        }
      };
    }
    case "swarm_mode_status": {
      const hintsMax = Math.max(1, Number(settings.mistakeTaxonomyHintsMax || settings.mistakeHintsMax || 8));
      return {
        enabled: Boolean(settings.swarmModeEnabled),
        mode: settings.swarmModeEnabled ? "enabled" : "disabled",
        autoDispatch: Boolean(settings.swarmModeAutoDispatch),
        mistakeTaxonomyEnabled: Boolean(settings.mistakeTaxonomyEnabled),
        mistakeTaxonomyHintsMax: hintsMax,
        mistakeHintsMax: hintsMax,
        summary: getMistakePatternSummary()
      };
    }
    case "mistake_avoidance_hints": {
      const limit = clampInt(
        payload.limit,
        Math.max(1, Number(settings.mistakeTaxonomyHintsMax || settings.mistakeHintsMax || 8)),
        1,
        24
      );
      return buildMistakeAvoidanceHints({
        status: String(payload.status || "active").trim().toLowerCase() || "active",
        skillId: payload.skillId || payload.skill || "",
        toolId: payload.toolId || payload.tool || "",
        activityType: payload.activityType || payload.activity || "",
        limit
      });
    }
    case "local_rebuild_plan": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const evidencePaths = Array.isArray(payload.evidencePaths)
        ? payload.evidencePaths
        : Array.isArray(input.evidencePaths)
          ? input.evidencePaths
          : [];
      const planInput = {
        ...payload,
        ...input,
        appName: payload.appName || input.appName || payload.target || input.target || "",
        objective: payload.objective || input.objective || "",
        evidencePaths,
        evidenceText: payload.evidenceText || input.evidenceText || input.text || payload.text || "",
        reportTag: payload.reportTag || input.reportTag || payload.tag || input.tag || "",
        persistReport: payload.persistReport !== undefined ? payload.persistReport : input.persistReport
      };
      return generateLocalRebuildPlan(planInput);
    }
    case "codex_skill_reference": {
      const resolved = resolveCodexReferenceMetadata(payload);
      return {
        source: "codex",
        integration: resolved.integration,
        codex: {
          id: resolved.codexId,
          name: resolved.codexName,
          scope: resolved.scope,
          relativePath: resolved.relativePath,
          fullPath: resolved.fullPath,
          labels: resolved.labels
        },
        wrapper: {
          skillId: resolved.wrapperSkillId
        },
        localState: {
          pathProvided: Boolean(resolved.fullPath),
          pathExists: resolved.pathExists,
          hasSkillMarkdown: resolved.hasSkillMarkdown
        }
      };
    }
    case "google_status": {
      return getGoogleIntegrationStatus(policies.google || {});
    }
    case "gcp_status": {
      return getGcpConfigSummary(policies.gcp || {});
    }
    case "gcp_services_enabled": {
      const project = String(payload.project || payload.projectId || payload.projectNumber || "").trim()
        || defaultGcpProject(policies);
      return listEnabledServices({
        project,
        pageSize: payload.pageSize
      }, policies.gcp || {});
    }
    case "vertex_status": {
      return getVertexConfigSummary(policies.vertex || {});
    }
    case "vertex_budget_status": {
      return getVertexBudgetStatus(policies.vertex || {});
    }
    case "gemini_api_status": {
      return getGeminiApiConfigSummary(policies.geminiApi || {});
    }
    case "avatar_npc_generate": {
      const inputSource = context?.input && typeof context.input === "object" ? context.input : {};
      const mergedMeasurements = {
        ...(payload.measurements && typeof payload.measurements === "object" ? payload.measurements : {}),
        ...(inputSource.measurements && typeof inputSource.measurements === "object" ? inputSource.measurements : {})
      };
      const mergedPhysics = {
        ...(payload.physics && typeof payload.physics === "object" ? payload.physics : {}),
        ...(inputSource.physics && typeof inputSource.physics === "object" ? inputSource.physics : {})
      };
      const mergedOutfit = {
        ...(payload.outfit && typeof payload.outfit === "object" ? payload.outfit : {}),
        ...(inputSource.outfit && typeof inputSource.outfit === "object" ? inputSource.outfit : {})
      };
      const mergedFace = {
        ...(payload.face && typeof payload.face === "object" ? payload.face : {}),
        ...(inputSource.face && typeof inputSource.face === "object" ? inputSource.face : {})
      };
      const request = {
        ...payload,
        ...inputSource,
        measurements: mergedMeasurements,
        physics: mergedPhysics,
        outfit: mergedOutfit,
        face: mergedFace
      };
      return generateAvatarNpcRepresentation(request);
    }
    case "captures_stats": {
      const policy = getCapturesPolicy();
      return {
        policy,
        stats: collectCapturesStats(policy)
      };
    }
    case "captures_prune": {
      const keep = clampInt(payload.keep, undefined, 0, 50000);
      const minAgeMinutes = clampInt(payload.minAgeMinutes, undefined, 0, 24 * 60);
      const pruneMode = String(payload.pruneMode || "").trim().toLowerCase();
      const dryRun = Boolean(payload.dryRun);
      const protectedAbsPaths = Array.isArray(payload.protectedAbsPaths)
        ? payload.protectedAbsPaths.map((p) => String(p || "")).filter(Boolean).slice(0, 24)
        : [];

      const desktop = pruneDesktopAutoCaptures({
        keep: Number.isFinite(Number(payload.keep)) ? keep : undefined,
        minAgeMinutes: Number.isFinite(Number(payload.minAgeMinutes)) ? minAgeMinutes : undefined,
        pruneMode: pruneMode === "trash" ? "trash" : pruneMode === "delete" ? "delete" : undefined,
        dryRun,
        protectedAbsPaths
      });
      const important = pruneImportantCaptures({ dryRun });
      const trash = pruneTrashCaptures({ dryRun });
      return {
        ok: Boolean(desktop.ok && important.ok && trash.ok),
        desktop,
        important,
        trash
      };
    }
    case "captures_mark_important": {
      const capturePath = String(payload.capturePath || payload.path || "").trim();
      if (!capturePath) {
        throw new Error("captures_mark_important requires capturePath.");
      }
      return markCaptureImportant({
        capturePath,
        note: payload.note,
        sensitive: Boolean(payload.sensitive)
      });
    }
    case "desktop_window_list": {
      const limit = clampInt(payload.limit, 16, 1, 80);
      const timeoutMs = clampInt(payload.timeoutMs, 9000, 2500, 30000);
      const displayIndex = clampInt(payload.displayIndex, -1, -1, 16);
      return invokeDesktopInput({
        action: "window_list",
        limit,
        timeoutMs,
        displayIndex
      });
    }
    case "desktop_window_active": {
      const timeoutMs = clampInt(payload.timeoutMs, 9000, 2500, 30000);
      const displayIndex = clampInt(payload.displayIndex, -1, -1, 16);
      return invokeDesktopInput({
        action: "window_active",
        timeoutMs,
        displayIndex
      });
    }
    case "desktop_window_focus": {
      const timeoutMs = clampInt(payload.timeoutMs, 12000, 2500, 30000);
      const windowId = clampInt(payload.windowId, 0, 0, 2000000000);
      const windowTitle = String(payload.windowTitle || "").trim().slice(0, 240);
      if (!windowId && !windowTitle) {
        throw new Error("desktop_window_focus requires windowId or windowTitle.");
      }
      return invokeDesktopInput({
        action: "window_focus",
        timeoutMs,
        windowId,
        windowTitle
      });
    }
    case "desktop_click": {
      const timeoutMs = clampInt(payload.timeoutMs, 12000, 2500, 30000);
      const displayIndex = clampInt(payload.displayIndex, -1, -1, 16);
      const button = String(payload.button || "left").trim().toLowerCase();
      const point = normalizeDesktopPoint(payload);
      if (!Object.keys(point).length) {
        throw new Error("desktop_click requires xNorm/yNorm or x/y.");
      }
      return invokeDesktopInput({
        action: "click",
        timeoutMs,
        displayIndex,
        button,
        ...point
      });
    }
    case "desktop_double_click": {
      const timeoutMs = clampInt(payload.timeoutMs, 12000, 2500, 30000);
      const displayIndex = clampInt(payload.displayIndex, -1, -1, 16);
      const button = String(payload.button || "left").trim().toLowerCase();
      const point = normalizeDesktopPoint(payload);
      if (!Object.keys(point).length) {
        throw new Error("desktop_double_click requires xNorm/yNorm or x/y.");
      }
      return invokeDesktopInput({
        action: "double_click",
        timeoutMs,
        displayIndex,
        button,
        ...point
      });
    }
    case "desktop_scroll": {
      const timeoutMs = clampInt(payload.timeoutMs, 12000, 2500, 30000);
      const displayIndex = clampInt(payload.displayIndex, -1, -1, 16);
      const wheelDelta = clampInt(payload.wheelDelta, -360, -2400, 2400);
      const point = normalizeDesktopPoint(payload);
      return invokeDesktopInput({
        action: "scroll",
        timeoutMs,
        displayIndex,
        wheelDelta,
        ...point
      });
    }
    case "desktop_type": {
      const timeoutMs = clampInt(payload.timeoutMs, 12000, 2500, 30000);
      const text = String(payload.text || "").slice(0, 2400);
      if (!text) {
        throw new Error("desktop_type requires text.");
      }
      return invokeDesktopInput({
        action: "type",
        timeoutMs,
        text
      });
    }
    case "desktop_key": {
      const timeoutMs = clampInt(payload.timeoutMs, 12000, 2500, 30000);
      const key = String(payload.key || "").trim().slice(0, 80);
      if (!key) {
        throw new Error("desktop_key requires key.");
      }
      return invokeDesktopInput({
        action: "key",
        timeoutMs,
        key
      });
    }
    case "desktop_move": {
      const timeoutMs = clampInt(payload.timeoutMs, 12000, 2500, 30000);
      const displayIndex = clampInt(payload.displayIndex, -1, -1, 16);
      const point = normalizeDesktopPoint(payload);
      if (!Object.keys(point).length) {
        throw new Error("desktop_move requires xNorm/yNorm or x/y.");
      }
      return invokeDesktopInput({
        action: "move",
        timeoutMs,
        displayIndex,
        ...point
      });
    }
    case "desktop_capture": {
      const timeoutMs = clampInt(payload.timeoutMs, 25000, 5000, 120000);
      const screenIndex = clampInt(payload.screenIndex, -1, -1, 16);
      const captureAll = Boolean(payload.captureAll);
      const fileName = safeDesktopFileName(String(payload.fileName || "").trim(), "desktop");
      return captureDesktopSnapshot({
        fileName,
        timeoutMs,
        screenIndex,
        captureAll
      });
    }
    case "desktop_dual_capture": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const timeoutSource = input.timeoutMs !== undefined ? input.timeoutMs : payload.timeoutMs;
      const tagSource = input.tag !== undefined ? input.tag : payload.tag;
      const windowIdSource = input.windowId !== undefined ? input.windowId : payload.windowId;
      const windowTitleSource = input.windowTitle !== undefined ? input.windowTitle : payload.windowTitle;
      const includeVirtualDesktopSource = input.includeVirtualDesktop !== undefined
        ? input.includeVirtualDesktop
        : payload.includeVirtualDesktop;
      const skipPerScreenSource = input.skipPerScreen !== undefined
        ? input.skipPerScreen
        : payload.skipPerScreen;
      const timeoutMs = clampInt(timeoutSource, 45000, 5000, 180000);
      const tag = safeCaptureTag(String(tagSource || "").trim(), "dual-capture");
      const windowId = clampInt(windowIdSource, 0, 0, 2000000000);
      const windowTitle = String(windowTitleSource || "").trim().slice(0, 240);
      const includeVirtualDesktop = parseOptionalBool(includeVirtualDesktopSource);
      const skipPerScreen = Boolean(skipPerScreenSource);
      return captureDesktopLayoutAndWindow({
        timeoutMs,
        tag,
        windowId,
        windowTitle,
        includeVirtualDesktop: includeVirtualDesktop !== false,
        skipPerScreen
      });
    }
    case "ui_visual_audit": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const baseUrl = String(
        payload.baseUrl
        || payload.url
        || input.baseUrl
        || input.url
        || ""
      ).trim();
      const includeLocalWindows = parseOptionalBool(
        payload.includeLocalWindows !== undefined
          ? payload.includeLocalWindows
          : input.includeLocalWindows
      );
      const includePinchZoom = parseOptionalBool(
        payload.includePinchZoom !== undefined
          ? payload.includePinchZoom
          : input.includePinchZoom
      );
      const timeoutMs = clampInt(
        payload.timeoutMs !== undefined ? payload.timeoutMs : input.timeoutMs,
        15 * 60 * 1000,
        60 * 1000,
        60 * 60 * 1000
      );
      return runUiVisualAudit({
        baseUrl,
        includeLocalWindows,
        includePinchZoom,
        timeoutMs
      });
    }
    case "phone_browser_history_check": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const maxEntries = clampInt(
        payload.maxEntries !== undefined ? payload.maxEntries : input.maxEntries,
        40,
        1,
        200
      );
      const includeScreenshot = parseOptionalBool(
        payload.includeScreenshot !== undefined
          ? payload.includeScreenshot
          : input.includeScreenshot
      );
      const strategy = String(
        payload.strategy !== undefined
          ? payload.strategy
          : (input.strategy !== undefined ? input.strategy : "")
      ).trim().toLowerCase();
      const costMode = String(
        payload.costMode !== undefined
          ? payload.costMode
          : (input.costMode !== undefined ? input.costMode : settings.costMode || "")
      ).trim().toLowerCase();
      const deviceId = String(payload.deviceId || input.deviceId || "").trim();
      return runPhoneBrowserHistoryCheck({
        maxEntries,
        includeScreenshot,
        strategy,
        costMode,
        deviceId
      });
    }
    case "chrome_profiles_list": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const limit = clampInt(
        payload.limit !== undefined ? payload.limit : input.limit,
        50,
        1,
        200
      );
      const includeRestricted = parseOptionalBool(
        payload.includeRestricted !== undefined
          ? payload.includeRestricted
          : input.includeRestricted
      ) === true;
      const profileEmail = String(payload.profileEmail || input.profileEmail || "").trim();
      const profileDirectory = String(payload.profileDirectory || input.profileDirectory || "").trim();
      const listing = listManagedChromeProfiles({
        includeRestricted,
        profileEmail,
        profileDirectory
      });
      return {
        ...listing,
        profiles: Array.isArray(listing.profiles) ? listing.profiles.slice(0, limit) : []
      };
    }
    case "chrome_open_url": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      if (settings.stealthMode) {
        throw new Error("chrome_open_url is blocked while stealthMode is enabled. Use web_mcp_inspect or web_mcp_task.");
      }
      const url = String(
        payload.url
        || payload.target
        || input.url
        || input.target
        || ""
      ).trim();
      if (!url) {
        throw new Error("chrome_open_url requires url.");
      }
      const isolatedProfile = parseOptionalBool(
        payload.isolatedProfile !== undefined
          ? payload.isolatedProfile
          : input.isolatedProfile
      ) === true;
      const profileName = String(payload.profileName || input.profileName || "asolaria-visible-open").trim();
      const profileDirectory = String(payload.profileDirectory || input.profileDirectory || "").trim();
      const profileEmail = String(payload.profileEmail || input.profileEmail || "").trim();
      const allowRestrictedProfile = parseOptionalBool(
        payload.allowRestrictedProfile !== undefined
          ? payload.allowRestrictedProfile
          : input.allowRestrictedProfile
      ) === true;
      const appMode = parseOptionalBool(
        payload.appMode !== undefined
          ? payload.appMode
          : input.appMode
      ) === true;
      const newWindow = parseOptionalBool(
        payload.newWindow !== undefined
          ? payload.newWindow
          : input.newWindow
      ) !== false;
      const disableTranslate = parseOptionalBool(
        payload.disableTranslate !== undefined
          ? payload.disableTranslate
          : input.disableTranslate
      );
      const launchOptions = {
        appMode,
        newWindow,
        isolatedProfile,
        profileName
      };
      if (disableTranslate !== undefined) {
        launchOptions.disableTranslate = disableTranslate;
      }
      if (!isolatedProfile) {
        launchOptions.useManagedProfile = true;
        if (profileDirectory) {
          launchOptions.profileDirectory = profileDirectory;
        }
        if (profileEmail) {
          launchOptions.profileEmail = profileEmail;
        } else if (!profileDirectory) {
          launchOptions.profileEmail = "plasmatoid@gmail.com";
        }
        launchOptions.allowRestrictedProfile = allowRestrictedProfile;
      }
      const launched = launchChromeUrl(url, launchOptions);
      return {
        ...launched,
        mode: isolatedProfile ? "isolated" : "managed"
      };
    }
    case "contactout_status": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const includeRestricted = parseOptionalBool(
        payload.includeRestricted !== undefined
          ? payload.includeRestricted
          : input.includeRestricted
      ) === true;
      const listing = listManagedChromeProfilesWithExtension({
        includeRestricted,
        extensionId: CONTACTOUT_EXTENSION_ID
      });
      return {
        enabled: true,
        freeOnly: true,
        integrationMode: "browser_extension",
        apiSupported: false,
        extensionId: CONTACTOUT_EXTENSION_ID,
        defaultUrl: CONTACTOUT_DEFAULT_URL,
        userDataPath: listing.userDataPath,
        matchedCount: Number(listing.matchedCount || 0),
        profiles: Array.isArray(listing.matchedProfiles)
          ? listing.matchedProfiles.map((entry) => ({
            directory: String(entry.directory || ""),
            displayName: String(entry.displayName || ""),
            email: String(entry.email || ""),
            restricted: Boolean(entry.restricted),
            extensions: Array.isArray(entry.extensions) ? entry.extensions.map((ext) => ({
              id: String(ext.id || ""),
              name: String(ext.name || ""),
              version: String(ext.version || ""),
              enabled: Boolean(ext.enabled)
            })) : []
          }))
          : []
      };
    }
    case "contactout_open": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      if (settings.stealthMode) {
        throw new Error("contactout_open is blocked while stealthMode is enabled. Use chrome_open_url or disable stealthMode.");
      }
      const url = String(
        payload.url
        || payload.target
        || input.url
        || input.target
        || CONTACTOUT_DEFAULT_URL
      ).trim() || CONTACTOUT_DEFAULT_URL;
      const requestedDirectory = String(payload.profileDirectory || input.profileDirectory || "").trim();
      const requestedEmail = String(payload.profileEmail || input.profileEmail || "").trim().toLowerCase();
      const allProfiles = parseOptionalBool(
        payload.allProfiles !== undefined
          ? payload.allProfiles
          : input.allProfiles
      ) === true;
      const includeRestricted = parseOptionalBool(
        payload.includeRestricted !== undefined
          ? payload.includeRestricted
          : input.includeRestricted
      ) === true;
      const listing = listManagedChromeProfilesWithExtension({
        includeRestricted,
        extensionId: CONTACTOUT_EXTENSION_ID
      });
      let targets = Array.isArray(listing.matchedProfiles) ? listing.matchedProfiles.slice(0) : [];
      if (requestedDirectory) {
        targets = targets.filter((entry) => String(entry.directory || "").trim().toLowerCase() === requestedDirectory.toLowerCase());
      }
      if (requestedEmail) {
        targets = targets.filter((entry) => String(entry.email || "").trim().toLowerCase() === requestedEmail);
      }
      if (!targets.length) {
        throw new Error("No ContactOut-enabled Chrome profiles matched the requested account/profile.");
      }
      if (!allProfiles) {
        targets = [targets[0]];
      }
      const launches = targets.map((target) => launchChromeUrl(url, {
        isolatedProfile: false,
        newWindow: parseOptionalBool(
          payload.newWindow !== undefined
            ? payload.newWindow
            : input.newWindow
        ) !== false,
        appMode: parseOptionalBool(
          payload.appMode !== undefined
            ? payload.appMode
            : input.appMode
        ) === true,
        profileDirectory: String(target.directory || "").trim(),
        profileEmail: String(target.email || "").trim(),
        allowRestrictedProfile: Boolean(target.restricted)
      }));
      return {
        enabled: true,
        freeOnly: true,
        integrationMode: "browser_extension",
        extensionId: CONTACTOUT_EXTENSION_ID,
        launches
      };
    }
    case "web_mcp_inspect": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const url = String(
        payload.url
        || payload.target
        || input.url
        || input.target
        || ""
      ).trim();
      if (!url) {
        throw new Error("web_mcp_inspect requires url.");
      }
      const waitMs = clampInt(
        payload.waitMs !== undefined ? payload.waitMs : input.waitMs,
        1200,
        0,
        15000
      );
      const maxChars = clampInt(
        payload.maxChars !== undefined ? payload.maxChars : input.maxChars,
        24000,
        2000,
        120000
      );
      const maxLinks = clampInt(
        payload.maxLinks !== undefined ? payload.maxLinks : input.maxLinks,
        40,
        5,
        120
      );
      return inspectPage({
        url,
        waitMs,
        maxChars,
        maxLinks
      });
    }
    case "web_mcp_task": {
      const input = context?.input && typeof context.input === "object" ? context.input : {};
      const url = String(
        payload.url
        || payload.target
        || input.url
        || input.target
        || ""
      ).trim();
      if (!url) {
        throw new Error("web_mcp_task requires url.");
      }
      const steps = Array.isArray(payload.steps)
        ? payload.steps
        : Array.isArray(input.steps)
          ? input.steps
          : [];
      if (!steps.length) {
        throw new Error("web_mcp_task requires at least one step.");
      }
      const waitMs = clampInt(
        payload.waitMs !== undefined ? payload.waitMs : input.waitMs,
        900,
        0,
        12000
      );
      const maxChars = clampInt(
        payload.maxChars !== undefined ? payload.maxChars : input.maxChars,
        24000,
        2000,
        120000
      );
      const maxLinks = clampInt(
        payload.maxLinks !== undefined ? payload.maxLinks : input.maxLinks,
        40,
        5,
        120
      );
      const actionTimeoutMs = clampInt(
        payload.actionTimeoutMs !== undefined ? payload.actionTimeoutMs : input.actionTimeoutMs,
        12000,
        1000,
        45000
      );
      const maxSteps = clampInt(
        payload.maxSteps !== undefined ? payload.maxSteps : input.maxSteps,
        20,
        1,
        40
      );
      const allowLoopback = parseOptionalBool(
        payload.allowLoopback !== undefined
          ? payload.allowLoopback
          : input.allowLoopback
      );
      const allowPrivateNetwork = parseOptionalBool(
        payload.allowPrivateNetwork !== undefined
          ? payload.allowPrivateNetwork
          : input.allowPrivateNetwork
      );
      const allowedHosts = Array.isArray(payload.allowedHosts)
        ? payload.allowedHosts
        : Array.isArray(input.allowedHosts)
          ? input.allowedHosts
          : [];
      return runBrowserTask({
        url,
        steps,
        waitMs,
        maxChars,
        maxLinks,
        actionTimeoutMs,
        maxSteps,
        allowLoopback,
        allowPrivateNetwork,
        allowedHosts
      });
    }
    default: {
      throw new Error(`Unsupported skill step action: ${action}`);
    }
  }
}

function compareRiskLevels(left, right) {
  const order = ["low", "medium", "high", "critical"];
  const l = order.indexOf(String(left || "low"));
  const r = order.indexOf(String(right || "low"));
  return Math.max(0, l) >= Math.max(0, r) ? left : right;
}

async function runSkill(skillId, input, context) {
  const skill = getSkillDefinition(skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${String(skillId || "").trim() || "(missing id)"}`);
  }

  const safeInput = normalizeInput(input);
  const hooks = context?.hooks && typeof context.hooks === "object" ? context.hooks : {};
  let runtimeSkill = null;
  if (skill.sourcePath) {
    try {
      runtimeSkill = loadSkill(path.dirname(skill.sourcePath));
    } catch (_error) {
      runtimeSkill = null;
    }
  }

  const executeSkill = async () => {
    const startedAt = new Date();
    const results = [];
    let maxRiskLevel = "low";

    for (let index = 0; index < skill.steps.length; index += 1) {
      const step = skill.steps[index];
      const action = normalizeStepAction(step.action);
      if (!action) {
        throw new Error(`Invalid skill step action at index ${index}.`);
      }
      const payload = normalizeStepPayload(step.payload);
      const permissions = Array.isArray(step.permissions) ? step.permissions.slice(0, 24) : [];
      const requiresApproval = Boolean(step.requiresApproval);
      const risk = evaluateRisk({
        action,
        message: step.note || ""
      });
      if (risk.level && ["low", "medium", "high", "critical"].includes(risk.level)) {
        maxRiskLevel = compareRiskLevels(maxRiskLevel, risk.level);
      }

      const stepStartedAt = new Date();
      if (typeof hooks.beforeStep === "function") {
        await hooks.beforeStep({
          skill,
          step,
          index,
          total: skill.steps.length,
          action,
          note: String(step.note || "").trim(),
          payload,
          permissions,
          requiresApproval,
          risk,
          input: safeInput
        });
      }
      const output = await runStep(action, payload, {
        ...context,
        input: safeInput
      });
      const stepFinishedAt = new Date();
      if (typeof hooks.afterStep === "function") {
        await hooks.afterStep({
          skill,
          step,
          index,
          total: skill.steps.length,
          action,
          note: String(step.note || "").trim(),
          payload,
          permissions,
          requiresApproval,
          risk,
          input: safeInput,
          output
        });
      }
      results.push({
        index,
        action,
        note: String(step.note || "").trim(),
        permissions,
        requiresApproval,
        risk,
        startedAt: stepStartedAt.toISOString(),
        finishedAt: stepFinishedAt.toISOString(),
        elapsedMs: stepFinishedAt.getTime() - stepStartedAt.getTime(),
        output
      });
    }

    const finishedAt = new Date();
    return {
      skill: {
        id: skill.id,
        title: skill.title,
        version: skill.version,
        risk: skill.risk,
        tags: skill.tags,
        permissions: Array.isArray(skill.permissions) ? skill.permissions.slice(0, 24) : []
      },
      input: safeInput,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
      maxRiskLevel,
      aso: runtimeSkill && runtimeSkill._aso ? { ...runtimeSkill._aso } : null,
      steps: results
    };
  };

  if (runtimeSkill && typeof runtimeSkill.run === "function") {
    return runtimeSkill.run(() => executeSkill());
  }
  return executeSkill();
}

module.exports = {
  runSkill,
  getSkillActionCatalog
};
