const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getSecret } = require("../secureVault");
const {
  getGeminiLiveAudioStatus,
  runGeminiLiveAudioTextTurn
} = require("./geminiLiveConnector");

const DEFAULT_CLOUD_TRANSCRIBE_MODEL = String(
  process.env.ASOLARIA_VOICE_TRANSCRIBE_MODEL
  || "gpt-4o-mini-transcribe"
).trim();
const GEMINI_API_SECRET = "integrations.gemini.api_studio";
const DEFAULT_GEMINI_TRANSCRIBE_MODEL = String(
  process.env.ASOLARIA_VOICE_TRANSCRIBE_GEMINI_MODEL
  || "gemini-2.0-flash"
).trim();
const DEFAULT_GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const EXTERNAL_PROVIDER_SECRET_KEYS = Object.freeze([
  "integrations.external.cursor",
  "integrations.external.antigravity"
]);
const LOCAL_WHISPER_BACKOFF_MS = Math.max(
  15000,
  Number(process.env.ASOLARIA_WHISPER_BACKOFF_MS || (5 * 60 * 1000))
);
const localWhisperBackoffState = {
  command: "",
  untilMs: 0,
  reason: ""
};

function safeText(value, limit = 12000) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function splitSentences(text, maxLen = 240) {
  const value = safeText(text, 20000);
  if (!value) return [];
  const rough = value
    .split(/(?<=[\.\!\?])\s+|\n+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  for (const part of rough) {
    if (part.length <= maxLen) {
      chunks.push(part);
      continue;
    }
    let cursor = 0;
    while (cursor < part.length) {
      chunks.push(part.slice(cursor, cursor + maxLen).trim());
      cursor += maxLen;
    }
  }
  return chunks.filter(Boolean);
}

function normalizeCommandPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (
    (raw.startsWith("\"") && raw.endsWith("\""))
    || (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function isExplicitCommandPath(value) {
  const command = normalizeCommandPath(value);
  if (!command) return false;
  return path.isAbsolute(command) || command.includes("\\") || command.includes("/");
}

function isConfiguredCommandAvailable(value) {
  const command = normalizeCommandPath(value);
  if (!command) return false;
  if (!isExplicitCommandPath(command)) {
    return true;
  }
  return fs.existsSync(path.resolve(command));
}

function getCommandIdentity(value) {
  const command = normalizeCommandPath(value);
  if (!command) return "";
  const target = isExplicitCommandPath(command)
    ? path.resolve(command)
    : command;
  return process.platform === "win32" ? target.toLowerCase() : target;
}

function isLikelyMissingLocalToolchainError(error) {
  const detail = String(error?.message || error || "").toLowerCase();
  if (!detail) return false;
  return (
    detail.includes("enoent")
    || detail.includes("command not found")
    || detail.includes("exited 127")
    || detail.includes("is not recognized as an internal or external command")
    || detail.includes("no such file or directory")
    || detail.includes("cannot find module")
    || detail.includes("modulenotfounderror")
    || detail.includes("importerror")
    || detail.includes("dll load failed")
    || detail.includes("failed to open")
    || detail.includes("failed to load model")
    || detail.includes("vcruntime")
    || detail.includes("msvcp")
    || detail.includes("libstdc++")
  );
}

function markLocalWhisperBackoff(commandPath, error) {
  const command = getCommandIdentity(commandPath);
  if (!command) return;
  localWhisperBackoffState.command = command;
  localWhisperBackoffState.untilMs = Date.now() + LOCAL_WHISPER_BACKOFF_MS;
  localWhisperBackoffState.reason = safeText(
    String(error?.message || error || "local_whisper_unavailable"),
    240
  );
}

function clearLocalWhisperBackoff(commandPath) {
  const command = getCommandIdentity(commandPath);
  if (!command) return;
  if (localWhisperBackoffState.command !== command) return;
  localWhisperBackoffState.command = "";
  localWhisperBackoffState.untilMs = 0;
  localWhisperBackoffState.reason = "";
}

function getLocalWhisperBackoff(commandPath) {
  const command = getCommandIdentity(commandPath);
  if (!command || localWhisperBackoffState.command !== command) {
    return {
      active: false,
      untilMs: 0,
      reason: ""
    };
  }
  const now = Date.now();
  const active = now < Number(localWhisperBackoffState.untilMs || 0);
  if (!active) {
    return {
      active: false,
      untilMs: 0,
      reason: ""
    };
  }
  return {
    active: true,
    untilMs: Number(localWhisperBackoffState.untilMs || 0),
    reason: String(localWhisperBackoffState.reason || "")
  };
}

function resolveVoiceToolPaths() {
  const whisperCmd = normalizeCommandPath(process.env.ASOLARIA_WHISPER_CMD || "");
  const piperCmd = normalizeCommandPath(process.env.ASOLARIA_PIPER_CMD || "");
  const kittyTtsCmd = normalizeCommandPath(process.env.ASOLARIA_KITTY_TTS_CMD || "");
  const kittyTtsUrl = String(process.env.ASOLARIA_KITTY_TTS_URL || "").trim();
  const kittyTtsApiKeyConfigured = String(process.env.ASOLARIA_KITTY_TTS_API_KEY || "").trim().length > 0;
  return {
    whisperCmd,
    piperCmd,
    kittyTtsCmd,
    kittyTtsUrl,
    kittyTtsApiKeyConfigured
  };
}

function normalizeApiKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (key.length < 16) return "";
  if (/\s/.test(key)) return "";
  return key;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function normalizeGeminiApiKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(key)) return "";
  return key;
}

function safeGetSecret(name, options) {
  try {
    return getSecret(name, options);
  } catch (_error) {
    return null;
  }
}

function resolveCloudTranscribeCredential() {
  const envApiKey = normalizeApiKey(
    process.env.ASOLARIA_VOICE_TRANSCRIBE_API_KEY
    || process.env.OPENAI_API_KEY
    || ""
  );
  const envBaseUrl = normalizeBaseUrl(
    process.env.ASOLARIA_VOICE_TRANSCRIBE_BASE_URL
    || "https://api.openai.com"
  );
  const envOrganization = String(
    process.env.ASOLARIA_VOICE_TRANSCRIBE_ORGANIZATION
    || ""
  ).trim();
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      baseUrl: envBaseUrl || "https://api.openai.com",
      organization: envOrganization,
      source: "env"
    };
  }

  const voiceSecret = safeGetSecret("integrations.voice.transcribe", { namespace: "owner" });
  const voiceValue = voiceSecret?.value && typeof voiceSecret.value === "object"
    ? voiceSecret.value
    : {};
  const voiceApiKey = normalizeApiKey(voiceValue.apiKey || voiceValue.token || voiceValue.key || "");
  if (voiceApiKey) {
    return {
      apiKey: voiceApiKey,
      baseUrl: normalizeBaseUrl(voiceValue.apiBaseUrl || voiceValue.baseUrl || voiceValue.apiUrl || "https://api.openai.com") || "https://api.openai.com",
      organization: String(voiceValue.organization || "").trim(),
      source: "vault:integrations.voice.transcribe"
    };
  }

  for (const secretName of EXTERNAL_PROVIDER_SECRET_KEYS) {
    const secret = safeGetSecret(secretName, { namespace: "owner" });
    const value = secret?.value && typeof secret.value === "object"
      ? secret.value
      : {};
    const apiKey = normalizeApiKey(value.apiKey || value.token || value.key || "");
    if (!apiKey) {
      continue;
    }
    return {
      apiKey,
      baseUrl: normalizeBaseUrl(value.apiBaseUrl || value.baseUrl || value.apiUrl || "https://api.openai.com") || "https://api.openai.com",
      organization: String(value.organization || "").trim(),
      source: `vault:${secretName}`
    };
  }

  return null;
}

function resolveGeminiTranscribeCredential() {
  const envApiKey = normalizeGeminiApiKey(process.env.ASOLARIA_GEMINI_API_KEY || "");
  if (envApiKey) {
    return {
      apiKey: envApiKey,
      baseUrl: DEFAULT_GEMINI_API_BASE,
      model: DEFAULT_GEMINI_TRANSCRIBE_MODEL,
      source: "env:ASOLARIA_GEMINI_API_KEY"
    };
  }

  const secret = safeGetSecret(GEMINI_API_SECRET, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object"
    ? secret.value
    : {};
  const apiKey = normalizeGeminiApiKey(value.apiKey || value.key || value.token || "");
  if (!apiKey) {
    return null;
  }
  const model = String(value.defaultModel || value.model || DEFAULT_GEMINI_TRANSCRIBE_MODEL).trim() || DEFAULT_GEMINI_TRANSCRIBE_MODEL;
  return {
    apiKey,
    baseUrl: DEFAULT_GEMINI_API_BASE,
    model,
    source: `vault:${GEMINI_API_SECRET}`
  };
}

function runCommand(exe, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, Math.max(3000, timeoutMs));

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`Command exited ${code}: ${(stderr || stdout).trim()}`));
      }
      return resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function runToolCommand(commandPath, args, timeoutMs = 120000) {
  const fullPath = normalizeCommandPath(commandPath);
  if (!fullPath) {
    throw new Error("Command path is required.");
  }
  const ext = path.extname(fullPath).toLowerCase();
  if (ext === ".ps1") {
    return runCommand("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", fullPath,
      ...args
    ], timeoutMs);
  }
  return runCommand(fullPath, args, timeoutMs);
}

function detectVoiceTools() {
  const tools = resolveVoiceToolPaths();
  const cloudCredential = resolveCloudTranscribeCredential();
  const geminiCredential = resolveGeminiTranscribeCredential();
  const geminiLiveAudioStatus = getGeminiLiveAudioStatus({});
  const geminiLiveAudioAvailable = Boolean(
    geminiLiveAudioStatus?.enabled
    && geminiLiveAudioStatus?.configured
  );
  const whisperConfigured = Boolean(tools.whisperCmd);
  const whisperCommandAvailable = isConfiguredCommandAvailable(tools.whisperCmd);
  const piperCommandAvailable = isConfiguredCommandAvailable(tools.piperCmd);
  const kittyCommandAvailable = isConfiguredCommandAvailable(tools.kittyTtsCmd);
  const whisperBackoff = getLocalWhisperBackoff(tools.whisperCmd);
  const cloudAvailable = Boolean(
    (cloudCredential && cloudCredential.apiKey)
    || (geminiCredential && geminiCredential.apiKey)
  );
  const whisperAvailable = whisperConfigured
    && whisperCommandAvailable
    && (!whisperBackoff.active || !cloudAvailable);
  return {
    tools,
    available: {
      whisper: whisperAvailable,
      piper: piperCommandAvailable,
      kittyTts: kittyCommandAvailable,
      kittyTtsRemote: Boolean(tools.kittyTtsUrl),
      cloudTranscribe: cloudAvailable,
      geminiLiveAudio: geminiLiveAudioAvailable
    },
    recommendations: {
      stt: whisperAvailable
        ? "local-whisper"
        : cloudAvailable
          ? "cloud-openai-transcribe"
          : "configure ASOLARIA_WHISPER_CMD or ASOLARIA_VOICE_TRANSCRIBE_API_KEY",
      tts: geminiLiveAudioAvailable
        ? "gemini_live_audio"
        : kittyCommandAvailable || tools.kittyTtsUrl
        ? "kitty_tts"
        : piperCommandAvailable
          ? "local-piper"
          : "configure ASOLARIA_KITTY_TTS_CMD or ASOLARIA_PIPER_CMD"
    },
    cloudTranscribeSource: cloudCredential?.source || geminiCredential?.source || "",
    cloudTranscribeSources: [cloudCredential?.source, geminiCredential?.source].filter(Boolean),
    geminiLiveAudio: geminiLiveAudioAvailable
      ? {
        project: String(geminiLiveAudioStatus.project || ""),
        location: String(geminiLiveAudioStatus.location || ""),
        model: String(geminiLiveAudioStatus.model || "")
      }
      : null,
    localWhisperBackoff: {
      active: whisperBackoff.active && cloudAvailable,
      untilMs: whisperBackoff.active && cloudAvailable ? whisperBackoff.untilMs : 0,
      reason: whisperBackoff.active && cloudAvailable ? whisperBackoff.reason : ""
    },
    localWhisperCommandConfigured: whisperConfigured,
    localWhisperCommandAvailable: whisperCommandAvailable
  };
}

async function transcribeAudioFileCloud(fullInput, options = {}) {
  const credential = resolveCloudTranscribeCredential();
  if (!credential || !credential.apiKey) {
    throw new Error("Cloud transcription is not configured. Set ASOLARIA_VOICE_TRANSCRIBE_API_KEY or store an external provider key in vault.");
  }

  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 180000));
  const model = String(options.model || DEFAULT_CLOUD_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe").trim();
  const language = String(options.language || "").trim();

  const fileBuffer = fs.readFileSync(fullInput);
  const fileBlob = new Blob([fileBuffer], { type: "audio/wav" });
  const form = new FormData();
  form.append("file", fileBlob, path.basename(fullInput));
  form.append("model", model);
  if (language) {
    form.append("language", language);
  }
  form.append("response_format", "json");

  const endpoint = `${credential.baseUrl}/v1/audio/transcriptions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      Authorization: `Bearer ${credential.apiKey}`
    };
    if (credential.organization) {
      headers["OpenAI-Organization"] = credential.organization;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal
    });

    const bodyText = await response.text();
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch (_error) {
      body = { raw: bodyText };
    }

    if (!response.ok) {
      const detail = String(body?.error?.message || bodyText || `HTTP ${response.status}`).slice(0, 400);
      throw new Error(`Cloud transcription failed (${response.status}): ${detail}`);
    }

    const text = String(body?.text || "").trim();
    if (!text) {
      throw new Error("Cloud transcription returned no text.");
    }

    return {
      text,
      raw: body,
      mode: "cloud-openai-transcribe",
      provider: credential.source
    };
  } finally {
    clearTimeout(timer);
  }
}

function inferAudioMimeType(filePath) {
  const ext = String(path.extname(filePath || "").toLowerCase() || "");
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".webm") return "audio/webm";
  return "application/octet-stream";
}

function writePcm16MonoWav(outputPath, pcmBuffer, sampleRateHz = 24000) {
  const buffer = Buffer.isBuffer(pcmBuffer) ? pcmBuffer : Buffer.from(pcmBuffer || []);
  if (!buffer.length) {
    throw new Error("PCM audio buffer is empty.");
  }
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRateHz * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + buffer.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(buffer.length, 40);
  fs.writeFileSync(outputPath, Buffer.concat([header, buffer]));
}

function extractGeminiText(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const parts = candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => (part && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeCloudSttProviderPreference(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "auto" || raw === "openai" || raw === "openai_first") {
    return "openai_first";
  }
  if (raw === "gemini" || raw === "gemini_first") {
    return "gemini_first";
  }
  if (raw === "openai_only") {
    return "openai_only";
  }
  if (raw === "gemini_only") {
    return "gemini_only";
  }
  return "openai_first";
}

async function transcribeAudioFileGemini(fullInput, options = {}) {
  const credential = resolveGeminiTranscribeCredential();
  if (!credential || !credential.apiKey) {
    throw new Error("Gemini transcription is not configured (missing ASOLARIA_GEMINI_API_KEY or vault Gemini API key).");
  }

  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 180000));
  const model = String(options.model || credential.model || DEFAULT_GEMINI_TRANSCRIBE_MODEL).trim();
  const language = String(options.language || "").trim();
  const instruction = language
    ? `Transcribe this audio to plain text. Primary language: ${language}. Return only the transcript text.`
    : "Transcribe this audio to plain text. Return only the transcript text.";
  const fileBuffer = fs.readFileSync(fullInput);
  const mimeType = inferAudioMimeType(fullInput);
  const base64Audio = fileBuffer.toString("base64");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: instruction },
          {
            inlineData: {
              mimeType,
              data: base64Audio
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096
    }
  };

  const endpoint = `${credential.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-goog-api-key": credential.apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const bodyText = await response.text();
    let parsed = {};
    try {
      parsed = bodyText ? JSON.parse(bodyText) : {};
    } catch (_error) {
      parsed = { raw: bodyText };
    }

    if (!response.ok) {
      const detail = String(parsed?.error?.message || parsed?.message || bodyText || `HTTP ${response.status}`).slice(0, 400);
      throw new Error(`Gemini transcription failed (${response.status}): ${detail}`);
    }

    const text = extractGeminiText(parsed);
    if (!text) {
      throw new Error("Gemini transcription returned no text.");
    }

    return {
      text,
      raw: parsed,
      mode: "cloud-gemini-transcribe",
      provider: credential.source
    };
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeAudioFile(inputPath, options = {}) {
  const fullInput = path.resolve(String(inputPath || "").trim());
  if (!fs.existsSync(fullInput)) {
    throw new Error(`Audio file not found: ${fullInput}`);
  }
  const tools = resolveVoiceToolPaths();
  const cloudCredential = resolveCloudTranscribeCredential();
  const geminiCredential = resolveGeminiTranscribeCredential();
  const cloudPreference = normalizeCloudSttProviderPreference(
    options.providerPreference
    || options.cloudProviderPreference
    || process.env.ASOLARIA_VOICE_CLOUD_STT_PROVIDER_PREFERENCE
    || "gemini_first"
  );
  const hasCloudTranscribe = Boolean(
    (cloudCredential && cloudCredential.apiKey)
    || (geminiCredential && geminiCredential.apiKey)
  );
  let localWhisperError = null;

  if (tools.whisperCmd) {
    if (!isConfiguredCommandAvailable(tools.whisperCmd)) {
      localWhisperError = new Error(`Configured local whisper command was not found: ${tools.whisperCmd}`);
      if (!hasCloudTranscribe) {
        throw localWhisperError;
      }
    } else {
      const whisperBackoff = getLocalWhisperBackoff(tools.whisperCmd);
      if (hasCloudTranscribe && whisperBackoff.active) {
        localWhisperError = new Error(
          `Local whisper temporarily bypassed after previous failure: ${whisperBackoff.reason || "toolchain_unavailable"}`
        );
      } else {
        const language = String(options.language || "en").trim();
        const model = String(options.model || "").trim();
        const args = [fullInput, "--language", language];
        if (model) {
          args.push("--model", model);
        }
        try {
          const result = await runToolCommand(tools.whisperCmd, args, Number(options.timeoutMs || 180000));
          clearLocalWhisperBackoff(tools.whisperCmd);
          return {
            text: result.stdout || result.stderr || "",
            raw: result,
            mode: "local-whisper",
            provider: "local"
          };
        } catch (error) {
          localWhisperError = error;
          if (hasCloudTranscribe && isLikelyMissingLocalToolchainError(error)) {
            markLocalWhisperBackoff(tools.whisperCmd, error);
          }
          if (!hasCloudTranscribe) {
            throw error;
          }
        }
      }
    }
  }

  if (cloudPreference === "openai_only" && !(cloudCredential && cloudCredential.apiKey)) {
    throw new Error("Cloud transcription preference is openai_only, but OpenAI transcription is not configured.");
  }
  if (cloudPreference === "gemini_only" && !(geminiCredential && geminiCredential.apiKey)) {
    throw new Error("Cloud transcription preference is gemini_only, but Gemini transcription is not configured.");
  }

  const cloudOrder = [];
  if (cloudPreference === "gemini_first" || cloudPreference === "gemini_only") {
    cloudOrder.push("gemini", "openai");
  } else {
    cloudOrder.push("openai", "gemini");
  }
  if (cloudPreference === "openai_only") {
    cloudOrder.length = 0;
    cloudOrder.push("openai");
  } else if (cloudPreference === "gemini_only") {
    cloudOrder.length = 0;
    cloudOrder.push("gemini");
  }

  let openAiError = null;
  let geminiError = null;

  for (const provider of cloudOrder) {
    if (provider === "openai") {
      if (!(cloudCredential && cloudCredential.apiKey)) {
        continue;
      }
      try {
        return await transcribeAudioFileCloud(fullInput, options);
      } catch (error) {
        openAiError = error;
      }
      continue;
    }

    if (provider === "gemini") {
      if (!(geminiCredential && geminiCredential.apiKey)) {
        continue;
      }
      try {
        return await transcribeAudioFileGemini(fullInput, options);
      } catch (error) {
        geminiError = error;
      }
    }
  }

  const firstCloudError = openAiError || geminiError;
  if (openAiError && geminiError) {
    const openAiMessage = String(openAiError?.message || openAiError || "openai_transcribe_failed");
    const geminiMessage = String(geminiError?.message || geminiError || "gemini_transcribe_failed");
    throw new Error(`${openAiMessage} | Gemini fallback failed: ${geminiMessage}`);
  }

  if (firstCloudError) {
    if (localWhisperError) {
      const localMessage = String(localWhisperError?.message || localWhisperError || "local_whisper_failed");
      const cloudMessage = String(firstCloudError?.message || firstCloudError || "cloud_transcribe_failed");
      throw new Error(`${localMessage} | Cloud fallback failed: ${cloudMessage}`);
    }
    throw firstCloudError;
  }

  if (localWhisperError) {
    throw localWhisperError;
  }

  throw new Error("No speech-to-text engine is available. Configure ASOLARIA_WHISPER_CMD or cloud transcription credentials.");
}

async function synthesizeSpeechToFile(text, outputPath, options = {}) {
  const content = safeText(text, 20000);
  if (!content) {
    throw new Error("Text is required for synthesis.");
  }
  const outPath = path.resolve(String(outputPath || "").trim());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const tools = resolveVoiceToolPaths();
  const provider = String(options.provider || "auto").trim().toLowerCase();
  const forceGeminiLiveAudio = provider === "gemini_live_audio" || provider === "gemini_live";
  const forceKitty = provider === "kitty_tts";
  const forcePiper = provider === "piper";
  const canKitty = Boolean(tools.kittyTtsCmd);
  const canPiper = Boolean(tools.piperCmd);
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 120000));
  const defaultKittyVoice = String(
    options.defaultVoice
    || process.env.ASOLARIA_KITTY_TTS_DEFAULT_VOICE
    || ""
  ).trim();
  const voice = String(options.voice || defaultKittyVoice).trim();

  if (forceGeminiLiveAudio) {
    const result = await runGeminiLiveAudioTextTurn({
      prompt: `Repeat exactly this message and nothing else:\n${content}`,
      system: [
        "You are the spoken voice of Asolaria.",
        "Speak naturally and clearly to Jesse.",
        "Repeat the provided user message exactly with no additions, no commentary, and no paraphrasing."
      ].join("\n"),
      voice: voice || process.env.ASOLARIA_GEMINI_LIVE_AUDIO_VOICE || "",
      timeoutMs
    });
    writePcm16MonoWav(outPath, result.audioBuffer, Number(result.sampleRateHz || 24000));
    return {
      outputPath: outPath,
      mode: "audio-gemini-live",
      provider: String(result.provider || "vertex-gemini-live-audio"),
      model: String(result.model || ""),
      transcript: String(result.transcript || "").trim(),
      voice: String(result.voiceName || "")
    };
  }

  if (forceKitty || (provider === "auto" && canKitty && !canPiper)) {
    if (!canKitty) {
      throw new Error("Kitty TTS command is not configured. Set ASOLARIA_KITTY_TTS_CMD.");
    }
    // Adapter contract for ASOLARIA_KITTY_TTS_CMD:
    // argv[0] = output path, argv[1] = text, argv[2] = optional voice id.
    const args = [outPath, content];
    if (voice) {
      args.push(voice);
    }
    await runToolCommand(tools.kittyTtsCmd, args, timeoutMs);
    if (!fs.existsSync(outPath)) {
      throw new Error("Kitty TTS did not produce an output file.");
    }
    return {
      outputPath: outPath,
      mode: "audio-kitty"
    };
  }

  if (forcePiper || canPiper) {
    const args = [];
    if (voice) {
      args.push("--model", voice);
    }
    args.push("--output_file", outPath);

    await new Promise((resolve, reject) => {
      const child = spawn(tools.piperCmd, args, {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      });
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Piper synthesis timed out."));
      }, timeoutMs);
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          return reject(new Error(`Piper exited ${code}: ${stderr.trim()}`));
        }
        return resolve();
      });
      child.stdin.write(content);
      child.stdin.end();
    });

    return {
      outputPath: outPath,
      mode: "audio"
    };
  }

  fs.writeFileSync(outPath.replace(/\.\w+$/, ".txt"), content, "utf8");
  return {
    outputPath: outPath.replace(/\.\w+$/, ".txt"),
    mode: "fallback-text"
  };
}

function buildVoicePlan() {
  return {
    priority: ["usb", "vpn", "private_internet"],
    freeStack: {
      stt: "whisper.cpp (local)",
      tts: "piper (local)",
      conversation: "Asolaria local/codex/external fallback",
      transport: "mobile approvals + private token + VPN/USB"
    },
    cloudFallback: {
      stt: "cloud transcribe only if local unavailable",
      tts: "cloud tts only for emergency fallback"
    }
  };
}

module.exports = {
  splitSentences,
  detectVoiceTools,
  transcribeAudioFile,
  synthesizeSpeechToFile,
  buildVoicePlan
};
