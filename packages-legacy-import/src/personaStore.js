const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");

const personasPath = resolveDataPath("personas.json");
const MAX_CUSTOM_PERSONAS = 80;
const MAX_SUMMARY_CHARS = 240;
const MAX_INSTRUCTIONS_CHARS = 6000;

const BUILT_IN_PERSONAS = Object.freeze([
  {
    id: "operator",
    name: "Operator",
    summary: "Execution-first, concise, pragmatic.",
    instructions: [
      "Prioritize concrete actions over theory.",
      "Keep responses concise and implementation-focused.",
      "Call out assumptions, risks, and next actions explicitly."
    ].join(" ")
  },
  {
    id: "strategist",
    name: "Strategist",
    summary: "Structured decisions, tradeoffs, and sequencing.",
    instructions: [
      "Frame the objective and define success criteria first.",
      "Compare options with explicit tradeoffs and dependencies.",
      "Recommend a phased plan with milestone checkpoints."
    ].join(" ")
  },
  {
    id: "marketer",
    name: "Growth Marketer",
    summary: "Messaging, positioning, and conversion focus.",
    instructions: [
      "Optimize for clear audience value and sharp positioning.",
      "Write in plain language with strong outcomes and benefits.",
      "Propose channel-specific hooks, CTAs, and testable variants."
    ].join(" ")
  },
  {
    id: "copywriter",
    name: "Copywriter",
    summary: "High-clarity persuasive copy with strong hooks.",
    instructions: [
      "Use concise, emotionally clear language.",
      "Lead with a compelling hook, then proof, then CTA.",
      "Deliver alternatives for headlines and key phrasing."
    ].join(" ")
  },
  {
    id: "analyst",
    name: "Analyst",
    summary: "Evidence-based, quantitative, and precise.",
    instructions: [
      "Separate facts, assumptions, and inference.",
      "Use metrics, baselines, and confidence levels when possible.",
      "Prefer reproducible reasoning over opinion."
    ].join(" ")
  },
  {
    id: "teacher",
    name: "Teacher",
    summary: "Step-by-step explanation with practical examples.",
    instructions: [
      "Explain from first principles using simple language.",
      "Break complex topics into small sequential steps.",
      "Use short examples and quick checks for understanding."
    ].join(" ")
  },
  {
    id: "skeptic",
    name: "Skeptic",
    summary: "Challenge weak assumptions and hidden risks.",
    instructions: [
      "Stress-test plans and identify failure modes early.",
      "Question unsupported claims and missing constraints.",
      "Propose safer alternatives and validation checks."
    ].join(" ")
  }
]);

let cache = null;

function toIsoDate(value, fallback = "") {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
}

function normalizePersonaId(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!raw) return "";
  return raw.slice(0, 48);
}

function cleanOneLine(value, maxChars = 120) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function cleanText(value, maxChars = MAX_INSTRUCTIONS_CHARS) {
  return String(value || "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, maxChars);
}

function ensureDir() {
  fs.mkdirSync(path.dirname(personasPath), { recursive: true });
}

function writeJsonAtomic(filePath, value) {
  ensureDir();
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}

function defaultState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    activeId: "",
    personas: BUILT_IN_PERSONAS.map((row) => ({
      id: row.id,
      name: row.name,
      summary: row.summary,
      instructions: row.instructions,
      builtIn: true,
      createdAt: now,
      updatedAt: now
    }))
  };
}

function normalizePersona(raw, nowIso) {
  const source = raw && typeof raw === "object" ? raw : {};
  const id = normalizePersonaId(source.id || source.name);
  if (!id) {
    return null;
  }
  const instructions = cleanText(source.instructions || source.prompt || "");
  if (!instructions) {
    return null;
  }
  const name = cleanOneLine(source.name || id, 80) || id;
  const summary = cleanOneLine(source.summary || source.description || "", MAX_SUMMARY_CHARS);
  const createdAt = toIsoDate(source.createdAt, nowIso);
  const updatedAt = toIsoDate(source.updatedAt, createdAt || nowIso);
  return {
    id,
    name,
    summary,
    instructions,
    builtIn: false,
    createdAt,
    updatedAt
  };
}

function normalizeState(parsed) {
  const now = new Date().toISOString();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const map = new Map();

  for (const builtIn of BUILT_IN_PERSONAS) {
    map.set(builtIn.id, {
      id: builtIn.id,
      name: builtIn.name,
      summary: builtIn.summary,
      instructions: builtIn.instructions,
      builtIn: true,
      createdAt: now,
      updatedAt: now
    });
  }

  const rows = Array.isArray(source.personas) ? source.personas : [];
  for (const row of rows) {
    const normalized = normalizePersona(row, now);
    if (!normalized) continue;
    if (map.has(normalized.id) && map.get(normalized.id).builtIn) {
      continue;
    }
    const existing = map.get(normalized.id);
    if (!existing) {
      map.set(normalized.id, normalized);
      continue;
    }
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextTime = new Date(normalized.updatedAt || normalized.createdAt || 0).getTime();
    if (nextTime >= existingTime) {
      map.set(normalized.id, normalized);
    }
  }

  const builtIns = [];
  const customs = [];
  for (const persona of map.values()) {
    if (persona.builtIn) builtIns.push(persona);
    else customs.push(persona);
  }

  const limitedCustoms = customs
    .sort((a, b) => {
      const left = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const right = new Date(b.updatedAt || b.createdAt || 0).getTime();
      if (left !== right) return right - left;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
    .slice(0, MAX_CUSTOM_PERSONAS);

  const personas = [...builtIns, ...limitedCustoms]
    .sort((a, b) => String(a.name || a.id || "").localeCompare(String(b.name || b.id || "")));

  const activeId = normalizePersonaId(source.activeId || "");
  const hasActive = activeId && personas.some((row) => row.id === activeId);

  return {
    version: 1,
    updatedAt: toIsoDate(source.updatedAt, now),
    activeId: hasActive ? activeId : "",
    personas
  };
}

function readStoreFromDisk() {
  ensureDir();
  if (!fs.existsSync(personasPath)) {
    return null;
  }
  const raw = fs.readFileSync(personasPath, "utf8");
  if (!String(raw || "").trim()) {
    return defaultState();
  }
  const parsed = JSON.parse(raw);
  return normalizeState(parsed);
}

function loadStore() {
  if (cache) {
    return cache;
  }
  try {
    const disk = readStoreFromDisk();
    if (!disk) {
      cache = defaultState();
      writeJsonAtomic(personasPath, cache);
      return cache;
    }
    cache = disk;
    return cache;
  } catch (_error) {
    cache = defaultState();
    writeJsonAtomic(personasPath, cache);
    return cache;
  }
}

function saveStore(store) {
  const normalized = normalizeState(store);
  normalized.updatedAt = new Date().toISOString();
  writeJsonAtomic(personasPath, normalized);
  cache = normalized;
  return normalized;
}

function projectPersona(persona, options = {}) {
  if (!persona) return null;
  const includeInstructions = Boolean(options.includeInstructions);
  return {
    id: String(persona.id || ""),
    name: String(persona.name || ""),
    summary: String(persona.summary || ""),
    instructions: includeInstructions ? String(persona.instructions || "") : undefined,
    builtIn: Boolean(persona.builtIn),
    createdAt: String(persona.createdAt || ""),
    updatedAt: String(persona.updatedAt || "")
  };
}

function listPersonas(options = {}) {
  const store = loadStore();
  return {
    activeId: String(store.activeId || ""),
    personas: store.personas.map((row) => projectPersona(row, options))
  };
}

function getPersonaById(id, options = {}) {
  const normalizedId = normalizePersonaId(id);
  if (!normalizedId) return null;
  const store = loadStore();
  const found = store.personas.find((row) => row.id === normalizedId);
  return projectPersona(found || null, options);
}

function getActivePersona(options = {}) {
  const store = loadStore();
  if (!store.activeId) return null;
  const found = store.personas.find((row) => row.id === store.activeId);
  return projectPersona(found || null, options);
}

function setActivePersona(id) {
  const normalizedId = normalizePersonaId(id);
  if (!normalizedId) {
    throw new Error("Persona id is required.");
  }
  const store = loadStore();
  const found = store.personas.find((row) => row.id === normalizedId);
  if (!found) {
    throw new Error(`Persona not found: ${normalizedId}`);
  }
  store.activeId = normalizedId;
  saveStore(store);
  return projectPersona(found, { includeInstructions: true });
}

function clearActivePersona() {
  const store = loadStore();
  if (!store.activeId) {
    return null;
  }
  store.activeId = "";
  saveStore(store);
  return null;
}

function upsertPersona(input) {
  const id = normalizePersonaId(input?.id || input?.name);
  if (!id) {
    throw new Error("Persona id is required.");
  }
  const instructions = cleanText(input?.instructions || input?.prompt || "");
  if (!instructions) {
    throw new Error("Persona instructions are required.");
  }
  const name = cleanOneLine(input?.name || id, 80) || id;
  const summary = cleanOneLine(input?.summary || "", MAX_SUMMARY_CHARS);

  const store = loadStore();
  const existing = store.personas.find((row) => row.id === id) || null;
  if (existing && existing.builtIn) {
    throw new Error(`Built-in persona "${id}" cannot be overwritten.`);
  }
  if (!existing) {
    const customCount = store.personas.filter((row) => !row.builtIn).length;
    if (customCount >= MAX_CUSTOM_PERSONAS) {
      throw new Error(`Custom persona limit reached (${MAX_CUSTOM_PERSONAS}).`);
    }
  }

  const now = new Date().toISOString();
  const nextPersona = {
    id,
    name,
    summary,
    instructions,
    builtIn: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    store.personas = store.personas.map((row) => (row.id === id ? nextPersona : row));
  } else {
    store.personas.push(nextPersona);
  }
  saveStore(store);
  return projectPersona(nextPersona, { includeInstructions: true });
}

function removePersona(id) {
  const normalizedId = normalizePersonaId(id);
  if (!normalizedId) {
    throw new Error("Persona id is required.");
  }
  const store = loadStore();
  const existing = store.personas.find((row) => row.id === normalizedId);
  if (!existing) {
    return false;
  }
  if (existing.builtIn) {
    throw new Error(`Built-in persona "${normalizedId}" cannot be deleted.`);
  }
  store.personas = store.personas.filter((row) => row.id !== normalizedId);
  if (store.activeId === normalizedId) {
    store.activeId = "";
  }
  saveStore(store);
  return true;
}

function getPersonaStoreSummary() {
  const store = loadStore();
  const builtInCount = store.personas.filter((row) => row.builtIn).length;
  const customCount = Math.max(0, store.personas.length - builtInCount);
  return {
    path: personasPath,
    updatedAt: store.updatedAt,
    activeId: store.activeId || "",
    total: store.personas.length,
    builtInCount,
    customCount
  };
}

module.exports = {
  listPersonas,
  getPersonaById,
  getActivePersona,
  setActivePersona,
  clearActivePersona,
  upsertPersona,
  removePersona,
  getPersonaStoreSummary
};
