const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "for", "from", "if", "in", "into",
  "is", "it", "its", "of", "on", "or", "that", "the", "their", "them", "there", "these", "they", "this", "to",
  "was", "we", "were", "with", "you", "your", "task", "tasks", "note", "notes", "workspace", "asolaria",
  "agent", "agents", "index"
]);

function cleanLine(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanLine(item)).filter(Boolean);
  }
  const text = cleanLine(value);
  if (!text) {
    return [];
  }
  const cleaned = text.startsWith("[") && text.endsWith("]")
    ? text.slice(1, -1)
    : text;
  return cleaned
    .split(",")
    .map((item) => cleanLine(item.replace(/^["'`]|["'`]$/g, "")))
    .filter(Boolean);
}

function padIndexNumber(rawNumber) {
  const digits = String(rawNumber || "").replace(/\D+/g, "");
  if (!digits) {
    return "";
  }
  return digits.padStart(Math.max(3, digits.length), "0");
}

function normalizePrefixedId(prefix, rawNumber) {
  const number = padIndexNumber(rawNumber);
  if (!number) {
    return "";
  }
  return `${String(prefix || "").toUpperCase()}-${number}`;
}

function normalizeIndexId(value) {
  const text = cleanLine(value);
  if (!text) {
    return "";
  }
  const match = text.match(/\b([A-Za-z]{1,16})[-_\s]?(\d{1,4})\b/);
  if (match) {
    return normalizePrefixedId(match[1], match[2]);
  }
  return text.toUpperCase();
}

function normalizeIxId(value) {
  const text = cleanLine(value);
  if (!text) {
    return "";
  }
  const match = text.match(/\bIX[-_\s]?(\d{1,4})\b/i) || text.match(/(\d{1,4})/);
  if (!match) {
    return "";
  }
  return normalizePrefixedId("IX", match[1]);
}

function normalizeLxId(value) {
  const text = cleanLine(value);
  if (!text) {
    return "";
  }
  const match = text.match(/\bLX[-_\s]?(\d{1,4})\b/i) || text.match(/(\d{1,4})/);
  if (!match) {
    return "";
  }
  return normalizePrefixedId("LX", match[1]);
}

function normalizeChainValue(value) {
  const text = cleanLine(value);
  if (!text) {
    return "";
  }
  return normalizeIndexId(text) || text;
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
  const frontMatter = source.slice(3, marker).trim();
  const body = source.slice(marker + 4).trim();
  const attrs = {};
  for (const line of frontMatter.split(/\r?\n/g)) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (!match) {
      continue;
    }
    const key = cleanLine(match[1]);
    const value = cleanLine(match[2]);
    if (!key) {
      continue;
    }
    if (["tags", "chain", "agents"].includes(key)) {
      attrs[key] = normalizeArray(value).map((item) => (key === "chain" ? normalizeChainValue(item) : item));
      continue;
    }
    attrs[key] = value.replace(/^["'`]|["'`]$/g, "");
  }
  return { attrs, body };
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
  if (!source) {
    return "";
  }
  const lower = source.toLowerCase();
  let firstIndex = -1;
  for (const term of terms) {
    const needle = cleanLine(term).toLowerCase();
    if (!needle) {
      continue;
    }
    const index = lower.indexOf(needle);
    if (index >= 0 && (firstIndex < 0 || index < firstIndex)) {
      firstIndex = index;
    }
  }
  if (firstIndex < 0) {
    return source.length <= maxChars
      ? source
      : `${source.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
  }
  const start = Math.max(0, firstIndex - 80);
  const end = Math.min(source.length, firstIndex + maxChars - 40);
  const snippet = source.slice(start, end).trim();
  return snippet.length <= maxChars
    ? snippet
    : `${snippet.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function tokenizeQuery(text) {
  return Array.from(
    new Set(
      String(text || "")
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && token.length <= 40 && !STOPWORDS.has(token))
    )
  ).slice(0, 20);
}

function extractIndexRefs(text) {
  const refs = new Set();
  const regex = /\b(?:IX|LX)[-_\s]?(\d{1,4})\b/gi;
  let match = regex.exec(String(text || ""));
  while (match) {
    refs.add(normalizeIndexId(match[0]));
    match = regex.exec(String(text || ""));
  }
  return Array.from(refs);
}

module.exports = {
  cleanLine,
  normalizeArray,
  normalizeIndexId,
  normalizeIxId,
  normalizeLxId,
  normalizeChainValue,
  parseFrontMatter,
  buildSummaryFromBody,
  buildSnippet,
  tokenizeQuery,
  extractIndexRefs
};
