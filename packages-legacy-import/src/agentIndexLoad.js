const fs = require("fs");
const path = require("path");

function createAgentIndexLoadRuntime(input = {}) {
  const agentIndexRoot = String(input.agentIndexRoot || "").trim();
  const catalogPath = String(input.catalogPath || "").trim();
  const typeSubdirs = Array.isArray(input.typeSubdirs) ? input.typeSubdirs.slice() : [];
  const projectRoot = String(input.projectRoot || "").trim();
  const defaultCacheTtlMs = Math.max(1000, Number(input.defaultCacheTtlMs) || 45000);
  const parseCatalogRows = input.parseCatalogRows;
  const parseFrontMatter = input.parseFrontMatter;
  const buildSummaryFromBody = input.buildSummaryFromBody;
  const normalizeIxId = input.normalizeIxId;
  const normalizeArray = input.normalizeArray;
  const cleanLine = input.cleanLine;

  let cache = {
    loadedAt: 0,
    signature: "",
    catalogRows: [],
    entries: []
  };

  function computeSignature(catalogStat, ixFiles) {
    const payload = [
      `${catalogPath}:${Number(catalogStat?.mtimeMs || 0)}:${Number(catalogStat?.size || 0)}`,
      ...ixFiles.map((row) => `${row.path}:${row.mtimeMs}:${row.size}`)
    ];
    return payload.join("|");
  }

  function listIxFiles() {
    if (!fs.existsSync(agentIndexRoot)) {
      return [];
    }
    const seen = new Map();
    const ixPattern = /^IX-\d{3,4}\.md$/i;

    for (const subdir of typeSubdirs) {
      const subdirPath = path.join(agentIndexRoot, subdir);
      if (!fs.existsSync(subdirPath)) continue;
      try {
        const entries = fs.readdirSync(subdirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !ixPattern.test(entry.name)) continue;
          const fullPath = path.join(subdirPath, entry.name);
          const stat = fs.statSync(fullPath);
          seen.set(entry.name, {
            path: fullPath,
            mtimeMs: Number(stat.mtimeMs || 0),
            size: Number(stat.size || 0)
          });
        }
      } catch (_error) { /* skip unreadable subdirs */ }
    }

    try {
      const rootEntries = fs.readdirSync(agentIndexRoot, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (!entry.isFile() || !ixPattern.test(entry.name)) continue;
        if (seen.has(entry.name)) continue;
        const fullPath = path.join(agentIndexRoot, entry.name);
        const stat = fs.statSync(fullPath);
        seen.set(entry.name, {
          path: fullPath,
          mtimeMs: Number(stat.mtimeMs || 0),
          size: Number(stat.size || 0)
        });
      }
    } catch (_error) { /* skip */ }

    return Array.from(seen.values())
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  function loadAgentIndex(options = {}) {
    const force = Boolean(options.force);
    const ttlMs = Math.max(1000, Number(options.cacheTtlMs) || defaultCacheTtlMs);
    if (!fs.existsSync(catalogPath)) {
      return {
        loadedAt: 0,
        catalogRows: [],
        entries: []
      };
    }

    const catalogStat = fs.statSync(catalogPath);
    const ixFiles = listIxFiles();
    const signature = computeSignature(catalogStat, ixFiles);
    const now = Date.now();
    const cacheAgeMs = now - Number(cache.loadedAt || 0);
    const canReuse = !force
      && cache.loadedAt > 0
      && cache.signature === signature
      && cacheAgeMs <= ttlMs;

    if (canReuse) {
      return {
        loadedAt: cache.loadedAt,
        catalogRows: cache.catalogRows.slice(),
        entries: cache.entries.slice()
      };
    }

    const catalogRaw = String(fs.readFileSync(catalogPath, "utf8") || "");
    const catalogRows = parseCatalogRows(catalogRaw, { normalizeIxId });
    const catalogMap = new Map(catalogRows.map((row) => [row.ix, row]));
    const entries = [];
    for (const file of ixFiles) {
      let rawText = "";
      try {
        rawText = String(fs.readFileSync(file.path, "utf8") || "");
      } catch (_error) {
        rawText = "";
      }
      if (!rawText.trim()) {
        continue;
      }
      const parsed = parseFrontMatter(rawText);
      const ix = normalizeIxId(parsed.attrs.ix || path.basename(file.path));
      const catalogRow = catalogMap.get(ix) || {};
      const body = String(parsed.body || "").trim();
      const summary = buildSummaryFromBody(body);
      const title = cleanLine(parsed.attrs.name || catalogRow.name || ix);
      const type = cleanLine(parsed.attrs.type || catalogRow.type || "reference");
      const tags = normalizeArray(parsed.attrs.tags || catalogRow.tags || []);
      const chain = normalizeArray(parsed.attrs.chain || catalogRow.chain || []);
      const source = path.relative(projectRoot, file.path).replace(/\\/g, "/");
      const searchable = [
        ix,
        title,
        type,
        tags.join(" "),
        chain.join(" "),
        summary,
        body
      ].filter(Boolean).join("\n");
      entries.push({
        ix,
        title,
        type,
        tags,
        chain,
        source,
        absolutePath: file.path,
        updatedAt: new Date(file.mtimeMs).toISOString(),
        summary,
        body,
        searchable,
        searchableLower: searchable.toLowerCase()
      });
    }

    cache = {
      loadedAt: now,
      signature,
      catalogRows,
      entries
    };
    return {
      loadedAt: cache.loadedAt,
      catalogRows: cache.catalogRows.slice(),
      entries: cache.entries.slice()
    };
  }

  return {
    computeSignature,
    listIxFiles,
    loadAgentIndex
  };
}

module.exports = {
  createAgentIndexLoadRuntime
};
