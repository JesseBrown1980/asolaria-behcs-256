const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

function createGatewayPaths(baseDirname, env = process.env) {
  const repoRoot = path.resolve(baseDirname, "..", "..");
  const defaultConfigPath = path.join(repoRoot, "config", "asolaria.gateway.json");
  const configPath = path.resolve(env.ASOLARIA_GATEWAY_CONFIG || defaultConfigPath);
  return {
    repoRoot,
    defaultConfigPath,
    configPath
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readUtf8Trim(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function loadGatewayConfig(paths) {
  if (!fs.existsSync(paths.configPath)) {
    throw new Error(`Gateway config not found: ${paths.configPath}`);
  }
  return readJsonFile(paths.configPath);
}

function buildGatewayTokenPath(repoRoot, cfg) {
  const relative = String(cfg?.gateway?.auth?.tokenFile || "data/vault/owner/gateway/gateway.token.txt").trim();
  return path.resolve(repoRoot, relative);
}

function loadGatewayToken(repoRoot, cfg, env = process.env) {
  const envToken = String(env.ASOLARIA_GATEWAY_TOKEN || "").trim();
  if (envToken) {
    return envToken;
  }
  const tokenPath = buildGatewayTokenPath(repoRoot, cfg);
  return readUtf8Trim(tokenPath);
}

function listToolManifests(repoRoot) {
  const manifestsRoot = path.join(repoRoot, "tools-manifests");
  if (!fs.existsSync(manifestsRoot)) {
    return [];
  }
  const connectors = fs.readdirSync(manifestsRoot, { withFileTypes: true }).filter((item) => item.isDirectory());
  const out = [];
  for (const connector of connectors) {
    const connectorPath = path.join(manifestsRoot, connector.name);
    const files = fs.readdirSync(connectorPath, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".schema.json")) {
        continue;
      }
      out.push({
        connector: connector.name,
        file: file.name,
        path: path.relative(repoRoot, path.join(connectorPath, file.name)).replace(/\\/g, "/")
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function compileGatewayMessageSchema() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile({
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", minLength: 1 },
      id: { type: "string" },
      payload: { type: "object" }
    },
    required: ["type"]
  });
}

function authFromRequest(req) {
  const authHeader = String(req?.headers?.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

function redactPayload(payload, redactKeys) {
  const keys = new Set((Array.isArray(redactKeys) ? redactKeys : []).map((item) => String(item || "").toLowerCase()));
  const seen = new WeakSet();

  function walk(value) {
    if (!value || typeof value !== "object") {
      return value;
    }
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    const out = {};
    for (const [rawKey, child] of Object.entries(value)) {
      const key = String(rawKey || "");
      if (keys.has(key.toLowerCase())) {
        out[key] = "***REDACTED***";
      } else {
        out[key] = walk(child);
      }
    }
    return out;
  }

  return walk(payload);
}

module.exports = {
  authFromRequest,
  buildGatewayTokenPath,
  compileGatewayMessageSchema,
  createGatewayPaths,
  listToolManifests,
  loadGatewayConfig,
  loadGatewayToken,
  redactPayload,
  readJsonFile,
  readUtf8Trim
};
