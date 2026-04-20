const { cleanLine, buildSnippet, tokenizeQuery, extractIndexRefs } = require("./textIds");
const { buildDocumentSearchText } = require("./compile");

function scoreDocument(document, query, tokens, refs) {
  const searchable = buildDocumentSearchText(document);
  const lower = searchable.toLowerCase();
  const titleLower = String(document.title || "").toLowerCase();
  const typeLower = String(document.type || "").toLowerCase();
  const tagLower = (document.tags || []).map((value) => String(value || "").toLowerCase());
  const chainLower = (document.chain || []).map((value) => String(value || "").toLowerCase());
  let score = 0;

  for (const ref of refs) {
    const refLower = ref.toLowerCase();
    if (String(document.id || "").toLowerCase() === refLower) {
      score += 240;
    }
    if (chainLower.includes(refLower)) {
      score += 30;
    }
    if (lower.includes(refLower)) {
      score += 36;
    }
  }

  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (titleLower.includes(token)) {
      score += 18;
    }
    if (tagLower.some((value) => value.includes(token))) {
      score += 12;
    }
    if (typeLower === token) {
      score += 10;
    }
    if (chainLower.some((value) => value.includes(token))) {
      score += 8;
    }
    if (lower.includes(token)) {
      score += 4;
    }
  }

  if (query && lower.includes(query.toLowerCase())) {
    score += 24;
  }

  return score;
}

function searchDocuments(documents, query, options = {}) {
  const text = cleanLine(query);
  if (!text) {
    return {
      query: "",
      tokens: [],
      indexRefs: [],
      count: 0,
      matches: []
    };
  }

  const tokens = tokenizeQuery(text);
  const refs = extractIndexRefs(text);
  const safeLimit = Math.max(1, Math.min(30, Number(options.limit) || 6));
  const maxSnippetChars = Math.max(80, Math.min(420, Number(options.maxSnippetChars) || 220));
  const matches = (documents || [])
    .map((document) => ({
      document,
      score: scoreDocument(document, text, tokens, refs)
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      if (String(left.document.updatedAt || "") !== String(right.document.updatedAt || "")) {
        return String(right.document.updatedAt || "").localeCompare(String(left.document.updatedAt || ""));
      }
      return String(left.document.id || "").localeCompare(String(right.document.id || ""));
    })
    .slice(0, safeLimit)
    .map((row) => ({
      kind: "index",
      id: row.document.id,
      indexId: row.document.id,
      ix: row.document.id,
      lx: row.document.prefix === "LX" ? row.document.id : "",
      prefix: row.document.prefix,
      number: row.document.number,
      source: row.document.source,
      sourceKind: row.document.sourceKind,
      layer: row.document.layer,
      title: row.document.title,
      type: row.document.type,
      tags: row.document.tags.slice(0, 12),
      chain: row.document.chain.slice(0, 8),
      line: 1,
      score: row.score,
      snippet: buildSnippet(
        [row.document.summary, row.document.body].filter(Boolean).join(" "),
        tokens.concat(refs.map((value) => value.toLowerCase())),
        maxSnippetChars
      ),
      updatedAt: row.document.updatedAt
    }));

  return {
    query: text,
    tokens,
    indexRefs: refs,
    count: matches.length,
    matches
  };
}

function collectDocumentRows(documents, limit = 120) {
  const safeLimit = Math.max(1, Math.min(800, Number(limit) || 120));
  return (documents || []).slice(0, safeLimit).map((document) => ({
    id: `agent-index:${document.id}`,
    indexId: document.id,
    ix: document.id,
    lx: document.prefix === "LX" ? document.id : "",
    sourceKind: "agent_index_unified",
    sourceLabel: document.source,
    source: document.source,
    absolutePath: document.absolutePath,
    title: `${document.id} ${document.title}`.trim(),
    updatedAt: document.updatedAt,
    type: document.type,
    tags: document.tags.slice(),
    chain: document.chain.slice(),
    layer: document.layer,
    summary: document.summary,
    body: document.body,
    text: [
      document.id,
      `Name: ${document.title}`,
      `Type: ${document.type}`,
      document.tags.length > 0 ? `Tags: ${document.tags.join(", ")}` : "",
      document.chain.length > 0 ? `Chain: ${document.chain.join(", ")}` : "",
      document.summary,
      document.body
    ].filter(Boolean).join("\n"),
    snippet: document.summary || buildSnippet(document.body, [], 240)
  }));
}

module.exports = {
  scoreDocument,
  searchDocuments,
  collectDocumentRows
};
