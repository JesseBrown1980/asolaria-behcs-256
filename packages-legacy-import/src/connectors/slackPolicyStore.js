const fs = require("fs");
const path = require("path");

const { resolveDataPath } = require("../runtimePaths");
const { normalizeSlackPolicy } = require("./slackConnector");

const SLACK_POLICY_PATH = resolveDataPath("integrations", "slack-policy.json");

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function getSlackPolicy() {
  return normalizeSlackPolicy(readJsonFile(SLACK_POLICY_PATH, {}));
}

function setSlackPolicy(input = {}) {
  const base = getSlackPolicy();
  const next = normalizeSlackPolicy({
    ...base,
    ...(input && typeof input === "object" ? input : {})
  });
  writeJsonAtomic(SLACK_POLICY_PATH, next);
  return next;
}

module.exports = {
  SLACK_POLICY_PATH,
  getSlackPolicy,
  setSlackPolicy
};
