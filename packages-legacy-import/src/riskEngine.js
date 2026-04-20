const LEVEL_ORDER = ["low", "medium", "high", "critical"];

function normalizeLevel(level, fallback = "low") {
  const value = String(level || "").trim().toLowerCase();
  if (LEVEL_ORDER.includes(value)) {
    return value;
  }
  return fallback;
}

function isLevelAtOrAbove(level, threshold) {
  const left = LEVEL_ORDER.indexOf(normalizeLevel(level, "low"));
  const right = LEVEL_ORDER.indexOf(normalizeLevel(threshold, "high"));
  return left >= right;
}

function scoreToLevel(score) {
  if (score >= 9) return "critical";
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function actionRiskScore(action) {
  const value = String(action || "").trim().toLowerCase();
  const map = {
    run_pad: 6,
    local_ops_run: 6,
    local_build: 5,
    local_test: 4,
    local_script: 6,
    browser_task: 4,
    slack_status: 1,
    slack_channels: 2,
    slack_review: 3,
    slack_config: 4,
    telegram_status: 1,
    telegram_config: 4,
    telegram_send: 4,
    telegram_webhook_inbound: 2,
    telegram_poll_start: 4,
    telegram_poll_stop: 2,
    github_status: 1,
    github_repos: 2,
    github_config: 4,
    external_provider_config: 4,
    google_status: 1,
    google_config: 4,
    google_auth_start: 3,
    google_api_request: 2,
    atlassian_status: 1,
    atlassian_config: 4,
    atlassian_auth_start: 3,
    atlassian_api_request: 2,
    gmail_inbox: 2,
    gmail_search: 2,
    calendar_list: 2,
    calendar_upcoming: 2,
    gcp_status: 1,
    gcp_config: 9,
    gcp_api_request: 4,
    gcp_api_mutation: 9,
    gcp_services_enabled: 3,
    gcp_service_enable: 9,
    vertex_status: 1,
    vertex_ask: 3,
    vertex_budget_status: 1,
    vertex_budget_set: 6,
    vertex_budget_reset: 4,
    gemini_api_status: 1,
    gemini_api_ask: 3,
    openai_web_chat_status: 1,
    openai_web_chat_ask: 4,
    gemini_enterprise_web_status: 1,
    gemini_enterprise_web_chat: 4,
    gemini_api_config: 4,
    avatar_npc_generate: 3,
    notebooklm_status: 1,
    notebooklm_ask: 3,
    notebooklm_open: 4,
    power_shutdown: 7,
    power_restart: 7,
    power_abort: 2,
    power_wol_config: 3,
    power_wol_send: 3,
    work_org_status: 1,
    work_org_set: 2,
    skills_list: 1,
    skills_get: 1,
    skills_run: 3,
    local_rebuild_plan: 2,
    codex_skill_reference: 1,
    chrome_profiles_list: 1,
    chrome_open_url: 4,
    web_mcp_inspect: 2,
    web_mcp_task: 4,
    captures_stats: 1,
    captures_mark_important: 2,
    captures_prune: 3,
    desktop_window_list: 2,
    desktop_window_active: 2,
    desktop_capture: 6,
    desktop_dual_capture: 6,
    desktop_window_focus: 6,
    desktop_move: 6,
    desktop_scroll: 6,
    desktop_click: 9,
    desktop_double_click: 9,
    desktop_type: 9,
    desktop_key: 9,
    ui_visual_audit: 4,
    phone_browser_history_check: 2,
    phone_pro_mirror_start: 2,
    phone_pro_mirror_stop: 1,
    phone_whatsapp_status: 2,
    phone_whatsapp_open: 4,
    phone_whatsapp_open_chat: 5,
    phone_whatsapp_voice_note: 9,
    company_decide_proceed: 5,
    company_account_reveal: 8,
    company_open_site: 4,
    moltbook_decide_proceed: 5,
    moltbook_account_reveal: 8,
    moltbook_open_site: 4,
    antigravity_ask: 4,
    cursor_ask: 4
  };
  return map[value] || 0;
}

function evaluateRisk(input = {}) {
  const message = String(input.message || "").trim();
  const action = String(input.action || "").trim().toLowerCase();
  const text = message.toLowerCase();
  const reasons = [];
  let score = actionRiskScore(action);

  if (score > 0) {
    reasons.push(`Action risk baseline for "${action}"`);
  }

  const destructive = /\b(delete|erase|wipe|destroy|format|rm\b|remove-item|shutdown|reset|drop table)\b/i;
  const secretData = /\b(password|token|api key|secret|credential|oauth|session key|private key)\b/i;
  const moneyOps = /\b(bank|wire|transfer|crypto|wallet|payment|invoice|purchase)\b/i;
  const massPosting = /\b(post|publish|broadcast|send to all|mass message|campaign)\b/i;
  const securityIncident = /\b(hack(?:ed|ing)?|breach|intrusion|compromis(?:e|ed)|ransomware|malware|phishing|unauthorized|credential stuffing|data exfiltration|exfiltration|ddos)\b/i;
  const instability = /\b(crazy|out of control|rogue|runaway)\b/i;
  const privilege = /\b(admin|elevated|root|system32|registry|services|daemon)\b/i;
  const captchaFlow = /\b(captcha|recaptcha|hcaptcha|human verification|i am not a robot|anti-bot challenge)\b/i;
  const accountCreation = /\b(create account|signup|sign up|register account|new account|account creation|verify account)\b/i;
  const secretSharing = /\b(share|send|post|publish|forward|upload)\b[\s\S]{0,80}\b(password|token|api key|secret|credential|private key|session cookie)\b/i;

  if (destructive.test(text)) {
    score += 5;
    reasons.push("Destructive-operation language detected.");
  }
  if (secretData.test(text)) {
    score += 4;
    reasons.push("Credential/secret language detected.");
  }
  if (moneyOps.test(text)) {
    score += 4;
    reasons.push("Financial-operation language detected.");
  }
  if (massPosting.test(text)) {
    score += 3;
    reasons.push("Mass posting/messaging language detected.");
  }
  if (securityIncident.test(text)) {
    score += 6;
    reasons.push("Security compromise language detected.");
  }
  if (instability.test(text)) {
    score += 2;
    reasons.push("Runaway/emergency language detected.");
  }
  if (privilege.test(text)) {
    score += 3;
    reasons.push("Privilege/escalation language detected.");
  }
  if (accountCreation.test(text)) {
    score += 3;
    reasons.push("Automated account-creation language detected.");
  }
  if (captchaFlow.test(text)) {
    score += 9;
    reasons.push("CAPTCHA/human-verification checkpoint detected (owner approval required).");
  }
  if (secretSharing.test(text)) {
    score += 8;
    reasons.push("Potential credential sharing intent detected.");
  }

  const level = scoreToLevel(score);
  return {
    level,
    score,
    reasons,
    crazy: instability.test(text) || securityIncident.test(text),
    securityIncident: securityIncident.test(text),
    action,
    preview: message.length > 220 ? `${message.slice(0, 217)}...` : message
  };
}

module.exports = {
  normalizeLevel,
  isLevelAtOrAbove,
  evaluateRisk
};
