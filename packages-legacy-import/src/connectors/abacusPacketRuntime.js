const fs = require("fs");
const path = require("path");

function createAbacusPacketRuntime(deps = {}) {
  const runtimeFs = deps.fs || fs;
  const runtimePath = deps.path || path;
  const packetRoot = deps.packetRoot || "";
  const responsePlaceholderHeading = deps.responsePlaceholderHeading || "# Abacus Response";
  const getAbacusIntegrationStatus = deps.getAbacusIntegrationStatus || (() => ({}));
  const getAbacusPacketPresets = deps.getAbacusPacketPresets || (() => []);
  const normalizeText = deps.normalizeText || ((value, maxLen = 600) => String(value || "").trim().slice(0, maxLen));
  const normalizeStringList = deps.normalizeStringList || ((value, maxItems = 12, maxLen = 260) => {
    const raw = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/\r?\n|[,;]+/g)
        : [];
    return raw
      .map((item) => normalizeText(item, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  });
  const slugifySegment = deps.slugifySegment || ((value, fallback = "work") => {
    const normalized = normalizeText(value, 120)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || fallback;
  });
  const safeReadJson = deps.safeReadJson || ((filePath, fallback = null) => {
    try {
      if (!filePath || !runtimeFs.existsSync(filePath)) return fallback;
      return JSON.parse(String(runtimeFs.readFileSync(filePath, "utf8") || ""));
    } catch (_error) {
      return fallback;
    }
  });
  const safeWriteJson = deps.safeWriteJson || ((filePath, value) => {
    ensureDir(runtimePath.dirname(filePath));
    runtimeFs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  });
  const safeWriteText = deps.safeWriteText || ((filePath, value) => {
    ensureDir(runtimePath.dirname(filePath));
    runtimeFs.writeFileSync(filePath, String(value || ""), "utf8");
  });
  const safeStat = deps.safeStat || ((filePath) => {
    try {
      if (!filePath || !runtimeFs.existsSync(filePath)) return null;
      return runtimeFs.statSync(filePath);
    } catch (_error) {
      return null;
    }
  });
  const ensureDir = deps.ensureDir || ((dirPath) => {
    if (!dirPath) return "";
    runtimeFs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  });
  const emitAbacusManifest = deps.emitAbacusManifest || (() => {});
  const emitAbacusEvent = deps.emitAbacusEvent || (() => {});
  const defaultBrowserMode = deps.defaultBrowserMode || "managed_isolated";

  function findAbacusPacketPreset(presetId) {
    const normalized = normalizeText(presetId, 120).toLowerCase();
    if (!normalized) return null;
    return getAbacusPacketPresets().find((item) => item.id === normalized) || null;
  }

  function readPacketSummary(packetDir) {
    const packetPath = runtimePath.join(packetDir, "packet.json");
    const packet = safeReadJson(packetPath, null);
    if (!packet || typeof packet !== "object") {
      return null;
    }
    const responsePath = runtimePath.join(packetDir, "response.md");
    const responseText = runtimeFs.existsSync(responsePath) ? String(runtimeFs.readFileSync(responsePath, "utf8") || "") : "";
    const responseStat = safeStat(responsePath);
    const artifactDir = runtimePath.join(packetDir, "artifacts");
    const artifactFiles = runtimeFs.existsSync(artifactDir)
      ? runtimeFs.readdirSync(artifactDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .slice(0, 20)
      : [];
    const responseReady = Boolean(responseText.trim()) && !/Pending response from Abacus/i.test(responseText);
    return {
      id: normalizeText(packet.id || runtimePath.basename(packetDir), 120),
      title: normalizeText(packet.title || "", 200),
      objective: normalizeText(packet.objective || "", 320),
      createdAt: normalizeText(packet.createdAt || "", 80),
      presetId: normalizeText(packet.presetId || "", 120),
      sensitivity: normalizeText(packet.sensitivity || "", 80),
      workerMode: normalizeText(packet.workerMode || "", 80),
      surfaceHints: normalizeStringList(packet.surfaceHints, 12, 80),
      sourceTaskId: normalizeText(packet.sourceTaskId || "", 120),
      packetDir,
      packetPath,
      promptPath: runtimePath.join(packetDir, "prompt.md"),
      responsePath,
      responseUpdatedAt: responseStat ? responseStat.mtime.toISOString() : "",
      responseReady,
      responsePreview: responseText.trim().slice(0, 240),
      artifactDir,
      artifactFiles
    };
  }

  function listAbacusWorkPackets(limit = 25) {
    const normalizedLimit = Math.max(1, Math.min(500, Number(limit || 25) || 25));
    if (!runtimeFs.existsSync(packetRoot)) {
      return {
        rootPath: packetRoot,
        exists: false,
        total: 0,
        items: []
      };
    }
    const entries = runtimeFs.readdirSync(packetRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => runtimePath.join(packetRoot, entry.name))
      .map((dirPath) => ({
        summary: readPacketSummary(dirPath),
        stat: safeStat(runtimePath.join(dirPath, "packet.json")) || safeStat(dirPath)
      }))
      .filter((entry) => entry.summary && entry.stat)
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return {
      rootPath: packetRoot,
      exists: true,
      total: entries.length,
      items: entries.slice(0, normalizedLimit).map((entry) => entry.summary)
    };
  }

  function findPacketDir(packetId) {
    const normalized = normalizeText(packetId, 200);
    if (!normalized) {
      throw new Error("packetId is required.");
    }
    const packetDir = runtimePath.join(packetRoot, normalized);
    if (!runtimeFs.existsSync(packetDir)) {
      throw new Error(`Abacus packet not found: ${normalized}`);
    }
    return packetDir;
  }

  function getAbacusWorkPacket(packetId) {
    const packetDir = findPacketDir(packetId);
    const summary = readPacketSummary(packetDir);
    if (!summary) {
      throw new Error(`Abacus packet metadata is missing: ${packetId}`);
    }
    return summary;
  }

  function renderAbacusWorkPacketPrompt(packet = {}) {
    return [
      `# Abacus Work Packet: ${packet.title || packet.id || "task"}`,
      "",
      "## Objective",
      packet.objective || "(none)",
      "",
      "## Instructions",
      packet.instructions || "(Use the objective and expected artifacts below. Ask for clarification only if blocked.)",
      "",
      ...(Array.isArray(packet.surfaceHints) && packet.surfaceHints.length > 0
        ? [
          "## Preferred Surfaces",
          ...packet.surfaceHints.map((item) => `- ${item}`),
          ""
        ]
        : []),
      "## Allowed Paths",
      ...(Array.isArray(packet.allowedPaths) && packet.allowedPaths.length > 0
        ? packet.allowedPaths.map((item) => `- ${item}`)
        : ["- No local write paths granted. Treat this as read-only unless Asolaria updates the packet."]),
      "",
      "## Expected Artifacts",
      ...(Array.isArray(packet.expectedArtifacts) && packet.expectedArtifacts.length > 0
        ? packet.expectedArtifacts.map((item) => `- ${item}`)
        : ["- Return a concise summary plus any generated files inside the allowed path."]),
      "",
      ...(Array.isArray(packet.launchChecklist) && packet.launchChecklist.length > 0
        ? [
          "## Launch Checklist",
          ...packet.launchChecklist.map((item) => `- ${item}`),
          ""
        ]
        : []),
      "",
      "## Guardrails",
      "- Do not request, reveal, or copy owner-plane secrets.",
      "- Do not pivot into personal/company accounts beyond the currently authenticated Abacus surface.",
      "- Stay inside the allowed paths and objective scope.",
      "- If blocked, return the blocker clearly instead of improvising wider access.",
      "",
      "## Metadata",
      `- Packet ID: ${packet.id || ""}`,
      `- Worker Mode: ${packet.workerMode || ""}`,
      `- Sensitivity: ${packet.sensitivity || ""}`,
      `- Created At: ${packet.createdAt || ""}`,
      packet.sourceTaskId ? `- Source Task ID: ${packet.sourceTaskId}` : "",
      packet.accountEmail ? `- Account: ${packet.accountEmail}` : ""
    ].filter(Boolean).join("\n");
  }

  function renderAbacusResponseTemplate(packet = {}) {
    return [
      responsePlaceholderHeading,
      "",
      "_Pending response from Abacus._",
      "",
      `Packet ID: ${packet.id || ""}`,
      `Created At: ${packet.createdAt || ""}`,
      "",
      "## Summary",
      "",
      "## Deliverables",
      "",
      "## Blockers",
      ""
    ].join("\n");
  }

  function ensurePacketWorkspaceScaffold(packet) {
    if (!packet || !packet.packetDir) {
      return packet;
    }
    ensureDir(runtimePath.join(packet.packetDir, "artifacts"));
    if (packet.responsePath && !runtimeFs.existsSync(packet.responsePath)) {
      safeWriteText(packet.responsePath, renderAbacusResponseTemplate(packet));
    }
    return getAbacusWorkPacket(packet.id);
  }

  function scanAbacusWorkPacket(packetId) {
    const packet = ensurePacketWorkspaceScaffold(getAbacusWorkPacket(packetId));
    const responseText = runtimeFs.existsSync(packet.responsePath)
      ? String(runtimeFs.readFileSync(packet.responsePath, "utf8") || "")
      : "";
    return {
      ...packet,
      responseText,
      responseReady: Boolean(responseText.trim()) && !/Pending response from Abacus/i.test(responseText)
    };
  }

  function writeAbacusWorkPacketResponse(packetId, responseText, options = {}) {
    const packet = ensurePacketWorkspaceScaffold(getAbacusWorkPacket(packetId));
    const normalized = String(responseText || "").trim();
    if (!normalized) {
      throw new Error("responseText is required.");
    }
    const heading = options.includeHeading === undefined || options.includeHeading === null
      ? responsePlaceholderHeading
      : options.includeHeading
        ? responsePlaceholderHeading
        : "";
    const body = [
      heading,
      heading ? "" : "",
      normalized,
      ""
    ].join("\n");
    safeWriteText(packet.responsePath, body);
    return scanAbacusWorkPacket(packetId);
  }

  function createAbacusWorkPacket(input = {}) {
    const status = getAbacusIntegrationStatus();
    const preset = findAbacusPacketPreset(input.presetId || input.preset || "");
    const title = normalizeText(
      input.title || preset?.title || input.objective || input.prompt || input.instructions || "Abacus worker task",
      200
    ) || "Abacus worker task";
    const objective = normalizeText(
      input.objective || input.prompt || input.instructions || title,
      4000
    );
    if (!objective) {
      throw new Error("objective is required.");
    }
    const createdAt = new Date().toISOString();
    const packetId = `${createdAt.replace(/[-:TZ.]/g, "").slice(0, 14)}-${slugifySegment(title, "abacus-task")}`;
    const packetDir = runtimePath.join(packetRoot, packetId);
    const packet = {
      id: packetId,
      createdAt,
      title,
      objective,
      presetId: preset?.id || "",
      instructions: normalizeText(input.instructions || preset?.instructions || input.prompt || "", 12000),
      allowedPaths: normalizeStringList(input.allowedPaths || input.paths || input.allowedFolders, 16, 320),
      surfaceHints: normalizeStringList(input.surfaceHints || input.preferredSurfaces || preset?.surfaceHints, 12, 80),
      expectedArtifacts: normalizeStringList(
        input.expectedArtifacts || input.outputs || input.expectedOutputs || preset?.expectedArtifacts,
        16,
        320
      ),
      launchChecklist: normalizeStringList(input.launchChecklist || preset?.launchChecklist, 12, 220),
      sensitivity: normalizeText(input.sensitivity || preset?.sensitivity || "sanitized", 80).toLowerCase() || "sanitized",
      workerMode: normalizeText(input.workerMode || input.surfacePreference || preset?.workerMode || "desktop_packet", 80).toLowerCase() || "desktop_packet",
      sourceTaskId: normalizeText(input.sourceTaskId || input.taskLedgerTaskId || input.taskId || "", 120),
      threadId: normalizeText(input.threadId || "", 120),
      accountEmail: status.accountEmail || "",
      browserMode: status.browserMode || defaultBrowserMode
    };
    const promptPath = runtimePath.join(packetDir, "prompt.md");
    const responsePath = runtimePath.join(packetDir, "response.md");
    ensureDir(packetDir);
    safeWriteJson(runtimePath.join(packetDir, "packet.json"), packet);
    safeWriteText(promptPath, renderAbacusWorkPacketPrompt(packet));
    ensureDir(runtimePath.join(packetDir, "artifacts"));
    safeWriteText(responsePath, renderAbacusResponseTemplate(packet));

    emitAbacusManifest("abacus_handoff", "queued", status, {
      target: {
        type: "worker_packet",
        id: packet.id,
        label: packet.title,
        domain: "local",
        criticality: "medium"
      },
      reason: "Created an Abacus work packet for bounded external-worker execution.",
      evidence: {
        packetDir,
        promptPath,
        workerMode: packet.workerMode,
        sensitivity: packet.sensitivity
      }
    });
    emitAbacusEvent("abacus_handoff_packet_created", status, {
      category: "worker_packet",
      target: {
        type: "worker_packet",
        id: packet.id,
        label: packet.title,
        domain: "local",
        criticality: "medium"
      },
      detail: {
        packetDir,
        promptPath,
        workerMode: packet.workerMode,
        sensitivity: packet.sensitivity
      },
      context: {
        sourceTaskId: packet.sourceTaskId,
        threadId: packet.threadId
      }
    });

    return {
      packet,
      packetDir,
      packetPath: runtimePath.join(packetDir, "packet.json"),
      promptPath,
      responsePath
    };
  }

  return {
    findAbacusPacketPreset,
    readPacketSummary,
    listAbacusWorkPackets,
    getAbacusWorkPacket,
    ensurePacketWorkspaceScaffold,
    scanAbacusWorkPacket,
    writeAbacusWorkPacketResponse,
    renderAbacusWorkPacketPrompt,
    renderAbacusResponseTemplate,
    createAbacusWorkPacket
  };
}

module.exports = {
  createAbacusPacketRuntime
};
