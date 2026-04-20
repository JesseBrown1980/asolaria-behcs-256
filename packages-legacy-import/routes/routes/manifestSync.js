const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { respondError: defaultRespondError, inferHttpStatusForError: defaultInferHttpStatusForError } = require("../../lib/helpers");
const { AGENT_ROLES } = require("../../src/spawnRoleConfig");

const ROUTES_DIR = __dirname;
const TOP_LEVEL_ROUTES_DIR = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.resolve(__dirname, "..", "..", "data", "manifest-sync-routes.json");
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

function ensureRegistryDir() {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
}

function loadManifestRegistry() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) {
      return [];
    }
    const parsed = JSON.parse(String(fs.readFileSync(REGISTRY_PATH, "utf8") || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch (_error) {
    return [];
  }
}

function saveManifestRegistry(entries) {
  ensureRegistryDir();
  const normalized = Array.isArray(entries) ? entries : [];
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function normalizeFileName(value) {
  const raw = path.basename(String(value || "").trim());
  if (!raw) {
    return "";
  }
  const next = raw.endsWith(".js") ? raw : `${raw}.js`;
  if (!/^[A-Za-z0-9._-]+\.js$/.test(next)) {
    return "";
  }
  return next;
}

function toKebabCase(value) {
  return String(value || "")
    .replace(/\.js$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function toPascalCase(value) {
  const parts = toKebabCase(value).split("-").filter(Boolean);
  if (!parts.length) {
    return "Managed";
  }
  return parts.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join("");
}

function filenameToRouteSegment(file) {
  return toKebabCase(file);
}

function normalizeEndpointSpec(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^([A-Z]+)\s+(.+)$/);
  if (!match) {
    return null;
  }
  const method = String(match[1] || "").trim().toUpperCase();
  const routePath = String(match[2] || "").trim();
  if (!HTTP_METHODS.has(method) || !routePath.startsWith("/")) {
    return null;
  }
  return {
    method,
    path: routePath
  };
}

function normalizeManifestRoute(route, index) {
  const file = normalizeFileName(route?.file || `managed-${index + 1}.js`);
  if (!file) {
    return null;
  }
  const endpoints = Array.isArray(route?.endpoints)
    ? route.endpoints.map(normalizeEndpointSpec).filter(Boolean)
    : [];
  return {
    file,
    lines: Number(route?.lines || 0) || 0,
    factory: route?.factory !== false,
    deps: Array.isArray(route?.deps) ? route.deps.map((item) => String(item || "").trim()).filter(Boolean) : [],
    endpoints
  };
}

function normalizeManifestRoutes(value) {
  const items = Array.isArray(value) ? value : [];
  return items.map(normalizeManifestRoute).filter(Boolean);
}

function resolveExistingRoutePath(file) {
  const fileName = normalizeFileName(file);
  if (!fileName) {
    return "";
  }
  const candidates = [
    path.join(ROUTES_DIR, fileName),
    path.join(TOP_LEVEL_ROUTES_DIR, fileName)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "";
}

function listLocalRouteFiles() {
  const names = new Set();
  for (const dir of [ROUTES_DIR, TOP_LEVEL_ROUTES_DIR]) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const entry of fs.readdirSync(dir)) {
      if (String(entry || "").endsWith(".js")) {
        names.add(entry);
      }
    }
  }
  return Array.from(names).sort();
}

function readRouteSource(file) {
  const filePath = resolveExistingRoutePath(file);
  if (!filePath) {
    return "";
  }
  return String(fs.readFileSync(filePath, "utf8") || "");
}

function routeLooksDiverged(file, spec) {
  const source = readRouteSource(file);
  if (!source) {
    return false;
  }
  const missingEndpoints = spec.endpoints.filter((endpoint) => !source.includes(endpoint.path));
  return missingEndpoints.length > 0;
}

function buildStubRouteSource(spec) {
  const functionName = `create${toPascalCase(spec.file)}Router`;
  const handlers = spec.endpoints.map((endpoint) => {
    const method = endpoint.method.toLowerCase();
    const isRead = method === "get" || method === "head";
    const payload = isRead
      ? "{ params: req.params, query: req.query }"
      : "{ params: req.params, query: req.query, body: req.body || {} }";
    return [
      `  router.${method}(${JSON.stringify(endpoint.path)}, (req, res) => {`,
      "    try {",
      "      return res.json({",
      "        ok: true,",
      `        file: ${JSON.stringify(spec.file)},`,
      `        endpoint: ${JSON.stringify(`${endpoint.method} ${endpoint.path}`)},`,
      "        stub: true,",
      `        request: ${payload}`,
      "      });",
      "    } catch (error) {",
      "      return respondError(res, error, inferHttpStatusForError(error, 500));",
      "    }",
      "  });"
    ].join("\n");
  }).join("\n\n");

  return [
    "const express = require(\"express\");",
    "const { respondError: defaultRespondError, inferHttpStatusForError: defaultInferHttpStatusForError } = require(\"../../lib/helpers\");",
    "",
    `function ${functionName}(options = {}) {`,
    "  const router = express.Router();",
    "  const respondError = typeof options.respondError === \"function\" ? options.respondError : defaultRespondError;",
    "  const inferHttpStatusForError = typeof options.inferHttpStatusForError === \"function\"",
    "    ? options.inferHttpStatusForError",
    "    : defaultInferHttpStatusForError;",
    "",
    handlers || "  router.get(\"/status\", (_req, res) => res.json({ ok: true, stub: true }));",
    "",
    "  return router;",
    "}",
    "",
    `module.exports = ${functionName};`,
    ""
  ].join("\n");
}

function mountManagedManifestRoutes(options = {}) {
  const mountRoute = typeof options.mountRoute === "function" ? options.mountRoute : null;
  const mountedFiles = options.mountedFiles instanceof Set ? options.mountedFiles : new Set();
  if (!mountRoute) {
    return [];
  }
  const mounted = [];
  for (const entry of loadManifestRegistry()) {
    const file = normalizeFileName(entry.file);
    if (!file || mountedFiles.has(file)) {
      continue;
    }
    try {
      mountRoute({
        file,
        routeSegment: String(entry.routeSegment || filenameToRouteSegment(file)).trim() || filenameToRouteSegment(file),
        generated: Boolean(entry.generated)
      });
      mountedFiles.add(file);
      mounted.push(file);
    } catch (_error) {
      // Ignore startup remount failures; diff/apply will surface them explicitly.
    }
  }
  return mounted;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stableValue(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function buildAgentProfileFingerprint(profile) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(stableValue(profile)))
    .digest("hex");
}

function listLocalAgentProfiles() {
  return Object.entries(AGENT_ROLES || {})
    .map(([role, config]) => {
      const profile = {
        role: String(role || "").trim().toLowerCase(),
        agentId: String(config?.agentId || "").trim(),
        responsibilityTier: String(config?.responsibilityTier || "").trim().toLowerCase(),
        label: String(config?.label || "").trim(),
        title: String(config?.title || "").trim(),
        identity: String(config?.identity || "").trim(),
        briefing: String(config?.briefing || "").trim(),
        ixTypes: Array.isArray(config?.ixTypes) ? config.ixTypes.map((item) => String(item || "").trim()).filter(Boolean) : [],
        taskKeywords: Array.isArray(config?.taskKeywords) ? config.taskKeywords.map((item) => String(item || "").trim()).filter(Boolean) : [],
        priorityChains: Array.isArray(config?.priorityChains) ? config.priorityChains.map((item) => String(item || "").trim()).filter(Boolean) : [],
        permissions: Array.isArray(config?.permissions) ? config.permissions.map((item) => String(item || "").trim()).filter(Boolean) : [],
        maxEntries: Number(config?.maxEntries || 0),
        includeBootCritical: Boolean(config?.includeBootCritical),
        includeActiveBlockers: Boolean(config?.includeActiveBlockers)
      };
      return {
        ...profile,
        fingerprint: buildAgentProfileFingerprint(profile)
      };
    })
    .sort((a, b) => a.role.localeCompare(b.role));
}

function createManifestSyncRouter(options = {}) {
  const router = express.Router();
  const respondError = typeof options.respondError === "function" ? options.respondError : defaultRespondError;
  const inferHttpStatusForError = typeof options.inferHttpStatusForError === "function"
    ? options.inferHttpStatusForError
    : defaultInferHttpStatusForError;
  const mountRoute = typeof options.mountRoute === "function" ? options.mountRoute : null;
  const mountedFiles = options.mountedFiles instanceof Set ? options.mountedFiles : new Set();

  router.post("/diff", (req, res) => {
    try {
      const routes = normalizeManifestRoutes(req.body?.routes);
      const localFiles = listLocalRouteFiles();
      const localSet = new Set(localFiles);
      const manifestFiles = new Set(routes.map((item) => item.file));

      const match = [];
      const diverged = [];
      const missing = [];
      for (const spec of routes) {
        if (!localSet.has(spec.file)) {
          missing.push({ file: spec.file, reason: "missing_file" });
          continue;
        }
        if (!mountedFiles.has(spec.file)) {
          diverged.push({ file: spec.file, reason: "not_mounted" });
          continue;
        }
        if (routeLooksDiverged(spec.file, spec)) {
          diverged.push({ file: spec.file, reason: "endpoint_mismatch" });
          continue;
        }
        match.push({ file: spec.file });
      }

      const extra = localFiles
        .filter((file) => !manifestFiles.has(file))
        .sort()
        .map((file) => ({ file }));

      return res.json({ ok: true, match, diverged, missing, extra });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.get("/agents", (_req, res) => {
    try {
      const profiles = listLocalAgentProfiles();
      return res.json({
        ok: true,
        count: profiles.length,
        profiles
      });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  router.post("/apply", (req, res) => {
    try {
      const routes = normalizeManifestRoutes(req.body?.routes);
      const registry = loadManifestRegistry();
      const byFile = new Map(registry.map((entry) => [normalizeFileName(entry.file), entry]));
      const mounted = [];
      const generated = [];
      const failed = [];

      for (const spec of routes) {
        const filePath = path.join(ROUTES_DIR, spec.file);
        const routeSegment = filenameToRouteSegment(spec.file);
        const existed = Boolean(resolveExistingRoutePath(spec.file));

        if (!existed) {
          fs.writeFileSync(filePath, buildStubRouteSource(spec), "utf8");
          generated.push({ file: spec.file, routeSegment });
        }

        const registryEntry = {
          file: spec.file,
          routeSegment,
          generated: !existed,
          updatedAt: new Date().toISOString()
        };
        byFile.set(spec.file, registryEntry);

        if (mountedFiles.has(spec.file)) {
          mounted.push({ file: spec.file, routeSegment, mode: "already_mounted" });
          continue;
        }
        if (!mountRoute) {
          failed.push({ file: spec.file, error: "mount_callback_unavailable" });
          continue;
        }

        try {
          mountRoute({
            file: spec.file,
            routeSegment,
            generated: !existed
          });
          mountedFiles.add(spec.file);
          mounted.push({ file: spec.file, routeSegment, mode: existed ? "mounted_existing" : "mounted_generated" });
        } catch (error) {
          failed.push({ file: spec.file, error: String(error?.message || error || "mount_failed") });
        }
      }

      saveManifestRegistry(Array.from(byFile.values()));
      return res.json({ ok: true, mounted, generated, failed });
    } catch (error) {
      return respondError(res, error, inferHttpStatusForError(error, 500));
    }
  });

  return router;
}

module.exports = createManifestSyncRouter;
module.exports.mountManagedManifestRoutes = mountManagedManifestRoutes;
module.exports.loadManifestRegistry = loadManifestRegistry;
module.exports.saveManifestRegistry = saveManifestRegistry;
module.exports.filenameToRouteSegment = filenameToRouteSegment;
module.exports.listLocalAgentProfiles = listLocalAgentProfiles;
