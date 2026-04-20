function createSymphonyOrchestrationRuntime(input = {}) {
  const fs = input.fs || require("fs");
  const path = input.path || require("path");
  const childProcess = input.childProcess || require("child_process");
  const fetchImpl = typeof input.fetchImpl === "function" ? input.fetchImpl : global.fetch;
  const processRef = input.processRef || process;
  const setSecret = typeof input.setSecret === "function" ? input.setSecret : () => {};
  const deleteSecret = typeof input.deleteSecret === "function" ? input.deleteSecret : () => {};
  const resolveToolPaths = typeof input.resolveToolPaths === "function" ? input.resolveToolPaths : () => ({});
  const normalizeText = typeof input.normalizeText === "function" ? input.normalizeText : (value, maxLen = 600) => String(value || "").trim().slice(0, maxLen);
  const normalizeBool = typeof input.normalizeBool === "function" ? input.normalizeBool : (value, fallback = false) => value == null || value === "" ? fallback : Boolean(value);
  const normalizeInt = typeof input.normalizeInt === "function" ? input.normalizeInt : (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const normalizePath = typeof input.normalizePath === "function" ? input.normalizePath : (value) => String(value || "");
  const normalizeRuntimeKind = typeof input.normalizeRuntimeKind === "function" ? input.normalizeRuntimeKind : (value) => String(value || "");
  const normalizeApiKey = typeof input.normalizeApiKey === "function" ? input.normalizeApiKey : (value) => String(value || "");
  const ensureDirExists = typeof input.ensureDirExists === "function" ? input.ensureDirExists : () => {};
  const readState = typeof input.readState === "function" ? input.readState : () => ({});
  const writeState = typeof input.writeState === "function" ? input.writeState : () => {};
  const resolveSymphonyConfig = typeof input.resolveSymphonyConfig === "function" ? input.resolveSymphonyConfig : () => ({});
  const summarizeConfig = typeof input.summarizeConfig === "function" ? input.summarizeConfig : (config) => config;
  const getProcessStatus = typeof input.getProcessStatus === "function" ? input.getProcessStatus : () => ({ running: false, pid: 0 });
  const buildLaunchPlan = typeof input.buildLaunchPlan === "function" ? input.buildLaunchPlan : () => ({ launchable: false, reasons: [], prerequisites: {} });
  const resolveCodexCommand = typeof input.resolveCodexCommand === "function" ? input.resolveCodexCommand : (command) => command;
  const collectWindowsShellPathEntries = typeof input.collectWindowsShellPathEntries === "function" ? input.collectWindowsShellPathEntries : () => [];
  const syncWorkflowCodexCommand = typeof input.syncWorkflowCodexCommand === "function" ? input.syncWorkflowCodexCommand : () => false;
  const writePidFile = typeof input.writePidFile === "function" ? input.writePidFile : () => {};
  const removeFileQuietly = typeof input.removeFileQuietly === "function" ? input.removeFileQuietly : () => {};
  const emitSymphonyEvent = typeof input.emitSymphonyEvent === "function" ? input.emitSymphonyEvent : () => {};
  const emitSymphonyManifest = typeof input.emitSymphonyManifest === "function" ? input.emitSymphonyManifest : () => {};
  const secretName = String(input.secretName || "integrations.symphony");
  const pidFile = String(input.pidFile || "");
  const stdoutLog = String(input.stdoutLog || "");
  const stderrLog = String(input.stderrLog || "");
  const defaultLogsRoot = String(input.defaultLogsRoot || "");
  const defaultPort = Number(input.defaultPort || 0) || 4792;
  const defaultSourceRepoUrl = String(input.defaultSourceRepoUrl || "");

  let lastSuccessfulSymphonyLiveState = null;

  function getSymphonyIntegrationStatus() {
    const config = resolveSymphonyConfig();
    const state = readState();
    const processInfo = getProcessStatus();
    const launchPlan = buildLaunchPlan(config);
    return {
      ...summarizeConfig(config),
      process: processInfo,
      launch: {
        mode: launchPlan.mode,
        cwd: launchPlan.cwd,
        commandPreview: launchPlan.command,
        launchable: launchPlan.launchable,
        bootstrapOnStart: Boolean(launchPlan.bootstrapOnStart),
        reasons: launchPlan.reasons,
        prerequisites: launchPlan.prerequisites
      },
      state: {
        lastStartedAt: state.lastStartedAt || "",
        lastStoppedAt: state.lastStoppedAt || "",
        lastError: state.lastError || "",
        lastLaunchCommand: state.lastLaunchCommand || "",
        lastLaunchCwd: state.lastLaunchCwd || "",
        lastPid: Number(state.lastPid || 0) || 0,
        lastResolvedCodexCommand: state.lastResolvedCodexCommand || ""
      }
    };
  }

  async function fetchSymphonyLiveState(options = {}) {
    const status = options && typeof options === "object" && options.status
      ? options.status
      : getSymphonyIntegrationStatus();
    const port = Number(status?.port || status?.launch?.port || defaultPort) || defaultPort;
    const running = Boolean(status?.process?.running);
    const url = `http://127.0.0.1:${port}/api/v1/state`;

    if (!running) {
      return {
        ok: false,
        available: false,
        running: false,
        port,
        url,
        fetchedAt: new Date().toISOString(),
        reason: "service_not_running",
        state: null,
        summary: {
          running: 0,
          retrying: 0,
          issueIdentifiers: []
        }
      };
    }

    const timeoutMs = Math.max(1600, Math.min(10000, Number(options.timeoutMs || 5000) || 5000));
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => {
          try { controller.abort(); } catch (_error) { /* ignore */ }
        }, timeoutMs)
      : null;

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller ? controller.signal : undefined
      });
      const json = await response.json().catch(() => ({}));
      const runningItems = Array.isArray(json?.running) ? json.running : [];
      const retryingItems = Array.isArray(json?.retrying) ? json.retrying : [];
      const payload = {
        ok: response.ok,
        available: true,
        running: true,
        port,
        url,
        fetchedAt: new Date().toISOString(),
        state: json,
        summary: {
          running: Number(json?.counts?.running || runningItems.length || 0) || 0,
          retrying: Number(json?.counts?.retrying || retryingItems.length || 0) || 0,
          issueIdentifiers: runningItems
            .map((item) => normalizeText(item?.issue_identifier || item?.issue_id || "", 120))
            .filter(Boolean)
            .slice(0, 12),
          totalTokens: Number(json?.codex_totals?.total_tokens || 0) || 0
        }
      };
      if (response.ok) {
        lastSuccessfulSymphonyLiveState = payload;
      }
      return payload;
    } catch (error) {
      const message = normalizeText(error?.message || error || "live_state_fetch_failed", 240);
      const cached = lastSuccessfulSymphonyLiveState
        && lastSuccessfulSymphonyLiveState.port === port
        && lastSuccessfulSymphonyLiveState.url === url
        ? lastSuccessfulSymphonyLiveState
        : null;
      if (cached) {
        return {
          ...cached,
          available: true,
          running: true,
          fetchedAt: new Date().toISOString(),
          fresh: false,
          staleFromCache: true,
          error: message
        };
      }
      return {
        ok: false,
        available: true,
        running: true,
        port,
        url,
        fetchedAt: new Date().toISOString(),
        error: message,
        state: null,
        summary: {
          running: 0,
          retrying: 0,
          issueIdentifiers: []
        }
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function setSymphonyConfig(inputValue = {}) {
    if (inputValue?.clear === true) {
      const previous = resolveSymphonyConfig();
      deleteSecret(secretName, { namespace: "owner" });
      writeState({ lastError: "" });
      emitSymphonyManifest("symphony_config", "cleared", previous, {
        reason: "Symphony integration settings cleared."
      });
      emitSymphonyEvent("symphony_config_cleared", previous, {
        detail: {
          repoRoot: previous.repoRoot || "",
          workflowPath: previous.workflowPath || ""
        }
      });
      return getSymphonyIntegrationStatus();
    }

    const previous = resolveSymphonyConfig();
    const payload = {
      enabled: inputValue.enabled === undefined ? previous.enabled : normalizeBool(inputValue.enabled, previous.enabled),
      repoRoot: inputValue.repoRoot === undefined ? previous.repoRoot : normalizePath(inputValue.repoRoot),
      workflowPath: inputValue.workflowPath === undefined ? previous.workflowPath : normalizePath(inputValue.workflowPath),
      logsRoot: inputValue.logsRoot === undefined ? previous.logsRoot : (normalizePath(inputValue.logsRoot) || defaultLogsRoot),
      runtime: inputValue.runtime === undefined ? previous.runtime : normalizeRuntimeKind(inputValue.runtime),
      port: inputValue.port === undefined ? previous.port : normalizeInt(inputValue.port, previous.port || defaultPort, 0, 65535),
      command: inputValue.command === undefined ? previous.command : normalizeText(inputValue.command, 1000),
      workingDirectory: inputValue.workingDirectory === undefined ? previous.workingDirectory : normalizePath(inputValue.workingDirectory),
      linearProjectSlug: inputValue.linearProjectSlug === undefined ? previous.linearProjectSlug : normalizeText(inputValue.linearProjectSlug, 160),
      linearApiKey: inputValue.linearApiKey === undefined ? previous.linearApiKey : normalizeApiKey(inputValue.linearApiKey),
      sourceRepoUrl: inputValue.sourceRepoUrl === undefined ? previous.sourceRepoUrl : (normalizeText(inputValue.sourceRepoUrl, 400) || defaultSourceRepoUrl),
      workspaceRoot: inputValue.workspaceRoot === undefined ? previous.workspaceRoot : normalizePath(inputValue.workspaceRoot),
      codexCommand: inputValue.codexCommand === undefined ? previous.codexCommand : (normalizeText(inputValue.codexCommand, 500) || "codex app-server"),
      updatedAt: new Date().toISOString()
    };

    setSecret(
      secretName,
      payload,
      {
        app: "Asolaria",
        component: "symphony-integration",
        credentialOwner: "owner",
        actor: "owner",
        updatedBy: "api"
      },
      { namespace: "owner" }
    );

    emitSymphonyManifest("symphony_config", "queued", payload, {
      reason: "Symphony integration settings updated."
    });
    emitSymphonyEvent("symphony_config_saved", payload, {
      detail: {
        repoRoot: payload.repoRoot || "",
        workflowPath: payload.workflowPath || "",
        workspaceRoot: payload.workspaceRoot || ""
      }
    });

    return getSymphonyIntegrationStatus();
  }

  function startSymphonyService() {
    const current = getProcessStatus();
    const config = resolveSymphonyConfig();
    if (current.running) {
      emitSymphonyEvent("symphony_start_skipped", config, {
        status: "ok",
        detail: {
          pid: Number(current.pid || 0) || 0,
          reason: "already_running"
        }
      });
      emitSymphonyManifest("symphony_start", "skipped", config, {
        reason: "Symphony service is already running.",
        evidence: {
          pid: Number(current.pid || 0) || 0
        }
      });
      return getSymphonyIntegrationStatus();
    }

    const plan = buildLaunchPlan(config);
    if (!plan.launchable) {
      const message = plan.reasons.join(" ");
      writeState({ lastError: message });
      emitSymphonyEvent("symphony_start_blocked", config, {
        status: "blocked",
        detail: {
          reasons: plan.reasons,
          prerequisites: plan.prerequisites
        }
      });
      emitSymphonyManifest("symphony_start", "failed", config, {
        reason: message || "Symphony launch plan is not runnable.",
        evidence: {
          reasons: plan.reasons,
          prerequisites: plan.prerequisites
        }
      });
      throw new Error(message || "Symphony launch plan is not runnable.");
    }

    ensureDirExists(path.dirname(stdoutLog));
    ensureDirExists(path.dirname(stderrLog));
    ensureDirExists(config.logsRoot || defaultLogsRoot);

    const stdoutFd = fs.openSync(stdoutLog, "a");
    const stderrFd = fs.openSync(stderrLog, "a");
    const codexPath = resolveToolPaths().codexPath || processRef.env.CODEX_BIN || "codex";
    const gitPath = resolveToolPaths().gitPath || processRef.env.GIT_BIN || "";
    const codexCommand = resolveCodexCommand(
      config.codexCommand || processRef.env.CODEX_COMMAND || "",
      codexPath
    );
    const pathEntries = [
      ...collectWindowsShellPathEntries(gitPath),
      ...(String(processRef.env.PATH || "").split(path.delimiter).filter(Boolean))
    ];
    const mergedPath = Array.from(new Set(pathEntries)).join(path.delimiter);
    const env = {
      ...processRef.env,
      PATH: mergedPath,
      LINEAR_API_KEY: config.linearApiKey || processRef.env.LINEAR_API_KEY || "",
      SYMPHONY_WORKSPACE_ROOT: config.workspaceRoot || processRef.env.SYMPHONY_WORKSPACE_ROOT || "",
      SOURCE_REPO_URL: config.sourceRepoUrl || processRef.env.SOURCE_REPO_URL || "",
      CODEX_BIN: codexPath,
      CODEX_COMMAND: codexCommand
    };

    syncWorkflowCodexCommand(config.workflowPath, codexCommand);

    const child = childProcess.spawn(plan.executable, plan.args, {
      cwd: plan.cwd || processRef.cwd(),
      env,
      windowsHide: true,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd]
    });

    child.unref();
    writePidFile(pidFile, child.pid);
    writeState({
      lastStartedAt: new Date().toISOString(),
      lastStoppedAt: "",
      lastError: "",
      lastLaunchCommand: plan.command,
      lastLaunchCwd: plan.cwd || processRef.cwd(),
      lastPid: Number(child.pid || 0) || 0,
      lastResolvedCodexCommand: codexCommand
    });

    emitSymphonyEvent("symphony_started", config, {
      detail: {
        pid: Number(child.pid || 0) || 0,
        executable: plan.executable,
        args: plan.args,
        cwd: plan.cwd || processRef.cwd()
      }
    });
    emitSymphonyManifest("symphony_start", "completed", config, {
      reason: "Symphony service launched.",
      evidence: {
        pid: Number(child.pid || 0) || 0,
        command: plan.command,
        cwd: plan.cwd || processRef.cwd()
      }
    });

    return getSymphonyIntegrationStatus();
  }

  function stopSymphonyService() {
    const processInfo = getProcessStatus();
    const config = resolveSymphonyConfig();
    if (!processInfo.running || !processInfo.pid) {
      removeFileQuietly(pidFile);
      writeState({
        lastStoppedAt: new Date().toISOString(),
        lastPid: 0
      });
      emitSymphonyEvent("symphony_stop_skipped", config, {
        detail: {
          reason: "not_running"
        }
      });
      emitSymphonyManifest("symphony_stop", "skipped", config, {
        reason: "Symphony service is not running."
      });
      return getSymphonyIntegrationStatus();
    }

    try {
      childProcess.spawnSync("taskkill", ["/PID", String(processInfo.pid), "/T", "/F"], {
        windowsHide: true,
        encoding: "utf8",
        timeout: 15000
      });
    } catch (_error) {
      try { processRef.kill(processInfo.pid); } catch (__error) { /* ignore */ }
    }

    removeFileQuietly(pidFile);
    writeState({
      lastStoppedAt: new Date().toISOString(),
      lastPid: 0
    });
    emitSymphonyEvent("symphony_stopped", config, {
      detail: {
        pid: Number(processInfo.pid || 0) || 0
      }
    });
    emitSymphonyManifest("symphony_stop", "completed", config, {
      reason: "Symphony service stopped.",
      evidence: {
        pid: Number(processInfo.pid || 0) || 0
      }
    });
    return getSymphonyIntegrationStatus();
  }

  function restartSymphonyService() {
    const config = resolveSymphonyConfig();
    emitSymphonyManifest("symphony_restart", "queued", config, {
      reason: "Symphony service restart requested."
    });
    emitSymphonyEvent("symphony_restart_requested", config, {
      detail: {
        port: Number(config.port || defaultPort) || defaultPort
      }
    });
    stopSymphonyService();
    const status = startSymphonyService();
    emitSymphonyManifest("symphony_restart", "completed", config, {
      reason: "Symphony service restarted."
    });
    emitSymphonyEvent("symphony_restarted", resolveSymphonyConfig(), {
      detail: {
        running: Boolean(status?.process?.running),
        pid: Number(status?.process?.pid || 0) || 0
      }
    });
    return status;
  }

  return {
    getSymphonyIntegrationStatus,
    fetchSymphonyLiveState,
    setSymphonyConfig,
    startSymphonyService,
    stopSymphonyService,
    restartSymphonyService
  };
}

module.exports = {
  createSymphonyOrchestrationRuntime
};
