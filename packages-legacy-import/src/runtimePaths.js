const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function resolveInstanceRoot() {
  const raw = String(process.env.ASOLARIA_INSTANCE_ROOT || "").trim();
  if (!raw) {
    return projectRoot;
  }
  return path.resolve(raw);
}

const instanceRoot = resolveInstanceRoot();
const dataDir = path.join(instanceRoot, "data");
const capturesDir = path.join(instanceRoot, "captures");
const logsDir = path.join(instanceRoot, "logs");

function resolveDataPath(...parts) {
  return path.join(dataDir, ...parts);
}

function resolveCapturePath(...parts) {
  return path.join(capturesDir, ...parts);
}

function resolveLogPath(...parts) {
  return path.join(logsDir, ...parts);
}

module.exports = {
  projectRoot,
  instanceRoot,
  dataDir,
  capturesDir,
  logsDir,
  resolveDataPath,
  resolveCapturePath,
  resolveLogPath
};

