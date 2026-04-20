const fs = require("fs");
const path = require("path");
const os = require("os");
const childProcess = require("child_process");
const { resolveManagedProfile } = require("../src/connectors/chromeConnector");
const { resolveToolPaths } = require("../src/connectors/systemPaths");
const { resolveDataPath } = require("../src/runtimePaths");

const SESSION_FILE = resolveDataPath("linear-playwright-session.json");
const EXCLUDE_NAMES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "GrShaderCache",
  "ShaderCache",
  "DawnCache",
  "Crashpad",
  "BrowserMetrics",
  "Safe Browsing",
  "OptimizationHints",
  "VideoDecodeStats"
]);

function normalizeText(value, maxLen = 300) {
  return String(value || "").trim().slice(0, maxLen);
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function rmSafe(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (_error) {
    // ignore
  }
}

function copyFiltered(src, dest) {
  let stat = null;
  try {
    stat = fs.statSync(src);
  } catch (_error) {
    return;
  }

  if (stat.isDirectory()) {
    ensureDir(dest);
    let entries = [];
    try {
      entries = fs.readdirSync(src, { withFileTypes: true });
    } catch (_error) {
      return;
    }
    for (const entry of entries) {
      if (EXCLUDE_NAMES.has(entry.name)) continue;
      if (entry.name.endsWith(".tmp")) continue;
      copyFiltered(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }

  ensureDir(path.dirname(dest));
  try {
    fs.copyFileSync(src, dest);
  } catch (_error) {
    // ignore transient file races in the live Chrome profile
  }
}

function writeSession(payload) {
  ensureDir(path.dirname(SESSION_FILE));
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const out = {
    profileEmail: "",
    profileDirectory: "",
    port: 9333,
    url: "https://linear.app/settings/api"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "");
    const next = String(argv[index + 1] || "");
    if (arg === "--profile-email" && next) {
      out.profileEmail = normalizeText(next, 160);
      index += 1;
    } else if (arg === "--profile-directory" && next) {
      out.profileDirectory = normalizeText(next, 80);
      index += 1;
    } else if (arg === "--port" && next) {
      const parsed = Number(next);
      if (Number.isFinite(parsed) && parsed >= 1024 && parsed <= 65535) {
        out.port = Math.round(parsed);
      }
      index += 1;
    } else if (arg === "--url" && next) {
      out.url = normalizeText(next, 1000);
      index += 1;
    }
  }

  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const toolPaths = resolveToolPaths();
  if (!toolPaths.chromePath) {
    throw new Error("Google Chrome executable was not found.");
  }

  const profile = resolveManagedProfile({
    profileEmail: args.profileEmail,
    profileDirectory: args.profileDirectory
  });

  const sourceRoot = path.join(String(process.env.LOCALAPPDATA || ""), "Google", "Chrome", "User Data");
  const cloneRoot = path.join(os.tmpdir(), `linear-playwright-${profile.directory.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  const sourceProfile = path.join(sourceRoot, profile.directory);
  const cloneProfile = path.join(cloneRoot, profile.directory);

  rmSafe(cloneRoot);
  ensureDir(cloneRoot);

  for (const rootFile of ["Local State", "First Run", "Last Version"]) {
    const sourcePath = path.join(sourceRoot, rootFile);
    if (!fs.existsSync(sourcePath)) continue;
    try {
      fs.copyFileSync(sourcePath, path.join(cloneRoot, rootFile));
    } catch (_error) {
      // ignore
    }
  }
  copyFiltered(sourceProfile, cloneProfile);

  const chromeArgs = [
    `--remote-debugging-port=${args.port}`,
    `--user-data-dir=${cloneRoot}`,
    `--profile-directory=${profile.directory}`,
    "--new-window",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-translate",
    "--disable-features=Translate,TranslateUI",
    args.url
  ];

  const child = childProcess.spawn(toolPaths.chromePath, chromeArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();

  const payload = {
    startedAt: new Date().toISOString(),
    pid: Number(child.pid || 0) || 0,
    port: args.port,
    url: args.url,
    cloneRoot,
    profileDirectory: profile.directory,
    profileEmail: profile.email || "",
    sessionFile: SESSION_FILE
  };
  writeSession(payload);

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
