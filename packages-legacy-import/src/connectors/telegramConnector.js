const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const TELEGRAM_SECRET_NAME = "integrations.telegram";
const TELEGRAM_API_BASE = "https://api.telegram.org";

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(value, limit = 3800) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeBotToken(value) {
  const token = String(value || "").trim();
  if (!token) return "";
  // Telegram bot tokens look like: 123456789:AA... (exact length can vary).
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,}$/i.test(token)) {
    return "";
  }
  return token;
}

function normalizeChatId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^-?\d{4,20}$/.test(raw)) return "";
  return raw;
}

function normalizeChatIdList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const normalized = items
    .map((item) => normalizeChatId(item))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function maskToken(token) {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 10) return "*".repeat(value.length);
  const idx = value.indexOf(":");
  const head = idx === -1 ? value.slice(0, 6) : value.slice(0, Math.min(idx + 1, 10));
  return `${head}${"*".repeat(Math.max(6, value.length - head.length - 4))}${value.slice(-4)}`;
}

function normalizeWebhookSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // Telegram limits secret token to 1-256 chars; keep it conservative.
  if (!/^[A-Za-z0-9._-]{12,80}$/.test(raw)) return "";
  return raw;
}

function resolveTelegramConfig() {
  const envToken = normalizeBotToken(process.env.ASOLARIA_TELEGRAM_BOT_TOKEN || "");
  if (envToken) {
    const allowedChatIds = normalizeChatIdList(process.env.ASOLARIA_TELEGRAM_ALLOWED_CHAT_IDS || "");
    const defaultChatId = normalizeChatId(process.env.ASOLARIA_TELEGRAM_DEFAULT_CHAT_ID || "");
    const webhookSecretToken = normalizeWebhookSecret(process.env.ASOLARIA_TELEGRAM_WEBHOOK_SECRET || "");
    const pollingEnabled = String(process.env.ASOLARIA_TELEGRAM_POLLING_ENABLED || "").trim().toLowerCase() === "true";
    return {
      token: envToken,
      source: "env",
      allowedChatIds,
      defaultChatId,
      webhookSecretToken,
      pollingEnabled,
      updatedAt: null
    };
  }

  const secret = getSecret(TELEGRAM_SECRET_NAME, { namespace: "owner" });
  const value = secret?.value && typeof secret.value === "object" ? secret.value : {};
  const token = normalizeBotToken(value.botToken || value.token || "");
  return {
    token,
    source: token ? "vault" : "none",
    allowedChatIds: normalizeChatIdList(value.allowedChatIds || []),
    defaultChatId: normalizeChatId(value.defaultChatId || ""),
    webhookSecretToken: normalizeWebhookSecret(value.webhookSecretToken || value.webhookSecret || ""),
    pollingEnabled: Boolean(value.pollingEnabled),
    updatedAt: secret?.updatedAt || null
  };
}

function isChatAllowed(chatId, resolved, policy = {}) {
  const wanted = normalizeChatId(chatId);
  if (!wanted) return false;
  const allowed = Array.isArray(resolved?.allowedChatIds) ? resolved.allowedChatIds : [];
  // Safer default than Slack: if no allowlist is set, deny.
  if (!allowed.length) {
    return false;
  }
  const allowSet = new Set(allowed.map(String));
  if (allowSet.has(wanted)) {
    return true;
  }
  // Policy can optionally allow a single default chat id even when not in list.
  if (policy.allowDefaultChatId === true && resolved?.defaultChatId && wanted === resolved.defaultChatId) {
    return true;
  }
  return false;
}

function getTelegramConfigSummary(policy = {}) {
  const resolved = resolveTelegramConfig();
  return {
    enabled: policy.enabled !== false,
    configured: Boolean(resolved.token),
    tokenSource: resolved.source,
    tokenHint: maskToken(resolved.token),
    allowedChatIds: resolved.allowedChatIds,
    allowedChatCount: resolved.allowedChatIds.length,
    defaultChatId: resolved.defaultChatId,
    webhookSecretConfigured: Boolean(resolved.webhookSecretToken),
    pollingEnabled: Boolean(resolved.pollingEnabled),
    updatedAt: resolved.updatedAt || null
  };
}

function setTelegramConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(TELEGRAM_SECRET_NAME, { namespace: "owner" });
    return getTelegramConfigSummary();
  }

  const existing = resolveTelegramConfig();
  const hasProp = (key) => Object.prototype.hasOwnProperty.call(input || {}, key);

  const hasToken = hasProp("botToken") || hasProp("token");
  const token = normalizeBotToken(hasToken ? (input.botToken || input.token || "") : "") || existing.token;
  if (!token) {
    throw new Error("A valid Telegram bot token is required (botToken).");
  }

  const hasAllowed = hasProp("allowedChatIds") || hasProp("allowedChats") || hasProp("allowedChatId");
  const allowedChatIds = hasAllowed
    ? normalizeChatIdList(input.allowedChatIds || input.allowedChats || input.allowedChatId || [])
    : normalizeChatIdList(existing.allowedChatIds || []);
  if (!allowedChatIds.length) {
    throw new Error("At least one allowlisted chat id is required (allowedChatIds).");
  }

  const defaultChatId = hasProp("defaultChatId")
    ? normalizeChatId(input.defaultChatId || "")
    : normalizeChatId(existing.defaultChatId || "");

  if (defaultChatId && !allowedChatIds.includes(String(defaultChatId))) {
    throw new Error("defaultChatId must be included in allowedChatIds.");
  }

  const webhookSecretToken = (hasProp("webhookSecretToken") || hasProp("webhookSecret"))
    ? normalizeWebhookSecret(input.webhookSecretToken || input.webhookSecret || "")
    : normalizeWebhookSecret(existing.webhookSecretToken || "");

  const pollingEnabled = hasProp("pollingEnabled") ? Boolean(input.pollingEnabled) : Boolean(existing.pollingEnabled);

  const payload = {
    botToken: token,
    allowedChatIds,
    defaultChatId,
    webhookSecretToken,
    pollingEnabled,
    updatedAt: new Date().toISOString()
  };

  setSecret(TELEGRAM_SECRET_NAME, payload, {
    app: "Asolaria",
    component: "telegram-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  return getTelegramConfigSummary();
}

async function telegramApiCall(method, payload, token, options = {}) {
  const name = String(method || "").trim();
  if (!name) {
    throw new Error("Telegram API method is required.");
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload || {}),
    signal: options.signal
  });

  let parsed = null;
  try {
    parsed = await response.json();
  } catch (_error) {
    parsed = null;
  }

  if (!response.ok) {
    const hint = String(parsed?.description || parsed?.error || `HTTP ${response.status}`);
    throw new Error(`Telegram API ${name} failed: ${hint}`.trim());
  }
  if (!parsed || parsed.ok !== true) {
    const hint = String(parsed?.description || parsed?.error || "unknown_error");
    throw new Error(`Telegram API ${name} failed: ${hint}`.trim());
  }
  return parsed;
}

async function getTelegramIntegrationStatus(policy = {}) {
  const resolved = resolveTelegramConfig();
  const summary = getTelegramConfigSummary(policy);
  if (!summary.enabled) {
    return {
      ...summary,
      connection: { ok: false, error: "disabled_by_policy" },
      bot: null
    };
  }
  if (!resolved.token) {
    return {
      ...summary,
      connection: { ok: false, error: "not_configured" },
      bot: null
    };
  }

  try {
    const data = await telegramApiCall("getMe", {}, resolved.token);
    const bot = data?.result && typeof data.result === "object" ? data.result : null;
    return {
      ...summary,
      connection: { ok: true, error: "" },
      bot: bot
        ? {
          id: bot.id,
          username: String(bot.username || ""),
          firstName: String(bot.first_name || ""),
          canJoinGroups: Boolean(bot.can_join_groups),
          canReadAllGroupMessages: Boolean(bot.can_read_all_group_messages),
          supportsInlineQueries: Boolean(bot.supports_inline_queries)
        }
        : null
    };
  } catch (error) {
    return {
      ...summary,
      connection: { ok: false, error: clipText(String(error?.message || error || "connection_failed"), 260) },
      bot: null
    };
  }
}

async function sendTelegramMessage(input = {}, policy = {}) {
  const resolved = resolveTelegramConfig();
  if (policy.enabled === false) {
    throw new Error("Telegram integration is disabled by policy.");
  }
  if (!resolved.token) {
    throw new Error("Telegram integration is not configured.");
  }

  const chatId = normalizeChatId(input.chatId || input.chat_id || resolved.defaultChatId || "");
  if (!chatId) {
    throw new Error("Telegram chatId is required (or configure a defaultChatId).");
  }
  if (!isChatAllowed(chatId, resolved, policy)) {
    throw new Error("Telegram chatId is not allowlisted.");
  }

  const maxChars = clampInt(policy.maxOutboundChars, 3800, 200, 3800);
  const text = clipText(input.text || input.message || "", maxChars);
  if (!text) {
    throw new Error("Telegram message text is required.");
  }

  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: input.disableWebPagePreview !== false,
    disable_notification: Boolean(input.disableNotification),
    reply_to_message_id: input.replyToMessageId ? Number(input.replyToMessageId) : undefined,
    allow_sending_without_reply: true
  };

  const data = await telegramApiCall("sendMessage", payload, resolved.token);
  return {
    ok: true,
    chatId,
    messageId: data?.result?.message_id ?? null,
    at: new Date().toISOString()
  };
}

async function fetchTelegramUpdates(input = {}, policy = {}) {
  const resolved = resolveTelegramConfig();
  if (policy.enabled === false) {
    throw new Error("Telegram integration is disabled by policy.");
  }
  if (!resolved.token) {
    throw new Error("Telegram integration is not configured.");
  }

  const offset = Number.isFinite(Number(input.offset)) ? Number(input.offset) : undefined;
  const limit = clampInt(input.limit, 40, 1, 100);
  const timeoutSec = clampInt(input.timeoutSec, 0, 0, 50);
  const payload = {
    offset,
    limit,
    timeout: timeoutSec,
    allowed_updates: Array.isArray(input.allowedUpdates) ? input.allowedUpdates : ["message"]
  };

  const data = await telegramApiCall("getUpdates", payload, resolved.token);
  const updates = Array.isArray(data?.result) ? data.result : [];
  return {
    ok: true,
    count: updates.length,
    updates
  };
}

function getTelegramWebhookSecretToken() {
  const resolved = resolveTelegramConfig();
  return String(resolved.webhookSecretToken || "");
}

module.exports = {
  getTelegramConfigSummary,
  setTelegramConfig,
  getTelegramIntegrationStatus,
  sendTelegramMessage,
  fetchTelegramUpdates,
  getTelegramWebhookSecretToken,
  normalizeChatId,
  normalizeChatIdList,
  clipText
};
