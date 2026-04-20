const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const z = require("zod/v4");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpExpressApp } = require("@modelcontextprotocol/sdk/server/express.js");
const { searchWorkspaceKnowledgeHybrid } = require("../src/workspaceKnowledgeStore");

const DEFAULT_PORT = 4793;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_TOOL_NAME = "codebase-retrieval";
const DEFAULT_AUGGIE_PATH = "C:\\nvm4w\\nodejs\\auggie.cmd";
const DEFAULT_STATUS_FILE = path.join(process.cwd(), "logs", "augment-mcp-bridge-status.json");
const FALLBACK_TOOL_DESCRIPTION = "Read-only codebase retrieval over the local Asolaria workspace using workspace knowledge and ripgrep-backed source search.";
const SEARCH_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "your", "about", "what", "when", "where",
  "which", "while", "using", "used", "have", "has", "how", "why", "are", "was", "were", "will", "would",
  "should", "could", "can", "code", "repo", "repository", "search", "find", "look", "need", "help"
]);

function parseArgs(argv) {
  const out = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = String(argv[index] || "").trim();
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = String(argv[index + 1] || "");
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

function asInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizePath(input, fallback = "") {
  const raw = String(input || fallback || "").trim();
  if (!raw) return "";
  return path.resolve(raw);
}

function normalizeAuggiePath(input, fallback = DEFAULT_AUGGIE_PATH) {
  const resolved = normalizePath(input, fallback) || DEFAULT_AUGGIE_PATH;
  if (/\.ps1$/i.test(resolved)) {
    const cmdSibling = resolved.replace(/\.ps1$/i, ".cmd");
    if (fs.existsSync(cmdSibling)) {
      return cmdSibling;
    }
  }
  return resolved;
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

function normalizeText(value, maxChars = 400) {
  const text = String(value || "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function maskToken(value) {
  const token = String(value || "");
  if (!token) return "";
  if (token.length <= 10) return "*".repeat(token.length);
  return `${token.slice(0, 4)}${"*".repeat(Math.max(4, token.length - 8))}${token.slice(-4)}`;
}

function createAuthMiddleware(expectedToken) {
  return (req, res, next) => {
    const actual = String(req.headers.authorization || "").trim();
    const custom = String(req.headers["x-asolaria-bridge-token"] || "").trim();
    const queryToken = normalizeText(
      req.query?.token
      || req.query?.access_token
      || req.query?.x_asolaria_bridge_token
      || req.query?.xAsolariaBridgeToken
      || "",
      400
    );
    const authorized = actual === `Bearer ${expectedToken}` || custom === expectedToken || queryToken === expectedToken;
    if (!authorized) {
      res.setHeader("WWW-Authenticate", "Bearer");
      return res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized."
        },
        id: null
      });
    }
    return next();
  };
}

function buildAuggieSessionEnv() {
  const sessionPath = path.join(process.env.USERPROFILE || process.env.HOME || "", ".augment", "session.json");
  const sessionJson = readTextFile(sessionPath).trim();
  if (!sessionJson) {
    return {};
  }
  return {
    AUGMENT_SESSION_AUTH: sessionJson
  };
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
    if (result.status !== 0) {
      return "";
    }
    return String(result.stdout || "")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .find(Boolean) || "";
  } catch (_error) {
    return "";
  }
}

function hasUpstreamTool(state) {
  return Boolean(state?.upstream?.client && state?.upstream?.tool);
}

function hasFallbackTool(state) {
  return Boolean(state?.config?.workspaceRoot && fs.existsSync(state.config.workspaceRoot));
}

function getBridgeToolMode(state) {
  if (hasUpstreamTool(state)) {
    return "auggie";
  }
  if (hasFallbackTool(state)) {
    return "local_workspace_search";
  }
  return "unavailable";
}

function extractSearchTerms(request) {
  const text = normalizeText(request, 1600);
  const out = [];
  const seen = new Set();
  const quoted = text.match(/"([^"\r\n]{3,120})"/g) || [];
  for (const raw of quoted) {
    const item = raw.slice(1, -1).trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 6) {
      return out;
    }
  }
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 80 && !SEARCH_STOPWORDS.has(item));
  for (const item of words) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= 6) {
      break;
    }
  }
  return out;
}

function toWorkspaceRelative(absolutePath, workspaceRoot) {
  try {
    const relative = path.relative(workspaceRoot, absolutePath);
    if (relative.startsWith("..") || relative === "..") {
      return absolutePath;
    }
    return relative.replace(/\\/g, "/");
  } catch (_error) {
    return absolutePath;
  }
}

function resolveSearchRoot(requestedPath, workspaceRoot) {
  const target = normalizeText(requestedPath, 800);
  const fallback = path.resolve(workspaceRoot);
  if (!target) {
    return fallback;
  }
  try {
    const resolved = path.resolve(target);
    const relative = path.relative(fallback, resolved);
    if (relative.startsWith("..") || relative === "..") {
      return fallback;
    }
    if (!fs.existsSync(resolved)) {
      return fallback;
    }
    return resolved;
  } catch (_error) {
    return fallback;
  }
}

function searchCodebaseWithRipgrep(request, directoryPath, workspaceRoot) {
  const rgPath = commandExists("rg");
  if (!rgPath) {
    return {
      ok: false,
      reason: "rg_not_found",
      matches: []
    };
  }

  const terms = extractSearchTerms(request);
  if (terms.length < 1) {
    return {
      ok: true,
      reason: "no_search_terms",
      matches: []
    };
  }

  const matches = [];
  const seen = new Set();
  const globs = [
    "!node_modules/**",
    "!.git/**",
    "!logs/**",
    "!data/**",
    "!dist/**",
    "!build/**",
    "!coverage/**",
    "!runtime/**"
  ];

  for (const term of terms) {
    const args = [
      "--json",
      "--line-number",
      "--hidden",
      "--smart-case",
      "--max-count", "8"
    ];
    for (const glob of globs) {
      args.push("--glob", glob);
    }
    args.push(term, directoryPath);

    let result = null;
    try {
      result = childProcess.spawnSync(rgPath, args, {
        cwd: directoryPath,
        windowsHide: true,
        encoding: "utf8",
        timeout: 12000,
        maxBuffer: 1024 * 1024 * 4
      });
    } catch (_error) {
      result = null;
    }

    const stdout = String(result?.stdout || "");
    if (!stdout.trim()) {
      continue;
    }
    const lines = stdout.split(/\r?\n/g);
    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed = null;
      try {
        parsed = JSON.parse(line);
      } catch (_error) {
        parsed = null;
      }
      if (!parsed || parsed.type !== "match") {
        continue;
      }
      const filePath = String(parsed.data?.path?.text || "").trim();
      const lineNumber = Number(parsed.data?.line_number || 0) || 0;
      const text = normalizeText(parsed.data?.lines?.text || "", 240).replace(/\s+/g, " ").trim();
      if (!filePath || !lineNumber || !text) {
        continue;
      }
      const absolutePath = path.resolve(directoryPath, filePath);
      const relativePath = toWorkspaceRelative(absolutePath, workspaceRoot);
      const key = `${relativePath}:${lineNumber}:${text}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      matches.push({
        path: relativePath,
        line: lineNumber,
        text,
        term
      });
      if (matches.length >= 12) {
        return {
          ok: true,
          reason: "matched",
          matches
        };
      }
    }
  }

  return {
    ok: true,
    reason: matches.length > 0 ? "matched" : "no_matches",
    matches
  };
}

async function runLocalFallbackTool(args, state) {
  const request = normalizeText(args?.information_request || "", 1600);
  const directoryPath = resolveSearchRoot(args?.directory_path || "", state.config.workspaceRoot);
  const knowledge = request
    ? await searchWorkspaceKnowledgeHybrid(request, { limit: 6 })
    : { matches: [], count: 0, mode: "lexical" };
  const code = request
    ? searchCodebaseWithRipgrep(request, directoryPath, state.config.workspaceRoot)
    : { matches: [], count: 0, reason: "empty_request" };

  const sections = [
    "Asolaria local fallback codebase retrieval",
    `Workspace root: ${state.config.workspaceRoot}`,
    `Search root: ${directoryPath}`,
    `Mode: local_workspace_search`
  ];

  if (request) {
    sections.push(`Request: ${request}`);
  }

  const knowledgeMatches = Array.isArray(knowledge?.matches) ? knowledge.matches.slice(0, 6) : [];
  if (knowledgeMatches.length > 0) {
    sections.push("", `Workspace knowledge hits (${knowledge.mode || "hybrid"}):`);
    for (const row of knowledgeMatches) {
      const lineSuffix = row.line ? `:${row.line}` : "";
      sections.push(`- [${row.kind || "memory"}] ${row.source || "unknown"}${lineSuffix} score=${Number(row.score || 0).toFixed(3)} ${row.snippet || ""}`.trim());
    }
  } else {
    sections.push("", "Workspace knowledge hits: none");
  }

  const codeMatches = Array.isArray(code?.matches) ? code.matches.slice(0, 12) : [];
  if (codeMatches.length > 0) {
    sections.push("", "Source matches:");
    for (const row of codeMatches) {
      sections.push(`- ${row.path}:${row.line} [${row.term}] ${row.text}`);
    }
  } else {
    sections.push("", `Source matches: none (${code.reason || "unknown"})`);
  }

  if (!hasUpstreamTool(state) && state.upstream.lastError) {
    sections.push("", `Upstream note: ${state.upstream.lastError}`);
  }

  return {
    content: [
      {
        type: "text",
        text: sections.join("\n")
      }
    ]
  };
}

function createBridgeState(config) {
  return {
    config,
    startedAt: new Date().toISOString(),
    upstream: {
      client: null,
      transport: null,
      tool: null,
      lastError: "",
      note: "",
      connectedAt: "",
      pid: 0
    },
    connecting: null
  };
}

function writeStatusFile(state) {
  const target = state.config.statusFile;
  if (!target) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      JSON.stringify(
        {
          ok: true,
          startedAt: state.startedAt,
          host: state.config.host,
          port: state.config.port,
          localUrl: `http://${state.config.host}:${state.config.port}/mcp`,
          workspaceRoot: state.config.workspaceRoot,
          auggiePath: state.config.auggiePath,
          upstream: {
            ready: hasUpstreamTool(state) || hasFallbackTool(state),
            mode: getBridgeToolMode(state),
            connectedAt: state.upstream.connectedAt || null,
            pid: state.upstream.pid || null,
            toolName: state.upstream.tool?.name || DEFAULT_TOOL_NAME,
            lastError: state.upstream.lastError || null,
            note: state.upstream.note || null
          },
          authorizationHint: `Bearer ${maskToken(state.config.bridgeToken)}`,
          urlTokenHint: `?token=${maskToken(state.config.bridgeToken)}`
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error(`[augment-mcp-bridge] Failed to write status file: ${error?.message || error}`);
  }
}

async function closeUpstream(state) {
  const transport = state.upstream.transport;
  state.upstream.client = null;
  state.upstream.transport = null;
  state.upstream.tool = null;
  state.upstream.connectedAt = "";
  state.upstream.pid = 0;
  state.upstream.note = "";
  if (!transport) {
    writeStatusFile(state);
    return;
  }
  try {
    await transport.close();
  } catch (_error) {
    // best effort
  }
  writeStatusFile(state);
}

async function connectUpstream(state) {
  if (state.connecting) {
    return state.connecting;
  }
  if (!state.config.auggiePath || !fs.existsSync(state.config.auggiePath)) {
    state.upstream.lastError = "";
    state.upstream.note = "Serving Asolaria-owned local retrieval. Optional Auggie upstream is not installed on this machine.";
    writeStatusFile(state);
    return state.upstream;
  }

  state.connecting = (async () => {
    await closeUpstream(state);
    state.upstream.lastError = "";
    state.upstream.note = "";
    writeStatusFile(state);

    const client = new Client(
      { name: "asolaria-augment-bridge", version: "1.0.0" },
      { capabilities: {} }
    );
    const transport = new StdioClientTransport({
      command: state.config.auggiePath,
      args: ["--mcp", "--mcp-auto-workspace"],
      cwd: state.config.workspaceRoot,
      env: {
        ...process.env,
        ...buildAuggieSessionEnv()
      },
      stderr: "pipe"
    });

    if (transport.stderr) {
      transport.stderr.on("data", (chunk) => {
        const text = String(chunk || "").trim();
        if (text) {
          console.error(`[augment-mcp-bridge][auggie] ${text}`);
        }
      });
    }

    transport.onerror = (error) => {
      state.upstream.lastError = String(error?.message || error || "transport_error");
      writeStatusFile(state);
    };

    transport.onclose = () => {
      state.upstream.client = null;
      state.upstream.transport = null;
      state.upstream.tool = null;
      state.upstream.connectedAt = "";
      state.upstream.pid = 0;
      writeStatusFile(state);
    };

    await client.connect(transport);
    const toolsResult = await client.listTools();
    const tool = Array.isArray(toolsResult?.tools)
      ? toolsResult.tools.find((entry) => String(entry?.name || "").trim() === DEFAULT_TOOL_NAME)
      : null;
    if (!tool) {
      throw new Error(`Auggie MCP did not expose ${DEFAULT_TOOL_NAME}.`);
    }

    state.upstream.client = client;
    state.upstream.transport = transport;
    state.upstream.tool = tool;
    state.upstream.connectedAt = new Date().toISOString();
    state.upstream.pid = Number(transport.pid || 0) || 0;
    state.upstream.note = "Auggie upstream connected.";
    writeStatusFile(state);
  })().catch(async (error) => {
    const message = String(error?.message || error || "upstream_connect_failed");
    state.upstream.lastError = hasFallbackTool(state) ? "" : message;
    state.upstream.note = hasFallbackTool(state)
      ? `Serving Asolaria-owned local retrieval. Optional Auggie upstream failed: ${message}`
      : "";
    await closeUpstream(state);
    writeStatusFile(state);
    throw error;
  }).finally(() => {
    state.connecting = null;
  });

  return state.connecting;
}

async function ensureUpstream(state) {
  if (state.upstream.client && state.upstream.tool) {
    return state.upstream;
  }
  await connectUpstream(state);
  if (!state.upstream.client || !state.upstream.tool) {
    throw new Error(state.upstream.lastError || "Augment upstream is unavailable.");
  }
  return state.upstream;
}

async function createBridgeServer(state) {
  let upstream = null;
  if (!hasUpstreamTool(state)) {
    try {
      await connectUpstream(state);
    } catch (_error) {
      upstream = null;
    }
  }
  if (hasUpstreamTool(state)) {
    upstream = state.upstream;
  }
  const tool = upstream?.tool || null;
  const inputSchema = tool?.inputSchema?.properties || {};
  const informationDescription = String(inputSchema.information_request?.description || "").trim();
  const directoryDescription = String(inputSchema.directory_path?.description || "").trim();

  const server = new McpServer(
    { name: "asolaria-augment-bridge", version: "1.0.0" },
    { capabilities: {} }
  );

  server.registerTool(
    DEFAULT_TOOL_NAME,
    {
      description: String(tool?.description || FALLBACK_TOOL_DESCRIPTION).trim(),
      inputSchema: {
        information_request: z.string().describe(informationDescription || "Natural language request for codebase context."),
        directory_path: z.string().describe(directoryDescription || "Absolute path to the repository to search.")
      }
    },
    async (args) => {
      if (upstream?.client) {
        const result = await upstream.client.callTool({
          name: DEFAULT_TOOL_NAME,
          arguments: {
            information_request: String(args.information_request || ""),
            directory_path: String(args.directory_path || "")
          }
        });
        return result;
      }
      return runLocalFallbackTool(args, state);
    }
  );

  return server;
}

async function main() {
  const args = parseArgs(process.argv);
  const port = asInt(args.port, DEFAULT_PORT, 1, 65535);
  const host = String(args.host || DEFAULT_HOST).trim() || DEFAULT_HOST;
  const workspaceRoot = normalizePath(args["workspace-root"], process.cwd());
  const auggiePath = normalizeAuggiePath(args["auggie-path"], DEFAULT_AUGGIE_PATH);
  const statusFile = normalizePath(args["status-file"], DEFAULT_STATUS_FILE);
  const bridgeToken = String(args.token || "").trim() || readTextFile(normalizePath(args["token-file"])).trim();

  if (!bridgeToken) {
    throw new Error("Bridge token is required. Use --token or --token-file.");
  }
  if (!fs.existsSync(workspaceRoot)) {
    throw new Error(`Workspace root does not exist: ${workspaceRoot}`);
  }

  const state = createBridgeState({
    port,
    host,
    workspaceRoot,
    auggiePath,
    bridgeToken,
    statusFile
  });

  // The bridge still listens on loopback, but the public tunnel forwards its own Host header.
  // Skip localhost-only Host validation here and rely on loopback binding plus bearer auth.
  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.get("/health", async (_req, res) => {
    const ready = hasUpstreamTool(state) || hasFallbackTool(state);
    return res.json({
      ok: true,
      bridge: {
        host,
        port,
        localUrl: `http://${host}:${port}/mcp`,
        ready,
        startedAt: state.startedAt
      },
      upstream: {
        mode: getBridgeToolMode(state),
        ready,
        connectedAt: state.upstream.connectedAt || null,
        toolName: state.upstream.tool?.name || DEFAULT_TOOL_NAME,
        pid: state.upstream.pid || null,
        lastError: state.upstream.lastError || null,
        note: state.upstream.note || null
      }
    });
  });

  app.get("/status", (_req, res) => {
    return res.json({
      ok: true,
      startedAt: state.startedAt,
      host,
      port,
      localUrl: `http://${host}:${port}/mcp`,
      authorizationHint: `Bearer ${maskToken(bridgeToken)}`,
      urlTokenHint: `?token=${maskToken(bridgeToken)}`,
      workspaceRoot,
      auggiePath,
      upstream: {
        ready: hasUpstreamTool(state) || hasFallbackTool(state),
        mode: getBridgeToolMode(state),
        connectedAt: state.upstream.connectedAt || null,
        pid: state.upstream.pid || null,
        toolName: state.upstream.tool?.name || DEFAULT_TOOL_NAME,
        lastError: state.upstream.lastError || null,
        note: state.upstream.note || null
      }
    });
  });

  app.use("/mcp", createAuthMiddleware(bridgeToken));

  app.post("/mcp", async (req, res) => {
    let server = null;
    let transport = null;
    try {
      server = await createBridgeServer(state);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        transport.close().catch(() => {});
        server.close();
      });
    } catch (error) {
      console.error(`[augment-mcp-bridge] MCP request failed: ${error?.stack || error}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: String(error?.message || error || "Internal server error")
          },
          id: null
        });
      }
      if (transport) {
        transport.close().catch(() => {});
      }
      if (server) {
        server.close();
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    return res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  app.delete("/mcp", (_req, res) => {
    return res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  const listener = app.listen(port, host, () => {
    writeStatusFile(state);
    console.log(`[augment-mcp-bridge] Listening on http://${host}:${port}/mcp`);
    connectUpstream(state).catch((error) => {
      console.error(`[augment-mcp-bridge] Upstream connect failed: ${error?.message || error}`);
    });
  });

  const shutdown = async () => {
    listener.close();
    await closeUpstream(state);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(`[augment-mcp-bridge] Fatal: ${error?.stack || error}`);
  process.exit(1);
});
