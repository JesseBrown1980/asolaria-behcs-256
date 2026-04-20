const fs = require("fs");
const path = require("path");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");

// Gemini API (AI Studio) uses the Generative Language API endpoint + an API key.
// This is separate from Vertex AI Gemini (which uses GCP service account auth).
const GEMINI_API_SECRET = "integrations.gemini.api_studio";
const DEFAULT_API_BASE = "https://generativelanguage.googleapis.com";
const DEFAULT_API_VERSION = "v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_EMBED_MODEL = "gemini-embedding-2-preview";
const DEFAULT_MAX_OUTPUT_TOKENS = 600;
const DEFAULT_LOCAL_FILE_PROMPT = [
  "Explain this file clearly.",
  "Return:",
  "1. A concise overall summary.",
  "2. A structured breakdown of the important content.",
  "3. Any visible UI, text, or key interactions if this is visual media.",
  "4. What the file is likely trying to show, prove, or communicate.",
  "5. A short uncertainty note if any detail is unclear."
].join("\n");
const EMBEDDING_SUPPORTED_INLINE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "audio/wav",
  "audio/mpeg",
  "video/mp4",
  "video/quicktime",
  "application/pdf"
]);
const EMBEDDING_SUPPORTED_VIDEO_MIME_TYPES = Object.freeze(
  EMBEDDING_SUPPORTED_INLINE_MIME_TYPES.filter((value) => value.startsWith("video/"))
);
const FILE_API_SUPPORTED_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "audio/wav",
  "audio/mpeg",
  "video/mp4",
  "video/quicktime",
  "application/pdf"
]);
const EMBED_TASK_TYPES = new Set([
  "SEMANTIC_SIMILARITY",
  "CLASSIFICATION",
  "CLUSTERING",
  "RETRIEVAL_DOCUMENT",
  "RETRIEVAL_QUERY",
  "CODE_RETRIEVAL_QUERY",
  "QUESTION_ANSWERING",
  "FACT_VERIFICATION"
]);

function normalizeApiKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length < 30 || key.length > 140) return "";
  if (/\s/.test(key)) return "";
  // GCP API keys commonly start with "AIza".
  if (!/^AIza[0-9A-Za-z_-]+$/.test(key)) return "";
  return key;
}

function normalizeText(value, limit = 220) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, limit);
}

function normalizeModel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(raw)) return "";
  return raw;
}

function normalizeProjectNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4,20}$/.test(raw)) return "";
  return raw;
}

function normalizeProjectName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^projects\/(\d{4,20})$/i);
  if (match) {
    return `projects/${match[1]}`;
  }
  if (/^\d{4,20}$/.test(raw)) {
    return `projects/${raw}`;
  }
  return "";
}

function maskKey(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 10) return "*".repeat(text.length);
  return `${text.slice(0, 6)}${"*".repeat(Math.max(4, text.length - 10))}${text.slice(-4)}`;
}

function resolveGeminiApiConfig() {
  const envKey = normalizeApiKey(process.env.ASOLARIA_GEMINI_API_KEY || "");
  const envModel = normalizeModel(process.env.ASOLARIA_GEMINI_API_MODEL || "");
  if (envKey) {
    return {
      enabled: true,
      apiKey: envKey,
      defaultModel: envModel || DEFAULT_MODEL,
      name: normalizeText(process.env.ASOLARIA_GEMINI_API_NAME || "Gemini API Key", 120),
      projectNumber: normalizeProjectNumber(process.env.ASOLARIA_GEMINI_API_PROJECT_NUMBER || ""),
      projectName: normalizeProjectName(process.env.ASOLARIA_GEMINI_API_PROJECT_NAME || ""),
      source: "env",
      updatedAt: null
    };
  }

  const secret = getSecret(GEMINI_API_SECRET, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const apiKey = normalizeApiKey(value.apiKey || value.key || value.token || "");
  const defaultModel = normalizeModel(value.defaultModel || value.model || "") || DEFAULT_MODEL;
  return {
    enabled: value.enabled !== false,
    apiKey,
    defaultModel,
    name: normalizeText(value.name || "Gemini API Key", 120) || "Gemini API Key",
    projectNumber: normalizeProjectNumber(value.projectNumber || value.projectId || ""),
    projectName: normalizeProjectName(value.projectName || value.project || value.projectNumber || ""),
    source: apiKey ? "vault" : "none",
    updatedAt: secret?.updatedAt || null
  };
}

function getGeminiApiConfigSummary(policy = {}) {
  const resolved = resolveGeminiApiConfig();
  return {
    enabled: policy.enabled !== false && resolved.enabled !== false,
    configured: Boolean(resolved.apiKey),
    apiKeySource: resolved.source,
    apiKeyHint: maskKey(resolved.apiKey),
    name: resolved.name || "Gemini API Key",
    projectNumber: resolved.projectNumber || "",
    projectName: resolved.projectName || "",
    apiBase: DEFAULT_API_BASE,
    apiVersion: DEFAULT_API_VERSION,
    defaultModel: resolved.defaultModel || DEFAULT_MODEL,
    updatedAt: resolved.updatedAt || null
  };
}

function setGeminiApiConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(GEMINI_API_SECRET, { namespace: "owner" });
    return getGeminiApiConfigSummary();
  }

  // Allow partial updates (for example model/name/project metadata) without
  // requiring the key to be re-sent if already stored.
  const current = resolveGeminiApiConfig();
  const apiKey = normalizeApiKey(input.apiKey || input.key || input.token || "") || current.apiKey;
  if (!apiKey) {
    throw new Error("Gemini API key is required.");
  }

  const payload = {
    enabled: input.enabled === undefined ? true : Boolean(input.enabled),
    apiKey,
    defaultModel: normalizeModel(input.defaultModel || input.model || "") || current.defaultModel || DEFAULT_MODEL,
    name: normalizeText(input.name || current.name || "Gemini API Key", 120) || "Gemini API Key",
    projectNumber: normalizeProjectNumber(input.projectNumber || input.projectId || "") || current.projectNumber || "",
    projectName: normalizeProjectName(input.projectName || input.project || input.projectNumber || "") || current.projectName || "",
    updatedAt: new Date().toISOString()
  };

  setSecret(
    GEMINI_API_SECRET,
    payload,
    {
      app: "Asolaria",
      component: "gemini-api",
      credentialOwner: "owner",
      actor: "owner",
      updatedBy: "api"
    },
    { namespace: "owner" }
  );

  return getGeminiApiConfigSummary();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeTaskType(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || !EMBED_TASK_TYPES.has(raw)) {
    return "";
  }
  return raw;
}

function normalizeOutputDimensionality(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return clampInt(value, 768, 128, 3072);
}

function extractGeminiText(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = candidates && candidates[0] && candidates[0].content ? candidates[0].content.parts : null;
  if (Array.isArray(parts)) {
    const text = parts
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "";
}

function describeSupportedEmbeddingInlineMimeTypes() {
  return EMBEDDING_SUPPORTED_INLINE_MIME_TYPES.join(", ");
}

function describeSupportedEmbeddingVideoMimeTypes() {
  return EMBEDDING_SUPPORTED_VIDEO_MIME_TYPES.join(", ");
}

function normalizeInlineMimeType(value, options = {}) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const mode = String(options.mode || "general").trim().toLowerCase();
  let normalized = "";
  if (/^image\/(png|jpeg|jpg|webp|heic|heif)$/.test(raw)) {
    normalized = raw === "image/jpg" ? "image/jpeg" : raw;
  }
  if (!normalized && /^audio\/(wav|mpeg|mp3|ogg|webm|mp4)$/.test(raw)) {
    normalized = raw === "audio/mp3" ? "audio/mpeg" : raw;
  }
  if (!normalized && /^video\/(mp4|mov|quicktime|webm)$/.test(raw)) {
    normalized = raw === "video/mov" ? "video/quicktime" : raw;
  }
  if (!normalized && raw === "application/pdf") {
    normalized = raw;
  }
  if (!normalized) {
    return "";
  }
  if (mode === "embedding" && !EMBEDDING_SUPPORTED_INLINE_MIME_TYPES.includes(normalized)) {
    return "";
  }
  return normalized;
}

function describeSupportedFileMimeTypes() {
  return FILE_API_SUPPORTED_MIME_TYPES.join(", ");
}

function normalizeLocalFilePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return path.resolve(raw);
}

function inferLocalFileMimeType(filePath, explicitMimeType = "") {
  const explicit = normalizeInlineMimeType(explicitMimeType);
  if (explicit && FILE_API_SUPPORTED_MIME_TYPES.includes(explicit)) {
    return explicit;
  }
  const extension = String(path.extname(filePath || "") || "").trim().toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".pdf") return "application/pdf";
  return "";
}

function normalizeFileExplainPrompt(value) {
  const text = String(value || "").trim();
  return text || DEFAULT_LOCAL_FILE_PROMPT;
}

async function readGeminiJson(response) {
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = { raw: text };
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    text,
    parsed
  };
}

function extractGeminiErrorMessage(payload) {
  return String(
    payload?.parsed?.error?.message
    || payload?.parsed?.message
    || payload?.text
    || "request failed"
  ).slice(0, 320);
}

async function startGeminiFileUpload(apiKey, filePath, mimeType) {
  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;
  const response = await fetch(`${DEFAULT_API_BASE}/upload/${DEFAULT_API_VERSION}/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(fileSize),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      file: {
        display_name: fileName
      }
    })
  });
  const details = await readGeminiJson(response);
  if (!details.ok) {
    throw new Error(`Gemini upload start failed: HTTP ${details.status} ${extractGeminiErrorMessage(details)}`);
  }
  const uploadUrl = details.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload start succeeded but returned no resumable upload URL.");
  }
  return {
    uploadUrl,
    fileSize,
    fileName
  };
}

async function finalizeGeminiFileUpload(uploadUrl, filePath, fileSize) {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: fs.readFileSync(filePath)
  });
  const details = await readGeminiJson(response);
  if (!details.ok) {
    throw new Error(`Gemini upload finalize failed: HTTP ${details.status} ${extractGeminiErrorMessage(details)}`);
  }
  return details.parsed?.file || details.parsed;
}

async function getGeminiFileRecord(apiKey, fileName) {
  const response = await fetch(`${DEFAULT_API_BASE}/${DEFAULT_API_VERSION}/${fileName}`, {
    headers: {
      "x-goog-api-key": apiKey
    }
  });
  const details = await readGeminiJson(response);
  if (!details.ok) {
    throw new Error(`Gemini file status failed: HTTP ${details.status} ${extractGeminiErrorMessage(details)}`);
  }
  return details.parsed?.file || details.parsed;
}

async function waitForGeminiFileActive(apiKey, uploadedFile, options = {}) {
  let current = uploadedFile;
  let state = String(current?.state?.name || current?.state || "").trim().toUpperCase();
  const timeoutMs = clampInt(options.timeoutMs, 180000, 10000, 1800000);
  const pollMs = clampInt(options.pollMs, 5000, 1000, 30000);
  const startedAt = Date.now();
  while (!state || state === "PROCESSING") {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Gemini file processing timed out after ${timeoutMs}ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    current = await getGeminiFileRecord(apiKey, current?.name || "");
    state = String(current?.state?.name || current?.state || "").trim().toUpperCase();
  }
  if (state !== "ACTIVE") {
    throw new Error(`Gemini file did not become ACTIVE. Final state: ${state || "<missing>"}`);
  }
  return current;
}

async function deleteGeminiFile(apiKey, fileName) {
  if (!fileName) return;
  const response = await fetch(`${DEFAULT_API_BASE}/${DEFAULT_API_VERSION}/${fileName}`, {
    method: "DELETE",
    headers: {
      "x-goog-api-key": apiKey
    }
  });
  await readGeminiJson(response);
}

async function runGeminiApiExplainFile(input = {}, policy = {}) {
  const status = getGeminiApiConfigSummary(policy);
  if (!status.enabled) {
    throw new Error("Gemini API integration is disabled by policy.");
  }
  if (!status.configured) {
    throw new Error("Gemini API integration is not configured (missing API key).");
  }

  const resolved = resolveGeminiApiConfig();
  const filePath = normalizeLocalFilePath(input.filePath || input.path || input.localPath || "");
  if (!filePath) {
    throw new Error("filePath is required.");
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Local file not found: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }
  if (stat.size < 1) {
    throw new Error(`File is empty: ${filePath}`);
  }

  const explicitMimeType = String(input.mimeType || input.fileMimeType || "").trim();
  const mimeType = inferLocalFileMimeType(filePath, explicitMimeType);
  if (!mimeType) {
    throw new Error(
      `Unsupported local file type${explicitMimeType ? ` "${explicitMimeType}"` : ""}. Supported file types: ${describeSupportedFileMimeTypes()}.`
    );
  }

  const requestedModel = normalizeModel(input.model || "");
  const candidateModels = [
    requestedModel,
    normalizeModel(resolved.defaultModel || ""),
    "gemini-2.5-pro",
    DEFAULT_MODEL
  ].filter(Boolean).filter((value, index, items) => items.indexOf(value) === index);
  const prompt = normalizeFileExplainPrompt(input.prompt || input.message || "");
  const system = String(input.system || "").trim();
  const maxOutputTokens = input.maxOutputTokens === undefined
    ? 1800
    : clampInt(input.maxOutputTokens, 1800, 128, 8192);
  const keepRemoteFile = Boolean(input.keepRemoteFile);
  const processingTimeoutMs = clampInt(input.processingTimeoutMs || input.timeoutMs, 180000, 10000, 1800000);
  const pollMs = clampInt(input.pollMs, 5000, 1000, 30000);

  let uploadedFile = null;
  try {
    const upload = await startGeminiFileUpload(resolved.apiKey, filePath, mimeType);
    uploadedFile = await finalizeGeminiFileUpload(upload.uploadUrl, filePath, upload.fileSize);
    uploadedFile = await waitForGeminiFileActive(resolved.apiKey, uploadedFile, {
      timeoutMs: processingTimeoutMs,
      pollMs
    });

    const errors = [];
    for (const model of candidateModels) {
      const body = {
        contents: [
          {
            role: "user",
            parts: [
              {
                file_data: {
                  mime_type: uploadedFile.mimeType || mimeType,
                  file_uri: uploadedFile.uri
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens
        }
      };
      if (system) {
        body.systemInstruction = {
          parts: [{ text: system }]
        };
      }

      const response = await fetch(
        `${DEFAULT_API_BASE}/${DEFAULT_API_VERSION}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": resolved.apiKey,
            "Content-Type": "application/json; charset=utf-8"
          },
          body: JSON.stringify(body)
        }
      );
      const details = await readGeminiJson(response);
      if (!details.ok) {
        errors.push(`Generate failed for ${model}: HTTP ${details.status} ${extractGeminiErrorMessage(details)}`);
        continue;
      }
      const reply = extractGeminiText(details.parsed);
      if (!reply) {
        errors.push(`Generate succeeded for ${model} but returned no text.`);
        continue;
      }
      return {
        model,
        filePath,
        fileName: path.basename(filePath),
        mimeType,
        bytes: stat.size,
        prompt,
        uploadedFile: {
          name: String(uploadedFile?.name || "").trim(),
          uri: String(uploadedFile?.uri || "").trim(),
          mimeType: String(uploadedFile?.mimeType || mimeType).trim(),
          state: String(uploadedFile?.state?.name || uploadedFile?.state || "ACTIVE").trim()
        },
        reply,
        raw: details.parsed
      };
    }

    throw new Error(errors.join(" | "));
  } finally {
    if (!keepRemoteFile && uploadedFile?.name) {
      await deleteGeminiFile(resolved.apiKey, uploadedFile.name).catch(() => {});
    }
  }
}

function normalizeBase64Payload(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const stripped = raw.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  if (!stripped) return "";
  if (!/^[A-Za-z0-9+/=_-]+$/.test(stripped)) return "";
  return stripped;
}

function normalizeEmbeddingParts(input) {
  const source = Array.isArray(input) ? input : [input];
  const parts = [];
  for (const raw of source) {
    if (raw === undefined || raw === null) {
      continue;
    }
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
      const text = String(raw).trim();
      if (text) {
        parts.push({ text });
      }
      continue;
    }
    if (typeof raw !== "object") {
      continue;
    }
    const row = raw;
    const text = String(row.text ?? row.content ?? row.prompt ?? row.message ?? "").trim();
    if (text) {
      parts.push({ text });
    }
    const inlineSource = row.inlineData && typeof row.inlineData === "object"
      ? row.inlineData.data ?? row.inlineData.base64 ?? row.inlineData.bytesBase64 ?? row.inlineData.bytes ?? ""
      : row.inlineData ?? row.data ?? row.base64 ?? row.bytesBase64 ?? row.bytes ?? "";
    const inlineData = normalizeBase64Payload(inlineSource);
    const inlineMimeTypeRaw = String(
      row.inlineMimeType
      || row.mimeType
      || row.contentType
      || (row.inlineData && typeof row.inlineData === "object"
        ? row.inlineData.mimeType || row.inlineData.contentType || ""
        : "")
    ).trim();
    const inlineMimeType = normalizeInlineMimeType(
      inlineMimeTypeRaw,
      { mode: "embedding" }
    );
    if (inlineData && !inlineMimeType) {
      const received = inlineMimeTypeRaw || "<missing>";
      if (/^video\//i.test(received)) {
        throw new Error(
          `Unsupported embedding video mimeType "${received}". Supported embedding video types: ${describeSupportedEmbeddingVideoMimeTypes()}.`
        );
      }
      throw new Error(
        `Unsupported embedding mimeType "${received}". Supported embedding inline types: ${describeSupportedEmbeddingInlineMimeTypes()}.`
      );
    }
    if (inlineData && inlineMimeType) {
      parts.push({
        inlineData: {
          mimeType: inlineMimeType,
          data: inlineData
        }
      });
    }
  }
  return parts.slice(0, 16);
}

function normalizeEmbeddingItems(input = {}) {
  const source = Array.isArray(input.contents)
    ? input.contents
    : Array.isArray(input.items)
      ? input.items
      : [input.content ?? (input.parts ? { parts: input.parts, title: input.title || "" } : (input.text ?? input.prompt ?? input.message ?? ""))];
  const items = [];
  for (const raw of source) {
    const row = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : { text: raw };
    const parts = normalizeEmbeddingParts(Array.isArray(row.parts) ? row.parts : row);
    if (parts.length < 1) {
      continue;
    }
    const text = parts
      .map((part) => (part && typeof part.text === "string" ? part.text.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
    items.push({
      text,
      parts,
      title: normalizeText(row.title || "", 160)
    });
  }
  return items.slice(0, 128);
}

function buildEmbedContentPayload(model, item, options = {}) {
  const parts = Array.isArray(item?.parts) && item.parts.length > 0
    ? item.parts
    : [{ text: item.text }];
  const payload = {
    model: `models/${model}`,
    content: {
      parts
    }
  };
  if (options.taskType) {
    payload.taskType = options.taskType;
  }
  if (options.outputDimensionality) {
    payload.outputDimensionality = options.outputDimensionality;
  }
  if (options.taskType === "RETRIEVAL_DOCUMENT" && item.title) {
    payload.title = item.title;
  }
  return payload;
}

function extractEmbeddingValues(raw) {
  const values = raw && typeof raw === "object" && Array.isArray(raw.values)
    ? raw.values
    : [];
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function extractEmbeddingList(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const direct = extractEmbeddingValues(data.embedding);
  if (direct.length > 0) {
    return [direct];
  }
  const rows = Array.isArray(data.embeddings) ? data.embeddings : [];
  return rows
    .map((row) => extractEmbeddingValues(row))
    .filter((row) => row.length > 0);
}

async function runGeminiApiGenerateContent(input = {}, policy = {}) {
  const status = getGeminiApiConfigSummary(policy);
  if (!status.enabled) {
    throw new Error("Gemini API integration is disabled by policy.");
  }
  if (!status.configured) {
    throw new Error("Gemini API integration is not configured (missing API key).");
  }

  const resolved = resolveGeminiApiConfig();
  const prompt = String(input.prompt || input.message || "").trim();
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const model = normalizeModel(input.model || "") || resolved.defaultModel || DEFAULT_MODEL;
  const system = String(input.system || "").trim();
  const temperature = input.temperature === undefined ? undefined : Number(input.temperature);
  const maxOutputTokens = input.maxOutputTokens === undefined
    ? undefined
    : clampInt(input.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, 1, 8192);

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ]
  };
  if (system) {
    // Align with Vertex `generateContent` request shape.
    body.systemInstruction = { parts: [{ text: system }] };
  }
  const genConfig = {};
  if (Number.isFinite(temperature)) {
    genConfig.temperature = Math.max(0, Math.min(2, temperature));
  }
  if (maxOutputTokens) {
    genConfig.maxOutputTokens = maxOutputTokens;
  }
  if (Object.keys(genConfig).length) {
    body.generationConfig = genConfig;
  }

  const url = new URL(`/${DEFAULT_API_VERSION}/models/${encodeURIComponent(model)}:generateContent`, DEFAULT_API_BASE);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-goog-api-key": resolved.apiKey
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const message = typeof parsed?.error?.message === "string"
      ? parsed.error.message
      : typeof parsed?.message === "string"
        ? parsed.message
        : text;
    throw new Error(`Gemini API generateContent HTTP ${response.status}: ${String(message || "request failed").slice(0, 260)}`);
  }

  const reply = extractGeminiText(parsed);
  if (!reply) {
    throw new Error("Gemini API returned no text output.");
  }

  return {
    model,
    reply,
    raw: parsed
  };
}

async function runGeminiApiMultimodal(input = {}, policy = {}) {
  const status = getGeminiApiConfigSummary(policy);
  if (!status.enabled) {
    throw new Error("Gemini API integration is disabled by policy.");
  }
  if (!status.configured) {
    throw new Error("Gemini API integration is not configured (missing API key).");
  }

  const resolved = resolveGeminiApiConfig();
  const prompt = String(input.prompt || input.message || "").trim();
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const model = normalizeModel(input.model || "") || resolved.defaultModel || DEFAULT_MODEL;
  const system = String(input.system || "").trim();
  const temperature = input.temperature === undefined ? undefined : Number(input.temperature);
  const maxOutputTokens = input.maxOutputTokens === undefined
    ? undefined
    : clampInt(input.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, 1, 8192);
  const inlineData = normalizeBase64Payload(input.inlineData || input.imageBase64 || input.audioBase64 || "");
  const inlineMimeTypeRaw = String(input.inlineMimeType || input.mimeType || "").trim();
  const inlineMimeType = normalizeInlineMimeType(inlineMimeTypeRaw);

  const parts = [{ text: prompt }];
  if (inlineData) {
    if (!inlineMimeType) {
      const received = inlineMimeTypeRaw || "<missing>";
      throw new Error(`Unsupported multimodal mimeType "${received}". Pass an explicit supported mimeType for inline data.`);
    }
    parts.push({
      inlineData: {
        mimeType: inlineMimeType,
        data: inlineData
      }
    });
  }

  const body = {
    contents: [
      {
        role: "user",
        parts
      }
    ]
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  const genConfig = {};
  if (Number.isFinite(temperature)) {
    genConfig.temperature = Math.max(0, Math.min(2, temperature));
  }
  if (maxOutputTokens) {
    genConfig.maxOutputTokens = maxOutputTokens;
  }
  if (Object.keys(genConfig).length) {
    body.generationConfig = genConfig;
  }

  const url = new URL(`/${DEFAULT_API_VERSION}/models/${encodeURIComponent(model)}:generateContent`, DEFAULT_API_BASE);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-goog-api-key": resolved.apiKey
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const message = typeof parsed?.error?.message === "string"
      ? parsed.error.message
      : typeof parsed?.message === "string"
        ? parsed.message
        : text;
    throw new Error(`Gemini API multimodal HTTP ${response.status}: ${String(message || "request failed").slice(0, 260)}`);
  }

  const reply = extractGeminiText(parsed);
  if (!reply) {
    throw new Error("Gemini API returned no text output.");
  }

  return {
    model,
    reply,
    raw: parsed
  };
}

async function runGeminiApiEmbedContent(input = {}, policy = {}) {
  const status = getGeminiApiConfigSummary(policy);
  if (!status.enabled) {
    throw new Error("Gemini API integration is disabled by policy.");
  }
  if (!status.configured) {
    throw new Error("Gemini API integration is not configured (missing API key).");
  }

  const resolved = resolveGeminiApiConfig();
  const items = normalizeEmbeddingItems(input);
  if (items.length < 1) {
    throw new Error("Embedding request requires at least one content item.");
  }

  const model = normalizeModel(input.model || "") || DEFAULT_EMBED_MODEL;
  const taskType = normalizeTaskType(input.taskType || "");
  const outputDimensionality = normalizeOutputDimensionality(input.outputDimensionality);
  const commonOptions = {
    taskType,
    outputDimensionality
  };

  let url = "";
  let body = null;
  if (items.length === 1) {
    url = new URL(`/${DEFAULT_API_VERSION}/models/${encodeURIComponent(model)}:embedContent`, DEFAULT_API_BASE).toString();
    body = buildEmbedContentPayload(model, items[0], commonOptions);
  } else {
    url = new URL(`/${DEFAULT_API_VERSION}/models/${encodeURIComponent(model)}:batchEmbedContents`, DEFAULT_API_BASE).toString();
    body = {
      requests: items.map((item) => buildEmbedContentPayload(model, item, commonOptions))
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-goog-api-key": resolved.apiKey
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_error) {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const message = typeof parsed?.error?.message === "string"
      ? parsed.error.message
      : typeof parsed?.message === "string"
        ? parsed.message
        : text;
    throw new Error(`Gemini API embedContent HTTP ${response.status}: ${String(message || "request failed").slice(0, 260)}`);
  }

  const embeddings = extractEmbeddingList(parsed);
  if (embeddings.length !== items.length) {
    throw new Error(`Gemini API returned ${embeddings.length} embedding(s) for ${items.length} input item(s).`);
  }

  return {
    model,
    taskType,
    outputDimensionality: outputDimensionality || embeddings[0]?.length || 0,
    embeddings,
    raw: parsed
  };
}

module.exports = {
  GEMINI_API_SECRET,
  getGeminiApiConfigSummary,
  setGeminiApiConfig,
  runGeminiApiGenerateContent,
  runGeminiApiMultimodal,
  runGeminiApiEmbedContent,
  runGeminiApiExplainFile
};
