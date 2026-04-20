function cleanText(value) {
  return String(value || "").replace(/\r/g, " ").trim();
}

function cleanLower(value) {
  return cleanText(value).toLowerCase();
}

function includesAny(haystack, terms) {
  return terms.some((term) => haystack.includes(term));
}

function normalizeDomain(value) {
  const normalized = cleanLower(value);
  if (!normalized) return "";
  if (normalized.includes("company") || normalized.includes("work")) return "company";
  if (normalized.includes("personal") || normalized.includes("owner")) return "personal";
  return normalized.slice(0, 40);
}

function normalizeCriticality(value) {
  const normalized = cleanLower(value);
  if (["low", "medium", "high", "critical"].includes(normalized)) {
    return normalized;
  }
  if (!normalized) return "";
  if (normalized === "normal") return "medium";
  return normalized.slice(0, 24);
}

function mapScoreToLevel(score) {
  if (score >= 9) return "critical";
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function scoreEdgeRisk(input = {}) {
  const action = cleanLower(input.action || input.type || "");
  const category = cleanLower(input.category || "");
  const tool = cleanLower(input.tool || input.context?.tool || "");
  const mode = cleanLower(input.mode || input.context?.mode || input.policy?.mode || "");
  const approvalState = cleanLower(input.approvalState || input.policy?.approvalState || "");
  const status = cleanLower(input.status || "");
  const actorDomain = normalizeDomain(input.actor?.domain || input.domain || "");
  const targetDomain = normalizeDomain(input.target?.domain || "");
  const criticality = normalizeCriticality(input.target?.criticality || input.criticality || "");
  const autonomous = input.autonomous === true || input.policy?.autonomous === true;
  const sourceText = [action, category, tool, mode, status].filter(Boolean).join(" ");
  const reasons = [];
  let score = 0;

  const highRiskTerms = [
    "secret",
    "iam",
    "privilege",
    "impersonat",
    "tunnel",
    "delete",
    "clear",
    "shutdown",
    "restart",
    "deploy",
    "external",
    "browser_task",
    "computer_use",
    "pad",
    "whatsapp",
    "slack",
    "telegram"
  ];
  const mediumRiskTerms = [
    "approval",
    "provider",
    "repo",
    "write",
    "voice",
    "phone",
    "meeting",
    "chat",
    "model",
    "cursor",
    "antigravity"
  ];

  if (includesAny(sourceText, highRiskTerms)) {
    score += 6;
    reasons.push("High-impact action or asset class.");
  } else if (includesAny(sourceText, mediumRiskTerms)) {
    score += 3;
    reasons.push("Operationally sensitive action class.");
  }

  if (criticality === "critical") {
    score += 4;
    reasons.push("Target criticality is critical.");
  } else if (criticality === "high") {
    score += 3;
    reasons.push("Target criticality is high.");
  } else if (criticality === "medium") {
    score += 1;
  }

  if (actorDomain && targetDomain && actorDomain !== targetDomain) {
    score += 4;
    reasons.push("Cross-domain action path detected.");
  }

  if (approvalState === "required" || approvalState === "pending") {
    score += 2;
    reasons.push("Approval is required or still pending.");
  } else if (approvalState === "denied") {
    score += 3;
    reasons.push("Denied approval state observed.");
  } else if (approvalState === "approved") {
    score = Math.max(0, score - 1);
  }

  if (autonomous) {
    score += 2;
    reasons.push("Autonomous execution path.");
  }

  if (mode === "silent" || mode === "headless" || mode === "backend-only" || mode === "backend") {
    score += 1;
    reasons.push("Low-visibility execution mode.");
  }

  if (status === "failed" || status === "error" || status === "blocked") {
    score += 1;
    reasons.push("Failed or blocked edge outcome.");
  }

  const level = mapScoreToLevel(score);
  return {
    score,
    level,
    reasons: reasons.slice(0, 8),
    actorDomain,
    targetDomain,
    approvalState,
    autonomous
  };
}

module.exports = {
  scoreEdgeRisk
};
