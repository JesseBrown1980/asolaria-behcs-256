const crypto = require("node:crypto");
const { listApprovals } = require("./guardianApprovalStore");
const { listTaskLedgerTasks } = require("./taskLedgerStore");
const { getNotebookState } = require("./notebookStore");
const { decorateTaskLeaseContextList } = require("./taskLeaseView");

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function clipText(value, maxChars = 220) {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function normalizeTitleSignature(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/^[a-z0-9_:-]+\s*:\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function normalizeBodySignature(value, maxChars = 220) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function fingerprintText(value) {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "";
  }
  return crypto.createHash("sha1").update(normalized).digest("hex");
}

function toEpochMs(value) {
  const parsed = new Date(value || "");
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function riskRank(level) {
  const normalized = cleanText(level).toLowerCase();
  if (normalized === "critical") return 0;
  if (normalized === "high") return 1;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 3;
  return 4;
}

function priorityRank(level) {
  const normalized = cleanText(level).toLowerCase();
  if (normalized === "critical") return 0;
  if (normalized === "high") return 1;
  if (normalized === "normal") return 2;
  if (normalized === "low") return 3;
  return 4;
}

function statusRank(status) {
  const normalized = cleanText(status).toLowerCase();
  if (normalized === "blocked") return 0;
  if (normalized === "review") return 1;
  if (normalized === "ready") return 2;
  if (normalized === "in_progress") return 3;
  if (normalized === "planned") return 4;
  return 5;
}

function noteRank(note = {}) {
  const tags = Array.isArray(note.tags) ? note.tags.map((entry) => cleanText(entry).toLowerCase()) : [];
  const title = cleanText(note.title).toLowerCase();
  const pinnedBias = note.pinned ? 0 : 4;
  const blockerBias = tags.some((entry) => entry.includes("blocker") || entry.includes("approval") || entry.includes("control-plane"))
    || title.includes("owner action")
    || title.includes("control-plane")
    || title.includes("blocker")
    ? -2
    : 0;
  return pinnedBias + blockerBias;
}

function taskSourceRank(task = {}) {
  const source = cleanText(task.source).toLowerCase();
  const projectScope = cleanText(task.projectScope).toLowerCase();
  if (source === "phone-takeover") return -2;
  if (projectScope === "phone-live") return -1;
  if (source === "chat-auto") return 1;
  return 0;
}

function describeTaskSource(task = {}) {
  const source = cleanText(task.source).toLowerCase();
  const projectScope = cleanText(task.projectScope).toLowerCase();
  if (source === "phone-takeover") return "phone takeover";
  if (projectScope === "phone-live") return "phone live";
  if (source === "chat-auto") return "chat";
  return source ? source.replace(/[-_]+/g, " ") : "";
}

function taskDedupeSignature(task = {}) {
  const id = cleanText(task.id || "");
  const source = cleanText(task.source || "").toLowerCase() || "unknown";
  const title = cleanText(task.titleFingerprint || "");
  const description = cleanText(task.descriptionFingerprint || "");
  if (source !== "chat-auto" || !title || !description) {
    return id ? `task:${id}` : "";
  }
  const scope = cleanText(task.projectScope || "").toLowerCase() || "global";
  return `${source}::${scope}::${title}::${description}`;
}

function noteDedupeSignature(note = {}) {
  const id = cleanText(note.id || "");
  const title = cleanText(note.titleFingerprint || "");
  const text = cleanText(note.textFingerprint || "");
  if (!title || !text) {
    return id ? `note:${id}` : "";
  }
  return `${title}::${text}`;
}

function dedupeBySignature(rows, signatureFn) {
  const pickedBySignature = new Map();
  for (const row of rows) {
    const signature = cleanText(signatureFn(row));
    if (!signature) {
      continue;
    }
    const existing = pickedBySignature.get(signature);
    if (!existing) {
      pickedBySignature.set(signature, { ...row, duplicateCount: 1 });
      continue;
    }
    existing.duplicateCount = Number(existing.duplicateCount || 1) + 1;
  }
  return Array.from(pickedBySignature.values());
}

function buildApprovalRows(limit = 6) {
  const approvals = listApprovals({ status: "pending", limit: 60 })
    .map((approval) => {
      const riskLevel = cleanText(approval?.risk?.level || "high").toLowerCase() || "high";
      const messagePreview = clipText(
        approval?.messagePreview
        || approval?.message
        || `${approval?.action || "approval"} requested`,
        220
      );
      return {
        id: cleanText(approval?.id),
        source: cleanText(approval?.source || "guardian"),
        action: cleanText(approval?.action || "approval"),
        riskLevel,
        messagePreview,
        expiresAt: cleanText(approval?.expiresAt),
        createdAt: cleanText(approval?.createdAt || approval?.at),
        duplicateCount: 1
      };
    })
    .filter((approval) => approval.id);

  approvals.sort((a, b) => {
    const riskDelta = riskRank(a.riskLevel) - riskRank(b.riskLevel);
    if (riskDelta !== 0) return riskDelta;
    return toEpochMs(b.createdAt || b.expiresAt) - toEpochMs(a.createdAt || a.expiresAt);
  });

  return {
    total: approvals.length,
    rows: approvals.slice(0, Math.max(1, Number(limit) || 6))
  };
}

function buildTaskRows(limit = 6) {
  const openTasks = decorateTaskLeaseContextList(listTaskLedgerTasks({
    // Keep a broad pool so older still-open tasks are not silently excluded.
    limit: Number.MAX_SAFE_INTEGER,
    includeArchived: false,
    status: "all"
  }))
    .filter((task) => {
      const status = cleanText(task?.status).toLowerCase();
      return status && !["done", "canceled", "archived"].includes(status);
    })
    .map((task) => {
      const lease = task?.leaseContext && typeof task.leaseContext === "object" ? task.leaseContext : {};
      return {
        id: cleanText(task?.id),
        title: clipText(task?.title || "Task", 160),
        titleSignature: normalizeTitleSignature(task?.title || ""),
        titleFingerprint: fingerprintText(normalizeTitleSignature(task?.title || "")),
        descriptionSignature: normalizeBodySignature(task?.description || "", 180),
        descriptionFingerprint: fingerprintText(task?.description || ""),
        descriptionPreview: clipText(task?.description || "", 220),
        status: cleanText(task?.status || "planned").toLowerCase(),
        priority: cleanText(task?.priority || "normal").toLowerCase(),
        progress: Number(task?.progress || 0),
        source: cleanText(task?.source || ""),
        sourceLabel: describeTaskSource(task),
        projectScope: cleanText(task?.projectScope || ""),
        assigneeId: cleanText(lease?.holderId || task?.assigneeId || task?.owner || ""),
        leaseStatus: cleanText(lease?.status || ""),
        leaseId: cleanText(lease?.leaseId || task?.lastLeaseId || ""),
        updatedAt: cleanText(task?.updatedAt || task?.createdAt),
        createdAt: cleanText(task?.createdAt),
        duplicateCount: 1
      };
    })
    .filter((task) => task.id && task.titleSignature);

  openTasks.sort((a, b) => {
    const sourceDelta = taskSourceRank(a) - taskSourceRank(b);
    if (sourceDelta !== 0) return sourceDelta;
    const statusDelta = statusRank(a.status) - statusRank(b.status);
    if (statusDelta !== 0) return statusDelta;
    const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDelta !== 0) return priorityDelta;
    const autoPenaltyA = a.source === "chat-auto" ? 1 : 0;
    const autoPenaltyB = b.source === "chat-auto" ? 1 : 0;
    if (autoPenaltyA !== autoPenaltyB) return autoPenaltyA - autoPenaltyB;
    return toEpochMs(b.updatedAt || b.createdAt) - toEpochMs(a.updatedAt || a.createdAt);
  });

  const deduped = dedupeBySignature(openTasks, (task) => taskDedupeSignature(task));
  deduped.sort((a, b) => {
    const sourceDelta = taskSourceRank(a) - taskSourceRank(b);
    if (sourceDelta !== 0) return sourceDelta;
    const statusDelta = statusRank(a.status) - statusRank(b.status);
    if (statusDelta !== 0) return statusDelta;
    const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return toEpochMs(b.updatedAt || b.createdAt) - toEpochMs(a.updatedAt || a.createdAt);
  });

  return {
    total: openTasks.length,
    dedupedTotal: deduped.length,
    rows: deduped.slice(0, Math.max(1, Number(limit) || 6))
  };
}

function buildNoteRows(limit = 4) {
  const notebook = getNotebookState(80, { includeSensitive: false });
  const notes = (Array.isArray(notebook?.notes) ? notebook.notes : [])
    .filter((note) => !Boolean(note?.sensitive))
    .map((note) => ({
      id: cleanText(note?.id),
      title: clipText(note?.title || "(untitled)", 140),
      titleSignature: normalizeTitleSignature(note?.title || ""),
      titleFingerprint: fingerprintText(normalizeTitleSignature(note?.title || "")),
      textPreview: clipText(note?.text || "", 200),
      textSignature: normalizeBodySignature(note?.text || "", 220),
      textFingerprint: fingerprintText(note?.text || ""),
      tags: Array.isArray(note?.tags) ? note.tags.map((entry) => cleanText(entry)).filter(Boolean).slice(0, 8) : [],
      pinned: Boolean(note?.pinned),
      updatedAt: cleanText(note?.updatedAt || note?.createdAt),
      createdAt: cleanText(note?.createdAt),
      duplicateCount: 1
    }))
    .filter((note) => note.id && note.titleSignature);

  notes.sort((a, b) => {
    const rankDelta = noteRank(a) - noteRank(b);
    if (rankDelta !== 0) return rankDelta;
    return toEpochMs(b.updatedAt || b.createdAt) - toEpochMs(a.updatedAt || a.createdAt);
  });

  const deduped = dedupeBySignature(notes, (note) => noteDedupeSignature(note));
  deduped.sort((a, b) => {
    const rankDelta = noteRank(a) - noteRank(b);
    if (rankDelta !== 0) return rankDelta;
    return toEpochMs(b.updatedAt || b.createdAt) - toEpochMs(a.updatedAt || a.createdAt);
  });

  return {
    total: notes.length,
    dedupedTotal: deduped.length,
    rows: deduped.slice(0, Math.max(1, Number(limit) || 4))
  };
}

function buildMobileInboxState(runtime = {}) {
  const approvals = buildApprovalRows(runtime.approvalLimit || 6);
  const tasks = buildTaskRows(runtime.taskLimit || 6);
  const notes = buildNoteRows(runtime.noteLimit || 4);

  const selectedChannel = cleanText(runtime?.connectionRouting?.selected?.channel || "");
  const pushSubscriptions = Number(runtime?.push?.subscriptions || 0);
  const pushState = runtime?.push?.enabled
    ? (pushSubscriptions > 0 ? "ready" : "needs_subscription")
    : "disabled";

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      pendingApprovals: approvals.total,
      visibleApprovals: approvals.rows.length,
      hiddenApprovals: Math.max(0, approvals.total - approvals.rows.length),
      activeTasks: tasks.dedupedTotal,
      visibleTasks: tasks.rows.length,
      hiddenTaskDuplicates: Math.max(0, tasks.total - tasks.dedupedTotal),
      visibleTaskDuplicates: tasks.rows.reduce((total, row) => total + Math.max(0, Number(row.duplicateCount || 1) - 1), 0),
      visibleNotes: notes.rows.length,
      hiddenNoteDuplicates: Math.max(0, notes.total - notes.dedupedTotal)
    },
    system: {
      selectedChannel,
      selectedReason: cleanText(runtime?.connectionRouting?.selected?.reason || ""),
      pushEnabled: Boolean(runtime?.push?.enabled),
      pushSubscriptions,
      pushState,
      controlArmed: Boolean(runtime?.control?.armed),
      guardianMode: cleanText(runtime?.guardian?.mode || ""),
      approvalMode: cleanText(runtime?.approvals?.mode || ""),
      approvalPreference: cleanText(runtime?.approvals?.preference || ""),
      workOrg: cleanText(runtime?.workOrgs?.activeOrg || ""),
      workOrgLabel: cleanText(runtime?.workOrgs?.activeOrgLabel || "")
    },
    approvals: approvals.rows,
    tasks: tasks.rows,
    notes: notes.rows
  };
}

module.exports = {
  buildMobileInboxState
};
