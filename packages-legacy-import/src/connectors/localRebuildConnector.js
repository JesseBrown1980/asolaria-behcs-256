const fs = require("fs");
const path = require("path");
const { instanceRoot } = require("../runtimePaths");

const DEFAULT_MAX_EVIDENCE_FILES = 16;
const DEFAULT_MAX_EVIDENCE_FILE_BYTES = 300 * 1024;
const DEFAULT_MAX_TOTAL_CHARS = 180000;
const REPORT_SUBDIR = path.join("reports", "local-rebuild-lab");
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".log",
  ".csv"
]);

const CAPABILITY_CATALOG = Object.freeze([
  {
    id: "live_transcription",
    title: "Live transcription pipeline",
    category: "speech",
    effortHours: 12,
    patterns: [
      /\blive transcript/i,
      /\btranscript\b/i,
      /\btranscription\b/i,
      /\bcaption(s)?\b/i,
      /\bspeech[-\s]?to[-\s]?text\b/i,
      /\bwhisper\b/i,
      /\bstt\b/i
    ],
    localComponents: [
      "audio-capture-ingest",
      "streaming-asr-worker",
      "transcript-buffer-store",
      "chat-mirror-renderer"
    ],
    controls: [
      "Keep raw audio local by default; require opt-in for cloud ASR.",
      "Mask secrets/PII before transcript persistence.",
      "Use append-only transcript audit logs with retention limits."
    ],
    tests: [
      "Mic-only and loopback transcription accuracy regression test",
      "Transcript drop-resilience test under queue pressure",
      "Copy-paste chat formatting validation test"
    ]
  },
  {
    id: "mobile_bridge",
    title: "Phone bridge and device control",
    category: "device",
    effortHours: 10,
    patterns: [
      /\badb\b/i,
      /\bdevice\b/i,
      /\bphone\b/i,
      /\busb\b/i,
      /\breverse\b/i,
      /\btunnel\b/i,
      /\bscreencap\b/i
    ],
    localComponents: [
      "device-target-resolver",
      "adb-command-wrapper",
      "phone-evidence-capture",
      "bridge-health-monitor"
    ],
    controls: [
      "Require explicit device allowlist and serial pinning.",
      "Block privileged shell paths unless owner-approved.",
      "Store captures in local evidence folders with checksum metadata."
    ],
    tests: [
      "Multi-device targeting fallback test",
      "USB/LAN route consistency check",
      "Phone capture artifact integrity check"
    ]
  },
  {
    id: "identity_oauth",
    title: "OAuth and identity workflows",
    category: "identity",
    effortHours: 8,
    patterns: [
      /\boauth\b/i,
      /\bconsent\b/i,
      /\blogin\b/i,
      /\bauth\b/i,
      /\btoken\b/i,
      /\binvalid_rapt\b/i
    ],
    localComponents: [
      "oauth-health-prober",
      "token-source-registry",
      "account-allowlist-guard",
      "auth-error-classifier"
    ],
    controls: [
      "Never persist refresh/access tokens in plaintext artifacts.",
      "Mask account identifiers in reports by default.",
      "Fail closed on redirect/auth anomalies."
    ],
    tests: [
      "Per-account OAuth viability smoke test",
      "Masked-report verification test",
      "Auth error taxonomy regression test"
    ]
  },
  {
    id: "tool_orchestration",
    title: "Connector and tool orchestration",
    category: "orchestration",
    effortHours: 9,
    patterns: [
      /\bmcp\b/i,
      /\bconnector\b/i,
      /\btool(s)?\b/i,
      /\bjson-rpc\b/i,
      /\ballowlist\b/i,
      /\bpolicy\b/i
    ],
    localComponents: [
      "tool-policy-engine",
      "connector-health-snapshot",
      "scoped-allowlist-runtime",
      "mistake-taxonomy-feedback-loop"
    ],
    controls: [
      "Default-deny tool execution with explicit allowlist.",
      "Run tool actions through risk scoring and approval gates.",
      "Log tool payload summaries without leaking secrets."
    ],
    tests: [
      "Tool allowlist deny/allow matrix",
      "Policy preset integrity test",
      "Approval hook bypass prevention test"
    ]
  },
  {
    id: "clipboard_pipeline",
    title: "Clipboard and copy pipeline",
    category: "ux",
    effortHours: 6,
    patterns: [
      /\bclipboard\b/i,
      /\bcopy\b/i,
      /\bpaste\b/i,
      /\bhoneyboard\b/i,
      /\bsemclipboard\b/i
    ],
    localComponents: [
      "safe-clipboard-reader",
      "copy-ready-format-builder",
      "clipboard-redaction-filter"
    ],
    controls: [
      "Treat clipboard entries as sensitive user data.",
      "Avoid privileged clipboard extraction paths.",
      "Apply secret-pattern redaction before export."
    ],
    tests: [
      "Copy payload formatting test",
      "Sensitive-token redaction test",
      "Clipboard failure fallback test"
    ]
  },
  {
    id: "browser_automation",
    title: "Browser and UI automation",
    category: "automation",
    effortHours: 8,
    patterns: [
      /\bplaywright\b/i,
      /\bweb[-\s]?mcp\b/i,
      /\bbrowser task\b/i,
      /\binspect\b/i,
      /\bscreenshot\b/i,
      /\bdom\b/i
    ],
    localComponents: [
      "headless-inspection-adapter",
      "deterministic-browser-step-runner",
      "ui-evidence-collector"
    ],
    controls: [
      "Prefer non-UI/headless probes before desktop control.",
      "Reject unknown hosts unless allowlisted.",
      "Capture minimal evidence needed for reproducibility."
    ],
    tests: [
      "Browser step schema validation test",
      "Host-allowlist enforcement test",
      "Headless/auth-state mismatch detection test"
    ]
  },
  {
    id: "integrations_collab",
    title: "Messaging and collaboration integrations",
    category: "integrations",
    effortHours: 7,
    patterns: [
      /\bslack\b/i,
      /\bteams\b/i,
      /\btelegram\b/i,
      /\bwhatsapp\b/i,
      /\bchannel\b/i,
      /\bworkspace\b/i
    ],
    localComponents: [
      "integration-status-checker",
      "workspace-allowlist-guard",
      "message-review-queue"
    ],
    controls: [
      "Enforce workspace/domain allowlists before any send action.",
      "Separate read-only review from posting capabilities.",
      "Block mass-send operations without explicit approval."
    ],
    tests: [
      "Integration configured/not-configured path test",
      "Workspace allowlist deny test",
      "Outbound posting approval-gate test"
    ]
  }
]);

function normalizeText(value, limit = 4000) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, Math.max(1, limit));
}

function parseOptionalBool(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return undefined;
}

function toInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function timestampStamp(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function isPathInsideRoot(targetPath, rootPath) {
  const safeTarget = path.resolve(String(targetPath || ""));
  const safeRoot = path.resolve(String(rootPath || ""));
  if (!safeTarget || !safeRoot) return false;
  const relative = path.relative(safeRoot, safeTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function findLatestFile(baseDir, pattern) {
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && pattern.test(entry.name))
      .map((entry) => {
        const fullPath = path.join(baseDir, entry.name);
        const stat = fs.statSync(fullPath);
        return {
          path: fullPath,
          mtimeMs: Number(stat.mtimeMs || 0)
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    return entries.length ? entries[0].path : "";
  } catch (_error) {
    return "";
  }
}

function uniquePaths(items) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const resolved = path.resolve(String(item || "").trim());
    if (!resolved) continue;
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

function looksLikeTextFile(filePath) {
  const ext = String(path.extname(filePath || "") || "").toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function readEvidenceFile(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const totalBytes = Number(stat.size || 0);
  const bytesToRead = Math.max(1, Math.min(totalBytes || maxBytes, maxBytes));
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, 0);
    if (buffer.includes(0)) {
      return {
        ok: false,
        reason: "binary_content_detected",
        totalBytes,
        text: ""
      };
    }
    return {
      ok: true,
      reason: "",
      totalBytes,
      text: buffer.toString("utf8")
    };
  } finally {
    fs.closeSync(fd);
  }
}

function collectDefaultEvidencePaths() {
  const out = [];
  const reportsRoot = path.join(instanceRoot, "reports");
  out.push(path.join(reportsRoot, "upgrade-blocker-checkpoint-latest.md"));
  out.push(path.join(reportsRoot, "task-closeout-runtime-validation-latest.json"));
  out.push(path.join(reportsRoot, "bridge-caption-auth-smoke-latest.md"));

  const liveTranscriptLatest = findLatestFile(reportsRoot, /^live-transcript-validation-matrix-\d{8}-\d{6}\.md$/i);
  if (liveTranscriptLatest) out.push(liveTranscriptLatest);

  const userRoot = path.resolve(instanceRoot, "..");
  const phoneOcrRoot = path.join(userRoot, "tmp_phone_recent_screens_usb");
  const phoneOcrLatest = findLatestFile(phoneOcrRoot, /^ocr_usb_filtered_.*\.(txt|json)$/i);
  if (phoneOcrLatest) out.push(phoneOcrLatest);

  return uniquePaths(out);
}

function collectEvidence(input = {}) {
  const maxFiles = toInt(input.maxEvidenceFiles, DEFAULT_MAX_EVIDENCE_FILES, 1, 32);
  const maxBytes = toInt(input.maxEvidenceFileBytes, DEFAULT_MAX_EVIDENCE_FILE_BYTES, 32 * 1024, 2 * 1024 * 1024);
  const maxTotalChars = toInt(input.maxTotalChars, DEFAULT_MAX_TOTAL_CHARS, 20000, 350000);
  const includeDefaultEvidence = parseOptionalBool(input.includeDefaultEvidence) !== false;
  const allowExternalEvidence = parseOptionalBool(input.allowExternalEvidence) === true;
  const allowedRoot = path.resolve(instanceRoot, "..");

  const requestedPaths = [];
  if (Array.isArray(input.evidencePaths)) {
    for (const item of input.evidencePaths) {
      const text = normalizeText(item, 800);
      if (text) requestedPaths.push(text);
    }
  } else if (input.evidencePath) {
    const text = normalizeText(input.evidencePath, 800);
    if (text) requestedPaths.push(text);
  }
  if (includeDefaultEvidence) {
    requestedPaths.push(...collectDefaultEvidencePaths());
  }

  const resolved = uniquePaths(requestedPaths).slice(0, maxFiles);
  const loaded = [];
  const skipped = [];
  let totalChars = 0;

  for (const filePath of resolved) {
    if (!allowExternalEvidence && !isPathInsideRoot(filePath, allowedRoot)) {
      skipped.push({
        path: filePath,
        reason: "outside_allowed_root"
      });
      continue;
    }
    if (!fs.existsSync(filePath)) {
      skipped.push({
        path: filePath,
        reason: "not_found"
      });
      continue;
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      skipped.push({
        path: filePath,
        reason: "not_file"
      });
      continue;
    }
    if (!looksLikeTextFile(filePath)) {
      skipped.push({
        path: filePath,
        reason: "unsupported_extension"
      });
      continue;
    }

    const read = readEvidenceFile(filePath, maxBytes);
    if (!read.ok) {
      skipped.push({
        path: filePath,
        reason: read.reason || "read_failed"
      });
      continue;
    }

    const remaining = Math.max(0, maxTotalChars - totalChars);
    if (remaining <= 0) {
      skipped.push({
        path: filePath,
        reason: "total_char_limit_reached"
      });
      continue;
    }
    const text = String(read.text || "").slice(0, remaining);
    totalChars += text.length;
    loaded.push({
      path: filePath,
      totalBytes: read.totalBytes,
      loadedChars: text.length,
      text
    });
  }

  const inlineText = normalizeText(input.evidenceText || input.text || "", maxTotalChars);
  if (inlineText) {
    const remaining = Math.max(0, maxTotalChars - totalChars);
    if (remaining > 0) {
      const clipped = inlineText.slice(0, remaining);
      totalChars += clipped.length;
      loaded.push({
        path: "inline:evidenceText",
        totalBytes: clipped.length,
        loadedChars: clipped.length,
        text: clipped
      });
    } else {
      skipped.push({
        path: "inline:evidenceText",
        reason: "total_char_limit_reached"
      });
    }
  }

  const corpus = loaded.map((item) => item.text).join("\n\n");
  return {
    maxFiles,
    maxBytes,
    maxTotalChars,
    includeDefaultEvidence,
    allowExternalEvidence,
    loaded,
    skipped,
    corpus
  };
}

function countPatternMatches(text, regex) {
  const source = String(text || "");
  if (!source) return 0;
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const dynamic = new RegExp(regex.source, flags);
  const matches = source.match(dynamic);
  return Array.isArray(matches) ? matches.length : 0;
}

function scoreCapabilities(corpusText) {
  const rows = [];
  for (const capability of CAPABILITY_CATALOG) {
    let hits = 0;
    const signals = [];
    for (const pattern of capability.patterns) {
      const count = countPatternMatches(corpusText, pattern);
      if (count > 0) {
        hits += count;
        signals.push(String(pattern.source || "").replace(/\\b/g, "").slice(0, 60));
      }
    }
    if (!hits) continue;
    const confidence = Math.min(0.97, 0.35 + hits * 0.08);
    rows.push({
      id: capability.id,
      title: capability.title,
      category: capability.category,
      confidence: Number(confidence.toFixed(2)),
      matchCount: hits,
      topSignals: signals.slice(0, 6),
      effortHours: capability.effortHours,
      localComponents: capability.localComponents.slice(0, 12),
      controls: capability.controls.slice(0, 12),
      tests: capability.tests.slice(0, 12)
    });
  }
  return rows.sort((a, b) => b.matchCount - a.matchCount || a.id.localeCompare(b.id));
}

function fallbackCapabilities() {
  return [
    {
      id: "baseline_capture",
      title: "Baseline capture and analysis",
      category: "baseline",
      confidence: 0.3,
      matchCount: 0,
      topSignals: [],
      effortHours: 6,
      localComponents: ["evidence-collector", "capability-mapper", "policy-guard"],
      controls: [
        "Treat all external app behavior as untrusted until verified.",
        "Keep implementation local-first and approval-gated."
      ],
      tests: [
        "Evidence parser smoke test",
        "Policy gate deny/allow test"
      ]
    }
  ];
}

function collectSecurityControls(capabilities = []) {
  const set = new Set([
    "No proprietary binary/code extraction; rely on observed behavior and public docs only.",
    "Pin dependency versions and generate SBOM for every local replacement service.",
    "Run secrets scan on generated artifacts before commits.",
    "Enforce egress allowlist for all connector calls."
  ]);
  for (const cap of capabilities) {
    for (const control of Array.isArray(cap.controls) ? cap.controls : []) {
      const text = normalizeText(control, 260);
      if (text) set.add(text);
    }
  }
  return Array.from(set.values()).slice(0, 24);
}

function collectTestMatrix(capabilities = []) {
  const set = new Set([
    "Unit tests for capability parsers and policy evaluators",
    "Contract tests for each enabled connector",
    "Red-team prompt test for unsafe automation denial paths"
  ]);
  for (const cap of capabilities) {
    for (const test of Array.isArray(cap.tests) ? cap.tests : []) {
      const text = normalizeText(test, 260);
      if (text) set.add(text);
    }
  }
  return Array.from(set.values()).slice(0, 32);
}

function buildComponentPlan(capabilities = []) {
  const set = new Map();
  set.set("policy-guardian", {
    id: "policy-guardian",
    role: "Enforce allowlists, risk scoring, and approval gates before execution.",
    source: "baseline"
  });
  set.set("evidence-ledger", {
    id: "evidence-ledger",
    role: "Store reconstruction evidence and test outcomes with immutable timestamps.",
    source: "baseline"
  });
  for (const cap of capabilities) {
    for (const component of Array.isArray(cap.localComponents) ? cap.localComponents : []) {
      const normalized = normalizeText(component, 80).toLowerCase().replace(/[^a-z0-9._:-]+/g, "-");
      if (!normalized) continue;
      if (!set.has(normalized)) {
        set.set(normalized, {
          id: normalized,
          role: `Implement ${cap.title.toLowerCase()} capability locally.`,
          source: cap.id
        });
      }
    }
  }
  return Array.from(set.values()).slice(0, 40);
}

function estimateTimelineHours(capabilities = []) {
  const base = 10;
  const dynamic = capabilities.reduce((sum, cap) => sum + Number(cap.effortHours || 0), 0);
  const total = Math.max(base, base + dynamic);
  return {
    hours: total,
    daysAt6h: Number((total / 6).toFixed(1)),
    daysAt8h: Number((total / 8).toFixed(1))
  };
}

function buildExecutionPhases(capabilities = [], timeline = { hours: 0 }) {
  const topCapabilities = capabilities.slice(0, 5).map((item) => item.id);
  return [
    {
      id: "phase-1-observe",
      title: "Observe and classify",
      deliverables: [
        "Evidence bundle normalized (screenshots OCR, logs, endpoint traces)",
        "Capability map with confidence scores",
        "Threat and trust-boundary register"
      ],
      estimatedHours: Math.max(4, Math.round((timeline.hours || 0) * 0.2)),
      focusCapabilities: topCapabilities
    },
    {
      id: "phase-2-build",
      title: "Build local equivalents",
      deliverables: [
        "Local connector/service implementations for top capabilities",
        "Policy-guardian integration for each action path",
        "Replayable scripts for critical operator workflows"
      ],
      estimatedHours: Math.max(8, Math.round((timeline.hours || 0) * 0.45)),
      focusCapabilities: topCapabilities
    },
    {
      id: "phase-3-harden",
      title: "Harden and verify",
      deliverables: [
        "Security controls enforced (allowlists, secret handling, audit logs)",
        "Regression + abuse-case test matrix passing",
        "Operational runbook and rollback steps"
      ],
      estimatedHours: Math.max(6, Math.round((timeline.hours || 0) * 0.35)),
      focusCapabilities: topCapabilities
    }
  ];
}

function summarizeTopSignals(corpusText) {
  const signalWords = [
    "transcript",
    "caption",
    "oauth",
    "token",
    "slack",
    "teams",
    "whatsapp",
    "mcp",
    "connector",
    "adb",
    "clipboard",
    "honeyboard",
    "notebooklm",
    "gemini",
    "queue",
    "bridge",
    "tunnel"
  ];
  const summary = [];
  for (const word of signalWords) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig");
    const count = countPatternMatches(corpusText, regex);
    if (!count) continue;
    summary.push({ signal: word, count });
  }
  return summary.sort((a, b) => b.count - a.count || a.signal.localeCompare(b.signal)).slice(0, 16);
}

function buildMarkdownReport(output = {}) {
  const lines = [];
  lines.push("# Local Secure Rebuild Plan");
  lines.push("");
  lines.push(`- Generated: ${output.generatedAt || ""}`);
  lines.push(`- App: ${output.appName || ""}`);
  lines.push(`- Objective: ${output.objective || ""}`);
  lines.push(`- Evidence files loaded: ${Number(output.evidence?.loadedCount || 0)}`);
  lines.push(`- Evidence chars loaded: ${Number(output.evidence?.totalChars || 0)}`);
  lines.push("");
  lines.push("## Top Signals");
  const topSignals = Array.isArray(output.evidence?.topSignals) ? output.evidence.topSignals : [];
  if (!topSignals.length) {
    lines.push("- none");
  } else {
    for (const signal of topSignals) {
      lines.push(`- ${signal.signal}: ${signal.count}`);
    }
  }
  lines.push("");
  lines.push("## Capability Profile");
  const capabilities = Array.isArray(output.capabilities) ? output.capabilities : [];
  if (!capabilities.length) {
    lines.push("- none");
  } else {
    for (const cap of capabilities) {
      lines.push(`- ${cap.id} | confidence=${cap.confidence} | matches=${cap.matchCount}`);
    }
  }
  lines.push("");
  lines.push("## Timeline");
  lines.push(`- Estimated hours: ${Number(output.timeline?.hours || 0)}`);
  lines.push(`- Days @6h: ${Number(output.timeline?.daysAt6h || 0)}`);
  lines.push(`- Days @8h: ${Number(output.timeline?.daysAt8h || 0)}`);
  lines.push("");
  lines.push("## Security Gates");
  for (const gate of Array.isArray(output.securityGates) ? output.securityGates : []) {
    lines.push(`- ${gate}`);
  }
  lines.push("");
  lines.push("## Test Matrix");
  for (const test of Array.isArray(output.testMatrix) ? output.testMatrix : []) {
    lines.push(`- ${test}`);
  }
  lines.push("");
  lines.push("## Legal Boundary");
  lines.push("- Rebuild from behavior/spec observations only; do not extract proprietary source code or bypass paid/licensed controls.");
  return `${lines.join("\n")}\n`;
}

function persistReport(output = {}, options = {}) {
  const shouldPersist = parseOptionalBool(options.persistReport);
  if (shouldPersist === false) {
    return {
      persisted: false,
      jsonPath: "",
      markdownPath: ""
    };
  }

  const reportDir = path.join(instanceRoot, REPORT_SUBDIR);
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = timestampStamp();
  const tag = normalizeText(options.reportTag || options.tag || "", 48)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-");
  const suffix = tag ? `-${tag}` : "";
  const jsonPath = path.join(reportDir, `local-rebuild-plan-${stamp}${suffix}.json`);
  const markdownPath = path.join(reportDir, `local-rebuild-plan-${stamp}${suffix}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");
  fs.writeFileSync(markdownPath, buildMarkdownReport(output), "utf8");

  return {
    persisted: true,
    jsonPath,
    markdownPath
  };
}

async function generateLocalRebuildPlan(input = {}) {
  const startedAt = new Date();
  const appName = normalizeText(input.appName || input.target || "External AI workflow", 160);
  const objective = normalizeText(
    input.objective || "Study behavior safely and rebuild local-first equivalents with explicit security gates.",
    280
  );

  const evidence = collectEvidence(input);
  const capabilitiesScored = scoreCapabilities(evidence.corpus);
  const capabilities = capabilitiesScored.length ? capabilitiesScored : fallbackCapabilities();
  const timeline = estimateTimelineHours(capabilities);
  const phases = buildExecutionPhases(capabilities, timeline);
  const components = buildComponentPlan(capabilities);
  const securityGates = collectSecurityControls(capabilities);
  const testMatrix = collectTestMatrix(capabilities);
  const topSignals = summarizeTopSignals(evidence.corpus);

  const result = {
    ok: true,
    generatedAt: new Date().toISOString(),
    startedAt: startedAt.toISOString(),
    appName,
    objective,
    evidence: {
      loadedCount: evidence.loaded.length,
      skippedCount: evidence.skipped.length,
      totalChars: evidence.corpus.length,
      loaded: evidence.loaded.map((item) => ({
        path: item.path,
        totalBytes: item.totalBytes,
        loadedChars: item.loadedChars
      })),
      skipped: evidence.skipped.slice(0, 40),
      topSignals
    },
    capabilities,
    components,
    phases,
    securityGates,
    testMatrix,
    timeline,
    constraints: {
      localFirst: true,
      legalBoundary: "behavioral reconstruction only",
      reverseEngineeringProprietaryBinaries: false
    }
  };

  const persisted = persistReport(result, input);
  return {
    ...result,
    report: persisted
  };
}

module.exports = {
  generateLocalRebuildPlan
};

