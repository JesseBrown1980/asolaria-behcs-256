const WebSocket = require("ws");
const { getServiceAccountAccessToken } = require("./gcpConnector");
const { getVertexConfigSummary } = require("./vertexConnector");

const LIVE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const LIVE_API_VERSION = "v1beta1";
const LIVE_AUDIO_API_VERSION = "v1";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_TOKENS = 256;
const DEFAULT_LIVE_MODEL = String(
  process.env.ASOLARIA_GEMINI_LIVE_MODEL
  || "gemini-2.0-flash-live-preview-04-09"
).trim();
const DEFAULT_LIVE_AUDIO_MODEL = String(
  process.env.ASOLARIA_GEMINI_LIVE_AUDIO_MODEL
  || "gemini-live-2.5-flash-native-audio"
).trim();
const DEFAULT_LIVE_AUDIO_LOCATION = String(
  process.env.ASOLARIA_GEMINI_LIVE_AUDIO_LOCATION
  || "us-central1"
).trim().toLowerCase();
const DEFAULT_LIVE_AUDIO_VOICE = String(
  process.env.ASOLARIA_GEMINI_LIVE_AUDIO_VOICE
  || "Kore"
).trim();
const DEFAULT_AUDIO_SAMPLE_RATE_HZ = 24000;

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeText(value, limit = 8000) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

function normalizeModel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("projects/")) return raw;
  if (!/^[a-z0-9._-]{3,120}$/i.test(raw)) return "";
  return raw;
}

function isLiveModelName(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw.includes("live");
}

function normalizeModalityList(value, fallback = ["TEXT"]) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const normalized = items
    .map((item) => String(item || "").trim().toUpperCase())
    .filter((item) => item === "TEXT" || item === "AUDIO");
  return normalized.length ? Array.from(new Set(normalized)) : fallback.slice();
}

function buildLiveHost(location) {
  const safeLocation = String(location || "").trim().toLowerCase();
  if (!safeLocation || safeLocation === "global") {
    return "aiplatform.googleapis.com";
  }
  return `${safeLocation}-aiplatform.googleapis.com`;
}

function buildQualifiedModelName(status, modelOverride = "", fallbackModel = DEFAULT_LIVE_MODEL) {
  const configured = normalizeModel(status.model || "");
  const model = normalizeModel(modelOverride)
    || (isLiveModelName(configured) ? configured : "")
    || normalizeModel(fallbackModel);
  if (!model) return "";
  if (model.startsWith("projects/")) {
    return model;
  }
  return `projects/${status.project}/locations/${status.location}/publishers/google/models/${model}`;
}

function buildLiveServiceUrl(status, apiVersion = LIVE_API_VERSION) {
  const host = buildLiveHost(status.location || "");
  return `wss://${host}/ws/google.cloud.aiplatform.${apiVersion}.LlmBidiService/BidiGenerateContent`;
}

function extractTextFromParts(parts = []) {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (part && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
}

function extractOutputTranscription(payload = {}) {
  const serverContent = payload?.serverContent || payload?.server_content || {};
  const outputTranscription = serverContent?.outputTranscription || serverContent?.output_transcription || {};
  return normalizeText(outputTranscription?.text || "", 12000);
}

function normalizeVoiceName(value) {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_LIVE_AUDIO_VOICE;
  if (!/^[a-z0-9._-]{2,80}$/i.test(raw)) {
    return DEFAULT_LIVE_AUDIO_VOICE;
  }
  return raw;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeToolName(value) {
  const raw = String(value || "").trim();
  if (!raw || !/^[a-zA-Z0-9_-]{1,64}$/.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeToolParameters(value) {
  if (isPlainObject(value)) {
    return value;
  }
  return {
    type: "OBJECT",
    properties: {}
  };
}

function normalizeToolDeclarations(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const name = normalizeToolName(entry?.name);
      if (!name) return null;
      const description = normalizeText(entry?.description || "", 800);
      return {
        name,
        description,
        parameters: normalizeToolParameters(entry?.parameters)
      };
    })
    .filter(Boolean);
}

function normalizeFunctionCallArgs(value) {
  if (isPlainObject(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return isPlainObject(parsed) ? parsed : { value: parsed };
    } catch {
      return { value: trimmed.slice(0, 4000) };
    }
  }
  if (value === undefined || value === null) {
    return {};
  }
  return { value };
}

function normalizeFunctionResponsePayload(value) {
  if (isPlainObject(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return { ok: true };
  }
  return { value };
}

function extractFunctionCalls(payload = {}) {
  const candidates = [
    payload?.toolCall,
    payload?.tool_call,
    payload?.serverContent?.toolCall,
    payload?.serverContent?.tool_call,
    payload?.server_content?.toolCall,
    payload?.server_content?.tool_call
  ].filter(Boolean);
  const out = [];
  for (const candidate of candidates) {
    const rows = Array.isArray(candidate?.functionCalls)
      ? candidate.functionCalls
      : Array.isArray(candidate?.function_calls)
        ? candidate.function_calls
        : [];
    for (const row of rows) {
      const name = normalizeToolName(row?.name);
      if (!name) continue;
      out.push({
        id: normalizeText(row?.id || "", 120),
        name,
        args: normalizeFunctionCallArgs(row?.args)
      });
    }
  }
  return out;
}

function buildGeminiLiveStatus(policy = {}, options = {}) {
  const status = getVertexConfigSummary(policy);
  const fallbackModel = normalizeModel(options.defaultModel || "")
    || normalizeModel(DEFAULT_LIVE_MODEL);
  const fallbackLocation = String(options.defaultLocation || "").trim().toLowerCase();
  const location = String(status.location || "").trim().toLowerCase()
    || fallbackLocation
    || "global";
  const effectiveLocation = fallbackLocation || location;
  const supportedModalities = normalizeModalityList(options.supportedModalities, ["TEXT"]);
  const model = isLiveModelName(status.model || "")
    ? String(status.model || "")
    : fallbackModel;
  const configured = Boolean(
    status.enabled !== false
    && status.gcpConfigured
    && status.project
    && effectiveLocation
    && model
  );
  return {
    enabled: policy.enabled !== false && status.enabled !== false,
    configured,
    gcpConfigured: Boolean(status.gcpConfigured),
    project: String(status.project || ""),
    location: effectiveLocation,
    model,
    serviceAccountEmail: String(status.serviceAccountEmail || ""),
    serviceUrl: configured
      ? buildLiveServiceUrl(
        { location: effectiveLocation },
        supportedModalities.includes("AUDIO") ? LIVE_AUDIO_API_VERSION : LIVE_API_VERSION
      )
      : "",
    supportedModalities
  };
}

function getGeminiLiveStatus(policy = {}) {
  return buildGeminiLiveStatus(policy, {
    defaultModel: DEFAULT_LIVE_MODEL,
    supportedModalities: ["TEXT"]
  });
}

function getGeminiLiveAudioStatus(policy = {}) {
  return buildGeminiLiveStatus(policy, {
    defaultModel: DEFAULT_LIVE_AUDIO_MODEL,
    defaultLocation: DEFAULT_LIVE_AUDIO_LOCATION,
    supportedModalities: ["AUDIO"]
  });
}

async function runGeminiLiveTextTurn(input = {}, policy = {}) {
  const status = getGeminiLiveStatus(policy);
  if (!status.enabled) {
    throw new Error("Gemini Live integration is disabled.");
  }
  if (!status.configured) {
    throw new Error("Gemini Live requires a configured Vertex project, location, model, and GCP service account.");
  }

  const prompt = normalizeText(input.prompt || input.message || "", 12000);
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const model = buildQualifiedModelName(status, input.model || "", DEFAULT_LIVE_MODEL);
  if (!model) {
    throw new Error("Gemini Live model is missing.");
  }

  const system = normalizeText(input.system || "", 4000);
  const temperature = input.temperature === undefined ? undefined : Number(input.temperature);
  const maxOutputTokens = input.maxOutputTokens === undefined
    ? DEFAULT_MAX_OUTPUT_TOKENS
    : clampInt(input.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, 1, 8192);
  const responseModalities = normalizeModalityList(input.responseModalities, ["TEXT"]);
  const timeoutMs = clampInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, 5000, 120000);

  const { accessToken } = await getServiceAccountAccessToken([LIVE_SCOPE]);
  const serviceUrl = buildLiveServiceUrl(status);

  const setupPayload = {
    setup: {
      model,
      generationConfig: {
        responseModalities,
        maxOutputTokens
      }
    }
  };
  if (Number.isFinite(temperature)) {
    setupPayload.setup.generationConfig.temperature = Math.max(0, Math.min(2, temperature));
  }
  if (system) {
    setupPayload.setup.systemInstruction = {
      parts: [{ text: system }]
    };
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let promptSent = false;
    const textParts = [];

    const ws = new WebSocket(serviceUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    function finish(error, payload = null) {
      if (settled) return;
      settled = true;
      try {
        ws.removeAllListeners();
      } catch {}
      try {
        ws.close();
      } catch {}
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(payload);
    }

    function sendPrompt() {
      if (promptSent) return;
      promptSent = true;
      ws.send(JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          turnComplete: true
        }
      }));
    }

    const timeout = setTimeout(() => {
      finish(new Error("Gemini Live timed out waiting for a response."));
    }, timeoutMs);

    ws.once("open", () => {
      ws.send(JSON.stringify(setupPayload));
      setTimeout(() => {
        sendPrompt();
      }, 80);
    });

    ws.on("message", (raw) => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const payload = text ? JSON.parse(text) : {};
        if (payload?.error) {
          const message = typeof payload.error?.message === "string"
            ? payload.error.message
            : JSON.stringify(payload.error);
          finish(new Error(`Gemini Live error: ${message}`));
          return;
        }
        if (payload?.setupComplete || payload?.setup_complete) {
          sendPrompt();
          return;
        }
        const serverContent = payload?.serverContent || payload?.server_content || {};
        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn || {};
        const chunk = extractTextFromParts(modelTurn?.parts || []);
        if (chunk) {
          textParts.push(chunk);
        }
        if (serverContent?.turnComplete || serverContent?.turn_complete) {
          const reply = textParts.join("").replace(/\s+/g, " ").trim();
          if (!reply) {
            finish(new Error("Gemini Live returned no text output."));
            return;
          }
          finish(null, {
            provider: "vertex-gemini-live",
            model,
            reply,
            raw: payload
          });
        }
      } catch (error) {
        finish(error);
      }
    });

    ws.once("error", (error) => {
      finish(error);
    });

    ws.once("close", (_code, reasonBuffer) => {
      if (settled) return;
      const reply = textParts.join("").replace(/\s+/g, " ").trim();
      if (reply) {
        finish(null, {
          provider: "vertex-gemini-live",
          model,
          reply,
          raw: {
            closedEarly: true,
            reason: reasonBuffer ? String(reasonBuffer) : ""
          }
        });
        return;
      }
      finish(new Error(`Gemini Live closed before completing a turn.${reasonBuffer ? ` ${String(reasonBuffer)}` : ""}`));
    });
  });
}

async function runGeminiLiveTextToolTurn(input = {}, policy = {}, options = {}) {
  const toolDeclarations = normalizeToolDeclarations(input.tools || options.tools);
  const onToolCall = typeof options.onToolCall === "function"
    ? options.onToolCall
    : (typeof input.onToolCall === "function" ? input.onToolCall : null);
  if (!toolDeclarations.length || !onToolCall) {
    return runGeminiLiveTextTurn(input, policy);
  }

  const status = getGeminiLiveStatus(policy);
  if (!status.enabled) {
    throw new Error("Gemini Live integration is disabled.");
  }
  if (!status.configured) {
    throw new Error("Gemini Live requires a configured Vertex project, location, model, and GCP service account.");
  }

  const prompt = normalizeText(input.prompt || input.message || "", 12000);
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const model = buildQualifiedModelName(status, input.model || "", DEFAULT_LIVE_MODEL);
  if (!model) {
    throw new Error("Gemini Live model is missing.");
  }

  const system = normalizeText(input.system || "", 4000);
  const temperature = input.temperature === undefined ? undefined : Number(input.temperature);
  const maxOutputTokens = input.maxOutputTokens === undefined
    ? DEFAULT_MAX_OUTPUT_TOKENS
    : clampInt(input.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS, 1, 8192);
  const responseModalities = normalizeModalityList(input.responseModalities, ["TEXT"]);
  const timeoutMs = clampInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, 5000, 120000);
  const maxToolCalls = clampInt(
    input.maxToolCalls === undefined ? options.maxToolCalls : input.maxToolCalls,
    4,
    1,
    8
  );

  const { accessToken } = await getServiceAccountAccessToken([LIVE_SCOPE]);
  const serviceUrl = buildLiveServiceUrl(status);

  const setupPayload = {
    setup: {
      model,
      generationConfig: {
        responseModalities,
        maxOutputTokens
      },
      tools: [
        {
          functionDeclarations: toolDeclarations
        }
      ]
    }
  };
  if (Number.isFinite(temperature)) {
    setupPayload.setup.generationConfig.temperature = Math.max(0, Math.min(2, temperature));
  }
  if (system) {
    setupPayload.setup.systemInstruction = {
      parts: [{ text: system }]
    };
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let promptSent = false;
    let toolCallCount = 0;
    let messageQueue = Promise.resolve();
    const textParts = [];
    const toolCalls = [];

    const ws = new WebSocket(serviceUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    function finish(error, payload = null) {
      if (settled) return;
      settled = true;
      try {
        ws.removeAllListeners();
      } catch {}
      try {
        ws.close();
      } catch {}
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(payload);
    }

    function sendPrompt() {
      if (promptSent || settled) return;
      promptSent = true;
      ws.send(JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          turnComplete: true
        }
      }));
    }

    async function handleMessage(raw) {
      if (settled) return;
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      const payload = text ? JSON.parse(text) : {};
      if (payload?.error) {
        const message = typeof payload.error?.message === "string"
          ? payload.error.message
          : JSON.stringify(payload.error);
        finish(new Error(`Gemini Live error: ${message}`));
        return;
      }
      if (payload?.setupComplete || payload?.setup_complete) {
        sendPrompt();
        return;
      }

      const functionCalls = extractFunctionCalls(payload);
      if (functionCalls.length) {
        toolCallCount += functionCalls.length;
        if (toolCallCount > maxToolCalls) {
          finish(new Error(`Gemini Live requested too many tool calls (${toolCallCount} > ${maxToolCalls}).`));
          return;
        }
        const functionResponses = [];
        for (const functionCall of functionCalls) {
          let response = null;
          try {
            response = await onToolCall(functionCall, {
              prompt,
              system,
              model,
              toolCallCount,
              status
            });
          } catch (error) {
            response = {
              ok: false,
              error: normalizeText(error?.message || error || "tool_call_failed", 600)
            };
          }
          const payloadResponse = normalizeFunctionResponsePayload(response);
          toolCalls.push({
            id: functionCall.id,
            name: functionCall.name,
            args: functionCall.args,
            response: payloadResponse
          });
          functionResponses.push({
            id: functionCall.id || undefined,
            name: functionCall.name,
            response: payloadResponse
          });
        }
        ws.send(JSON.stringify({
          toolResponse: {
            functionResponses
          }
        }));
        return;
      }

      const serverContent = payload?.serverContent || payload?.server_content || {};
      const modelTurn = serverContent?.modelTurn || serverContent?.model_turn || {};
      const chunk = extractTextFromParts(modelTurn?.parts || []);
      if (chunk) {
        textParts.push(chunk);
      }
      if (serverContent?.turnComplete || serverContent?.turn_complete) {
        const reply = textParts.join("").replace(/\s+/g, " ").trim();
        if (!reply) {
          finish(new Error("Gemini Live returned no text output."));
          return;
        }
        finish(null, {
          provider: "vertex-gemini-live",
          model,
          reply,
          toolCalls,
          raw: payload
        });
      }
    }

    const timeout = setTimeout(() => {
      finish(new Error("Gemini Live timed out waiting for a response."));
    }, timeoutMs);

    ws.once("open", () => {
      ws.send(JSON.stringify(setupPayload));
      setTimeout(() => {
        sendPrompt();
      }, 80);
    });

    ws.on("message", (raw) => {
      messageQueue = messageQueue
        .then(() => handleMessage(raw))
        .catch((error) => {
          finish(error);
        });
    });

    ws.once("error", (error) => {
      finish(error);
    });

    ws.once("close", (_code, reasonBuffer) => {
      if (settled) return;
      const reply = textParts.join("").replace(/\s+/g, " ").trim();
      if (reply) {
        finish(null, {
          provider: "vertex-gemini-live",
          model,
          reply,
          toolCalls,
          raw: {
            closedEarly: true,
            reason: reasonBuffer ? String(reasonBuffer) : ""
          }
        });
        return;
      }
      finish(new Error(`Gemini Live closed before completing a turn.${reasonBuffer ? ` ${String(reasonBuffer)}` : ""}`));
    });
  });
}

async function runGeminiLiveAudioTextTurn(input = {}, policy = {}) {
  const status = getGeminiLiveAudioStatus(policy);
  if (!status.enabled) {
    throw new Error("Gemini Live audio integration is disabled.");
  }
  if (!status.configured) {
    throw new Error("Gemini Live audio requires a configured Vertex project, location, model, and GCP service account.");
  }

  const prompt = normalizeText(input.prompt || input.message || "", 12000);
  if (!prompt) {
    throw new Error("prompt is required.");
  }

  const model = buildQualifiedModelName(status, input.model || "", DEFAULT_LIVE_AUDIO_MODEL);
  if (!model) {
    throw new Error("Gemini Live audio model is missing.");
  }

  const system = normalizeText(input.system || "", 4000);
  const voiceName = normalizeVoiceName(input.voice || "");
  const timeoutMs = clampInt(input.timeoutMs, DEFAULT_TIMEOUT_MS, 5000, 120000);

  const { accessToken } = await getServiceAccountAccessToken([LIVE_SCOPE]);
  const serviceUrl = buildLiveServiceUrl(status, LIVE_AUDIO_API_VERSION);

  const setupPayload = {
    setup: {
      model,
      generation_config: {
        response_modalities: ["audio"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: voiceName
            }
          }
        }
      },
      output_audio_transcription: {}
    }
  };
  if (system) {
    setupPayload.setup.system_instruction = {
      parts: [{ text: system }]
    };
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let promptSent = false;
    const audioChunks = [];
    const transcriptChunks = [];

    const ws = new WebSocket(serviceUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    function finish(error, payload = null) {
      if (settled) return;
      settled = true;
      try {
        ws.removeAllListeners();
      } catch {}
      try {
        ws.close();
      } catch {}
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(payload);
    }

    function sendPrompt() {
      if (promptSent) return;
      promptSent = true;
      ws.send(JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          turnComplete: true
        }
      }));
    }

    const timeout = setTimeout(() => {
      finish(new Error("Gemini Live audio timed out waiting for a response."));
    }, timeoutMs);

    ws.once("open", () => {
      ws.send(JSON.stringify(setupPayload));
      setTimeout(() => {
        sendPrompt();
      }, 80);
    });

    ws.on("message", (raw, isBinary) => {
      try {
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        let payload = null;
        const textCandidate = buffer.length ? buffer.toString("utf8") : "";
        const trimmedCandidate = textCandidate.trim();
        if (trimmedCandidate.startsWith("{") || trimmedCandidate.startsWith("[")) {
          try {
            payload = JSON.parse(textCandidate);
          } catch {
            payload = null;
          }
        } else if (!isBinary && typeof raw === "string") {
          payload = raw ? JSON.parse(raw) : {};
        }
        if (!payload) {
          if (buffer.length > 0) {
            audioChunks.push(buffer);
          }
          return;
        }
        if (payload?.error) {
          const message = typeof payload.error?.message === "string"
            ? payload.error.message
            : JSON.stringify(payload.error);
          finish(new Error(`Gemini Live audio error: ${message}`));
          return;
        }
        if (payload?.setupComplete || payload?.setup_complete) {
          sendPrompt();
          return;
        }
        const serverContent = payload?.serverContent || payload?.server_content || {};
        const transcript = extractOutputTranscription(payload);
        if (transcript) {
          transcriptChunks.push(transcript);
        }
        const modelTurn = serverContent?.modelTurn || serverContent?.model_turn || {};
        const parts = Array.isArray(modelTurn?.parts) ? modelTurn.parts : [];
        for (const part of parts) {
          const inline = part?.inlineData || part?.inline_data || null;
          const data = typeof inline?.data === "string" ? inline.data.trim() : "";
          if (data) {
            audioChunks.push(Buffer.from(data, "base64"));
          }
          const chunkText = normalizeText(part?.text || "", 4000);
          if (chunkText) {
            transcriptChunks.push(chunkText);
          }
        }
        if (serverContent?.turnComplete || serverContent?.turn_complete) {
          const audioBuffer = Buffer.concat(audioChunks);
          if (!audioBuffer.length) {
            finish(new Error("Gemini Live audio returned no audio output."));
            return;
          }
          finish(null, {
            provider: "vertex-gemini-live-audio",
            model,
            voiceName,
            sampleRateHz: DEFAULT_AUDIO_SAMPLE_RATE_HZ,
            audioBuffer,
            transcript: transcriptChunks.join(" ").replace(/\s+/g, " ").trim()
          });
        }
      } catch (error) {
        finish(error);
      }
    });

    ws.once("error", (error) => {
      finish(error);
    });

    ws.once("close", (_code, reasonBuffer) => {
      if (settled) return;
      const audioBuffer = Buffer.concat(audioChunks);
      if (audioBuffer.length) {
        finish(null, {
          provider: "vertex-gemini-live-audio",
          model,
          voiceName,
          sampleRateHz: DEFAULT_AUDIO_SAMPLE_RATE_HZ,
          audioBuffer,
          transcript: transcriptChunks.join(" ").replace(/\s+/g, " ").trim(),
          raw: {
            closedEarly: true,
            reason: reasonBuffer ? String(reasonBuffer) : ""
          }
        });
        return;
      }
      finish(new Error(`Gemini Live audio closed before completing a turn.${reasonBuffer ? ` ${String(reasonBuffer)}` : ""}`));
    });
  });
}

module.exports = {
  getGeminiLiveStatus,
  getGeminiLiveAudioStatus,
  runGeminiLiveTextTurn,
  runGeminiLiveTextToolTurn,
  runGeminiLiveAudioTextTurn
};
