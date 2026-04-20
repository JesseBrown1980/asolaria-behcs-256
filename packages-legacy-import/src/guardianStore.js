const { setSecret, getSecret, getVaultStatus } = require("./secureVault");

const GUARDIAN_PROFILE_SECRET = "guardian.profile";
const GUARDIAN_SMTP_SECRET = "guardian.smtp";
const GUARDIAN_WHATSAPP_SECRET = "guardian.whatsapp";

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeBool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return fallback;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "";
  }
  return email.slice(0, 160);
}

function normalizeContactRoute(value, fallbackEmail = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "security_emergency" || normalized === "security" || normalized === "emergency") {
    return "security_emergency";
  }
  if (normalized === "silent" || normalized === "disabled" || normalized === "none") {
    return "silent";
  }
  if (normalized === "primary" || normalized === "all") {
    return "primary";
  }
  if (fallbackEmail === "jessebrown.soft1980@gmail.com") {
    return "security_emergency";
  }
  return "primary";
}

function maskEmail(email) {
  const value = String(email || "");
  const [local, domain] = value.split("@");
  if (!local || !domain) return "";
  const safeLocal = local.length <= 2
    ? `${local[0] || "*"}*`
    : `${local.slice(0, 2)}${"*".repeat(Math.max(2, local.length - 2))}`;
  return `${safeLocal}@${domain}`;
}

function normalizeContacts(rawContacts) {
  if (!Array.isArray(rawContacts)) return [];
  const seen = new Set();
  const contacts = [];
  for (const [index, item] of rawContacts.entries()) {
    const email = normalizeEmail(item?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    contacts.push({
      name: normalizeText(item?.name, `Contact ${index + 1}`),
      email,
      channel: "email",
      enabled: normalizeBool(item?.enabled, true),
      priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : index + 1,
      route: normalizeContactRoute(item?.route, email)
    });
  }
  return contacts.slice(0, 12);
}

function guardianPreset() {
  const value = String(process.env.ASOLARIA_GUARDIAN_PRESET || "private_owner").trim().toLowerCase();
  if (value === "empty" || value === "private_owner") {
    return value;
  }
  return "private_owner";
}

function defaultProfile() {
  const now = new Date().toISOString();
  const preset = guardianPreset();
  const ownerFallback = preset === "empty" ? "Owner" : "Jesse Daniel Brown";
  const defaultContacts = preset === "empty"
    ? []
    : [
      {
        name: "Jesse Daniel Brown (Primary)",
        email: "plasmatoid@gmail.com",
        enabled: true,
        priority: 1,
        route: "primary"
      },
      {
        name: "Jesse Daniel Brown (Emergency)",
        email: "jessebrown.soft1980@gmail.com",
        enabled: true,
        priority: 2,
        route: "security_emergency"
      }
    ];
  return {
    ownerName: normalizeText(process.env.ASOLARIA_OWNER_NAME, ownerFallback),
    aliases: preset === "empty"
      ? []
      : [
        "plasmatoid"
      ],
    contacts: normalizeContacts(defaultContacts),
    createdAt: now,
    updatedAt: now
  };
}

function sanitizeProfileForDisplay(profile, reveal = false) {
  if (!profile) return null;
  const contacts = Array.isArray(profile.contacts) ? profile.contacts : [];
  return {
    ownerName: profile.ownerName || "Owner",
    aliases: Array.isArray(profile.aliases) ? profile.aliases : [],
    contacts: contacts.map((contact) => ({
      name: contact.name,
      email: reveal ? contact.email : maskEmail(contact.email),
      enabled: Boolean(contact.enabled),
      priority: contact.priority,
      channel: "email",
      route: normalizeContactRoute(contact.route, contact.email)
    })),
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || null
  };
}

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") {
    return defaultProfile();
  }
  return {
    ownerName: normalizeText(profile.ownerName, "Owner"),
    aliases: Array.isArray(profile.aliases)
      ? profile.aliases.slice(0, 12).map((value) => normalizeText(value)).filter(Boolean)
      : [],
    contacts: normalizeContacts(profile.contacts),
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: profile.updatedAt || new Date().toISOString()
  };
}

function readGuardianProfile(options = {}) {
  const secret = getSecret(GUARDIAN_PROFILE_SECRET, { namespace: "owner" });
  if (!secret || !secret.value) return null;
  const profile = normalizeProfile(secret.value);
  profile.createdAt = profile.createdAt || secret.createdAt;
  profile.updatedAt = profile.updatedAt || secret.updatedAt;
  return sanitizeProfileForDisplay(profile, options.reveal === true);
}

function revealGuardianProfile() {
  const secret = getSecret(GUARDIAN_PROFILE_SECRET, { namespace: "owner" });
  if (!secret || !secret.value) return null;
  const profile = normalizeProfile(secret.value);
  profile.createdAt = profile.createdAt || secret.createdAt;
  profile.updatedAt = profile.updatedAt || secret.updatedAt;
  return profile;
}

function bootstrapGuardianProfile(input = {}) {
  const existing = revealGuardianProfile();
  if (existing) {
    return sanitizeProfileForDisplay(existing, false);
  }

  const base = defaultProfile();
  const merged = {
    ...base,
    ownerName: normalizeText(input.ownerName, base.ownerName),
    aliases: Array.isArray(input.aliases) ? input.aliases.slice(0, 12).map((value) => normalizeText(value)).filter(Boolean) : base.aliases,
    contacts: normalizeContacts(input.contacts?.length ? input.contacts : base.contacts),
    updatedAt: new Date().toISOString()
  };
  setSecret(GUARDIAN_PROFILE_SECRET, merged, {
    app: "Asolaria",
    component: "guardian",
    credentialOwner: "owner",
    actor: "owner",
    createdBy: "bootstrap"
  }, { namespace: "owner" });
  return sanitizeProfileForDisplay(merged, false);
}

function updateGuardianProfile(input = {}) {
  const existing = revealGuardianProfile() || defaultProfile();
  const next = {
    ...existing,
    ownerName: normalizeText(input.ownerName, existing.ownerName),
    aliases: Array.isArray(input.aliases)
      ? input.aliases.slice(0, 12).map((value) => normalizeText(value)).filter(Boolean)
      : existing.aliases,
    contacts: Array.isArray(input.contacts) ? normalizeContacts(input.contacts) : existing.contacts,
    updatedAt: new Date().toISOString()
  };
  setSecret(GUARDIAN_PROFILE_SECRET, next, {
    app: "Asolaria",
    component: "guardian",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "update"
  }, { namespace: "owner" });
  return sanitizeProfileForDisplay(next, false);
}

function normalizeSmtpConfig(input = {}) {
  const host = normalizeText(input.host);
  const fromEmail = normalizeEmail(input.fromEmail || input.from || "");
  const username = normalizeText(input.username);
  const password = normalizeText(input.password);
  const portRaw = Number(input.port);
  return {
    host,
    port: Number.isFinite(portRaw) ? Math.max(1, Math.min(65535, Math.round(portRaw))) : 587,
    secure: normalizeBool(input.secure, false),
    username,
    password,
    fromEmail
  };
}

function setGuardianSmtpConfig(input = {}) {
  const config = normalizeSmtpConfig(input);
  const payload = {
    ...config,
    updatedAt: new Date().toISOString()
  };
  setSecret(GUARDIAN_SMTP_SECRET, payload, {
    app: "Asolaria",
    component: "guardian-smtp",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "set"
  }, { namespace: "owner" });
  return readGuardianSmtpConfig();
}

function readGuardianSmtpConfig(options = {}) {
  const secret = getSecret(GUARDIAN_SMTP_SECRET, { namespace: "owner" });
  if (!secret || !secret.value) {
    return null;
  }
  const value = secret.value;
  const base = {
    host: value.host || "",
    port: value.port || 587,
    secure: Boolean(value.secure),
    username: value.username || "",
    fromEmail: value.fromEmail || "",
    hasPassword: Boolean(value.password),
    updatedAt: value.updatedAt || secret.updatedAt
  };
  if (options.reveal === true) {
    return {
      ...base,
      password: value.password || ""
    };
  }
  return {
    ...base,
    username: base.username ? `${base.username.slice(0, 2)}***` : "",
    fromEmail: base.fromEmail ? maskEmail(base.fromEmail) : ""
  };
}

function getGuardianStatusSummary() {
  const whatsapp = readGuardianWhatsAppConfig();
  return {
    profile: readGuardianProfile(),
    smtp: readGuardianSmtpConfig(),
    whatsapp,
    vault: getVaultStatus({ namespace: "owner" })
  };
}

function normalizeWhatsAppAddress(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  if (!text.toLowerCase().startsWith("whatsapp:")) {
    text = `whatsapp:${text}`;
  }
  return text.slice(0, 64);
}

function normalizeWhatsAppNotifyMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "all_alerts" || normalized === "security_only") {
    return normalized;
  }
  return "critical_or_security";
}

function normalizeWhatsAppApp(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["auto", "default", "personal", "business", "w4b"].includes(normalized)) {
    return normalized === "w4b" ? "business" : normalized;
  }
  if (normalized.startsWith("com.")) {
    return normalized;
  }
  return "";
}

function normalizeWhatsAppPackage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!normalized.startsWith("com.")) {
    return "";
  }
  return normalized.slice(0, 80);
}

function normalizeWhatsAppUserId(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "";
  }
  return Math.round(numeric);
}

function setGuardianWhatsAppConfig(input = {}) {
  const payload = {
    enabled: normalizeBool(input.enabled, true),
    accountSid: normalizeText(input.accountSid),
    authToken: normalizeText(input.authToken),
    fromNumber: normalizeWhatsAppAddress(input.fromNumber),
    toNumber: normalizeWhatsAppAddress(input.toNumber),
    backupAsolariaNumber: normalizeWhatsAppAddress(input.backupAsolariaNumber),
    backupUserNumber: normalizeWhatsAppAddress(input.backupUserNumber),
    app: normalizeWhatsAppApp(input.app || input.whatsappApp),
    packageName: normalizeWhatsAppPackage(input.packageName || input.whatsappPackage),
    userId: normalizeWhatsAppUserId(input.userId),
    notifyMode: normalizeWhatsAppNotifyMode(input.notifyMode),
    updatedAt: new Date().toISOString()
  };
  setSecret(GUARDIAN_WHATSAPP_SECRET, payload, {
    app: "Asolaria",
    component: "guardian-whatsapp",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "set"
  }, { namespace: "owner" });
  return readGuardianWhatsAppConfig();
}

function maskValue(value, keep = 4) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= keep) {
    return "*".repeat(text.length);
  }
  return `${"*".repeat(Math.max(3, text.length - keep))}${text.slice(-keep)}`;
}

function readGuardianWhatsAppConfig(options = {}) {
  const secret = getSecret(GUARDIAN_WHATSAPP_SECRET, { namespace: "owner" });
  if (!secret || !secret.value) {
    return null;
  }
  const value = secret.value || {};
  const base = {
    enabled: normalizeBool(value.enabled, true),
    notifyMode: normalizeWhatsAppNotifyMode(value.notifyMode),
    app: normalizeWhatsAppApp(value.app || value.whatsappApp),
    packageName: normalizeWhatsAppPackage(value.packageName || value.whatsappPackage),
    userId: normalizeWhatsAppUserId(value.userId),
    hasAccountSid: Boolean(value.accountSid),
    hasAuthToken: Boolean(value.authToken),
    hasFromNumber: Boolean(value.fromNumber),
    hasToNumber: Boolean(value.toNumber),
    hasBackupAsolariaNumber: Boolean(value.backupAsolariaNumber),
    hasBackupUserNumber: Boolean(value.backupUserNumber),
    configured: Boolean(value.accountSid && value.authToken && value.fromNumber && value.toNumber),
    updatedAt: value.updatedAt || secret.updatedAt
  };
  if (options.reveal === true) {
    return {
      ...base,
      accountSid: normalizeText(value.accountSid),
      authToken: normalizeText(value.authToken),
      fromNumber: normalizeWhatsAppAddress(value.fromNumber),
      toNumber: normalizeWhatsAppAddress(value.toNumber),
      backupAsolariaNumber: normalizeWhatsAppAddress(value.backupAsolariaNumber),
      backupUserNumber: normalizeWhatsAppAddress(value.backupUserNumber)
    };
  }
  return {
    ...base,
    accountSid: maskValue(value.accountSid, 5),
    fromNumber: value.fromNumber ? maskValue(normalizeWhatsAppAddress(value.fromNumber), 6) : "",
    toNumber: value.toNumber ? maskValue(normalizeWhatsAppAddress(value.toNumber), 6) : "",
    backupAsolariaNumber: value.backupAsolariaNumber
      ? maskValue(normalizeWhatsAppAddress(value.backupAsolariaNumber), 6)
      : "",
    backupUserNumber: value.backupUserNumber
      ? maskValue(normalizeWhatsAppAddress(value.backupUserNumber), 6)
      : ""
  };
}

module.exports = {
  GUARDIAN_PROFILE_SECRET,
  GUARDIAN_SMTP_SECRET,
  GUARDIAN_WHATSAPP_SECRET,
  bootstrapGuardianProfile,
  readGuardianProfile,
  revealGuardianProfile,
  updateGuardianProfile,
  setGuardianSmtpConfig,
  readGuardianSmtpConfig,
  setGuardianWhatsAppConfig,
  readGuardianWhatsAppConfig,
  getGuardianStatusSummary
};
