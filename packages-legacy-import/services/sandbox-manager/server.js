const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");
const { spawnSync } = require("child_process");

function loadConfig() {
  const filePath = path.join(__dirname, "asolaria.sandbox.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const config = loadConfig();
const app = express();
app.use(express.json({ limit: "1mb" }));

function resolveNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function removeDirectorySafe(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {}
}

function createSourceFile(language, code) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "asolaria-sbx-"));
  const fileName = language === "node" ? "script.js" : "script.py";
  const fullPath = path.join(tmpDir, fileName);
  fs.writeFileSync(fullPath, code, "utf8");
  return { tmpDir, fullPath, fileName };
}

function buildDockerCommand(input, source) {
  const limits = config.limits || {};
  const language = input.language === "node" ? "node" : "python";
  const image = language === "node" ? config.dockerImageNode : config.dockerImagePython;
  const noNetwork = input.noNetwork !== undefined ? Boolean(input.noNetwork) : Boolean(config.noNetworkDefault);
  const timeoutSeconds = resolveNumber(input.timeoutSeconds, Number(limits.timeoutSeconds || 30), 1, 120);
  const args = [
    "run",
    "--rm",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    String(resolveNumber(limits.pids, 64, 16, 512)),
    "--cpus",
    String(resolveNumber(limits.cpus, 1, 0.25, 4)),
    "--memory",
    String(limits.memory || "256m"),
    "--user",
    "65534:65534",
    "-v",
    `${source.tmpDir}:/work:ro`
  ];

  if (noNetwork) {
    args.push("--network", "none");
  }

  if (config?.runtime?.preferGVisor && config?.runtime?.gVisorRuntimeName) {
    args.push("--runtime", String(config.runtime.gVisorRuntimeName));
  }

  args.push(image);
  if (language === "node") {
    args.push("node", `/work/${source.fileName}`);
  } else {
    args.push("python", `/work/${source.fileName}`);
  }

  return { args, timeoutSeconds, language, image, noNetwork };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sandbox-manager",
    bind: config.bind,
    port: config.port,
    noNetworkDefault: Boolean(config.noNetworkDefault),
    time: new Date().toISOString()
  });
});

app.post("/execute", (req, res) => {
  const body = req.body || {};
  const language = String(body.language || "python").trim().toLowerCase();
  if (language !== "python" && language !== "node") {
    return res.status(400).json({ ok: false, error: "language must be python or node" });
  }

  const code = String(body.code || "");
  const maxCodeChars = resolveNumber(config?.limits?.maxCodeChars, 50000, 1000, 250000);
  if (!code.trim()) {
    return res.status(400).json({ ok: false, error: "missing code" });
  }
  if (code.length > maxCodeChars) {
    return res.status(400).json({ ok: false, error: `code length exceeds maxCodeChars (${maxCodeChars})` });
  }

  const source = createSourceFile(language, code);
  const execution = buildDockerCommand(body, source);
  const started = Date.now();
  let runResult = null;
  try {
    runResult = spawnSync("docker", execution.args, {
      encoding: "utf8",
      timeout: execution.timeoutSeconds * 1000
    });
  } catch (error) {
    removeDirectorySafe(source.tmpDir);
    return res.status(500).json({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  } finally {
    removeDirectorySafe(source.tmpDir);
  }

  const runtimeMs = Date.now() - started;
  const stderrText = String(runResult.stderr || "");
  const dockerMissing = /ENOENT|not recognized as an internal or external command|command not found/i.test(stderrText);
  if (dockerMissing) {
    return res.status(500).json({
      ok: false,
      error: "docker is not available in PATH"
    });
  }

  const daemonUnavailable = /failed to connect to the docker api|cannot connect to the docker daemon|docker daemon is not running/i.test(stderrText);
  if (daemonUnavailable) {
    return res.status(503).json({
      ok: false,
      error: "docker daemon is unavailable",
      stderr: stderrText
    });
  }

  const exitCode = runResult.status === null ? -1 : runResult.status;
  const success = exitCode === 0;

  return res.status(success ? 200 : 422).json({
    ok: success,
    runtimeMs,
    language: execution.language,
    image: execution.image,
    noNetwork: execution.noNetwork,
    exitCode,
    stdout: String(runResult.stdout || ""),
    stderr: stderrText
  });
});

http.createServer(app).listen(config.port, config.bind, () => {
  console.log(`Sandbox manager is listening on http://${config.bind}:${config.port}`);
});
