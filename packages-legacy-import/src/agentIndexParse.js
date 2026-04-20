function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) return [];
  const cleaned = text.startsWith("[") && text.endsWith("]")
    ? text.slice(1, -1)
    : text;
  return cleaned
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => item.replace(/^["']|["']$/g, ""));
}

function cleanLine(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFrontMatter(rawText) {
  const source = String(rawText || "");
  if (!source.startsWith("---")) {
    return { attrs: {}, body: source };
  }
  const marker = source.indexOf("\n---", 3);
  if (marker < 0) {
    return { attrs: {}, body: source };
  }
  const frontmatter = source.slice(3, marker).trim();
  const body = source.slice(marker + 4).trim();
  const attrs = {};
  for (const line of frontmatter.split(/\r?\n/g)) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (!match) continue;
    const key = String(match[1] || "").trim();
    const value = String(match[2] || "").trim();
    if (!key) continue;
    if (["tags", "chain", "agents"].includes(key)) {
      attrs[key] = normalizeArray(value);
    } else {
      attrs[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { attrs, body };
}

function parseCatalogRows(rawText, options = {}) {
  const normalizeIxId = typeof options.normalizeIxId === "function"
    ? options.normalizeIxId
    : (value) => String(value || "").trim();
  const rows = [];
  for (const line of String(rawText || "").split(/\r?\n/g)) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 8) continue;
    const rawId = String(parts[1] || "").trim();
    const prefixed = rawId.match(/^([A-Za-z]{1,16})[-_\s]?(\d{1,4})$/);
    const numeric = rawId.match(/^(\d{1,4})$/);
    const number = prefixed ? prefixed[2] : numeric ? numeric[1] : "";
    if (!number) continue;
    rows.push({
      id: prefixed ? `${prefixed[1].toUpperCase()}-${String(number).padStart(3, "0")}` : "",
      ix: normalizeIxId(number),
      name: String(parts[2] || "").trim(),
      type: String(parts[3] || "").trim(),
      tags: normalizeArray(parts[4]),
      chain: normalizeArray(String(parts[5] || "").replace(/\u2192/g, ",")),
      agents: normalizeArray(parts[6])
    });
  }
  return rows;
}

function buildSummaryFromBody(body) {
  const lines = String(body || "")
    .split(/\r?\n/g)
    .map((line) => cleanLine(line))
    .filter(Boolean)
    .filter((line) => !/^#/.test(line));
  if (lines.length < 1) {
    return "";
  }
  return cleanLine(lines.slice(0, 3).join(" "));
}

function buildSnippet(text, terms, maxChars = 220) {
  const source = cleanLine(text);
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
    if (source.length <= maxChars) return source;
    return `${source.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
  }
  const start = Math.max(0, firstIndex - 80);
  const end = Math.min(source.length, firstIndex + maxChars - 40);
  const snippet = source.slice(start, end).trim();
  return snippet.length <= maxChars
    ? snippet
    : `${snippet.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function tokenizeQuery(text, options = {}) {
  const stopwords = options.stopwords instanceof Set ? options.stopwords : new Set();
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && token.length <= 40 && !stopwords.has(token))
    )
  ).slice(0, 20);
}

function extractIxRefs(text, options = {}) {
  const normalizeIxId = typeof options.normalizeIxId === "function"
    ? options.normalizeIxId
    : (value) => String(value || "").trim();
  const refs = new Set();
  const source = String(text || "");
  const regex = /\bix[-_\s]?(\d{1,4})\b/gi;
  let match = regex.exec(source);
  while (match) {
    refs.add(normalizeIxId(match[1]));
    match = regex.exec(source);
  }
  return Array.from(refs);
}

module.exports = {
  normalizeArray,
  cleanLine,
  parseFrontMatter,
  parseCatalogRows,
  buildSummaryFromBody,
  buildSnippet,
  tokenizeQuery,
  extractIxRefs
};
