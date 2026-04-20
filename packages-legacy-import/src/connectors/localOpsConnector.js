const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { appendMistakeLedger } = require("../mistakeLedgerStore");

const TASKS = new Set(["build", "test", "script"]);

function normalizePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.resolve(raw);
}

function normalizePathForCompare(value) {
  const resolved = normalizePath(value);
  if (!resolved) return "";
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInsideRoot(targetPath, rootPath) {
  const safeTarget = normalizePath(targetPath);
  const safeRoot = normalizePath(rootPath);
  if (!safeTarget || !safeRoot) return false;
  const relative = path.relative(safeRoot, safeTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function uniqueNormalizedPaths(items) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    const resolved = normalizePath(item);
    const compare = normalizePathForCompare(resolved);
    if (!resolved || seen.has(compare)) continue;
    seen.add(compare);
    out.push(resolved);
  }
  return out;
}

function sanitizeAliasName(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (!/^[a-z0-9._:-]{1,80}$/.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeAliases(rawAliases) {
  const aliases = {};
  if (!rawAliases || typeof rawAliases !== "object") {
    return aliases;
  }
  for (const [name, rawPath] of Object.entries(rawAliases)) {
    const key = sanitizeAliasName(name);
    const resolved = normalizePath(rawPath);
    if (!key || !resolved) continue;
    aliases[key] = resolved;
  }
  return aliases;
}

function resolveProjectTarget(target, options = {}) {
  const value = String(target || "").trim();
  if (!value) {
    throw new Error("Local ops target is required.");
  }

  const aliases = normalizeAliases(options.aliases || {});
  const allowedRoots = uniqueNormalizedPaths(options.allowedRoots || []);
  if (!allowedRoots.length) {
    throw new Error("Local ops has no allowed roots configured.");
  }

  const aliasName = sanitizeAliasName(value);
  const fromAlias = aliasName ? aliases[aliasName] : "";
  const candidatePath = fromAlias || normalizePath(value);
  if (!candidatePath) {
    throw new Error("Local ops target could not be resolved.");
  }

  let stats;
  try {
    stats = fs.statSync(candidatePath);
  } catch (_error) {
    throw new Error(`Local ops target does not exist: ${candidatePath}`);
  }

  const projectPath = stats.isDirectory()
    ? candidatePath
    : stats.isFile()
      ? path.dirname(candidatePath)
      : "";
  if (!projectPath) {
    throw new Error("Local ops target must be a folder or a file inside a project folder.");
  }

  const inAllowedRoot = allowedRoots.some((root) => isPathInsideRoot(projectPath, root));
  if (!inAllowedRoot) {
    throw new Error(
      `Local ops target is outside allowlisted roots: ${projectPath}. Configure ASOLARIA_LOCAL_OPS_ALLOWED_ROOTS if needed.`
    );
  }

  return {
    alias: fromAlias ? aliasName : "",
    projectPath
  };
}

function detectProjectType(projectPath) {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    return "node";
  }

  if (
    fs.existsSync(path.join(projectPath, "pyproject.toml"))
    || fs.existsSync(path.join(projectPath, "requirements.txt"))
    || fs.existsSync(path.join(projectPath, "setup.py"))
  ) {
    return "python";
  }

  if (fs.existsSync(path.join(projectPath, "go.mod"))) {
    return "go";
  }

  try {
    const names = fs.readdirSync(projectPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.toLowerCase());
    if (names.some((name) => name.endsWith(".sln") || name.endsWith(".csproj"))) {
      return "dotnet";
    }
  } catch (_error) {
    // Ignore directory listing failures and continue to unknown.
  }

  return "unknown";
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function pythonCommand() {
  const configured = String(process.env.ASOLARIA_LOCAL_OPS_PYTHON_CMD || "").trim();
  if (configured) return configured;
  return process.platform === "win32" ? "python" : "python3";
}

function pythonFallbackExecutables(primary) {
  const first = String(primary || "").trim();
  const candidates = [first];
  if (process.platform === "win32") {
    if (first.toLowerCase() !== "py") {
      candidates.push("py");
    }
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

function readNodeScripts(projectPath) {
  const packagePath = path.join(projectPath, "package.json");
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse package.json at ${packagePath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    return {};
  }
  return parsed.scripts && typeof parsed.scripts === "object"
    ? parsed.scripts
    : {};
}

function normalizeScriptName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(raw)) {
    throw new Error("Script name contains unsupported characters.");
  }
  return raw;
}

function pickPythonCompileTargets(projectPath) {
  const preferredDirs = ["src", "backend", "app", "tests"];
  const selected = preferredDirs
    .map((name) => path.join(projectPath, name))
    .filter((fullPath) => {
      try {
        return fs.statSync(fullPath).isDirectory();
      } catch (_error) {
        return false;
      }
    })
    .map((fullPath) => path.basename(fullPath));
  if (selected.length > 0) {
    return selected;
  }
  return ["."];
}

function buildCommandPlan(input = {}) {
  const task = String(input.task || "").trim().toLowerCase();
  const projectType = String(input.projectType || "").trim().toLowerCase();
  const projectPath = String(input.projectPath || "").trim();
  const scriptName = normalizeScriptName(input.script || "");

  if (!TASKS.has(task)) {
    throw new Error(`Unsupported local task "${task}". Use build, test, or script.`);
  }

  if (projectType === "node") {
    const scripts = readNodeScripts(projectPath);
    if (task === "build") {
      if (!scripts.build) {
        throw new Error("Node project does not define a build script in package.json.");
      }
      return {
        executable: npmCommand(),
        args: ["run", "build"],
        display: "npm run build"
      };
    }
    if (task === "test") {
      if (!scripts.test) {
        throw new Error("Node project does not define a test script in package.json.");
      }
      return {
        executable: npmCommand(),
        args: ["run", "test"],
        display: "npm run test"
      };
    }
    if (!scriptName) {
      throw new Error("Script task requires a script name.");
    }
    if (!scripts[scriptName]) {
      throw new Error(`Node project does not define script "${scriptName}" in package.json.`);
    }
    return {
      executable: npmCommand(),
      args: ["run", scriptName],
      display: `npm run ${scriptName}`,
      scriptName
    };
  }

  if (task === "script") {
    throw new Error(`Custom script task is currently supported only for Node projects (detected: ${projectType || "unknown"}).`);
  }

  if (projectType === "dotnet") {
    return task === "build"
      ? {
        executable: "dotnet",
        args: ["build", "--nologo"],
        display: "dotnet build --nologo"
      }
      : {
        executable: "dotnet",
        args: ["test", "--nologo"],
        display: "dotnet test --nologo"
      };
  }

  if (projectType === "go") {
    return task === "build"
      ? {
        executable: "go",
        args: ["build", "./..."],
        display: "go build ./..."
      }
      : {
        executable: "go",
        args: ["test", "./..."],
        display: "go test ./..."
      };
  }

  if (projectType === "python") {
    const pythonExe = pythonCommand();
    const fallbackExecutables = pythonFallbackExecutables(pythonExe);
    if (task === "build") {
      const targets = pickPythonCompileTargets(projectPath);
      const excludePattern = "(^|[\\\\/])(\\.git|\\.venv|venv|node_modules|build|dist)([\\\\/]|$)";
      return {
        executable: pythonExe,
        fallbackExecutables,
        args: ["-m", "compileall", "-q", "-x", excludePattern, ...targets],
        display: `${pythonExe} -m compileall -q ${targets.join(" ")}`
      };
    }
    return {
      executable: pythonExe,
      fallbackExecutables,
      args: ["-m", "pytest", "-q"],
      display: `${pythonExe} -m pytest -q`
    };
  }

  throw new Error(
    `Could not determine project type for ${projectPath}. Supported: Node (package.json), Python (pyproject/setup/requirements), Go (go.mod), .NET (.sln/.csproj).`
  );
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function appendLimited(state, chunk, limit) {
  const text = String(chunk || "");
  if (!text) return;
  const remaining = Math.max(0, limit - state.value.length);
  if (remaining <= 0) {
    state.truncated = true;
    return;
  }
  if (text.length <= remaining) {
    state.value += text;
    return;
  }
  state.value += text.slice(0, remaining);
  state.truncated = true;
}

function sanitizeSpawnEnv(inputEnv = {}) {
  const output = {};
  const entries = Object.entries(inputEnv || {});
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey || "");
    if (!key || key.includes("=") || key.includes("\u0000")) {
      continue;
    }
    if (rawValue === undefined || rawValue === null) {
      continue;
    }
    const value = String(rawValue);
    if (value.includes("\u0000")) {
      continue;
    }
    output[key] = value;
  }
  return output;
}

function shouldUseCommandShell(command = {}) {
  if (process.platform !== "win32") {
    return false;
  }
  const executable = String(command.executable || "").trim().toLowerCase();
  if (!executable) {
    return false;
  }
  return executable.endsWith(".cmd") || executable.endsWith(".bat");
}

function runCommand(command, options = {}) {
  const timeoutMs = clampInt(options.timeoutMs, 15 * 60 * 1000, 10 * 1000, 30 * 60 * 1000);
  const outputLimit = clampInt(options.maxOutputChars, 120000, 4000, 500000);
  const startedAt = Date.now();
  const stdoutState = { value: "", truncated: false };
  const stderrState = { value: "", truncated: false };

  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: options.cwd,
      shell: shouldUseCommandShell(command),
      windowsHide: true,
      env: sanitizeSpawnEnv({
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0"
      })
    });

    let completed = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch (_error) {
        // Ignore kill errors; process may already be gone.
      }
      setTimeout(() => {
        if (completed) return;
        try {
          child.kill("SIGKILL");
        } catch (_error) {
          // Ignore kill errors.
        }
      }, 1500);
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.on("data", (chunk) => appendLimited(stdoutState, chunk, outputLimit));
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => appendLimited(stderrState, chunk, outputLimit));
    }

    child.on("error", (error) => {
      clearTimeout(timer);
      if (completed) return;
      completed = true;
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (completed) return;
      completed = true;
      resolve({
        exitCode: Number.isInteger(code) ? code : null,
        signal: signal || "",
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: stdoutState.value,
        stderr: stderrState.value,
        stdoutTruncated: stdoutState.truncated,
        stderrTruncated: stderrState.truncated
      });
    });
  });
}

function executionLooksLikeMissingBinary(execution = {}) {
  const stderr = String(execution.stderr || "").toLowerCase();
  const stdout = String(execution.stdout || "").toLowerCase();
  const text = `${stderr}\n${stdout}`;
  return (
    Number(execution.exitCode) === 9009
    || text.includes("was not found")
    || text.includes("is not recognized as an internal or external command")
    || text.includes("enoent")
  );
}

async function runCommandWithFallback(command, options = {}) {
  const alternatives = [String(command.executable || "").trim(), ...(Array.isArray(command.fallbackExecutables) ? command.fallbackExecutables : [])]
    .filter(Boolean);
  const unique = Array.from(new Set(alternatives));
  let lastExecution = null;
  let lastError = null;

  for (const executable of unique) {
    try {
      const execution = await runCommand({
        ...command,
        executable
      }, options);
      if (executionLooksLikeMissingBinary(execution) && executable !== unique[unique.length - 1]) {
        lastExecution = execution;
        continue;
      }
      return {
        ...execution,
        resolvedExecutable: executable
      };
    } catch (error) {
      const code = String(error?.code || "").toUpperCase();
      if (code === "ENOENT" && executable !== unique[unique.length - 1]) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastExecution) {
    return {
      ...lastExecution,
      resolvedExecutable: unique[unique.length - 1] || command.executable
    };
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error("Command execution failed with no available fallback.");
}

function normalizePolicy(options = {}) {
  const allowedRoots = uniqueNormalizedPaths(options.allowedRoots || []);
  const aliases = normalizeAliases(options.aliases || {});
  return {
    enabled: options.enabled !== false,
    allowedRoots,
    aliases,
    defaultTimeoutMs: clampInt(options.defaultTimeoutMs, 15 * 60 * 1000, 10 * 1000, 30 * 60 * 1000),
    maxTimeoutMs: clampInt(options.maxTimeoutMs, 30 * 60 * 1000, 10 * 1000, 60 * 60 * 1000),
    defaultMaxOutputChars: clampInt(options.defaultMaxOutputChars, 120000, 4000, 500000)
  };
}

function getLocalOpsPolicySummary(options = {}) {
  const policy = normalizePolicy(options);
  return {
    enabled: policy.enabled,
    allowedRoots: policy.allowedRoots,
    aliases: policy.aliases,
    tasks: Array.from(TASKS),
    defaultTimeoutMs: policy.defaultTimeoutMs,
    maxTimeoutMs: policy.maxTimeoutMs,
    defaultMaxOutputChars: policy.defaultMaxOutputChars
  };
}

function logLocalOpsFailure(context = {}, error = null) {
  const command = Array.isArray(context.command) ? context.command : [];
  const errorMessage = String((error && error.message) || error || "local ops execution failed");

  appendMistakeLedger({
    feature: "local_ops",
    operation: "run",
    type: "failure",
    severity: "medium",
    actor: "server",
    laneId: "local_ops",
    message: "Local ops run failed before completion.",
    code: "local_ops_exec_error",
    context: {
      task: String(context.task || "").trim(),
      script: String(context.script || "").trim(),
      target: String(context.target || "").trim(),
      alias: String(context.alias || "").trim(),
      resolvedProjectPath: String(context.projectPath || "").trim(),
      projectType: String(context.projectType || "").trim(),
      timeoutMs: Number.isFinite(Number(context.timeoutMs)) ? Number(context.timeoutMs) : undefined,
      maxOutputChars: Number.isFinite(Number(context.maxOutputChars))
        ? Number(context.maxOutputChars)
        : undefined,
      command: command.map((item) => String(item || "")).join(" ").trim() || "",
      resolvedExecutable: String(context.resolvedExecutable || "").trim(),
      error: errorMessage.slice(0, 500)
    }
  });
}

async function runLocalProjectTask(input = {}, options = {}) {
  const policy = normalizePolicy(options);
  if (!policy.enabled) {
    throw new Error("Local ops is disabled.");
  }

  const task = String(input.task || "").trim().toLowerCase();
  const script = normalizeScriptName(input.script || "");
  const resolved = resolveProjectTarget(input.target, {
    aliases: policy.aliases,
    allowedRoots: policy.allowedRoots
  });
  const projectType = detectProjectType(resolved.projectPath);
  const command = buildCommandPlan({
    task,
    script,
    projectType,
    projectPath: resolved.projectPath
  });
  const timeoutMs = clampInt(
    input.timeoutMs,
    policy.defaultTimeoutMs,
    10 * 1000,
    policy.maxTimeoutMs
  );
  const maxOutputChars = clampInt(
    input.maxOutputChars,
    policy.defaultMaxOutputChars,
    4000,
    500000
  );
  let withFallback;
  try {
    withFallback = await runCommandWithFallback(command, {
      cwd: resolved.projectPath,
      timeoutMs,
      maxOutputChars
    });
  } catch (error) {
    logLocalOpsFailure({
      task,
      script,
      target: String(input.target || "").trim(),
      alias: resolved.alias || "",
      projectPath: resolved.projectPath,
      projectType,
      timeoutMs,
      maxOutputChars,
      command: [command.executable, ...command.args],
      resolvedExecutable: command.executable
    }, error);
    throw error;
  }

  return {
    target: String(input.target || "").trim(),
    alias: resolved.alias || "",
    projectPath: resolved.projectPath,
    projectType,
    task,
    script: command.scriptName || "",
    command: [command.executable, ...command.args],
    resolvedCommand: [withFallback.resolvedExecutable || command.executable, ...command.args],
    displayCommand: command.display,
    ...withFallback
  };
}

module.exports = {
  getLocalOpsPolicySummary,
  runLocalProjectTask
};
