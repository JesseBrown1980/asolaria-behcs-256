function createSymphonyServiceRuntime(input = {}) {
  const fs = input.fs || require("fs");
  const path = input.path || require("path");
  const childProcess = input.childProcess || require("child_process");
  const processRef = input.processRef || process;
  const resolveToolPaths = typeof input.resolveToolPaths === "function"
    ? input.resolveToolPaths
    : () => ({});
  const normalizeText = typeof input.normalizeText === "function"
    ? input.normalizeText
    : (value, maxLen = 600) => String(value || "").trim().slice(0, maxLen);
  const normalizePath = typeof input.normalizePath === "function"
    ? input.normalizePath
    : (value) => {
        try {
          return path.resolve(String(value || ""));
        } catch (_error) {
          return "";
        }
      };
  const ensureDirExists = typeof input.ensureDirExists === "function"
    ? input.ensureDirExists
    : (folderPath) => {
        if (!folderPath) return;
        fs.mkdirSync(folderPath, { recursive: true });
      };
  const pidFile = String(input.pidFile || "");
  const stdoutLog = String(input.stdoutLog || "");
  const stderrLog = String(input.stderrLog || "");
  const templateWorkflowPath = String(input.templateWorkflowPath || "");
  const defaultPort = Number(input.defaultPort || 0) || 4792;
  const defaultLogsRoot = String(input.defaultLogsRoot || "");
  const projectRoot = String(input.projectRoot || process.cwd());

  function fileExists(targetPath) {
    try {
      return Boolean(targetPath) && fs.existsSync(targetPath);
    } catch (_error) {
      return false;
    }
  }

  function quoteForPosixShell(value) {
    const text = String(value ?? "");
    if (!text) return "''";
    return `'${text.replace(/'/g, `'\\''`)}'`;
  }

  function escapeYamlDoubleQuoted(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function readPidFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return 0;
      const parsed = Number(String(fs.readFileSync(filePath, "utf8") || "").trim());
      if (!Number.isFinite(parsed) || parsed <= 0) return 0;
      return parsed;
    } catch (_error) {
      return 0;
    }
  }

  function writePidFile(filePath, pid) {
    ensureDirExists(path.dirname(filePath));
    fs.writeFileSync(filePath, `${Number(pid || 0) || 0}\n`, "utf8");
  }

  function removeFileQuietly(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_error) {
      // ignore
    }
  }

  function isPidRunning(pid) {
    const value = Number(pid || 0);
    if (!Number.isFinite(value) || value <= 0) return false;
    try {
      processRef.kill(value, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  }

  function commandExists(name) {
    const command = normalizeText(name, 120);
    if (!command) return "";
    try {
      const result = childProcess.spawnSync("where", [command], {
        windowsHide: true,
        encoding: "utf8",
        timeout: 5000
      });
      if (result.status !== 0) return "";
      return String(result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean) || "";
    } catch (_error) {
      return "";
    }
  }

  function quoteForCmd(value) {
    return `"${String(value || "").replace(/"/g, "\"\"")}"`;
  }

  function resolveMisePath() {
    const envCandidates = [
      processRef.env.ASOLARIA_SYMPHONY_MISE_PATH,
      processRef.env.MISE_PATH,
      processRef.env.MISE_BIN
    ]
      .map((candidate) => normalizePath(candidate))
      .filter(Boolean);

    for (const candidate of envCandidates) {
      if (fileExists(candidate)) {
        return candidate;
      }
    }

    for (const candidate of [commandExists("mise"), commandExists("mise.exe")]) {
      if (candidate) {
        return candidate;
      }
    }

    const localAppData = normalizePath(processRef.env.LOCALAPPDATA || "");
    if (!localAppData) {
      return "";
    }

    const winGetPackagesRoot = path.join(localAppData, "Microsoft", "WinGet", "Packages");
    try {
      if (fs.existsSync(winGetPackagesRoot)) {
        const packageDir = fs.readdirSync(winGetPackagesRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^jdx\.mise_/i.test(entry.name))
          .map((entry) => path.join(winGetPackagesRoot, entry.name, "mise", "bin", "mise.exe"))
          .find((candidate) => fileExists(candidate));
        if (packageDir) {
          return packageDir;
        }
      }
    } catch (_error) {
      // ignore
    }

    const fallback = path.join(localAppData, "Programs", "mise", "bin", "mise.exe");
    if (fileExists(fallback)) {
      return fallback;
    }

    return "";
  }

  function resolveCodexCommand(command, codexPath) {
    const raw = normalizeText(command, 500) || "codex app-server";
    const resolvedCodexPath = normalizePath(codexPath);
    if (!resolvedCodexPath) {
      return raw;
    }
    if (/^codex(?:\.cmd|\.exe)?(?:\s|$)/i.test(raw)) {
      const suffix = raw.replace(/^codex(?:\.cmd|\.exe)?/i, "");
      if (processRef.platform === "win32") {
        const codexDir = path.dirname(resolvedCodexPath);
        const nodeExePath = path.join(codexDir, "node.exe");
        const codexJsPath = path.join(codexDir, "node_modules", "@openai", "codex", "bin", "codex.js");
        if (fileExists(nodeExePath) && fileExists(codexJsPath)) {
          const wslNodeExePath = nodeExePath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_m, drive) => `/mnt/${String(drive).toLowerCase()}`);
          return `${quoteForPosixShell(wslNodeExePath)} ${quoteForPosixShell(codexJsPath)}${suffix}`;
        }
        return raw;
      }
      return `${quoteForCmd(resolvedCodexPath)}${suffix}`;
    }
    return raw;
  }

  function collectWindowsShellPathEntries(gitPath) {
    if (processRef.platform !== "win32") return [];
    const normalizedGitPath = normalizePath(gitPath);
    if (!normalizedGitPath) return [];
    const gitRoot = path.dirname(path.dirname(normalizedGitPath));
    const candidates = [
      path.join(gitRoot, "bin"),
      path.join(gitRoot, "usr", "bin")
    ];
    return candidates.filter((candidate) => fileExists(candidate));
  }

  function buildSymphonyRunCommand(misePath, workflowPath, logsRoot, port) {
    const runner = processRef.platform === "win32"
      ? `${quoteForCmd(misePath)} exec -- escript ./bin/symphony`
      : `${quoteForCmd(misePath)} exec -- ./bin/symphony`;
    const command = [
      runner,
      "--i-understand-that-this-will-be-running-without-the-usual-guardrails",
      `"${workflowPath}"`,
      `--logs-root "${logsRoot}"`
    ];
    if (Number(port || 0) > 0) {
      command.push(`--port ${Number(port)}`);
    }
    return command.join(" ");
  }

  function buildSymphonyRunArgs(workflowPath, logsRoot, port) {
    const args = ["exec", "--"];
    if (processRef.platform === "win32") {
      args.push("escript", "./bin/symphony");
    } else {
      args.push("./bin/symphony");
    }
    args.push(
      "--i-understand-that-this-will-be-running-without-the-usual-guardrails",
      workflowPath,
      "--logs-root",
      logsRoot
    );
    if (Number(port || 0) > 0) {
      args.push("--port", String(Number(port)));
    }
    return args;
  }

  function syncWorkflowCodexCommand(workflowPath, codexCommand) {
    const normalizedWorkflowPath = normalizePath(workflowPath);
    const normalizedCommand = normalizeText(codexCommand, 4000);
    if (!normalizedWorkflowPath || !normalizedCommand || !fileExists(normalizedWorkflowPath)) {
      return false;
    }
    const original = String(fs.readFileSync(normalizedWorkflowPath, "utf8") || "");
    if (!original) {
      return false;
    }
    const desiredLine = `  command: "${escapeYamlDoubleQuoted(normalizedCommand)}"`;
    let updated = original.replace(/^\s*command:\s*.*$/m, desiredLine);
    if (updated === original && /^codex:\s*$/m.test(original)) {
      updated = original.replace(/^codex:\s*$/m, `codex:\n${desiredLine}`);
    }
    if (updated === original) {
      return false;
    }
    fs.writeFileSync(normalizedWorkflowPath, updated, "utf8");
    return true;
  }

  function resolveElixirProject(repoRoot) {
    const root = normalizePath(repoRoot);
    const empty = {
      root: "",
      mixProjectPath: "",
      binaryPath: "",
      cliEntrypointPath: "",
      miseConfigPath: "",
      hasProject: false,
      hasBuiltBinary: false,
      hasCliEntrypoint: false,
      hasMiseConfig: false
    };
    if (!root) return empty;

    for (const candidate of [root, path.join(root, "elixir")]) {
      const mixProjectPath = path.join(candidate, "mix.exs");
      if (!fileExists(mixProjectPath)) {
        continue;
      }
      const binaryPath = path.join(candidate, "bin", "symphony");
      const cliEntrypointPath = path.join(candidate, "lib", "symphony_elixir", "cli.ex");
      const miseConfigPath = path.join(candidate, "mise.toml");
      return {
        root: candidate,
        mixProjectPath,
        binaryPath,
        cliEntrypointPath,
        miseConfigPath,
        hasProject: true,
        hasBuiltBinary: fileExists(binaryPath),
        hasCliEntrypoint: fileExists(cliEntrypointPath),
        hasMiseConfig: fileExists(miseConfigPath)
      };
    }
    return empty;
  }

  function buildLaunchPlan(config) {
    const toolPaths = resolveToolPaths();
    const gitPath = commandExists("git");
    const misePath = resolveMisePath();
    const elixirPath = commandExists("elixir");
    const mixPath = commandExists("mix");
    const wslPath = toolPaths.wslPath || commandExists("wsl");
    const elixirProject = resolveElixirProject(config.repoRoot);
    const plan = {
      mode: "",
      cwd: "",
      command: "",
      executable: "",
      args: [],
      launchable: false,
      bootstrapOnStart: false,
      reasons: [],
      prerequisites: {
        codexPath: toolPaths.codexPath || "",
        gitPath,
        misePath,
        elixirPath,
        mixPath,
        wslPath,
        repoExists: Boolean(config.repoRoot && fileExists(config.repoRoot)),
        workflowExists: Boolean(config.workflowPath && fileExists(config.workflowPath)),
        templateExists: fileExists(templateWorkflowPath),
        elixirRoot: elixirProject.root,
        elixirMixProjectExists: elixirProject.hasProject,
        elixirCliEntrypointExists: elixirProject.hasCliEntrypoint,
        elixirBinaryExists: elixirProject.hasBuiltBinary,
        elixirMiseConfigExists: elixirProject.hasMiseConfig
      }
    };

    if (!config.enabled) {
      plan.reasons.push("Symphony integration is disabled.");
    }
    if (!config.repoRoot) {
      plan.reasons.push("repoRoot is not configured.");
    } else if (!plan.prerequisites.repoExists) {
      plan.reasons.push("Configured Symphony repoRoot does not exist.");
    }
    if (!config.workflowPath) {
      plan.reasons.push("workflowPath is not configured.");
    } else if (!plan.prerequisites.workflowExists) {
      plan.reasons.push("Configured Symphony workflowPath does not exist.");
    }
    if (!config.linearProjectSlug) {
      plan.reasons.push("linearProjectSlug is not configured.");
    }
    if (!config.linearApiKey) {
      plan.reasons.push("LINEAR_API_KEY is not configured.");
    }
    if (!toolPaths.codexPath) {
      plan.reasons.push("Codex CLI is not available on this machine.");
    }

    if (config.command) {
      plan.mode = "custom";
      plan.cwd = config.workingDirectory || config.repoRoot || projectRoot;
      plan.command = config.command;
      plan.executable = processRef.env.ComSpec || "cmd.exe";
      plan.args = ["/d", "/s", "/c", config.command];
    } else {
      plan.mode = config.runtime === "custom" ? "custom" : "elixir_reference";
      if (!elixirProject.hasProject) {
        plan.reasons.push("Reference Symphony Elixir project was not found under repoRoot (expected mix.exs in repoRoot or repoRoot\\elixir).");
      }
      if (!misePath) {
        plan.reasons.push("mise is not installed, so the Elixir reference implementation cannot be launched automatically.");
      }
      if (elixirProject.hasProject && config.workflowPath && misePath) {
        plan.cwd = elixirProject.root;
        plan.command = buildSymphonyRunCommand(
          misePath,
          config.workflowPath,
          config.logsRoot || defaultLogsRoot,
          config.port
        );

        if (!elixirProject.hasBuiltBinary) {
          const commandParts = [];
          plan.bootstrapOnStart = true;
          commandParts.push(`${quoteForCmd(misePath)} trust`);
          commandParts.push(`${quoteForCmd(misePath)} install`);
          commandParts.push(`${quoteForCmd(misePath)} exec -- mix setup`);
          commandParts.push(`${quoteForCmd(misePath)} exec -- mix build`);
          commandParts.push(plan.command);
          plan.command = commandParts.join(" && ");
          plan.executable = processRef.env.ComSpec || "cmd.exe";
          plan.args = ["/d", "/s", "/c", plan.command];
        } else {
          plan.executable = misePath;
          plan.args = buildSymphonyRunArgs(
            config.workflowPath,
            config.logsRoot || defaultLogsRoot,
            config.port
          );
        }
      }
    }

    plan.launchable = plan.reasons.length === 0 && Boolean(plan.executable && plan.args.length > 0);
    return plan;
  }

  function getProcessStatus() {
    const pid = readPidFile(pidFile);
    const running = isPidRunning(pid);
    if (!running && pid > 0) {
      removeFileQuietly(pidFile);
    }
    return {
      running,
      pid: running ? pid : 0,
      pidFile,
      stdoutLog,
      stderrLog
    };
  }

  return {
    fileExists,
    quoteForPosixShell,
    readPidFile,
    writePidFile,
    removeFileQuietly,
    isPidRunning,
    commandExists,
    quoteForCmd,
    resolveMisePath,
    resolveCodexCommand,
    collectWindowsShellPathEntries,
    buildSymphonyRunCommand,
    buildSymphonyRunArgs,
    syncWorkflowCodexCommand,
    resolveElixirProject,
    buildLaunchPlan,
    getProcessStatus
  };
}

module.exports = {
  createSymphonyServiceRuntime
};
