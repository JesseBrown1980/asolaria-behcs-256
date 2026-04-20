const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");

const rulesPath = resolveDataPath("approval-rules.json");
const defaultRules = {
  version: 1,
  persistentPrefixes: []
};

let rulesCache = null;

function ensureRulesDir() {
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
}

function loadRules() {
  if (rulesCache) {
    return rulesCache;
  }

  try {
    if (!fs.existsSync(rulesPath)) {
      rulesCache = { ...defaultRules };
      saveRules(rulesCache);
      return rulesCache;
    }

    const parsed = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
    if (!parsed || !Array.isArray(parsed.persistentPrefixes)) {
      throw new Error("Invalid approval rules file.");
    }

    rulesCache = {
      version: 1,
      persistentPrefixes: parsed.persistentPrefixes
        .map((value) => String(value || "").toLowerCase().trim())
        .filter(Boolean)
    };
    return rulesCache;
  } catch (_error) {
    rulesCache = { ...defaultRules };
    saveRules(rulesCache);
    return rulesCache;
  }
}

function saveRules(rules) {
  ensureRulesDir();
  fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2), "utf8");
}

function tokenize(commandText) {
  const text = String(commandText || "").trim();
  if (!text) {
    return [];
  }

  const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const tokens = [];
  let match;

  while ((match = regex.exec(text))) {
    const token = match[1] || match[2] || match[3] || "";
    if (token) {
      tokens.push(token);
    }
    if (tokens.length >= 6) {
      break;
    }
  }

  return tokens;
}

function commandPrefix(commandText) {
  const tokens = tokenize(commandText).map((token) => token.toLowerCase());
  if (tokens.length === 0) {
    return "";
  }

  if (tokens.length >= 2 && tokens[0].includes("powershell") && tokens[1] === "-command") {
    return `${tokens[0]} ${tokens[1]}`;
  }

  return tokens.slice(0, 2).join(" ");
}

function isReadOnly(commandText) {
  const value = String(commandText || "").toLowerCase();
  const patterns = [
    /\b(get-childitem|get-content|cat|type|dir|ls|pwd|whoami|where|which|rg|find|findstr|select-string)\b/,
    /\bgit\s+(status|diff|log|show)\b/,
    /\bnode\s+--check\b/,
    /\bwsl\s+(-l|--status|--version)\b/,
    /\bsysteminfo\b/
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function isDestructive(commandText) {
  const value = String(commandText || "").toLowerCase();
  const patterns = [
    /\brm\b/,
    /\bdel\b/,
    /\bremove-item\b/,
    /\bformat-volume\b/,
    /\bformat\.com\b/,
    /(?:^|[\s"'])format(?:\.com)?\s+[a-z]:(?=\s|$|["'])/,
    /\bdiskpart\b/,
    /\breg\s+delete\b/,
    /\bshutdown\b/,
    /\brestart-computer\b/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+clean\s+-f/
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function isHigherRiskWrite(commandText) {
  const value = String(commandText || "").toLowerCase();
  const patterns = [
    /\bwinget\s+install\b/,
    /\bchoco\s+install\b/,
    /\bnpm\s+install\b/,
    /\bset-content\b/,
    /\bout-file\b/,
    /\bnew-item\b/,
    /\bcopy-item\b/,
    /\bmove-item\b/,
    /\brename-item\b/,
    /\bset-itemproperty\b/
  ];
  return patterns.some((pattern) => pattern.test(value));
}

function detectApprovalPrompt(text) {
  const value = String(text || "");
  if (!value.trim()) {
    return false;
  }

  const lower = value.toLowerCase();
  const hasIntent = /(approve|approval|allow|permission|confirm|run this command|escalat|don't ask again|do not ask again|request)/.test(lower);
  const hasChoices = /(\(p\)|\(a\)|\(y\)|\by\/n\b|\bno\b|\(n\))/.test(lower);
  return hasIntent && hasChoices;
}

function createApprovalSession() {
  const rules = loadRules();
  const persistentPrefixes = new Set(
    (rules.persistentPrefixes || [])
      .map((value) => String(value || "").toLowerCase().trim())
      .filter(Boolean)
  );
  return {
    rules,
    persistentPrefixes,
    seenPrefixes: new Set(),
    alwaysPrefixes: new Set()
  };
}

function persistPrefix(session, prefix) {
  if (!prefix) {
    return;
  }

  const normalized = prefix.toLowerCase().trim();
  if (!normalized) {
    return;
  }

  const rules = session.rules;
  if (rules.persistentPrefixes.includes(normalized)) {
    session.persistentPrefixes.add(normalized);
    return;
  }

  rules.persistentPrefixes.push(normalized);
  session.persistentPrefixes.add(normalized);
  saveRules(rules);
}

function chooseApprovalChoice({ command, mode = "smart", session, preference = "balanced" }) {
  const normalizedMode = String(mode || "smart").toLowerCase();
  const normalizedPreference = String(preference || "balanced").toLowerCase();
  const normalizedCommand = String(command || "").trim();
  const prefix = commandPrefix(normalizedCommand);
  const isPersistentPrefix = Boolean(prefix && session?.persistentPrefixes?.has(prefix));

  if (normalizedMode === "manual") {
    return { choice: null, reason: "Manual approval mode." };
  }

  if (normalizedMode === "deny") {
    return { choice: "n", reason: "Deny mode active." };
  }

  if (!normalizedCommand) {
    return { choice: "y", reason: "No command context; approve once." };
  }

  if (isDestructive(normalizedCommand)) {
    return {
      choice: normalizedMode === "deny" ? "n" : null,
      escalate: normalizedMode !== "deny",
      reason: normalizedMode === "deny"
        ? "Destructive pattern detected and deny mode active."
        : "Destructive pattern detected; owner approval required.",
      prefix
    };
  }

  if (isPersistentPrefix) {
    return { choice: "p", reason: "Persistent trusted prefix matched.", prefix };
  }

  if (normalizedPreference === "pay_priority") {
    if (isReadOnly(normalizedCommand)) {
      persistPrefix(session, prefix);
      return { choice: "p", reason: "Read-only command promoted to persistent prefix.", prefix };
    }

    if (prefix && session.alwaysPrefixes.has(prefix)) {
      return { choice: "a", reason: "Prefix already trusted for this run.", prefix };
    }

    if (prefix && session.seenPrefixes.has(prefix)) {
      session.alwaysPrefixes.add(prefix);
      return { choice: "a", reason: "Repeated prefix promoted to always for this run.", prefix };
    }

    if (prefix) {
      session.seenPrefixes.add(prefix);
    }

    return { choice: "y", reason: "P/A unavailable; approved once with y.", prefix };
  }

  if (isReadOnly(normalizedCommand)) {
    persistPrefix(session, prefix);
    return { choice: "p", reason: "Trusted read-only command prefix persisted.", prefix };
  }

  if (prefix && session.alwaysPrefixes.has(prefix)) {
    return { choice: "a", reason: "Prefix already approved for this run.", prefix };
  }

  if (prefix && session.seenPrefixes.has(prefix)) {
    session.alwaysPrefixes.add(prefix);
    return { choice: "a", reason: "Repeated prefix promoted to always for this run.", prefix };
  }

  if (prefix) {
    session.seenPrefixes.add(prefix);
  }

  if (isHigherRiskWrite(normalizedCommand)) {
    return { choice: "y", reason: "Higher-risk write/install command approved once.", prefix };
  }

  return { choice: "y", reason: "Default one-time approval.", prefix };
}

function formatApprovalInput(choice) {
  const normalized = String(choice || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "n" || normalized === "no") {
    return "no\n";
  }
  return `${normalized[0]}\n`;
}

function approvalStats() {
  const rules = loadRules();
  return {
    persistentPrefixes: rules.persistentPrefixes.length
  };
}

const COMMAND_RISK_CLASSES = {
  safe_read: {
    id: "safe_read",
    level: 1,
    label: "Safe Read"
  },
  write: {
    id: "write",
    level: 2,
    label: "Write"
  },
  high_risk_write: {
    id: "high_risk_write",
    level: 3,
    label: "High Risk Write"
  },
  destructive: {
    id: "destructive",
    level: 4,
    label: "Destructive"
  }
};

function classifyCommandRisk(commandText) {
  const command = String(commandText || "").trim();
  if (!command) {
    return {
      riskClass: "safe_read",
      level: 1,
      command
    };
  }
  if (isDestructive(command)) {
    return {
      riskClass: "destructive",
      level: COMMAND_RISK_CLASSES.destructive.level,
      command
    };
  }
  if (isHigherRiskWrite(command)) {
    return {
      riskClass: "high_risk_write",
      level: COMMAND_RISK_CLASSES.high_risk_write.level,
      command
    };
  }
  if (isReadOnly(command)) {
    return {
      riskClass: "safe_read",
      level: COMMAND_RISK_CLASSES.safe_read.level,
      command
    };
  }
  return {
    riskClass: "write",
    level: COMMAND_RISK_CLASSES.write.level,
    command
  };
}

module.exports = {
  createApprovalSession,
  chooseApprovalChoice,
  detectApprovalPrompt,
  formatApprovalInput,
  approvalStats,
  COMMAND_RISK_CLASSES,
  classifyCommandRisk
};
