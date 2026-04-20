const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const SLACK_SECRET_NAME = "integrations.slack";
const SLACK_API_BASE = "https://slack.com/api";

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeToken(value) {
  const token = String(value || "").trim();
  if (!token) return "";
  if (!/^xox[baprs]-[A-Za-z0-9-]+$/.test(token)) {
    return "";
  }
  return token;
}

function normalizeChannelList(list) {
  const items = Array.isArray(list) ? list : [];
  const normalized = items
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((item) => /^[a-z0-9._:-]+$/.test(item));
  return Array.from(new Set(normalized));
}

function normalizeWorkspaceLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeWorkspaceList(list) {
  const items = Array.isArray(list) ? list : [];
  const normalized = items
    .map((item) => normalizeWorkspaceLabel(item))
    .filter(Boolean)
    .filter((item) => /^[a-z0-9._ -]{2,120}$/.test(item));
  return Array.from(new Set(normalized));
}

function normalizeWorkspaceIdList(list) {
  const items = Array.isArray(list) ? list : [];
  const normalized = items
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((item) => /^[a-z0-9]{3,40}$/.test(item));
  return Array.from(new Set(normalized));
}

function maskToken(token) {
  const value = String(token || "");
  if (!value) return "";
  if (value.length <= 10) return "*".repeat(value.length);
  return `${value.slice(0, 6)}${"*".repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
}

function resolveSlackToken() {
  const envToken = normalizeToken(
    process.env.ASOLARIA_SLACK_BOT_TOKEN
    || process.env.ASOLARIA_SLACK_TOKEN
    || ""
  );
  if (envToken) {
    return {
      token: envToken,
      source: "env",
      updatedAt: null
    };
  }

  const secret = getSecret(SLACK_SECRET_NAME, { namespace: "owner" });
  const vaultToken = normalizeToken(secret?.value?.botToken || secret?.value?.token || "");
  if (vaultToken) {
    return {
      token: vaultToken,
      source: "vault",
      updatedAt: secret.updatedAt || null,
      defaultChannel: String(secret.value?.defaultChannel || "").trim()
    };
  }

  return {
    token: "",
    source: "none",
    updatedAt: null,
    defaultChannel: ""
  };
}

function getSlackConfigSummary(policy = {}) {
  const resolved = resolveSlackToken();
  return {
    enabled: policy.enabled !== false,
    configured: Boolean(resolved.token),
    tokenSource: resolved.source,
    tokenHint: maskToken(resolved.token),
    defaultChannel: resolved.defaultChannel || "",
    updatedAt: resolved.updatedAt || null
  };
}

function setSlackConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(SLACK_SECRET_NAME, { namespace: "owner" });
    return getSlackConfigSummary();
  }

  const resolved = resolveSlackToken();
  const token = normalizeToken(input.botToken || input.token) || resolved.token;
  if (!token) {
    throw new Error("A valid Slack token is required (expected format xoxb-... or similar).");
  }

  const payload = {
    botToken: token,
    defaultChannel: input.defaultChannel !== undefined
      ? String(input.defaultChannel || "").trim()
      : String(resolved.defaultChannel || "").trim(),
    updatedAt: new Date().toISOString()
  };
  setSecret(SLACK_SECRET_NAME, payload, {
    app: "Asolaria",
    component: "slack-integration",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });

  return getSlackConfigSummary();
}

async function slackApiCall(method, payload, token) {
  const response = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(payload || {})
  });

  let parsed;
  try {
    parsed = await response.json();
  } catch (_error) {
    throw new Error(`Slack API ${method} returned a non-JSON response.`);
  }

  if (!response.ok) {
    throw new Error(`Slack API ${method} HTTP ${response.status}.`);
  }
  if (!parsed || parsed.ok !== true) {
    const code = String(parsed?.error || "unknown_error");
    throw new Error(`Slack API ${method} failed: ${code}`);
  }
  return parsed;
}

function normalizeSlackChannel(entry) {
  return {
    id: String(entry?.id || ""),
    name: String(entry?.name || ""),
    isPrivate: Boolean(entry?.is_private),
    isArchived: Boolean(entry?.is_archived),
    isIm: Boolean(entry?.is_im),
    isMpim: Boolean(entry?.is_mpim),
    isChannel: Boolean(entry?.is_channel),
    isGroup: Boolean(entry?.is_group),
    members: Number.isFinite(Number(entry?.num_members)) ? Number(entry.num_members) : null
  };
}

function channelAllowedByPolicy(channel, policy = {}) {
  if (!channel || !channel.id) {
    return false;
  }
  if (!policy.allowPrivateChannels && channel.isPrivate) {
    return false;
  }
  if (!policy.allowDirectMessages && (channel.isIm || channel.isMpim)) {
    return false;
  }
  const allowed = normalizeChannelList(policy.allowedChannels || []);
  if (!allowed.length) {
    return true;
  }
  const id = String(channel.id || "").toLowerCase();
  const name = String(channel.name || "").toLowerCase();
  return allowed.includes(id) || (name && allowed.includes(name));
}

function sanitizeChannelReference(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("#")) {
    return raw.slice(1).trim();
  }
  return raw;
}

function workspaceAllowedByPolicy(workspace, policy = {}) {
  const allowedNames = normalizeWorkspaceList(policy.allowedWorkspaces || []);
  const allowedIds = normalizeWorkspaceIdList(policy.allowedWorkspaceIds || []);
  if (!allowedNames.length && !allowedIds.length) {
    return true;
  }

  const id = String(workspace?.id || "").trim().toLowerCase();
  const name = normalizeWorkspaceLabel(workspace?.name || "");
  if (allowedIds.length && id && allowedIds.includes(id)) {
    return true;
  }
  if (allowedNames.length && name && allowedNames.includes(name)) {
    return true;
  }
  return false;
}

function normalizeSlackPolicy(policy = {}) {
  return {
    enabled: policy.enabled !== false,
    allowPrivateChannels: policy.allowPrivateChannels !== false,
    allowDirectMessages: Boolean(policy.allowDirectMessages),
    allowedChannels: normalizeChannelList(policy.allowedChannels || []),
    allowedWorkspaces: normalizeWorkspaceList(policy.allowedWorkspaces || []),
    allowedWorkspaceIds: normalizeWorkspaceIdList(policy.allowedWorkspaceIds || []),
    maxMessages: clampInt(policy.maxMessages, 60, 5, 200),
    maxDigestChars: clampInt(policy.maxDigestChars, 26000, 2000, 120000)
  };
}

async function resolveSlackAuthIdentity(token) {
  const auth = await slackApiCall("auth.test", {}, token);
  return {
    workspace: {
      id: String(auth.team_id || ""),
      name: String(auth.team || "")
    },
    botUser: {
      id: String(auth.user_id || ""),
      name: String(auth.user || "")
    }
  };
}

async function enforceSlackWorkspacePolicy(token, policy = {}) {
  const identity = await resolveSlackAuthIdentity(token);
  if (!workspaceAllowedByPolicy(identity.workspace, policy)) {
    const label = identity.workspace.name || identity.workspace.id || "unknown";
    throw new Error(`Slack workspace not allowed by policy: ${label}`);
  }
  return identity;
}

async function listSlackChannels(input = {}, policy = {}) {
  const resolved = resolveSlackToken();
  if (!resolved.token) {
    throw new Error("Slack integration is not configured.");
  }
  if (input.enforceWorkspace !== false) {
    await enforceSlackWorkspacePolicy(resolved.token, policy);
  }

  const limit = clampInt(input.limit, 60, 1, 200);
  const types = [];
  types.push("public_channel");
  if (policy.allowPrivateChannels !== false) {
    types.push("private_channel");
  }
  if (policy.allowDirectMessages) {
    types.push("im", "mpim");
  }
  const payload = {
    limit,
    cursor: String(input.cursor || "").trim() || undefined,
    exclude_archived: input.excludeArchived !== false,
    types: types.join(",")
  };

  const data = await slackApiCall("conversations.list", payload, resolved.token);
  const channels = Array.isArray(data.channels)
    ? data.channels.map(normalizeSlackChannel).filter((channel) => channelAllowedByPolicy(channel, policy))
    : [];
  return {
    channels,
    nextCursor: String(data?.response_metadata?.next_cursor || "").trim(),
    hasMore: Boolean(String(data?.response_metadata?.next_cursor || "").trim())
  };
}

async function resolveSlackChannel(input = {}, policy = {}) {
  const resolved = resolveSlackToken();
  if (!resolved.token) {
    throw new Error("Slack integration is not configured.");
  }
  await enforceSlackWorkspacePolicy(resolved.token, policy);
  const requested = sanitizeChannelReference(input.channel || resolved.defaultChannel || "");
  if (!requested) {
    throw new Error("Slack channel is required.");
  }
  const requestedLower = requested.toLowerCase();
  const isId = /^[cgd][a-z0-9]{8,}$/i.test(requested);

  let cursor = "";
  for (let page = 0; page < 25; page += 1) {
    const batch = await listSlackChannels({
      limit: 200,
      cursor,
      excludeArchived: true,
      enforceWorkspace: false
    }, policy);
    const found = batch.channels.find((channel) => {
      const id = String(channel.id || "").toLowerCase();
      const name = String(channel.name || "").toLowerCase();
      if (isId) {
        return id === requestedLower;
      }
      return name === requestedLower || `#${name}` === requestedLower || id === requestedLower;
    });
    if (found) {
      return {
        token: resolved.token,
        channel: found
      };
    }
    if (!batch.hasMore || !batch.nextCursor) {
      break;
    }
    cursor = batch.nextCursor;
  }

  throw new Error(`Slack channel not found or not allowed by policy: ${requested}`);
}

async function sendSlackMessage(input = {}, policy = {}) {
  if (policy.enabled === false) {
    throw new Error("Slack integration is disabled by policy.");
  }

  const { token, channel } = await resolveSlackChannel({
    channel: input.channel
  }, policy);

  const text = String(input.text || input.message || "").trim();
  if (!text) {
    throw new Error("text is required.");
  }

  const threadTs = String(input.thread_ts || input.threadTs || "").trim();
  const result = await slackApiCall("chat.postMessage", {
    channel: channel.id,
    text,
    ...(threadTs ? { thread_ts: threadTs } : {})
  }, token);

  return {
    ok: true,
    ts: String(result?.ts || ""),
    channel: String(result?.channel || channel.id || "")
  };
}

function createSlackEventPoller(options = {}) {
  const channels = Array.isArray(options.channels)
    ? options.channels.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const intervalMs = clampInt(options.intervalMs, 8000, 1000, 600000);
  const onMessage = typeof options.onMessage === "function" ? options.onMessage : null;
  const policy = options.policy && typeof options.policy === "object" ? options.policy : {};

  if (!channels.length) {
    throw new Error("At least one channel ID required.");
  }
  if (!onMessage) {
    throw new Error("onMessage callback required.");
  }

  const state = {
    running: false,
    lastTs: {},
    intervalHandle: null,
    pollCount: 0,
    errors: []
  };
  for (const channelId of channels) {
    state.lastTs[channelId] = String(Date.now() / 1000);
  }

  function pushError(error, channelId = "") {
    state.errors.push({
      at: new Date().toISOString(),
      ...(channelId ? { channelId } : {}),
      error: String(error?.message || error || "unknown_error")
    });
    if (state.errors.length > 50) {
      state.errors.shift();
    }
  }

  async function poll() {
    if (!state.running) {
      return;
    }

    const resolved = resolveSlackToken();
    if (!resolved.token) {
      pushError("no_token");
      return;
    }

    if (policy.allowedWorkspaces?.length || policy.allowedWorkspaceIds?.length) {
      try {
        await enforceSlackWorkspacePolicy(resolved.token, policy);
      } catch (error) {
        pushError(error);
        return;
      }
    }

    for (const channelId of channels) {
      try {
        const oldest = state.lastTs[channelId] || "0";
        const result = await slackApiCall("conversations.history", {
          channel: channelId,
          oldest,
          limit: 20,
          inclusive: false
        }, resolved.token);
        const messages = (Array.isArray(result?.messages) ? result.messages : [])
          .filter((message) => message?.ts && !message?.bot_id && message?.subtype !== "channel_join")
          .sort((left, right) => parseFloat(left.ts) - parseFloat(right.ts));

        for (const message of messages) {
          try {
            onMessage({ channelId, message });
          } catch (_error) {
            // Keep polling even if the observer callback fails.
          }
          if (parseFloat(message.ts) > parseFloat(state.lastTs[channelId] || "0")) {
            state.lastTs[channelId] = String(message.ts);
          }
        }
      } catch (error) {
        pushError(error, channelId);
      }
    }

    state.pollCount += 1;
  }

  return {
    start() {
      if (state.running) {
        return;
      }
      state.running = true;
      state.intervalHandle = setInterval(() => {
        void poll();
      }, intervalMs);
      void poll();
    },
    stop() {
      state.running = false;
      if (state.intervalHandle) {
        clearInterval(state.intervalHandle);
        state.intervalHandle = null;
      }
    },
    status() {
      return {
        running: state.running,
        pollCount: state.pollCount,
        channels: channels.slice(),
        intervalMs,
        lastTs: { ...state.lastTs },
        recentErrors: state.errors.slice(-5)
      };
    }
  };
}

function decodeSlackToken(text) {
  const raw = String(text || "");
  return raw.replace(/<([^>]+)>/g, (_match, insideRaw) => {
    const inside = String(insideRaw || "");
    const [left, label] = inside.split("|");
    if (/^https?:\/\//i.test(left)) {
      return label ? `${label} [link omitted]` : "[link omitted]";
    }
    if (left.startsWith("@")) {
      return `@${left.slice(1)}`;
    }
    if (left.startsWith("#")) {
      return label ? `#${label}` : "#channel";
    }
    if (left.startsWith("!")) {
      return "";
    }
    return label || left;
  });
}

function sanitizeSlackText(text) {
  const decoded = decodeSlackToken(text);
  return decoded
    .replace(/\bhttps?:\/\/\S+/gi, "[link omitted]")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipText(value, limit = 900) {
  const text = String(value || "");
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function toIsoFromSlackTs(ts) {
  const num = Number(ts);
  if (!Number.isFinite(num)) {
    return "";
  }
  return new Date(Math.round(num * 1000)).toISOString();
}

async function resolveUserLabels(messages, token) {
  const ids = Array.from(new Set(
    (Array.isArray(messages) ? messages : [])
      .map((msg) => String(msg?.user || "").trim())
      .filter(Boolean)
  )).slice(0, 25);
  if (!ids.length) {
    return {};
  }

  const labels = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const info = await slackApiCall("users.info", { user: id }, token);
      const profile = info?.user?.profile || {};
      const name = String(
        profile.display_name
        || profile.real_name
        || info?.user?.real_name
        || info?.user?.name
        || id
      ).trim();
      labels[id] = name || id;
    } catch (_error) {
      labels[id] = id;
    }
  }));
  return labels;
}

function normalizeSlackMessage(msg, userLabels = {}) {
  const rawText = String(msg?.text || "");
  const subtype = String(msg?.subtype || "").trim();
  const userId = String(msg?.user || "").trim();
  const author = userId
    ? (userLabels[userId] || userId)
    : String(msg?.bot_id || subtype || "system");
  let text = sanitizeSlackText(rawText);

  const fileNames = Array.isArray(msg?.files)
    ? msg.files
      .map((file) => String(file?.name || file?.title || "").trim())
      .filter(Boolean)
      .slice(0, 5)
    : [];
  if (fileNames.length) {
    text = text ? `${text}\n[files: ${fileNames.join(", ")}]` : `[files: ${fileNames.join(", ")}]`;
  }
  if (!text && subtype) {
    text = `[event:${subtype}]`;
  }

  return {
    id: String(msg?.client_msg_id || msg?.ts || ""),
    ts: String(msg?.ts || ""),
    at: toIsoFromSlackTs(msg?.ts),
    author: clipText(author, 120),
    text: clipText(text, 1800),
    subtype,
    hasLinksRedacted: /\bhttps?:\/\/|<https?:\/\//i.test(rawText)
  };
}

function buildSlackConversationDigest(messages, options = {}) {
  const maxChars = clampInt(options.maxChars, 24000, 2000, 120000);
  const lines = [];
  for (const message of Array.isArray(messages) ? messages : []) {
    const at = String(message.at || "").replace("T", " ").replace("Z", " UTC");
    const author = String(message.author || "unknown");
    const text = String(message.text || "");
    const row = `${at} | ${author}: ${text}`;
    lines.push(row);
  }
  const joined = lines.join("\n");
  if (joined.length <= maxChars) {
    return joined;
  }
  return `${joined.slice(0, maxChars - 3)}...`;
}

async function reviewSlackConversation(input = {}, policy = {}) {
  const limit = clampInt(
    input.limit,
    Math.min(50, clampInt(policy.maxMessages, 60, 5, 200)),
    1,
    clampInt(policy.maxMessages, 60, 5, 200)
  );

  const { token, channel } = await resolveSlackChannel({
    channel: input.channel
  }, policy);

  const history = await slackApiCall("conversations.history", {
    channel: channel.id,
    limit,
    inclusive: Boolean(input.inclusive),
    oldest: input.oldest ? String(input.oldest) : undefined,
    latest: input.latest ? String(input.latest) : undefined
  }, token);

  const rawMessages = Array.isArray(history.messages) ? history.messages : [];
  const userLabels = await resolveUserLabels(rawMessages, token);
  const normalized = rawMessages
    .map((msg) => normalizeSlackMessage(msg, userLabels))
    .filter((msg) => msg.text)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  const digest = buildSlackConversationDigest(normalized, {
    maxChars: clampInt(policy.maxDigestChars, 26000, 2000, 120000)
  });

  return {
    channel,
    messageCount: normalized.length,
    hasMore: Boolean(history.has_more),
    messages: normalized,
    digest
  };
}

async function getSlackIntegrationStatus(policy = {}) {
  const normalizedPolicy = normalizeSlackPolicy(policy);
  const summary = getSlackConfigSummary(normalizedPolicy);
  const status = {
    ...summary,
    policy: {
      ...normalizedPolicy,
      backendOnly: true,
      noLinkNavigation: true,
      linkRedaction: true
    },
    connection: {
      ok: false,
      error: summary.configured ? "not_tested" : "not_configured"
    },
    workspace: null,
    botUser: null
  };
  if (!summary.enabled || !summary.configured) {
    return status;
  }

  const resolved = resolveSlackToken();
  try {
    const identity = await resolveSlackAuthIdentity(resolved.token);
    status.workspace = identity.workspace;
    status.botUser = identity.botUser;
    if (workspaceAllowedByPolicy(identity.workspace, normalizedPolicy)) {
      status.connection.ok = true;
      status.connection.error = "";
    } else {
      status.connection.ok = false;
      status.connection.error = `workspace_not_allowed:${identity.workspace.name || identity.workspace.id || "unknown"}`;
    }
  } catch (error) {
    status.connection.ok = false;
    status.connection.error = String(error?.message || error || "auth_failed");
  }
  return status;
}

module.exports = {
  SLACK_SECRET_NAME,
  resolveSlackToken,
  slackApiCall,
  getSlackConfigSummary,
  setSlackConfig,
  normalizeSlackPolicy,
  getSlackIntegrationStatus,
  listSlackChannels,
  reviewSlackConversation,
  buildSlackConversationDigest,
  sendSlackMessage,
  createSlackEventPoller
};
