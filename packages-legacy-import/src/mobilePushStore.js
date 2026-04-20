const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveDataPath } = require("./runtimePaths");

const storePath = resolveDataPath("mobile-push-subscriptions.json");

function ensureDir() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
}

function initialDoc() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    subscriptions: []
  };
}

function loadDoc() {
  ensureDir();
  if (!fs.existsSync(storePath)) {
    const doc = initialDoc();
    fs.writeFileSync(storePath, JSON.stringify(doc, null, 2), "utf8");
    return doc;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    if (!parsed || !Array.isArray(parsed.subscriptions)) {
      throw new Error("Invalid mobile push subscription store.");
    }
    return {
      version: 1,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      subscriptions: parsed.subscriptions
    };
  } catch (_error) {
    const doc = initialDoc();
    fs.writeFileSync(storePath, JSON.stringify(doc, null, 2), "utf8");
    return doc;
  }
}

function saveDoc(doc) {
  ensureDir();
  doc.updatedAt = new Date().toISOString();
  if (doc.subscriptions.length > 160) {
    doc.subscriptions = doc.subscriptions
      .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))
      .slice(-160);
  }
  fs.writeFileSync(storePath, JSON.stringify(doc, null, 2), "utf8");
}

function hashEndpoint(endpoint) {
  return crypto
    .createHash("sha256")
    .update(String(endpoint || ""), "utf8")
    .digest("hex");
}

function normalizeSubscription(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Push subscription payload is required.");
  }
  const endpoint = String(input.endpoint || "").trim();
  const p256dh = String(input.keys?.p256dh || "").trim();
  const auth = String(input.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing endpoint or keys.");
  }
  const expirationTime = Number(input.expirationTime);
  return {
    endpoint,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
    keys: {
      p256dh,
      auth
    }
  };
}

function upsertSubscription(subscription, options = {}) {
  const normalized = normalizeSubscription(subscription);
  const tokenHash = String(options.tokenHash || "").trim();
  const userAgent = String(options.userAgent || "").trim().slice(0, 240);
  const now = new Date().toISOString();
  const doc = loadDoc();
  const index = doc.subscriptions.findIndex((item) => item.endpoint === normalized.endpoint);
  const next = {
    id: hashEndpoint(normalized.endpoint).slice(0, 20),
    endpoint: normalized.endpoint,
    tokenHash,
    userAgent,
    subscription: normalized,
    createdAt: index >= 0 ? (doc.subscriptions[index].createdAt || now) : now,
    updatedAt: now
  };
  if (index >= 0) {
    doc.subscriptions[index] = {
      ...doc.subscriptions[index],
      ...next
    };
  } else {
    doc.subscriptions.push(next);
  }
  saveDoc(doc);
  return sanitizeRecord(next);
}

function removeSubscriptionByEndpoint(endpoint) {
  const value = String(endpoint || "").trim();
  if (!value) {
    return false;
  }
  const doc = loadDoc();
  const before = doc.subscriptions.length;
  doc.subscriptions = doc.subscriptions.filter((item) => item.endpoint !== value);
  if (doc.subscriptions.length !== before) {
    saveDoc(doc);
    return true;
  }
  return false;
}

function removeSubscriptionsByTokenHash(tokenHash) {
  const value = String(tokenHash || "").trim();
  if (!value) {
    return 0;
  }
  const doc = loadDoc();
  const before = doc.subscriptions.length;
  doc.subscriptions = doc.subscriptions.filter((item) => item.tokenHash !== value);
  const removed = before - doc.subscriptions.length;
  if (removed > 0) {
    saveDoc(doc);
  }
  return removed;
}

function listSubscriptions(options = {}) {
  const tokenHash = String(options.tokenHash || "").trim();
  const includeRaw = options.includeRaw === true;
  const limit = Math.max(1, Math.min(200, Number(options.limit || 120)));
  const rows = loadDoc().subscriptions
    .filter((item) => (tokenHash ? String(item.tokenHash || "") === tokenHash : true))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .slice(0, limit);
  if (includeRaw) {
    return rows.map((item) => ({
      ...item,
      subscription: normalizeSubscription(item.subscription || {})
    }));
  }
  return rows.map(sanitizeRecord);
}

function sanitizeRecord(record) {
  return {
    id: record.id,
    endpointHint: `${String(record.endpoint || "").slice(0, 42)}...`,
    tokenHashHint: String(record.tokenHash || "").slice(0, 10),
    userAgent: record.userAgent || "",
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function getStoreSummary(tokenHash = "") {
  const rows = listSubscriptions({ tokenHash });
  return {
    path: storePath,
    total: rows.length,
    subscriptions: rows
  };
}

module.exports = {
  upsertSubscription,
  removeSubscriptionByEndpoint,
  removeSubscriptionsByTokenHash,
  listSubscriptions,
  getStoreSummary
};
