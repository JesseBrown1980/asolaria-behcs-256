const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");

const repoRoot = path.resolve(__dirname, "..", "..");
const configPath = path.join(__dirname, "asolaria.memory.json");

function loadConfig() {
  const fallback = {
    bind: "127.0.0.1",
    port: 5444,
    livingFilesDir: "living-files",
    maxFiles: 300,
    maxFileChars: 200000
  };
  try {
    if (!fs.existsSync(configPath)) {
      return fallback;
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    return {
      ...fallback,
      ...parsed
    };
  } catch {
    return fallback;
  }
}

const config = loadConfig();
const app = express();
app.use(express.json({ limit: "512kb" }));

function normalizePathForCompare(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function collectTextFiles(rootDir, maxFiles) {
  const out = [];
  const stack = [rootDir];
  const allowedExt = new Set([".md", ".txt", ".json"]);
  while (stack.length > 0 && out.length < maxFiles) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!allowedExt.has(ext)) {
        continue;
      }
      out.push(full);
    }
  }
  return out;
}

function normalizeQueryTerms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 16);
}

function countMatches(textLower, term) {
  if (!term) return 0;
  let count = 0;
  let index = 0;
  while (index >= 0) {
    index = textLower.indexOf(term, index);
    if (index < 0) break;
    count += 1;
    index += term.length;
  }
  return count;
}

function buildSnippet(text, terms) {
  const source = String(text || "");
  if (!source) return "";
  const lower = source.toLowerCase();
  let firstIndex = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (firstIndex < 0 || idx < firstIndex)) {
      firstIndex = idx;
    }
  }
  if (firstIndex < 0) {
    return source.slice(0, 320).replace(/\s+/g, " ").trim();
  }
  const start = Math.max(0, firstIndex - 120);
  const end = Math.min(source.length, firstIndex + 220);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

function queryLivingFiles(query, k = 5) {
  const livingRoot = path.resolve(repoRoot, String(config.livingFilesDir || "living-files"));
  if (!fs.existsSync(livingRoot)) {
    return [];
  }

  const terms = normalizeQueryTerms(query);
  if (terms.length < 1) {
    return [];
  }

  const files = collectTextFiles(livingRoot, Number(config.maxFiles) || 300);
  const results = [];
  for (const filePath of files) {
    let text = "";
    try {
      text = String(fs.readFileSync(filePath, "utf8") || "");
    } catch {
      continue;
    }
    if (!text.trim()) continue;
    const bounded = text.slice(0, Number(config.maxFileChars) || 200000);
    const lower = bounded.toLowerCase();
    let score = 0;
    for (const term of terms) {
      score += countMatches(lower, term);
    }
    if (score < 1) continue;
    results.push({
      source: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
      score,
      snippet: buildSnippet(bounded, terms)
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(1, Math.min(Number(k) || 5, 20)));
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "memory-indexer",
    legacy: true,
    retrievalMode: "lexical_legacy",
    vector: false,
    warning: "Legacy keyword service only. Use main Asolaria /api/workspace-knowledge routes for hybrid semantic retrieval.",
    bind: config.bind,
    port: config.port,
    livingFilesDir: String(config.livingFilesDir || "living-files"),
    time: new Date().toISOString()
  });
});

app.post("/query", (req, res) => {
  const query = String(req.body?.query || "").trim();
  if (!query) {
    return res.status(400).json({ ok: false, error: "query is required" });
  }
  const kRaw = Number(req.body?.k || 5);
  const k = Number.isFinite(kRaw) ? Math.max(1, Math.min(Math.round(kRaw), 20)) : 5;
  const documents = queryLivingFiles(query, k);
  return res.json({
    ok: true,
    legacy: true,
    retrievalMode: "lexical_legacy",
    query,
    k,
    count: documents.length,
    documents
  });
});

app.get("/query", (req, res) => {
  const query = String(req.query?.q || req.query?.query || "").trim();
  if (!query) {
    return res.status(400).json({ ok: false, error: "query is required" });
  }
  const kRaw = Number(req.query?.k || 5);
  const k = Number.isFinite(kRaw) ? Math.max(1, Math.min(Math.round(kRaw), 20)) : 5;
  const documents = queryLivingFiles(query, k);
  return res.json({
    ok: true,
    legacy: true,
    retrievalMode: "lexical_legacy",
    query,
    k,
    count: documents.length,
    documents
  });
});

http.createServer(app).listen(config.port, config.bind, () => {
  console.log(`Memory indexer is listening on http://${config.bind}:${config.port}`);
});
