const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { resolveDataPath, resolveLogPath } = require("./runtimePaths");
const {
  bootstrapGuardianProfile,
  revealGuardianProfile,
  readGuardianSmtpConfig,
  readGuardianWhatsAppConfig
} = require("./guardianStore");
const { sendPhoneWhatsAppLinkedMessage } = require("./connectors/phoneMirrorConnector");

const alertsPath = resolveDataPath("guardian-alerts.json");
const alertsLogPath = resolveLogPath("guardian-alerts.log");

function ensureDirs() {
  fs.mkdirSync(path.dirname(alertsPath), { recursive: true });
  fs.mkdirSync(path.dirname(alertsLogPath), { recursive: true });
}

function loadAlerts() {
  ensureDirs();
  if (!fs.existsSync(alertsPath)) {
    const initial = {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      alerts: []
    };
    fs.writeFileSync(alertsPath, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(alertsPath, "utf8"));
    if (!parsed || !Array.isArray(parsed.alerts)) {
      throw new Error("Invalid guardian alerts file.");
    }
    return parsed;
  } catch (_error) {
    const fallback = {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      alerts: []
    };
    fs.writeFileSync(alertsPath, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

function saveAlerts(doc) {
  ensureDirs();
  doc.updatedAt = new Date().toISOString();
  if (doc.alerts.length > 400) {
    doc.alerts = doc.alerts.slice(-400);
  }
  fs.writeFileSync(alertsPath, JSON.stringify(doc, null, 2), "utf8");
}

function appendLogLine(line) {
  ensureDirs();
  fs.appendFileSync(alertsLogPath, `${line}\n`, "utf8");
}

function listGuardianAlerts(limit = 30) {
  const doc = loadAlerts();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 30));
  return doc.alerts.slice(-safeLimit).reverse();
}

function getGuardianAlertStats() {
  const alerts = loadAlerts().alerts;
  const byLevel = { low: 0, medium: 0, high: 0, critical: 0 };
  let delivered = 0;
  for (const alert of alerts) {
    const level = String(alert.risk?.level || "low");
    if (Object.prototype.hasOwnProperty.call(byLevel, level)) {
      byLevel[level] += 1;
    }
    const items = Array.isArray(alert.delivery) ? alert.delivery : [];
    delivered += items.filter((item) => item.ok).length;
  }
  return {
    total: alerts.length,
    delivered,
    byLevel
  };
}

function escapePs(value) {
  return String(value || "").replace(/'/g, "''");
}

function runPowerShellScript(script, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "-"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell mail command timed out."));
    }, Math.max(12000, timeoutMs));

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start PowerShell: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`PowerShell exited ${code}: ${(stderr || stdout).trim()}`));
      }
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    child.stdin.write(script);
    child.stdin.end();
  });
}

async function sendEmailViaSmtp(smtp, toEmail, subject, body) {
  if (process.platform !== "win32") {
    throw new Error("SMTP mail sender currently implemented for Windows PowerShell only.");
  }

  const secureFlag = smtp.secure ? "$true" : "$false";
  const hasCreds = smtp.username && smtp.password;
  const scriptLines = [];
  scriptLines.push(`$to='${escapePs(toEmail)}'`);
  scriptLines.push(`$from='${escapePs(smtp.fromEmail)}'`);
  scriptLines.push(`$subject='${escapePs(subject)}'`);
  scriptLines.push(`$body='${escapePs(body)}'`);
  scriptLines.push(`$host='${escapePs(smtp.host)}'`);
  scriptLines.push(`$port=${Number(smtp.port || 587)}`);
  scriptLines.push(`$useSsl=${secureFlag}`);
  if (hasCreds) {
    scriptLines.push(`$user='${escapePs(smtp.username)}'`);
    scriptLines.push(`$pass='${escapePs(smtp.password)}'`);
    scriptLines.push("$sec=ConvertTo-SecureString $pass -AsPlainText -Force");
    scriptLines.push("$cred=New-Object System.Management.Automation.PSCredential($user,$sec)");
    scriptLines.push("Send-MailMessage -To $to -From $from -Subject $subject -Body $body -SmtpServer $host -Port $port -UseSsl:$useSsl -Credential $cred -Encoding UTF8");
  } else {
    scriptLines.push("Send-MailMessage -To $to -From $from -Subject $subject -Body $body -SmtpServer $host -Port $port -UseSsl:$useSsl -Encoding UTF8");
  }

  await runPowerShellScript(scriptLines.join("\n"), 35000);
}

async function sendWebhookAlert(event) {
  const url = String(process.env.ASOLARIA_ALERT_WEBHOOK_URL || "").trim();
  if (!url) {
    return { ok: false, method: "webhook", reason: "webhook_not_configured" };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!response.ok) {
      return { ok: false, method: "webhook", reason: `http_${response.status}` };
    }
    return { ok: true, method: "webhook" };
  } catch (error) {
    return { ok: false, method: "webhook", reason: error.message };
  }
}

function shouldSendCodexBridgeAlert(event) {
  const mode = String(process.env.ASOLARIA_CODEX_BRIDGE_NOTIFY_MODE || "critical_or_security").trim().toLowerCase();
  const level = String(event?.risk?.level || "low").toLowerCase();
  const security = isSecurityEmergency(event);

  if (mode === "all_alerts" || mode === "all") {
    return true;
  }
  if (mode === "security_only") {
    return security;
  }
  if (mode === "important") {
    return security || level === "critical" || level === "high" || Boolean(event?.blocked);
  }

  // Default: low-noise.
  return security || level === "critical";
}

function clipPreview(text, limit = 220) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function isPrivateIpv4Literal(host) {
  const value = String(host || "").trim();
  const match = /^(\d{1,3})(?:\.(\d{1,3})){3}$/.exec(value);
  if (!match) return false;
  const parts = value.split(".").map((item) => Number(item));
  if (parts.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    return false;
  }
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  return false;
}

function inferRelayChannelFromUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    const host = String(parsed.hostname || "").trim().toLowerCase();
    if (!host) return "public_internet";
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "private_internet";
    }
    if (host.endsWith(".ts.net") || host.endsWith(".tailnet")) {
      return "private_internet";
    }
    if (isPrivateIpv4Literal(host)) {
      return "private_internet";
    }
    return "public_internet";
  } catch (_error) {
    return "public_internet";
  }
}

function resolveRelayOutputPolicy(url) {
  const requested = String(process.env.ASOLARIA_RELAY_OUTPUT_MODE || "auto").trim().toLowerCase();
  const channel = inferRelayChannelFromUrl(url);
  let mode = requested;
  if (mode === "auto") {
    mode = channel === "public_internet" ? "abstraction" : "full";
  }
  if (mode !== "full" && mode !== "abstraction") {
    mode = "abstraction";
  }
  return {
    requestedMode: requested,
    mode,
    channel
  };
}

function redactRelaySensitiveText(value) {
  let text = String(value || "");
  if (!text) return "";

  // Secrets/tokens first.
  text = text.replace(/\b(sk-[A-Za-z0-9]{12,})\b/g, "[secret]");
  text = text.replace(/\b(AIza[0-9A-Za-z\-_]{20,})\b/g, "[secret]");
  text = text.replace(/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "[secret]");
  text = text.replace(/\b(ghp_[A-Za-z0-9]{20,})\b/g, "[secret]");
  text = text.replace(/\bBearer\s+[A-Za-z0-9._\-]+\b/gi, "Bearer [secret]");
  text = text.replace(/([?&](?:token|api[_-]?key|apikey|key|secret|password)=)([^&\s]+)/gi, "$1[redacted]");

  // Environment fingerprints.
  text = text.replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]");
  text = text.replace(/\/(?:Users|home|data|sdcard|var|etc)\/[^\s"'`]+/g, "[path]");
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]");
  text = text.replace(/\b[0-9a-z.-]+\.ts\.net\b/gi, "[tailnet_host]");
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]");

  return text;
}

function summarizeRouteAction(action) {
  const value = String(action || "").trim().toLowerCase();
  if (!value) return "general";
  if (value.includes("gcp") || value.includes("vertex")) return "cloud_ops";
  if (value.includes("slack") || value.includes("telegram") || value.includes("github") || value.includes("google") || value.includes("atlassian")) {
    return "integration_ops";
  }
  if (value.includes("local") || value.includes("desktop") || value.includes("browser")) return "automation_ops";
  if (value.includes("approval") || value.includes("guardian")) return "approval_ops";
  return value.replace(/[^a-z0-9_]+/g, "_").slice(0, 48) || "general";
}

function buildRelayMessageSummary(event, relayPolicy) {
  const blocked = Boolean(event?.blocked) ? "yes" : "no";
  const security = isSecurityEmergency(event) ? "yes" : "no";
  const level = String(event?.risk?.level || "unknown").toUpperCase();
  const rawAction = String(event?.routeAction || "none");

  if (relayPolicy.mode === "abstraction") {
    const action = summarizeRouteAction(rawAction);
    const reasons = Array.isArray(event?.risk?.reasons) ? event.risk.reasons.length : 0;
    return {
      level,
      action,
      blocked,
      security,
      preview: "policy_redacted",
      detail: `reason_count=${reasons}`
    };
  }

  const action = redactRelaySensitiveText(rawAction);
  const preview = redactRelaySensitiveText(clipPreview(event?.messagePreview || "", 220));
  const decision = redactRelaySensitiveText(clipPreview(event?.decisionText || "", 180));
  const detail = decision || "";
  return {
    level,
    action,
    blocked,
    security,
    preview: preview || "(none)",
    detail
  };
}

async function sendCodexBridgeAlert(event, options = {}) {
  const url = String(process.env.ASOLARIA_CODEX_BRIDGE_URL || "").trim();
  if (!url) {
    return { ok: false, method: "codex-bridge", reason: "codex_bridge_not_configured" };
  }
  if (!shouldSendCodexBridgeAlert(event)) {
    return { ok: false, method: "codex-bridge", reason: "not_eligible" };
  }

  const token = String(process.env.ASOLARIA_CODEX_BRIDGE_TOKEN || "").trim();
  const room = String(process.env.ASOLARIA_CODEX_BRIDGE_ROOM || "asolaria_bridge").trim() || "asolaria_bridge";
  const from = String(process.env.ASOLARIA_CODEX_BRIDGE_FROM || "asolaria").trim() || "asolaria";
  const to = String(process.env.ASOLARIA_CODEX_BRIDGE_TO || "vector").trim() || "vector";
  const thread = String(options.thread || "").trim() || `asolaria-alert-${Date.now()}`;

  const relayPolicy = resolveRelayOutputPolicy(url);
  const summary = buildRelayMessageSummary(event, relayPolicy);
  const text = clipPreview(
    `@${to} #thread:${thread} ALERT: mode=${relayPolicy.mode} channel=${relayPolicy.channel} level=${summary.level} action=${summary.action} blocked=${summary.blocked} security=${summary.security} preview=${summary.preview} detail=${summary.detail || "(none)"}`,
    700
  );

  try {
    const base = new URL(url);
    const endpoint = new URL(`/rooms/${encodeURIComponent(room)}/messages`, base);
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ from, text })
    });
    if (!response.ok) {
      return { ok: false, method: "codex-bridge", reason: `http_${response.status}` };
    }
    return { ok: true, method: "codex-bridge", room, mode: relayPolicy.mode, channel: relayPolicy.channel };
  } catch (error) {
    return { ok: false, method: "codex-bridge", reason: error.message };
  }
}

function shouldSendIztEmergency(event) {
  const level = String(event?.risk?.level || "low").toLowerCase();
  return isSecurityEmergency(event) || level === "critical";
}

async function sendIztEmergencyRelay(event) {
  const url = String(process.env.ASOLARIA_IZT_RELAY_URL || "").trim();
  if (!url) {
    return { ok: false, method: "izt-relay", reason: "izt_relay_not_configured" };
  }
  if (!shouldSendIztEmergency(event)) {
    return { ok: false, method: "izt-relay", reason: "not_emergency_event" };
  }

  const relayPolicy = resolveRelayOutputPolicy(url);
  const summary = buildRelayMessageSummary(event, relayPolicy);
  const payload = {
    type: "asolaria-emergency-relay",
    at: new Date().toISOString(),
    routeAction: summary.action,
    messagePreview: summary.preview,
    risk: event.risk || {},
    blocked: Boolean(event.blocked),
    decisionText: summary.detail || "",
    relayPolicy: {
      mode: relayPolicy.mode,
      channel: relayPolicy.channel
    },
    approvalRequest: event.approvalRequest || null,
    ownerPhone: String(process.env.ASOLARIA_OWNER_PHONE || "").trim(),
    channels: {
      sms: true,
      voice: true
    },
    voice: {
      tone: String(process.env.ASOLARIA_VOICE_STYLE || "warm_feminine").trim()
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return { ok: false, method: "izt-relay", reason: `http_${response.status}` };
    }
    return { ok: true, method: "izt-relay" };
  } catch (error) {
    return { ok: false, method: "izt-relay", reason: error.message };
  }
}

function buildSubject(event) {
  const level = String(event.risk?.level || "unknown").toUpperCase();
  const action = String(event.routeAction || "general");
  return `[Asolaria Alert][${level}] ${action}`;
}

function buildBody(event, ownerName) {
  const approvalBlock = event.approvalRequest
    ? [
      "",
      "Pending approval:",
      `ID: ${event.approvalRequest.id}`,
      `Expires: ${event.approvalRequest.expiresAt || "unknown"}`,
      event.approvalRequest.url ? `Review URL: ${event.approvalRequest.url}` : "",
      "To approve: APPROVE <id>",
      "To deny: DENY <id>"
    ].filter(Boolean)
    : [];
  return [
    `Owner: ${ownerName || "unknown"}`,
    `Timestamp: ${event.at || new Date().toISOString()}`,
    `Risk level: ${event.risk?.level || "unknown"} (score ${event.risk?.score ?? "n/a"})`,
    `Route action: ${event.routeAction || "none"}`,
    `Blocked: ${event.blocked ? "yes" : "no"}`,
    "",
    "Reasons:",
    ...(Array.isArray(event.risk?.reasons) && event.risk.reasons.length ? event.risk.reasons.map((value) => `- ${value}`) : ["- (none)"]),
    "",
    "Message preview:",
    event.messagePreview || "(empty)",
    "",
    "Decision:",
    event.decisionText || "(no autonomous decision text)",
    ...approvalBlock
  ].join("\n");
}

function normalizeContactRoute(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "security_emergency" || normalized === "security" || normalized === "emergency") {
    return "security_emergency";
  }
  if (normalized === "silent" || normalized === "disabled" || normalized === "none") {
    return "silent";
  }
  return "primary";
}

function isSecurityEmergency(event) {
  if (Boolean(event?.risk?.securityIncident)) {
    return true;
  }
  const reasons = Array.isArray(event?.risk?.reasons) ? event.risk.reasons.join(" ").toLowerCase() : "";
  const messagePreview = String(event?.messagePreview || "").toLowerCase();
  const routeAction = String(event?.routeAction || "").toLowerCase();
  const text = `${reasons} ${messagePreview} ${routeAction}`;
  return /\b(hack|breach|intrusion|malware|ransomware|phishing|unauthorized|compromis|exfiltration|credential stuffing|attack)\b/i.test(text);
}

function shouldNotifyEmailContact(contact, event) {
  const route = normalizeContactRoute(contact?.route);
  if (route === "silent") {
    return false;
  }
  if (route === "security_emergency") {
    return isSecurityEmergency(event);
  }
  return true;
}

function shouldSendWhatsAppAlert(config, event) {
  if (!config || !config.enabled) {
    return false;
  }
  const mode = String(config.notifyMode || "critical_or_security").trim().toLowerCase();
  const level = String(event?.risk?.level || "low").toLowerCase();
  const security = isSecurityEmergency(event);
  if (mode === "all_alerts") {
    return true;
  }
  if (mode === "security_only") {
    return security;
  }
  return security || level === "critical";
}

async function sendWhatsAppViaTwilio(config, body) {
  const accountSid = String(config?.accountSid || "").trim();
  const authToken = String(config?.authToken || "").trim();
  const from = String(config?.fromNumber || "").trim();
  const to = String(config?.toNumber || "").trim();

  if (!accountSid || !authToken || !from || !to) {
    return { ok: false, method: "twilio-whatsapp", reason: "whatsapp_not_configured" };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const payload = new URLSearchParams({
    From: from,
    To: to,
    Body: body
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        method: "twilio-whatsapp",
        reason: `http_${response.status}`,
        details: text.slice(0, 280)
      };
    }
    return {
      ok: true,
      method: "twilio-whatsapp",
      to
    };
  } catch (error) {
    return {
      ok: false,
      method: "twilio-whatsapp",
      reason: error.message
    };
  }
}

function hasTwilioWhatsAppConfig(config) {
  const accountSid = String(config?.accountSid || "").trim();
  const authToken = String(config?.authToken || "").trim();
  const from = String(config?.fromNumber || "").trim();
  const to = String(config?.toNumber || "").trim();
  return Boolean(accountSid && authToken && from && to);
}

async function notifyGuardianContacts(event) {
  bootstrapGuardianProfile({});
  const profile = revealGuardianProfile() || {};
  const contacts = Array.isArray(profile.contacts) ? profile.contacts.filter((contact) => contact.enabled && contact.email) : [];
  const emailTargets = contacts
    .filter((contact) => shouldNotifyEmailContact(contact, event))
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999));
  const smtp = readGuardianSmtpConfig({ reveal: true });
  const whatsapp = readGuardianWhatsAppConfig({ reveal: true });
  const ownerName = profile.ownerName || "Owner";

  const delivery = [];
  const subject = buildSubject(event);
  const body = buildBody(event, ownerName);
  const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (smtp && smtp.host && smtp.fromEmail && emailTargets.length > 0) {
    for (const contact of emailTargets) {
      try {
        await sendEmailViaSmtp(smtp, contact.email, subject, body);
        delivery.push({
          ok: true,
          method: "smtp-email",
          to: contact.email,
          route: normalizeContactRoute(contact.route),
          at: new Date().toISOString()
        });
      } catch (error) {
        delivery.push({
          ok: false,
          method: "smtp-email",
          to: contact.email,
          route: normalizeContactRoute(contact.route),
          reason: error.message,
          at: new Date().toISOString()
        });
      }
    }
  } else if (emailTargets.length === 0) {
    delivery.push({
      ok: false,
      method: "smtp-email",
      reason: "no_eligible_email_contacts_for_event",
      at: new Date().toISOString()
    });
  } else {
    delivery.push({
      ok: false,
      method: "smtp-email",
      reason: "smtp_not_configured",
      at: new Date().toISOString()
    });
  }

  if (shouldSendWhatsAppAlert(whatsapp, event)) {
    const wa = await sendDirectWhatsAppMessage(body);
    delivery.push({
      ...wa,
      at: new Date().toISOString()
    });
  }

  const webhook = await sendWebhookAlert({
    type: "guardian-alert",
    event
  });
  if (webhook.method) {
    delivery.push({
      ...webhook,
      at: new Date().toISOString()
    });
  }

  const codexBridge = await sendCodexBridgeAlert(event, { thread: alertId });
  if (codexBridge.method) {
    delivery.push({
      ...codexBridge,
      at: new Date().toISOString()
    });
  }

  const iztRelay = await sendIztEmergencyRelay(event);
  if (iztRelay.method) {
    delivery.push({
      ...iztRelay,
      at: new Date().toISOString()
    });
  }

  const alertRecord = {
    id: alertId,
    at: new Date().toISOString(),
    ownerName,
    routeAction: event.routeAction || "none",
    messagePreview: event.messagePreview || "",
    risk: event.risk || {},
    securityIncident: isSecurityEmergency(event),
    blocked: Boolean(event.blocked),
    decisionText: event.decisionText || "",
    approvalRequest: event.approvalRequest
      ? {
        id: event.approvalRequest.id,
        expiresAt: event.approvalRequest.expiresAt || null,
        url: event.approvalRequest.url || null
      }
      : null,
    delivery
  };

  const doc = loadAlerts();
  doc.alerts.push(alertRecord);
  saveAlerts(doc);
  appendLogLine(`${alertRecord.at} | ${alertRecord.risk.level || "unknown"} | ${alertRecord.routeAction} | blocked=${alertRecord.blocked} | deliveries=${delivery.length}`);

  return {
    alertId: alertRecord.id,
    delivery,
    alertsPath,
    alertsLogPath
  };
}

async function sendDirectWhatsAppMessage(message, options = {}) {
  const body = String(message || "").trim();
  if (!body) {
    return {
      ok: false,
      method: "twilio-whatsapp",
      reason: "message_required"
    };
  }
  const config = readGuardianWhatsAppConfig({ reveal: true });
  if (!config || !config.enabled) {
    return {
      ok: false,
      method: "twilio-whatsapp",
      reason: "whatsapp_disabled"
    };
  }
  const prefix = String(options.prefix || "").trim();
  const mergedBody = [prefix, body].filter(Boolean).join("\n").slice(0, 1500);
  const requestedTo = String(options.toNumber || options.phone || "").trim();
  const linkedTo = requestedTo || String(config.toNumber || "").trim();
  const explicitApp = String(options.whatsappApp || options.app || "").trim();
  const explicitPackage = String(options.whatsappPackage || options.packageName || "").trim();
  const selectedApp = explicitApp || String(config.app || "").trim();
  const selectedPackage = explicitPackage || (explicitApp ? "" : String(config.packageName || "").trim());
  const selectedUserId = options.userId !== undefined ? options.userId : config.userId;
  const linkedOnly = String(options.mode || "").trim().toLowerCase() === "linked";
  const allowLinkedFallback = options.allowLinkedFallback !== false;
  const twilioConfigured = hasTwilioWhatsAppConfig(config);

  if (!linkedOnly && twilioConfigured) {
    const twilio = await sendWhatsAppViaTwilio(config, mergedBody);
    if (twilio?.ok || !allowLinkedFallback) {
      return twilio;
    }
  }

  if (!allowLinkedFallback) {
    return {
      ok: false,
      method: "twilio-whatsapp",
      reason: "whatsapp_not_configured"
    };
  }

  if (!linkedTo) {
    return {
      ok: false,
      method: "phone-linked-whatsapp",
      reason: "whatsapp_to_number_required"
    };
  }

  try {
    const linked = await sendPhoneWhatsAppLinkedMessage({
      toNumber: linkedTo,
      message: mergedBody,
      deviceId: String(options.deviceId || "").trim(),
      timeoutMs: Number(options.timeoutMs || 15000),
      postLaunchWaitMs: Number(options.postLaunchWaitMs || 900),
      allowEnterFallback: options.allowEnterFallback !== false,
      whatsappApp: selectedApp,
      whatsappPackage: selectedPackage,
      userId: selectedUserId
    });
    if (!linked?.ok) {
      return {
        ok: false,
        method: "phone-linked-whatsapp",
        reason: "linked_send_failed",
        details: linked
      };
    }
    return {
      ok: true,
      method: "phone-linked-whatsapp",
      to: String(linked.phone || ""),
      deviceId: String(linked.deviceId || ""),
      sendMethod: String(linked.sendMethod || ""),
      manualActionRequired: Boolean(linked.manualActionRequired),
      nextStep: String(linked.nextStep || ""),
      url: String(linked.url || "")
    };
  } catch (error) {
    return {
      ok: false,
      method: "phone-linked-whatsapp",
      reason: String(error?.message || error || "linked_send_exception")
    };
  }
}

module.exports = {
  notifyGuardianContacts,
  listGuardianAlerts,
  getGuardianAlertStats,
  sendDirectWhatsAppMessage
};
