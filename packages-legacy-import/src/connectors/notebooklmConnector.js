const {
  listGmailMessages,
  listUpcomingEvents,
  searchDriveDocs,
  getGoogleDocPlainText,
  getGoogleIntegrationStatus,
  googleApiRequest
} = require("./googleConnector");
const { getGeminiApiConfigSummary, runGeminiApiGenerateContent } = require("./geminiApiConnector");
const { getVertexConfigSummary, getVertexBudgetStatus, runVertexGemini } = require("./vertexConnector");
const { getGcpConfigSummary, gcpApiRequest } = require("./gcpConnector");

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clipText(value, limit = 1000) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeProvider(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "gemini" || raw === "gemini_api" || raw === "ai_studio" || raw === "studio") return "gemini_api";
  if (raw === "vertex" || raw === "vertex_ai") return "vertex";
  return "";
}

function normalizeProjectToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/^projects\//i, "");
}

function normalizeLocationToken(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "global";
  if (!/^[a-z0-9-]{2,40}$/.test(raw)) return "global";
  return raw;
}

function resolveNotebooklmEnterpriseParent(input = {}, policies = {}) {
  const gcpStatus = getGcpConfigSummary(policies.gcpPolicy || {});
  const project = normalizeProjectToken(
    input.project
    || input.projectId
    || input.projectNumber
    || gcpStatus.defaultProject
    || gcpStatus.projectNumber
    || gcpStatus.projectId
  );
  if (!project) {
    throw new Error("NotebookLM Enterprise requires a GCP project (set defaultProject/projectId/projectNumber first).");
  }
  const location = normalizeLocationToken(input.location || "global");
  return {
    project,
    location,
    parent: `projects/${project}/locations/${location}`,
    gcpStatus
  };
}

function normalizeNotebookName(nameOrId, parent) {
  const raw = String(nameOrId || "").trim();
  if (!raw) return "";
  if (/^projects\/[^/]+\/locations\/[^/]+\/notebooks\/[^/]+$/i.test(raw)) {
    return raw;
  }
  if (!parent) return raw;
  if (/^[a-z0-9._-]{3,200}$/i.test(raw)) {
    return `${parent}/notebooks/${raw}`;
  }
  return raw;
}

function classifyNotebooklmEnterpriseError(error) {
  const message = String(error?.message || error || "").trim();
  const lower = message.toLowerCase();
  const tierMatch = message.match(/required\s+license[^.\n]*\bis\s+([A-Z0-9_]+)/i);
  const requiredSubscriptionTier = tierMatch ? String(tierMatch[1] || "").trim().toUpperCase() : "";
  if (lower.includes("required license") || lower.includes("must be assigned a license") || lower.includes("subscription_tier_notebook_lm")) {
    return { code: "license_required", message, requiredSubscriptionTier };
  }
  if (lower.includes("permission denied") || lower.includes("does not have permission")) {
    return { code: "permission_denied", message, requiredSubscriptionTier };
  }
  if (lower.includes("has not been used in project") || (lower.includes("disabled") && lower.includes("api"))) {
    return { code: "api_disabled", message, requiredSubscriptionTier };
  }
  return { code: "unknown", message, requiredSubscriptionTier };
}

async function readNotebooklmApiServiceState(project, policies = {}) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(project)}/services/discoveryengine.googleapis.com`;
  const account = String(policies?.account || "").trim();
  if (account) {
    return googleApiRequest({
      account,
      method: "GET",
      url
    }, {
      maxDepth: 5,
      maxEntries: 260,
      maxString: 2200,
      maxBodyChars: 50000
    });
  }
  return gcpApiRequest({
    method: "GET",
    url,
    scopes: ["https://www.googleapis.com/auth/cloud-platform.read-only"]
  }, {
    maxDepth: 5,
    maxEntries: 260,
    maxString: 2200,
    maxBodyChars: 50000,
    ...(policies.gcpPolicy || {})
  });
}

async function listNotebooklmEnterpriseNotebooks(input = {}, policies = {}) {
  const resolved = resolveNotebooklmEnterpriseParent(input, policies);
  const account = chooseBestGoogleAccount(input.account || input.email || "", policies.googlePolicy || {});
  const limit = clampInt(input.limit, 20, 1, 100);
  const pageToken = String(input.pageToken || "").trim();
  const url = new URL(`https://discoveryengine.googleapis.com/v1alpha/${resolved.parent}/notebooks:listRecentlyViewed`);
  url.searchParams.set("pageSize", String(limit));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = account
    ? await googleApiRequest({
      account,
      method: "GET",
      url: url.toString()
    }, {
      maxDepth: 7,
      maxEntries: 600,
      maxString: 3200,
      maxBodyChars: 50000
    })
    : await gcpApiRequest({
      method: "GET",
      url: url.toString(),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    }, {
      maxDepth: 7,
      maxEntries: 600,
      maxString: 3200,
      maxBodyChars: 50000,
      ...(policies.gcpPolicy || {})
    });

  const raw = response?.data && typeof response.data === "object" ? response.data : {};
  const notebooks = Array.isArray(raw.notebooks) ? raw.notebooks : [];
  const nextPageToken = String(raw.nextPageToken || "").trim();
  return {
    account: account || "",
    project: resolved.project,
    location: resolved.location,
    parent: resolved.parent,
    notebooks: notebooks.map((row) => {
      return {
        name: String(row?.name || "").trim(),
        notebookId: String(row?.notebookId || "").trim(),
        title: String(row?.title || "").trim(),
        emoji: String(row?.emoji || "").trim()
      };
    }),
    nextPageToken: nextPageToken || "",
    hasMore: Boolean(nextPageToken)
  };
}

async function createNotebooklmEnterpriseNotebook(input = {}, policies = {}) {
  const resolved = resolveNotebooklmEnterpriseParent(input, policies);
  const account = chooseBestGoogleAccount(input.account || input.email || "", policies.googlePolicy || {});
  const title = clipText(String(input.title || "").trim() || `Asolaria Notebook ${new Date().toISOString().slice(0, 10)}`, 180);
  const url = `https://discoveryengine.googleapis.com/v1alpha/${resolved.parent}/notebooks`;
  const response = account
    ? await googleApiRequest({
      account,
      method: "POST",
      url,
      body: { title }
    }, {
      maxDepth: 7,
      maxEntries: 600,
      maxString: 3200,
      maxBodyChars: 120000
    })
    : await gcpApiRequest({
      method: "POST",
      url,
      body: { title },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    }, {
      maxDepth: 7,
      maxEntries: 600,
      maxString: 3200,
      maxBodyChars: 120000,
      ...(policies.gcpPolicy || {})
    });

  const row = response?.data && typeof response.data === "object" ? response.data : {};
  return {
    account: account || "",
    project: resolved.project,
    location: resolved.location,
    notebook: {
      name: String(row?.name || "").trim(),
      notebookId: String(row?.notebookId || "").trim(),
      title: String(row?.title || "").trim() || title
    }
  };
}

function buildNotebooklmUserContent(entry = {}, index = 1) {
  const type = String(entry.type || entry.kind || entry.contentType || "").trim().toLowerCase();

  if (type === "drive" || type === "google_drive" || entry.documentId || entry.docId) {
    const documentId = String(entry.documentId || entry.docId || "").trim();
    if (!documentId) {
      throw new Error(`Source ${index}: drive source requires documentId.`);
    }
    const mimeType = String(entry.mimeType || "application/vnd.google-apps.document").trim();
    const sourceName = clipText(String(entry.sourceName || entry.title || `Drive Source ${index}`).trim(), 180);
    return {
      googleDriveContent: {
        documentId,
        mimeType,
        sourceName
      }
    };
  }

  if (type === "web" || entry.url) {
    const url = String(entry.url || "").trim();
    if (!url) {
      throw new Error(`Source ${index}: web source requires url.`);
    }
    const sourceName = clipText(String(entry.sourceName || entry.title || `Web Source ${index}`).trim(), 180);
    return {
      webContent: {
        url,
        sourceName
      }
    };
  }

  if (type === "video" || type === "youtube" || entry.youtubeUrl) {
    const youtubeUrl = String(entry.youtubeUrl || entry.url || "").trim();
    if (!youtubeUrl) {
      throw new Error(`Source ${index}: video source requires youtubeUrl.`);
    }
    return {
      videoContent: {
        youtubeUrl
      }
    };
  }

  const content = String(entry.content || entry.text || "").trim();
  if (!content) {
    throw new Error(`Source ${index}: text source requires content.`);
  }
  const sourceName = clipText(String(entry.sourceName || entry.title || `Text Source ${index}`).trim(), 180);
  return {
    textContent: {
      content,
      sourceName
    }
  };
}

async function batchCreateNotebooklmSources(input = {}, policies = {}) {
  const resolved = resolveNotebooklmEnterpriseParent(input, policies);
  const account = chooseBestGoogleAccount(input.account || input.email || "", policies.googlePolicy || {});
  const notebookName = normalizeNotebookName(input.notebook || input.notebookName || input.notebookId, resolved.parent);
  if (!notebookName) {
    throw new Error("Notebook name/id is required.");
  }

  const rows = Array.isArray(input.userContents)
    ? input.userContents
    : Array.isArray(input.sources)
      ? input.sources
      : Array.isArray(input.entries)
        ? input.entries
        : [];
  if (rows.length < 1) {
    throw new Error("At least one source entry is required.");
  }

  const userContents = rows.map((row, i) => buildNotebooklmUserContent(row, i + 1));
  const url = `https://discoveryengine.googleapis.com/v1alpha/${notebookName}/sources:batchCreate`;
  const response = account
    ? await googleApiRequest({
      account,
      method: "POST",
      url,
      body: { userContents }
    }, {
      maxDepth: 7,
      maxEntries: 700,
      maxString: 3200,
      maxBodyChars: 220000
    })
    : await gcpApiRequest({
      method: "POST",
      url,
      body: { userContents },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    }, {
      maxDepth: 7,
      maxEntries: 700,
      maxString: 3200,
      maxBodyChars: 220000,
      ...(policies.gcpPolicy || {})
    });

  const raw = response?.data && typeof response.data === "object" ? response.data : {};
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  return {
    account: account || "",
    project: resolved.project,
    location: resolved.location,
    notebook: notebookName,
    createdCount: sources.length,
    sources: sources.map((row) => {
      return {
        name: String(row?.name || "").trim(),
        sourceId: String(row?.sourceId || "").trim(),
        title: String(row?.title || "").trim(),
        state: String(row?.settings?.state || "").trim(),
        failureReasons: Array.isArray(row?.settings?.failureReasons)
          ? row.settings.failureReasons.map((fr) => String(fr || "")).filter(Boolean)
          : []
      };
    })
  };
}

async function getNotebooklmEnterpriseStatus(input = {}, policies = {}) {
  const account = chooseBestGoogleAccount(input.account || input.email || "", policies.googlePolicy || {});
  const status = {
    enabled: policies?.gcpPolicy?.enabled !== false,
    configured: false,
    account: account || "",
    project: "",
    location: "",
    apiEnabled: null,
    access: false,
    enterpriseReady: false,
    requiredSubscriptionTier: "",
    blockers: [],
    recentNotebookCount: 0,
    gcp: getGcpConfigSummary(policies.gcpPolicy || {})
  };

  if (!status.enabled) {
    status.blockers.push("GCP integration is disabled by policy.");
    return status;
  }
  if (!status.gcp.configured) {
    status.blockers.push("GCP service account is not configured.");
    return status;
  }

  let resolved = null;
  try {
    resolved = resolveNotebooklmEnterpriseParent(input, policies);
    status.configured = true;
    status.project = resolved.project;
    status.location = resolved.location;
  } catch (error) {
    status.blockers.push(String(error?.message || error || "").trim());
    return status;
  }

  try {
    const apiState = await readNotebooklmApiServiceState(resolved.project, {
      ...policies,
      account
    });
    status.apiEnabled = String(apiState?.data?.state || "").trim().toUpperCase() === "ENABLED";
    if (!status.apiEnabled) {
      status.blockers.push("Discovery Engine API (NotebookLM Enterprise) is not enabled.");
    }
  } catch (error) {
    const detail = classifyNotebooklmEnterpriseError(error);
    if (detail.requiredSubscriptionTier) {
      status.requiredSubscriptionTier = detail.requiredSubscriptionTier;
    }
    status.blockers.push(detail.message || "Could not read Discovery Engine API state.");
  }

  try {
    const recent = await listNotebooklmEnterpriseNotebooks({
      account,
      project: resolved.project,
      location: resolved.location,
      limit: 1
    }, policies);
    status.access = true;
    status.recentNotebookCount = Array.isArray(recent.notebooks) ? recent.notebooks.length : 0;
    status.enterpriseReady = Boolean(status.apiEnabled !== false);
  } catch (error) {
    const detail = classifyNotebooklmEnterpriseError(error);
    if (detail.requiredSubscriptionTier) {
      status.requiredSubscriptionTier = detail.requiredSubscriptionTier;
    }
    status.access = false;
    if (detail.code === "license_required") {
      const tierHint = detail.requiredSubscriptionTier
        ? ` Required subscription tier: ${detail.requiredSubscriptionTier}.`
        : "";
      status.blockers.push(`NotebookLM Enterprise license is required for this principal.${tierHint}`.trim());
    } else if (detail.code === "permission_denied") {
      status.blockers.push("NotebookLM Enterprise IAM role is missing. Grant roles/discoveryengine.notebookLmUser or roles/discoveryengine.notebookLmOwner.");
    } else {
      status.blockers.push(detail.message || "NotebookLM Enterprise access failed.");
    }
  }

  status.enterpriseReady = Boolean(status.apiEnabled && status.access);
  return status;
}

function hasScope(scopeText, needle) {
  const text = String(scopeText || "");
  return text.includes(String(needle || "").trim());
}

function chooseBestGoogleAccount(requestedEmail, googlePolicy = {}) {
  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
  const wanted = normalizeEmail(requestedEmail);
  const status = getGoogleIntegrationStatus(googlePolicy);
  const accounts = Array.isArray(status?.accounts) ? status.accounts : [];
  const findByEmail = (email) => accounts.find((row) => normalizeEmail(row?.email) === normalizeEmail(email));
  if (wanted) {
    const exact = findByEmail(wanted);
    if (exact) return String(exact.email || "").trim();
    // Fall back to passing through the wanted value so upstream errors are explicit.
    return requestedEmail;
  }
  if (accounts.length === 0) {
    return "";
  }
  if (accounts.length === 1) {
    return String(accounts[0].email || "").trim();
  }

  // Respect configured primary/default Google account first when connected.
  const preferredEmail = normalizeEmail(status?.defaultAccount || status?.primaryRuntimeAccount || "");
  if (preferredEmail) {
    const preferred = findByEmail(preferredEmail);
    if (preferred) {
      return String(preferred.email || "").trim();
    }
  }

  // Prefer accounts that are currently valid, or can refresh.
  const viable = accounts.filter((row) => {
    const expiresInSec = Number(row?.expiresInSec);
    if (Number.isFinite(expiresInSec) && expiresInSec > 90) return true;
    return row?.hasRefreshToken === true;
  });
  const pool = viable.length ? viable : accounts;

  // Prefer the account that can read Drive docs (NotebookLM-style).
  const withDrive = pool.filter((row) => hasScope(row?.scope, "https://www.googleapis.com/auth/drive.readonly"));
  if (withDrive.length === 1) {
    return String(withDrive[0].email || "").trim();
  }
  if (withDrive.length > 1) {
    // Prefer the one that also has documents.readonly if present.
    const withDocs = withDrive.filter((row) => hasScope(row?.scope, "https://www.googleapis.com/auth/documents.readonly"));
    if (withDocs.length >= 1) {
      return String(withDocs[0].email || "").trim();
    }
    return String(withDrive[0].email || "").trim();
  }

  return String(accounts[0].email || "").trim();
}

function wantsCalendarSources(query) {
  const text = String(query || "").toLowerCase();
  return /\b(calendar|event|events|meeting|schedule|appointment|upcoming|tomorrow|today|next week|next month)\b/i.test(text);
}

function wantsEmailSources(query) {
  const text = String(query || "").toLowerCase();
  return /\b(gmail|email|inbox|message|messages|subject|from:|to:)\b/i.test(text);
}

function formatGmailSources(gmail) {
  const messages = Array.isArray(gmail?.messages) ? gmail.messages : [];
  const lines = [];
  const refs = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i] || {};
    const tag = `G${i + 1}`;
    const at = String(msg.at || "").replace("T", " ").replace("Z", " UTC");
    const from = String(msg.from || "").trim();
    const subject = String(msg.subject || "").trim();
    const snippet = String(msg.snippet || "").trim();
    lines.push(`[${tag}] Gmail ${at} | From: ${from || "(unknown)"} | Subject: ${subject || "(none)"} | Snippet: ${snippet || "(none)"}`);
    refs.push({
      tag,
      type: "gmail",
      id: String(msg.id || ""),
      threadId: String(msg.threadId || ""),
      at: String(msg.at || ""),
      from,
      subject
    });
  }
  return { lines, refs };
}

function formatCalendarSources(calendar) {
  const events = Array.isArray(calendar?.events) ? calendar.events : [];
  const lines = [];
  const refs = [];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i] || {};
    const tag = `C${i + 1}`;
    const summary = String(ev.summary || "").trim();
    const start = String(ev.start || "").trim();
    const end = String(ev.end || "").trim();
    const location = String(ev.location || "").trim();
    lines.push(`[${tag}] Calendar | ${start || "(unknown)"} -> ${end || "(unknown)"} | ${summary || "(no title)"}${location ? ` | Location: ${location}` : ""}`);
    refs.push({
      tag,
      type: "calendar",
      id: String(ev.id || ""),
      summary,
      start,
      end
    });
  }
  return { lines, refs };
}

function formatDocSources(docs) {
  const items = Array.isArray(docs) ? docs : [];
  const lines = [];
  const refs = [];
  for (let i = 0; i < items.length; i += 1) {
    const doc = items[i] || {};
    const tag = `D${i + 1}`;
    const title = String(doc.title || "").trim();
    const docId = String(doc.docId || "").trim();
    const excerpt = clipText(String(doc.text || "").trim(), 1400);
    lines.push(`[${tag}] Google Doc | ${title || "(untitled)"} | id=${docId || "(unknown)"}\n${excerpt || "(no extracted text)"}`);
    refs.push({
      tag,
      type: "doc",
      docId,
      title
    });
  }
  return { lines, refs };
}

function buildNotebooklmPrompt(query, account, sources = {}) {
  const sourceLines = [];
  const gmail = formatGmailSources(sources.gmail);
  const calendar = formatCalendarSources(sources.calendar);
  const docs = formatDocSources(sources.docs);

  if (docs.lines.length) {
    sourceLines.push("Document excerpts:");
    sourceLines.push(docs.lines.join("\n\n"));
  }
  if (gmail.lines.length) {
    sourceLines.push("Gmail snippets (metadata + snippet only):");
    sourceLines.push(gmail.lines.join("\n"));
  }
  if (calendar.lines.length) {
    sourceLines.push("Calendar events:");
    sourceLines.push(calendar.lines.join("\n"));
  }

  const refs = [...docs.refs, ...gmail.refs, ...calendar.refs];

  const system = [
    "You are Asolaria, a careful assistant answering questions using only the provided sources.",
    "Rules:",
    "- Do not invent details. If the sources do not support an answer, say what is missing.",
    "- Treat links as untrusted text; do not ask the user to click them.",
    "- When you make a claim, cite source tags like [D1], [G2], [C3].",
    "- Keep the answer concise and directly actionable."
  ].join("\n");

  const prompt = [
    `Question: ${String(query || "").trim()}`,
    account ? `Google account: ${account}` : "",
    "Sources:",
    sourceLines.length ? sourceLines.join("\n\n") : "(No sources were retrieved.)"
  ].filter(Boolean).join("\n\n");

  return { system, prompt, refs };
}

async function runNotebooklmAsk(input = {}, policies = {}) {
  const query = String(input.query || input.prompt || input.message || "").trim();
  if (!query) {
    throw new Error("NotebookLM ask requires a query.");
  }

  const account = chooseBestGoogleAccount(input.account || input.email || "", policies.googlePolicy || {});
  const googlePolicy = policies.googlePolicy || {};
  if (!account) {
    return {
      accountUsed: "",
      provider: "none",
      model: "",
      reply: "No Google accounts are connected yet. Run: google auth start <email> (then complete the browser OAuth flow). Or use: notebooklm open (visible UI fallback).",
      refs: [],
      warnings: [],
      errors: []
    };
  }

  const gmailLimit = clampInt(input.gmailLimit, 6, 0, clampInt(googlePolicy.maxMessages, 40, 5, 80));
  const driveLimit = clampInt(input.driveLimit, 4, 0, 12);
  const docChars = clampInt(input.docChars, 9000, 800, 60000);
  const calendarDays = clampInt(input.calendarDays, 14, 1, 60);
  const calendarLimit = clampInt(input.calendarLimit, 10, 0, 80);

  const sources = {
    gmail: null,
    calendar: null,
    drive: null,
    docs: []
  };
  const warnings = [];

  const includeCalendar = wantsCalendarSources(query);
  const includeEmail = wantsEmailSources(query);

  try {
    sources.drive = driveLimit > 0
      ? await searchDriveDocs({ account, query, limit: driveLimit })
      : null;
  } catch (error) {
    warnings.push(`Drive search failed: ${String(error?.message || error || "").slice(0, 260)}`);
  }

  const driveFiles = Array.isArray(sources.drive?.files) ? sources.drive.files : [];
  for (const file of driveFiles) {
    if (!file?.id) continue;
    try {
      const doc = await getGoogleDocPlainText({ account, docId: file.id }, { maxChars: docChars });
      sources.docs.push(doc);
    } catch (error) {
      warnings.push(`Doc fetch failed (${String(file?.name || file?.id || "").slice(0, 80)}): ${String(error?.message || error || "").slice(0, 220)}`);
    }
  }

  try {
    const shouldTryEmail = includeEmail || driveFiles.length === 0;
    sources.gmail = gmailLimit > 0 && shouldTryEmail
      ? await listGmailMessages({ account, q: query, limit: gmailLimit }, {
        maxMessages: googlePolicy.maxMessages,
        maxDigestChars: googlePolicy.maxDigestChars
      })
      : null;
  } catch (error) {
    warnings.push(`Gmail search failed: ${String(error?.message || error || "").slice(0, 260)}`);
  }

  try {
    sources.calendar = calendarLimit > 0 && includeCalendar
      ? await listUpcomingEvents({ account, days: calendarDays, limit: calendarLimit })
      : null;
  } catch (error) {
    warnings.push(`Calendar fetch failed: ${String(error?.message || error || "").slice(0, 260)}`);
  }

  const promptPack = buildNotebooklmPrompt(query, account, sources);

  if (promptPack.refs.length === 0) {
    return {
      accountUsed: account,
      provider: "none",
      model: "",
      reply: "No sources were retrieved for this query. If you want a general (non-personal) answer, use: gemini api ask <prompt>. If you want your content, try a more specific keyword or open the NotebookLM UI: notebooklm open.",
      refs: [],
      warnings,
      errors: []
    };
  }

  const providerOverride = normalizeProvider(input.provider);
  const order = providerOverride
    ? [providerOverride, providerOverride === "gemini_api" ? "vertex" : "gemini_api"]
    : ["gemini_api", "vertex"];

  const errors = [];
  for (const provider of order) {
    if (provider === "gemini_api") {
      const status = getGeminiApiConfigSummary(policies.geminiApiPolicy || {});
      if (!status.enabled || !status.configured) {
        errors.push("Gemini API is not configured/enabled.");
        continue;
      }
      try {
        const result = await runGeminiApiGenerateContent({
          system: promptPack.system,
          prompt: promptPack.prompt,
          temperature: 0.2,
          maxOutputTokens: clampInt(input.maxOutputTokens, 900, 120, 8192),
          model: String(input.model || "").trim()
        }, { enabled: true });
        return {
          accountUsed: account,
          provider: "gemini_api",
          model: result.model,
          reply: result.reply,
          refs: promptPack.refs,
          warnings,
          errors
        };
      } catch (error) {
        errors.push(`Gemini API failed: ${String(error?.message || error || "").slice(0, 320)}`);
        continue;
      }
    }

    if (provider === "vertex") {
      const status = getVertexConfigSummary(policies.vertexPolicy || {});
      if (!status.enabled || !status.configured) {
        errors.push("Vertex (Gemini) is not configured/enabled.");
        continue;
      }
      try {
        // Budget checks happen inside runVertexGemini.
        void getVertexBudgetStatus(policies.vertexPolicy || {});
        const result = await runVertexGemini({
          system: promptPack.system,
          prompt: promptPack.prompt,
          temperature: 0.2,
          maxOutputTokens: clampInt(input.maxOutputTokens, 900, 120, 8192)
        }, { enabled: true });
        return {
          accountUsed: account,
          provider: "vertex",
          model: result.model,
          reply: result.reply,
          refs: promptPack.refs,
          warnings,
          errors,
          budget: result.budget || null
        };
      } catch (error) {
        errors.push(`Vertex failed: ${String(error?.message || error || "").slice(0, 320)}`);
        continue;
      }
    }
  }

  throw new Error(`NotebookLM ask failed: ${errors.join(" | ") || "no providers available"}`.trim());
}

module.exports = {
  classifyNotebooklmEnterpriseError,
  getNotebooklmEnterpriseStatus,
  listNotebooklmEnterpriseNotebooks,
  createNotebooklmEnterpriseNotebook,
  batchCreateNotebooklmSources,
  runNotebooklmAsk,
  buildNotebooklmPrompt
};
