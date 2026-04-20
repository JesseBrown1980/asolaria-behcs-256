#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const REPORTS_DIR = path.join(ROOT, "reports");

const PATHS = {
  memory: path.join(DATA_DIR, "memory.json"),
  taskLedger: path.join(DATA_DIR, "task-ledger.json"),
  notebook: path.join(DATA_DIR, "notebook.json")
};

const DEFAULTS = {
  mode: "dry-run",
  maxWatchdogTurns: 40,
  keepNotebookOwnerAction: 8,
  keepNotebookUpgradeLoop: 8,
  keepNotebookModelAudit: 14,
  keepJobStatusEventsPerTask: 0
};

const AGENT_CANON = [
  { id: "asolaria", name: "Asolaria", aliases: ["asolaria", "asolaria-core"] },
  { id: "vector", name: "Vector", aliases: ["vector", "this-codex"] },
  { id: "rook", name: "Rook", aliases: ["rook", "other-codex"] },
  { id: "forge", name: "Forge", aliases: ["forge", "build-codex"] },
  { id: "falcon", name: "Falcon", aliases: ["falcon", "phone-codex"] },
  { id: "watchdog", name: "Watchdog", aliases: ["watchdog"] },
  { id: "oli", name: "Oli", aliases: ["oli"] }
];

const AGENT_ALIAS_LOOKUP = new Map();
for (const entry of AGENT_CANON) {
  for (const alias of entry.aliases) {
    AGENT_ALIAS_LOOKUP.set(normalizeAlias(alias), entry);
  }
}

const NOISY_EVENT_TYPES = new Set(["job_running", "job_queued"]);

function normalizeAlias(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function toEpochMs(value) {
  const parsed = new Date(value || "");
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseArgs(argv) {
  const out = {
    mode: DEFAULTS.mode,
    maxWatchdogTurns: DEFAULTS.maxWatchdogTurns,
    keepNotebookOwnerAction: DEFAULTS.keepNotebookOwnerAction,
    keepNotebookUpgradeLoop: DEFAULTS.keepNotebookUpgradeLoop,
    keepNotebookModelAudit: DEFAULTS.keepNotebookModelAudit,
    keepJobStatusEventsPerTask: DEFAULTS.keepJobStatusEventsPerTask
  };
  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = String(argv[idx] || "").trim();
    if (!arg) continue;
    if (arg === "--apply") {
      out.mode = "apply";
      continue;
    }
    if (arg === "--dry-run") {
      out.mode = "dry-run";
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[idx + 1];
    if (next === undefined) continue;
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) continue;
    if (key === "max-watchdog-turns") {
      out.maxWatchdogTurns = Math.max(0, Math.min(300, Math.round(parsed)));
      idx += 1;
      continue;
    }
    if (key === "keep-notebook-owner-action") {
      out.keepNotebookOwnerAction = Math.max(0, Math.min(200, Math.round(parsed)));
      idx += 1;
      continue;
    }
    if (key === "keep-notebook-upgrade-loop") {
      out.keepNotebookUpgradeLoop = Math.max(0, Math.min(200, Math.round(parsed)));
      idx += 1;
      continue;
    }
    if (key === "keep-notebook-model-audit") {
      out.keepNotebookModelAudit = Math.max(0, Math.min(200, Math.round(parsed)));
      idx += 1;
      continue;
    }
    if (key === "keep-job-status-events-per-task") {
      out.keepJobStatusEventsPerTask = Math.max(0, Math.min(20, Math.round(parsed)));
      idx += 1;
      continue;
    }
  }
  return out;
}

function resolveAgent(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const direct = AGENT_ALIAS_LOOKUP.get(normalizeAlias(raw));
  if (direct) return direct;
  const idMatch = raw.match(/\(([a-z0-9._:-]+)\)\s*$/i);
  if (idMatch) {
    const byId = AGENT_ALIAS_LOOKUP.get(normalizeAlias(idMatch[1]));
    if (byId) return byId;
  }
  return null;
}

function toPersonaLabel(value) {
  const resolved = resolveAgent(value);
  if (!resolved) return String(value || "").trim();
  return `${resolved.name} (${resolved.id})`;
}

function toPersonaName(value) {
  const resolved = resolveAgent(value);
  if (!resolved) return String(value || "").trim();
  return resolved.name;
}

const LEGACY_AGENT_REWRITES = AGENT_CANON.flatMap((entry) =>
  entry.aliases
    .map((alias) => String(alias || "").trim())
    .filter((alias) => alias && normalizeAlias(alias) !== normalizeAlias(entry.name) && normalizeAlias(alias) !== normalizeAlias(entry.id))
    .map((alias) => ({ alias, replacement: entry.name }))
).sort((a, b) => b.alias.length - a.alias.length);

function rewriteLegacyAgentText(input) {
  let output = String(input || "");
  if (!output) {
    return output;
  }
  const prefixPattern = "(^|[\\s([{\"'])";
  const suffixPattern = "(?=$|[\\s)\\]}\",.!?:;'])";
  for (const item of LEGACY_AGENT_REWRITES) {
    const alias = escapeRegex(item.alias);
    output = output.replace(
      new RegExp(`${prefixPattern}@${alias}${suffixPattern}`, "gi"),
      `$1@${item.replacement}`
    );
    output = output.replace(
      new RegExp(`${prefixPattern}${alias}${suffixPattern}`, "gi"),
      `$1${item.replacement}`
    );
  }
  return output;
}

function rewriteWatchdogText(input) {
  const raw = String(input || "");
  if (!raw) {
    return raw;
  }
  const replaced = raw.replace(
    /(IdleLanes|Summary):\s*([^|]+)/i,
    (_full, prefix, laneChunk) => {
      const parts = String(laneChunk || "")
        .split(",")
        .map((piece) => piece.trim())
        .filter(Boolean);
      if (parts.length < 1) {
        return `${prefix}: ${laneChunk}`;
      }
      const mapped = parts.map((piece) => {
        const colonIndex = piece.indexOf(":");
        const laneToken = colonIndex === -1 ? piece : piece.slice(0, colonIndex);
        const suffix = colonIndex === -1 ? "" : piece.slice(colonIndex);
        const laneLabel = toPersonaLabel(laneToken);
        return `${laneLabel}${suffix}`;
      });
      return `${prefix}: ${mapped.join(", ")}`;
    }
  );
  return replaced;
}

function collectReview(memory, taskLedger, notebook) {
  const turns = Array.isArray(memory?.turns) ? memory.turns : [];
  const tasks = Array.isArray(taskLedger?.tasks) ? taskLedger.tasks : [];
  const events = Array.isArray(taskLedger?.events) ? taskLedger.events : [];
  const notes = Array.isArray(notebook?.notes) ? notebook.notes : [];

  const memoryBySource = {};
  let watchdogIdleCount = 0;
  let watchdogDigestCount = 0;
  let userTurns = 0;
  let assistantTurns = 0;
  for (const turn of turns) {
    const role = String(turn?.role || "").toLowerCase();
    if (role === "user") userTurns += 1;
    if (role === "assistant") assistantTurns += 1;
    const source = String(turn?.meta?.source || "none").toLowerCase();
    memoryBySource[source] = Number(memoryBySource[source] || 0) + 1;
    const text = String(turn?.text || "");
    if (/^Agent Colony Idle Escalation\b/i.test(text)) {
      watchdogIdleCount += 1;
    }
    if (/^Agent Colony Watchdog Digest\b/i.test(text)) {
      watchdogDigestCount += 1;
    }
  }

  const eventActors = {};
  const eventTypes = {};
  for (const event of events) {
    const actor = String(event?.actor || "none").toLowerCase();
    eventActors[actor] = Number(eventActors[actor] || 0) + 1;
    const type = String(event?.type || "none").toLowerCase();
    eventTypes[type] = Number(eventTypes[type] || 0) + 1;
  }

  const noteTitles = {};
  for (const note of notes) {
    const title = String(note?.title || "(untitled)").trim() || "(untitled)";
    noteTitles[title] = Number(noteTitles[title] || 0) + 1;
  }

  return {
    memory: {
      turns: turns.length,
      userTurns,
      assistantTurns,
      watchdogIdleCount,
      watchdogDigestCount,
      topSources: Object.entries(memoryBySource).sort((a, b) => b[1] - a[1]).slice(0, 12)
    },
    taskLedger: {
      tasks: tasks.length,
      events: events.length,
      topActors: Object.entries(eventActors).sort((a, b) => b[1] - a[1]).slice(0, 16),
      topEventTypes: Object.entries(eventTypes).sort((a, b) => b[1] - a[1]).slice(0, 16)
    },
    notebook: {
      notes: notes.length,
      topTitles: Object.entries(noteTitles).sort((a, b) => b[1] - a[1]).slice(0, 16)
    }
  };
}

function untangleData(state) {
  const counts = {
    memoryWatchdogTextUpdated: 0,
    memoryLegacyTextUpdated: 0
  };

  const turns = Array.isArray(state.memory?.turns) ? state.memory.turns : [];
  for (const turn of turns) {
    const before = String(turn.text || "");
    if (!before) {
      continue;
    }
    let after = before;
    const source = String(turn?.meta?.source || "").toLowerCase();
    if (source === "agent_colony_watchdog") {
      after = rewriteWatchdogText(after);
      if (after !== before) {
        counts.memoryWatchdogTextUpdated += 1;
      }
    }
    const normalized = rewriteLegacyAgentText(after);
    if (normalized !== after) {
      after = normalized;
      counts.memoryLegacyTextUpdated += 1;
    }
    if (after !== before) {
      turn.text = after;
    }
  }

  return counts;
}

function reassignData(state) {
  const counts = {
    taskOwnerReassigned: 0,
    eventActorReassigned: 0,
    notebookTagReassigned: 0,
    taskTextRewritten: 0,
    eventTextRewritten: 0,
    notebookTextRewritten: 0
  };

  const tasks = Array.isArray(state.taskLedger?.tasks) ? state.taskLedger.tasks : [];
  for (const task of tasks) {
    const ownerBefore = String(task?.owner || "").trim();
    if (ownerBefore) {
      const ownerAfter = toPersonaName(ownerBefore);
      if (ownerAfter && ownerAfter !== ownerBefore) {
        task.owner = ownerAfter;
        counts.taskOwnerReassigned += 1;
      }
    }
    for (const field of ["title", "description"]) {
      const before = String(task?.[field] || "");
      if (!before) continue;
      const after = rewriteLegacyAgentText(before);
      if (after !== before) {
        task[field] = after;
        counts.taskTextRewritten += 1;
      }
    }
  }

  const events = Array.isArray(state.taskLedger?.events) ? state.taskLedger.events : [];
  for (const event of events) {
    const actorBefore = String(event?.actor || "").trim();
    if (actorBefore) {
      const actorAfter = toPersonaName(actorBefore);
      if (actorAfter && actorAfter !== actorBefore) {
        event.actor = actorAfter;
        counts.eventActorReassigned += 1;
      }
    }
    for (const field of ["note"]) {
      const before = String(event?.[field] || "");
      if (!before) continue;
      const after = rewriteLegacyAgentText(before);
      if (after !== before) {
        event[field] = after;
        counts.eventTextRewritten += 1;
      }
    }
  }

  const notes = Array.isArray(state.notebook?.notes) ? state.notebook.notes : [];
  for (const note of notes) {
    if (Array.isArray(note?.tags) && note.tags.length > 0) {
      const nextTags = [];
      let touched = false;
      for (const tag of note.tags) {
        const before = String(tag || "").trim();
        const remapped = toPersonaName(before);
        const next = remapped ? remapped.toLowerCase() : before;
        if (next !== before) touched = true;
        if (next) nextTags.push(next);
      }
      if (touched) {
        note.tags = Array.from(new Set(nextTags)).slice(0, 20);
        counts.notebookTagReassigned += 1;
      }
    }
    for (const field of ["title", "text"]) {
      const before = String(note?.[field] || "");
      if (!before) continue;
      const after = rewriteLegacyAgentText(before);
      if (after !== before) {
        note[field] = after;
        counts.notebookTextRewritten += 1;
      }
    }
  }

  return counts;
}

function pruneMemory(state, options) {
  const maxWatchdogTurns = Math.max(0, Number(options.maxWatchdogTurns || 0));
  const turns = Array.isArray(state.memory?.turns) ? state.memory.turns : [];
  const watchdog = [];
  const keep = [];
  for (const turn of turns) {
    const source = String(turn?.meta?.source || "").toLowerCase();
    if (source === "agent_colony_watchdog") {
      watchdog.push(turn);
    } else {
      keep.push(turn);
    }
  }

  watchdog.sort((a, b) => toEpochMs(a?.at) - toEpochMs(b?.at));
  const retainedWatchdog = maxWatchdogTurns > 0
    ? watchdog.slice(Math.max(0, watchdog.length - maxWatchdogTurns))
    : [];

  const merged = keep.concat(retainedWatchdog)
    .sort((a, b) => toEpochMs(a?.at) - toEpochMs(b?.at));
  state.memory.turns = merged;
  state.memory.updatedAt = toIsoDate(
    merged.length > 0 ? merged[merged.length - 1].at : state.memory.updatedAt,
    new Date().toISOString()
  );

  return {
    watchdogBefore: watchdog.length,
    watchdogAfter: retainedWatchdog.length,
    watchdogPruned: Math.max(0, watchdog.length - retainedWatchdog.length),
    turnsBefore: turns.length,
    turnsAfter: merged.length,
    turnsPruned: Math.max(0, turns.length - merged.length)
  };
}

function pruneNotebookByTitle(state, pattern, keepCount) {
  const notes = Array.isArray(state.notebook?.notes) ? state.notebook.notes : [];
  const matches = notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => pattern.test(String(note?.title || "")))
    .sort((a, b) => toEpochMs(a.note?.updatedAt || a.note?.createdAt) - toEpochMs(b.note?.updatedAt || b.note?.createdAt));
  const removeCount = Math.max(0, matches.length - keepCount);
  if (removeCount < 1) {
    return {
      matched: matches.length,
      pruned: 0
    };
  }
  const removeIndexes = new Set(matches.slice(0, removeCount).map((row) => row.index));
  state.notebook.notes = notes.filter((_row, index) => !removeIndexes.has(index));
  state.notebook.updatedAt = toIsoDate(
    state.notebook.notes.length > 0
      ? state.notebook.notes[state.notebook.notes.length - 1].updatedAt
      : state.notebook.updatedAt,
    new Date().toISOString()
  );
  return {
    matched: matches.length,
    pruned: removeCount
  };
}

function pruneNotebook(state, options) {
  const ownerAction = pruneNotebookByTitle(
    state,
    /^NotebookLM Enterprise Owner Action Required$/i,
    Math.max(0, Number(options.keepNotebookOwnerAction || 0))
  );
  const upgradeLoop = pruneNotebookByTitle(
    state,
    /^NotebookLM Enterprise Upgrade Loop Completed$/i,
    Math.max(0, Number(options.keepNotebookUpgradeLoop || 0))
  );
  const modelAudit = pruneNotebookByTitle(
    state,
    /^Model Audit /i,
    Math.max(0, Number(options.keepNotebookModelAudit || 0))
  );
  return {
    ownerAction,
    upgradeLoop,
    modelAudit,
    totalPruned: Number(ownerAction.pruned || 0) + Number(upgradeLoop.pruned || 0) + Number(modelAudit.pruned || 0)
  };
}

function pruneTaskLedgerEvents(state, options) {
  const events = Array.isArray(state.taskLedger?.events) ? state.taskLedger.events : [];
  const keepPerTask = Math.max(0, Number(options.keepJobStatusEventsPerTask || 0));
  const sorted = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const delta = toEpochMs(a.event?.at) - toEpochMs(b.event?.at);
      if (delta !== 0) return delta;
      return a.index - b.index;
    });

  const keepMap = new Map();
  const keepIndexes = new Set();
  for (const row of sorted) {
    const type = String(row.event?.type || "").toLowerCase();
    if (!NOISY_EVENT_TYPES.has(type)) {
      keepIndexes.add(row.index);
      continue;
    }
    const taskId = String(row.event?.taskId || "");
    const key = `${taskId}::${type}`;
    const bucket = keepMap.get(key) || [];
    bucket.push(row.index);
    keepMap.set(key, bucket);
  }

  for (const bucket of keepMap.values()) {
    const pick = keepPerTask > 0 ? bucket.slice(Math.max(0, bucket.length - keepPerTask)) : [];
    for (const idx of pick) {
      keepIndexes.add(idx);
    }
  }

  const next = events.filter((_event, index) => keepIndexes.has(index));
  state.taskLedger.events = next;
  state.taskLedger.updatedAt = toIsoDate(
    next.length > 0 ? next[next.length - 1].at : state.taskLedger.updatedAt,
    new Date().toISOString()
  );

  return {
    eventsBefore: events.length,
    eventsAfter: next.length,
    eventsPruned: Math.max(0, events.length - next.length)
  };
}

function pruneData(state, options) {
  return {
    memory: pruneMemory(state, options),
    notebook: pruneNotebook(state, options),
    taskLedger: pruneTaskLedgerEvents(state, options)
  };
}

function createBackup(filePath, backupRoot) {
  ensureDir(backupRoot);
  const targetPath = path.join(backupRoot, path.basename(filePath));
  fs.copyFileSync(filePath, targetPath);
  return targetPath;
}

function createMarkdownReport(report) {
  const lines = [
    "# Agent State Maintenance Report",
    "",
    `- Timestamp: ${report.timestamp}`,
    `- Mode: ${report.mode}`,
    "",
    "## Requested Flow",
    "- Untangle: canonicalized watchdog lane labels in message text.",
    "- Review: captured before/after stats for memory, task-ledger, notebook.",
    "- Reassign: mapped legacy lane IDs to persona names in structured fields.",
    "- Prune: trimmed watchdog memory spam, repeated notebook automation notes, and noisy job status events.",
    "",
    "## Changes",
    `- Untangle memory watchdog text updates: ${report.changes.untangle.memoryWatchdogTextUpdated}`,
    `- Reassign task owners: ${report.changes.reassign.taskOwnerReassigned}`,
    `- Reassign event actors: ${report.changes.reassign.eventActorReassigned}`,
    `- Reassign notebook tags: ${report.changes.reassign.notebookTagReassigned}`,
    `- Prune memory turns: ${report.changes.prune.memory.turnsPruned} (${report.changes.prune.memory.watchdogPruned} watchdog entries)`,
    `- Prune notebook notes: ${report.changes.prune.notebook.totalPruned}`,
    `- Prune task-ledger events: ${report.changes.prune.taskLedger.eventsPruned}`,
    "",
    "## Review Before",
    `- Memory turns: ${report.review.before.memory.turns} (watchdog idle=${report.review.before.memory.watchdogIdleCount}, digest=${report.review.before.memory.watchdogDigestCount})`,
    `- Task-ledger: tasks=${report.review.before.taskLedger.tasks}, events=${report.review.before.taskLedger.events}`,
    `- Notebook notes: ${report.review.before.notebook.notes}`,
    "",
    "## Review After",
    `- Memory turns: ${report.review.after.memory.turns} (watchdog idle=${report.review.after.memory.watchdogIdleCount}, digest=${report.review.after.memory.watchdogDigestCount})`,
    `- Task-ledger: tasks=${report.review.after.taskLedger.tasks}, events=${report.review.after.taskLedger.events}`,
    `- Notebook notes: ${report.review.after.notebook.notes}`,
    ""
  ];
  if (report.mode === "apply") {
    lines.push("## Backups");
    for (const [label, filePath] of Object.entries(report.backups || {})) {
      lines.push(`- ${label}: ${filePath}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function run() {
  const options = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString();
  const stampSafe = timestamp.replace(/[:.]/g, "-");

  const state = {
    memory: readJson(PATHS.memory),
    taskLedger: readJson(PATHS.taskLedger),
    notebook: readJson(PATHS.notebook)
  };
  const before = deepClone(state);
  const reviewBefore = collectReview(before.memory, before.taskLedger, before.notebook);

  const untangleCounts = untangleData(state);
  const reassignCounts = reassignData(state);
  const pruneCounts = pruneData(state, options);

  const reviewAfter = collectReview(state.memory, state.taskLedger, state.notebook);
  const report = {
    timestamp,
    mode: options.mode,
    options,
    changes: {
      untangle: untangleCounts,
      reassign: reassignCounts,
      prune: pruneCounts
    },
    review: {
      before: reviewBefore,
      after: reviewAfter
    },
    backups: {},
    outputs: {}
  };

  if (options.mode === "apply") {
    const backupRoot = path.join(DATA_DIR, "backups", "agent-state-maintenance", stampSafe);
    report.backups.memory = createBackup(PATHS.memory, backupRoot);
    report.backups.taskLedger = createBackup(PATHS.taskLedger, backupRoot);
    report.backups.notebook = createBackup(PATHS.notebook, backupRoot);

    writeJson(PATHS.memory, state.memory);
    writeJson(PATHS.taskLedger, state.taskLedger);
    writeJson(PATHS.notebook, state.notebook);
  }

  ensureDir(REPORTS_DIR);
  const reportJsonPath = path.join(REPORTS_DIR, `agent-state-maintenance-${stampSafe}.json`);
  const reportMdPath = path.join(REPORTS_DIR, `agent-state-maintenance-${stampSafe}.md`);
  writeJson(reportJsonPath, report);
  fs.writeFileSync(reportMdPath, createMarkdownReport(report), "utf8");
  report.outputs.json = reportJsonPath;
  report.outputs.md = reportMdPath;

  console.log(JSON.stringify({
    ok: true,
    mode: options.mode,
    reportJsonPath,
    reportMdPath,
    changes: report.changes,
    reviewBefore: {
      memoryTurns: reviewBefore.memory.turns,
      taskEvents: reviewBefore.taskLedger.events,
      notebookNotes: reviewBefore.notebook.notes
    },
    reviewAfter: {
      memoryTurns: reviewAfter.memory.turns,
      taskEvents: reviewAfter.taskLedger.events,
      notebookNotes: reviewAfter.notebook.notes
    }
  }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.message || error || "unknown_error")
  }, null, 2));
  process.exitCode = 1;
}
