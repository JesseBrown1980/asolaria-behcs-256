const fs = require("fs");
const path = require("path");
const { resolveDataPath } = require("./runtimePaths");
const { appendGraphEvent } = require("./graphRuntimeStore");

const taskLedgerPath = resolveDataPath("task-ledger.json");
const maxTasks = Math.max(100, Number(process.env.ASOLARIA_TASK_LEDGER_MAX_TASKS || 4000));
const maxEvents = Math.max(200, Number(process.env.ASOLARIA_TASK_LEDGER_MAX_EVENTS || 12000));

const TASK_STATUSES = [
  "planned",
  "ready",
  "in_progress",
  "blocked",
  "review",
  "done",
  "canceled",
  "archived"
];

const TASK_PRIORITIES = [
  "low",
  "normal",
  "high",
  "critical"
];
const TASK_LEDGER_VERSION = 2;

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(taskLedgerPath), { recursive: true });
}

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeProjectMarker(value) {
  return cleanText(value).slice(0, 80).toUpperCase();
}

function normalizeProjectScopeId(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function taskMatchesProjectMarker(task = {}, marker = "") {
  const normalizedMarker = normalizeProjectMarker(marker);
  if (!normalizedMarker) {
    return true;
  }
  const haystack = `${task.title || ""}\n${task.description || ""}`.toUpperCase();
  return haystack.includes(normalizedMarker);
}

function taskMatchesScope(task = {}, projectScope = "", marker = "") {
  const normalizedScope = normalizeProjectScopeId(projectScope);
  const normalizedMarker = normalizeProjectMarker(marker);
  if (!normalizedScope || normalizedScope === "all") {
    return taskMatchesProjectMarker(task, normalizedMarker);
  }
  const taskScope = normalizeProjectScopeId(task.projectScope || task.scope || task.projectId || "");
  if (taskScope && taskScope === normalizedScope) {
    return true;
  }
  if (normalizedMarker) {
    return taskMatchesProjectMarker(task, normalizedMarker);
  }
  return false;
}

function clipOneLine(value, maxChars = 220) {
  const text = cleanText(value).replace(/\s+/g, " ");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function toIsoDate(value, fallback = "") {
  const parsed = new Date(value || "");
  if (!Number.isFinite(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function hasField(source, key) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key));
}

function normalizeTags(input) {
  const raw = Array.isArray(input)
    ? input.map((item) => String(item || "")).join(",")
    : String(input || "");
  const tags = raw
    .split(/[,\n]/g)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, "_"))
    .filter((item) => /^[a-z0-9][a-z0-9_-]{0,35}$/i.test(item))
    .slice(0, 20);
  return Array.from(new Set(tags));
}

function normalizeTaskRef(value, maxChars = 120) {
  return cleanText(value).slice(0, maxChars);
}

function normalizeOriginKind(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]/g, "_")
    .slice(0, 80);
}

function normalizeStatus(value, fallback = "planned", strict = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (TASK_STATUSES.includes(normalized)) return normalized;
  if (strict && normalized) {
    throw new Error(`Invalid task status. Allowed: ${TASK_STATUSES.join(", ")}.`);
  }
  return fallback;
}

function normalizePriority(value, fallback = "normal", strict = false) {
  const normalized = String(value || "").trim().toLowerCase();
  if (TASK_PRIORITIES.includes(normalized)) return normalized;
  if (strict && normalized) {
    throw new Error(`Invalid task priority. Allowed: ${TASK_PRIORITIES.join(", ")}.`);
  }
  return fallback;
}

function normalizeProgress(value, fallback = 0, strict = false) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (strict) throw new Error("Task progress must be a number between 0 and 100.");
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createInitialDoc() {
  const now = new Date().toISOString();
  return {
    version: TASK_LEDGER_VERSION,
    createdAt: now,
    updatedAt: now,
    tasks: [],
    events: []
  };
}

function normalizeTask(raw, nowIso) {
  const source = raw && typeof raw === "object" ? raw : {};
  const createdAt = toIsoDate(source.createdAt, nowIso);
  const updatedAt = toIsoDate(source.updatedAt, createdAt || nowIso);
  const baseStatus = normalizeStatus(source.status, "planned", false);
  const archived = Boolean(source.archived) || baseStatus === "archived";
  const status = archived ? "archived" : baseStatus;
  const description = cleanText(source.description ?? source.text).slice(0, 12000);
  const title = clipOneLine(source.title, 220) || clipOneLine(description, 140) || "Task";
  const task = {
    id: cleanText(source.id || "").slice(0, 80) || makeId("task"),
    projectScope: normalizeProjectScopeId(source.projectScope || source.scope || source.projectId || ""),
    title,
    description,
    status,
    priority: normalizePriority(source.priority, "normal", false),
    owner: cleanText(source.owner ?? source.assignee).slice(0, 120),
    assigneeId: normalizeTaskRef(source.assigneeId),
    source: cleanText(source.source || "").slice(0, 80),
    originKind: normalizeOriginKind(source.originKind),
    originId: normalizeTaskRef(source.originId),
    lastLeaseId: normalizeTaskRef(source.lastLeaseId),
    tags: normalizeTags(source.tags),
    progress: normalizeProgress(source.progress, 0, false),
    dueAt: toIsoDate(source.dueAt, ""),
    startedAt: toIsoDate(source.startedAt, ""),
    completedAt: toIsoDate(source.completedAt, status === "done" ? updatedAt || nowIso : ""),
    archived,
    archivedAt: archived ? toIsoDate(source.archivedAt, updatedAt || nowIso) : "",
    createdAt,
    updatedAt
  };

  if (task.status === "in_progress" && !task.startedAt) {
    task.startedAt = task.updatedAt || nowIso;
  }
  if (task.status === "done") {
    if (!task.completedAt) task.completedAt = task.updatedAt || nowIso;
    if (task.progress < 100) task.progress = 100;
  } else if (task.progress === 100) {
    task.progress = 99;
  }
  return task;
}

function normalizeEvent(raw, nowIso) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    id: cleanText(source.id || "").slice(0, 80) || makeId("evt"),
    taskId: cleanText(source.taskId || "").slice(0, 80),
    type: cleanText(source.type || "task_event").toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 80) || "task_event",
    actor: cleanText(source.actor || source.by || "system").slice(0, 120) || "system",
    source: cleanText(source.source || "api").slice(0, 80) || "api",
    note: cleanText(source.note || source.message || "").slice(0, 6000),
    at: toIsoDate(source.at, nowIso),
    detail: source.detail && typeof source.detail === "object" ? source.detail : {}
  };
}

function normalizeDoc(parsed) {
  const now = new Date().toISOString();
  const source = parsed && typeof parsed === "object" ? parsed : {};
  const tasks = (Array.isArray(source.tasks) ? source.tasks : [])
    .map((task) => normalizeTask(task, now))
    .sort((a, b) => new Date(a.updatedAt || a.createdAt || 0).getTime() - new Date(b.updatedAt || b.createdAt || 0).getTime())
    .slice(-maxTasks);
  const events = (Array.isArray(source.events) ? source.events : [])
    .map((event) => normalizeEvent(event, now))
    .filter((event) => Boolean(event.taskId))
    .sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())
    .slice(-maxEvents);
  const createdAt = toIsoDate(source.createdAt, now);
  const latestTaskAt = tasks.length
    ? tasks[tasks.length - 1].updatedAt || tasks[tasks.length - 1].createdAt || createdAt
    : createdAt;
  const latestEventAt = events.length ? events[events.length - 1].at || createdAt : createdAt;
  const latestAt = new Date(latestTaskAt).getTime() >= new Date(latestEventAt).getTime()
    ? latestTaskAt
    : latestEventAt;
  return {
    version: TASK_LEDGER_VERSION,
    createdAt,
    updatedAt: toIsoDate(source.updatedAt, latestAt),
    tasks,
    events
  };
}

function writeDoc(doc) {
  ensureDir();
  const normalized = normalizeDoc(doc);
  const tempPath = `${taskLedgerPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(tempPath, taskLedgerPath);
  cache = normalized;
  return normalized;
}

function loadDoc() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(taskLedgerPath)) {
    cache = createInitialDoc();
    writeDoc(cache);
    return cache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(taskLedgerPath, "utf8"));
    cache = normalizeDoc(parsed);
    return cache;
  } catch (_error) {
    cache = createInitialDoc();
    writeDoc(cache);
    return cache;
  }
}

function summarizeDoc(doc) {
  const source = doc && typeof doc === "object" ? doc : loadDoc();
  const statusCounts = {};
  const priorityCounts = {};
  let openTasks = 0;
  let activeTasks = 0;
  let archivedTasks = 0;
  let latestTaskUpdatedAt = "";
  let latestEventAt = "";
  for (const task of source.tasks) {
    const status = normalizeStatus(task.status, "planned", false);
    const priority = normalizePriority(task.priority, "normal", false);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
    if (task.archived || status === "archived") {
      archivedTasks += 1;
    } else if (!["done", "canceled"].includes(status)) {
      openTasks += 1;
      activeTasks += 1;
    }
    const taskStamp = toIsoDate(task.updatedAt, "");
    if (taskStamp && (!latestTaskUpdatedAt || new Date(taskStamp).getTime() >= new Date(latestTaskUpdatedAt).getTime())) {
      latestTaskUpdatedAt = taskStamp;
    }
  }
  for (const event of source.events) {
    const eventStamp = toIsoDate(event.at, "");
    if (eventStamp && (!latestEventAt || new Date(eventStamp).getTime() >= new Date(latestEventAt).getTime())) {
      latestEventAt = eventStamp;
    }
  }
  return {
    totalTasks: source.tasks.length,
    openTasks,
    activeTasks,
    archivedTasks,
    eventsCount: source.events.length,
    latestTaskUpdatedAt,
    latestEventAt,
    statusCounts,
    priorityCounts
  };
}

function listTaskLedgerTasks(options = {}) {
  const doc = loadDoc();
  const limit = clampInt(options.limit, 100, 1, Math.max(1000, maxTasks));
  const includeArchived = hasField(options, "includeArchived") ? Boolean(options.includeArchived) : true;
  const status = String(options.status || "all").trim().toLowerCase();
  const priority = String(options.priority || "all").trim().toLowerCase();
  const query = cleanText(options.query || options.q || "").toLowerCase();
  const projectScope = normalizeProjectScopeId(options.projectScope || options.scope || "");
  const projectMarker = normalizeProjectMarker(options.projectMarker || "");
  let rows = doc.tasks.slice();
  if (!includeArchived) {
    rows = rows.filter((task) => !task.archived && task.status !== "archived");
  }
  if (status !== "all") {
    rows = rows.filter((task) => task.status === status);
  }
  if (priority !== "all") {
    rows = rows.filter((task) => task.priority === priority);
  }
  if (query) {
    rows = rows.filter((task) => {
      const haystack = [
        task.id,
        task.title,
        task.description,
        task.owner,
        task.assigneeId,
        task.source,
        task.originKind,
        task.originId,
        task.lastLeaseId,
        (task.tags || []).join(" ")
      ].join("\n").toLowerCase();
      return haystack.includes(query);
    });
  }
  if (projectScope || projectMarker) {
    rows = rows.filter((task) => taskMatchesScope(task, projectScope, projectMarker));
  }
  return rows
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
    .slice(0, limit)
    .map((task) => JSON.parse(JSON.stringify(task)));
}

function listTaskLedgerEvents(options = {}) {
  const doc = loadDoc();
  const limit = clampInt(options.limit, 120, 1, Math.max(2000, maxEvents));
  const taskId = cleanText(options.taskId || "");
  const type = cleanText(options.type || "").toLowerCase();
  const actor = cleanText(options.actor || "").toLowerCase();
  const since = Date.parse(options.since || "");
  const until = Date.parse(options.until || "");
  const projectScope = normalizeProjectScopeId(options.projectScope || options.scope || "");
  const projectMarker = normalizeProjectMarker(options.projectMarker || "");
  const scopedTaskIds = (projectScope || projectMarker)
    ? new Set(
      doc.tasks
        .filter((task) => taskMatchesScope(task, projectScope, projectMarker))
        .map((task) => String(task.id || ""))
    )
    : null;
  let rows = doc.events.slice();
  if (taskId) rows = rows.filter((event) => event.taskId === taskId);
  if (type && type !== "all") rows = rows.filter((event) => String(event.type || "").toLowerCase() === type);
  if (actor) rows = rows.filter((event) => String(event.actor || "").toLowerCase() === actor);
  if (Number.isFinite(since)) rows = rows.filter((event) => Date.parse(event.at || "") >= since);
  if (Number.isFinite(until)) rows = rows.filter((event) => Date.parse(event.at || "") <= until);
  if ((projectScope || projectMarker) && scopedTaskIds) {
    rows = rows.filter((event) => {
      const taskMatch = scopedTaskIds.has(String(event.taskId || ""));
      if (taskMatch) return true;
      if (projectScope) return false;
      return String(event.note || "").toUpperCase().includes(projectMarker);
    });
  }
  return rows
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
    .slice(0, limit)
    .map((event) => JSON.parse(JSON.stringify(event)));
}

function getTaskLedgerTask(id, options = {}) {
  const taskId = cleanText(id);
  if (!taskId) return null;
  const doc = loadDoc();
  const task = doc.tasks.find((row) => row.id === taskId);
  if (!task) return null;
  const clone = JSON.parse(JSON.stringify(task));
  if (Boolean(options.includeEvents)) {
    clone.events = listTaskLedgerEvents({ taskId, limit: clampInt(options.eventLimit, 100, 1, 2000) });
  }
  return clone;
}

function applyTaskPatch(task, patch, nowIso) {
  const next = { ...task };
  const changedFields = [];
  const mark = (field) => { if (!changedFields.includes(field)) changedFields.push(field); };
  if (hasField(patch, "title")) {
    const title = clipOneLine(patch.title, 220);
    if (!title) throw new Error("Task title cannot be empty.");
    if (title !== next.title) { next.title = title; mark("title"); }
  }
  if (hasField(patch, "description") || hasField(patch, "text")) {
    const description = cleanText(patch.description ?? patch.text).slice(0, 12000);
    if (description !== next.description) { next.description = description; mark("description"); }
  }
  if (hasField(patch, "status")) {
    const status = normalizeStatus(patch.status, next.status, true);
    if (status !== next.status) { next.status = status; mark("status"); }
  }
  if (hasField(patch, "priority")) {
    const priority = normalizePriority(patch.priority, next.priority, true);
    if (priority !== next.priority) { next.priority = priority; mark("priority"); }
  }
  if (hasField(patch, "owner") || hasField(patch, "assignee")) {
    const owner = cleanText(patch.owner ?? patch.assignee).slice(0, 120);
    if (owner !== next.owner) { next.owner = owner; mark("owner"); }
  }
  if (hasField(patch, "assigneeId")) {
    const assigneeId = normalizeTaskRef(patch.assigneeId);
    if (assigneeId !== next.assigneeId) { next.assigneeId = assigneeId; mark("assigneeId"); }
  }
  if (hasField(patch, "source")) {
    const source = cleanText(patch.source).slice(0, 80);
    if (source !== next.source) { next.source = source; mark("source"); }
  }
  if (hasField(patch, "originKind")) {
    const originKind = normalizeOriginKind(patch.originKind);
    if (originKind !== next.originKind) { next.originKind = originKind; mark("originKind"); }
  }
  if (hasField(patch, "originId")) {
    const originId = normalizeTaskRef(patch.originId);
    if (originId !== next.originId) { next.originId = originId; mark("originId"); }
  }
  if (hasField(patch, "lastLeaseId")) {
    const lastLeaseId = normalizeTaskRef(patch.lastLeaseId);
    if (lastLeaseId !== next.lastLeaseId) { next.lastLeaseId = lastLeaseId; mark("lastLeaseId"); }
  }
  if (hasField(patch, "tags")) {
    const tags = normalizeTags(patch.tags);
    if (JSON.stringify(tags) !== JSON.stringify(next.tags || [])) { next.tags = tags; mark("tags"); }
  }
  if (hasField(patch, "progress")) {
    const progress = normalizeProgress(patch.progress, next.progress, true);
    if (progress !== next.progress) { next.progress = progress; mark("progress"); }
  }
  if (hasField(patch, "dueAt")) {
    const dueAt = toIsoDate(patch.dueAt, "");
    if (dueAt !== next.dueAt) { next.dueAt = dueAt; mark("dueAt"); }
  }
  if (hasField(patch, "projectScope") || hasField(patch, "scope")) {
    const projectScope = normalizeProjectScopeId(patch.projectScope ?? patch.scope);
    if (projectScope !== normalizeProjectScopeId(next.projectScope || "")) {
      next.projectScope = projectScope;
      mark("projectScope");
    }
  }
  if (hasField(patch, "archived")) {
    const archived = Boolean(patch.archived);
    if (archived !== next.archived) { next.archived = archived; mark("archived"); }
  }

  if (next.status === "in_progress" && !next.startedAt) next.startedAt = nowIso;
  if (next.status === "done") {
    if (!next.completedAt) next.completedAt = nowIso;
    if (!hasField(patch, "progress")) next.progress = 100;
  } else if (hasField(patch, "status")) {
    next.completedAt = "";
  }
  if (next.status === "archived" && (!hasField(patch, "archived") || Boolean(patch.archived))) next.archived = true;
  if (next.archived) {
    if (!next.archivedAt) next.archivedAt = nowIso;
    if (!["done", "canceled", "archived"].includes(next.status)) next.status = "archived";
  } else {
    next.archivedAt = "";
    if (next.status === "archived") next.status = "planned";
  }
  if (next.status !== "done" && next.progress === 100) next.progress = 99;
  if (changedFields.length > 0) next.updatedAt = nowIso;
  return { changed: changedFields.length > 0, changedFields, task: next };
}

function appendEvent(doc, input = {}) {
  const nowIso = toIsoDate(input.at, new Date().toISOString());
  const event = normalizeEvent({
    id: input.id || makeId("evt"),
    taskId: input.taskId,
    type: input.type || "task_event",
    actor: input.actor || "api",
    source: input.source || "api",
    note: input.note || "",
    detail: input.detail || {},
    at: nowIso
  }, nowIso);
  doc.events.push(event);
  if (doc.events.length > maxEvents) {
    doc.events = doc.events.slice(-maxEvents);
  }
  doc.updatedAt = nowIso;
  return event;
}

function mapTaskPriorityToCriticality(priority = "") {
  const normalized = String(priority || "").trim().toLowerCase();
  if (normalized === "critical") return "high";
  if (normalized === "high") return "medium";
  if (normalized === "normal") return "low";
  return normalized || "low";
}

function buildTaskGraphTarget(task = {}, taskId = "") {
  return {
    type: "task",
    id: String(task.id || taskId || "").trim(),
    label: String(task.title || "").trim(),
    domain: String(task.projectScope || "").trim(),
    criticality: mapTaskPriorityToCriticality(task.priority || "")
  };
}

function createTaskLedgerTask(input = {}) {
  const doc = loadDoc();
  const nowIso = new Date().toISOString();
  const title = clipOneLine(input.title, 220);
  const description = cleanText(input.description ?? input.text).slice(0, 12000);
  if (!title && !description) {
    throw new Error("Task requires a title or description.");
  }
  const task = normalizeTask({
    id: makeId("task"),
    title: title || clipOneLine(description, 140) || "Task",
    description,
    status: hasField(input, "status") ? input.status : "planned",
    priority: hasField(input, "priority") ? input.priority : "normal",
    projectScope: input.projectScope ?? input.scope,
    owner: input.owner ?? input.assignee,
    assigneeId: input.assigneeId,
    source: input.source || "api",
    originKind: input.originKind,
    originId: input.originId,
    lastLeaseId: input.lastLeaseId,
    tags: input.tags,
    progress: hasField(input, "progress") ? input.progress : 0,
    dueAt: input.dueAt,
    createdAt: nowIso,
    updatedAt: nowIso
  }, nowIso);
  doc.tasks.push(task);
  if (doc.tasks.length > maxTasks) {
    doc.tasks = doc.tasks.slice(-maxTasks);
  }
  const event = appendEvent(doc, {
    taskId: task.id,
    type: "task_created",
    actor: cleanText(input.actor || input.by || "api").slice(0, 120),
    source: cleanText(input.source || "api").slice(0, 80),
    note: cleanText(input.note || `Created task \"${task.title}\".`).slice(0, 6000),
    detail: {
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      originKind: task.originKind,
      originId: task.originId,
      lastLeaseId: task.lastLeaseId
    },
    at: nowIso
  });
  writeDoc(doc);
  appendGraphEvent({
    component: "task-ledger",
    category: "task_ledger",
    action: "task_created",
    actor: {
      type: "task_actor",
      id: cleanText(input.actor || input.by || input.source || "api").slice(0, 120)
    },
    target: buildTaskGraphTarget(task),
    context: {
      source: task.source || "",
      projectScope: task.projectScope || "",
      status: task.status || "",
      priority: task.priority || ""
    },
    detail: {
      eventId: event.id,
      note: event.note
    }
  });
  return { task: JSON.parse(JSON.stringify(task)), event: JSON.parse(JSON.stringify(event)), summary: summarizeDoc(doc) };
}

function updateTaskLedgerTask(taskId, patch = {}, options = {}) {
  const id = cleanText(taskId);
  if (!id) throw new Error("Task id is required.");
  const doc = loadDoc();
  const index = doc.tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error("Task not found.");
  const nowIso = new Date().toISOString();
  const updated = applyTaskPatch(doc.tasks[index], patch, nowIso);
  if (updated.changed) {
    doc.tasks[index] = updated.task;
  }
  const shouldEvent = updated.changed || cleanText(options.note || "") || cleanText(options.type || "");
  let event = null;
  if (shouldEvent) {
    const eventType = cleanText(options.type || "")
      || (updated.changedFields.includes("status") ? "task_status_changed" : updated.changedFields.includes("archived") ? "task_archived" : "task_updated");
    const eventNote = cleanText(options.note || "") || `Updated fields: ${updated.changedFields.join(", ") || "none"}.`;
    event = appendEvent(doc, {
      taskId: id,
      type: eventType,
      actor: cleanText(options.actor || options.by || "api").slice(0, 120),
      source: cleanText(options.source || "api").slice(0, 80),
      note: eventNote,
      detail: { changedFields: updated.changedFields },
      at: nowIso
    });
  }
  if (updated.changed || event) {
    const persistedDoc = writeDoc(doc);
    const persistedTask = persistedDoc.tasks.find((task) => task.id === id) || doc.tasks[index];
    appendGraphEvent({
      component: "task-ledger",
      category: "task_ledger",
      action: String(event?.type || "task_updated"),
      actor: {
        type: "task_actor",
        id: cleanText(options.actor || options.by || options.source || "api").slice(0, 120)
      },
      target: buildTaskGraphTarget(persistedTask, id),
      context: {
        source: String(options.source || "api").slice(0, 80),
        projectScope: persistedTask?.projectScope || "",
        status: persistedTask?.status || "",
        priority: persistedTask?.priority || ""
      },
      detail: {
        changedFields: updated.changedFields,
        note: event?.note || ""
      }
    });
    return {
      task: JSON.parse(JSON.stringify(persistedTask)),
      event: event ? JSON.parse(JSON.stringify(event)) : null,
      changedFields: updated.changedFields.slice(0, 40),
      summary: summarizeDoc(persistedDoc)
    };
  }
  return {
    task: JSON.parse(JSON.stringify(doc.tasks[index])),
    event: event ? JSON.parse(JSON.stringify(event)) : null,
    changedFields: updated.changedFields.slice(0, 40),
    summary: summarizeDoc(doc)
  };
}

function deleteTaskLedgerTask(taskId, options = {}) {
  const id = cleanText(taskId);
  if (!id) throw new Error("Task id is required.");
  const hard = Boolean(options.hard);
  const doc = loadDoc();
  const index = doc.tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error("Task not found.");
  const nowIso = new Date().toISOString();
  if (hard) {
    const removed = doc.tasks.splice(index, 1)[0];
    const event = appendEvent(doc, {
      taskId: id,
      type: "task_deleted",
      actor: cleanText(options.actor || "api"),
      source: cleanText(options.source || "api"),
      note: cleanText(options.note || `Hard-deleted task \"${removed.title}\".`),
      detail: { mode: "hard" },
      at: nowIso
    });
    writeDoc(doc);
    appendGraphEvent({
      component: "task-ledger",
      category: "task_ledger",
      action: "task_deleted",
      actor: {
        type: "task_actor",
        id: cleanText(options.actor || options.source || "api").slice(0, 120)
      },
      target: buildTaskGraphTarget(removed, id),
      context: {
        source: cleanText(options.source || "api").slice(0, 80),
        status: "deleted"
      },
      detail: {
        mode: "hard",
        eventId: event.id
      }
    });
    return { mode: "hard", removed, event, summary: summarizeDoc(doc) };
  }
  const updated = applyTaskPatch(doc.tasks[index], { status: "archived", archived: true }, nowIso);
  doc.tasks[index] = updated.task;
  const event = appendEvent(doc, {
    taskId: id,
    type: "task_archived",
    actor: cleanText(options.actor || "api"),
    source: cleanText(options.source || "api"),
    note: cleanText(options.note || `Archived task \"${updated.task.title}\".`),
    detail: { changedFields: updated.changedFields },
    at: nowIso
  });
  writeDoc(doc);
  appendGraphEvent({
    component: "task-ledger",
    category: "task_ledger",
    action: "task_archived",
    actor: {
      type: "task_actor",
      id: cleanText(options.actor || options.source || "api").slice(0, 120)
    },
    target: buildTaskGraphTarget(doc.tasks[index], id),
    context: {
      source: cleanText(options.source || "api").slice(0, 80),
      status: doc.tasks[index]?.status || "archived"
    },
    detail: {
      changedFields: updated.changedFields,
      eventId: event.id
    }
  });
  return { mode: "soft", task: doc.tasks[index], event, changedFields: updated.changedFields.slice(0, 40), summary: summarizeDoc(doc) };
}

function addTaskLedgerEvent(taskId, input = {}) {
  const id = cleanText(taskId);
  if (!id) throw new Error("Task id is required.");
  const doc = loadDoc();
  const index = doc.tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error("Task not found.");
  const nowIso = new Date().toISOString();
  const patch = {};
  const patchFields = [
    "title",
    "description",
    "text",
    "status",
    "priority",
    "owner",
    "assignee",
    "assigneeId",
    "source",
    "originKind",
    "originId",
    "lastLeaseId",
    "tags",
    "progress",
    "dueAt",
    "projectScope",
    "scope",
    "archived"
  ];
  for (const field of patchFields) {
    if (hasField(input, field)) patch[field] = input[field];
  }
  const patched = applyTaskPatch(doc.tasks[index], patch, nowIso);
  if (patched.changed) {
    doc.tasks[index] = patched.task;
  } else {
    doc.tasks[index].updatedAt = nowIso;
  }
  const type = cleanText(input.type || "")
    || (patched.changedFields.includes("status") ? "task_status_changed" : patched.changedFields.includes("archived") ? "task_archived" : "task_event");
  const note = cleanText(input.note || input.message || "")
    || (patched.changed ? `Updated fields: ${patched.changedFields.join(", ")}.` : "Task event logged.");
  const event = appendEvent(doc, {
    taskId: id,
    type,
    actor: cleanText(input.actor || input.by || "api"),
    source: cleanText(input.source || "api"),
    note,
    detail: { changedFields: patched.changedFields, ...(input.detail && typeof input.detail === "object" ? input.detail : {}) },
    at: nowIso
  });
  const persistedDoc = writeDoc(doc);
  const persistedTask = persistedDoc.tasks.find((task) => task.id === id) || doc.tasks[index];
  appendGraphEvent({
    component: "task-ledger",
    category: "task_ledger",
    action: String(type || "task_event"),
    actor: {
      type: "task_actor",
      id: cleanText(input.actor || input.by || input.source || "api").slice(0, 120)
    },
    target: buildTaskGraphTarget(persistedTask, id),
    context: {
      source: cleanText(input.source || "api").slice(0, 80),
      projectScope: persistedTask?.projectScope || "",
      status: persistedTask?.status || "",
      priority: persistedTask?.priority || ""
    },
    detail: {
      changedFields: patched.changedFields,
      eventId: event.id,
      note
    }
  });
  return {
    task: JSON.parse(JSON.stringify(persistedTask)),
    event: JSON.parse(JSON.stringify(event)),
    changedFields: patched.changedFields.slice(0, 40),
    summary: summarizeDoc(persistedDoc)
  };
}

function getTaskLedgerSummary() {
  return summarizeDoc(loadDoc());
}

function getTaskLedgerState(options = {}) {
  const doc = loadDoc();
  const projectScope = normalizeProjectScopeId(options.projectScope || options.scope || "");
  const projectMarker = normalizeProjectMarker(options.projectMarker || "");
  const taskFilters = {
    includeArchived: hasField(options, "includeArchived") ? Boolean(options.includeArchived) : true,
    status: options.taskStatus || options.status || "all",
    priority: options.taskPriority || options.priority || "all",
    query: options.taskQuery || options.q || "",
    projectScope,
    projectMarker
  };
  const eventFilters = {
    taskId: options.eventTaskId,
    type: options.eventType,
    actor: options.eventActor,
    since: options.eventSince,
    until: options.eventUntil,
    projectScope,
    projectMarker
  };
  const allScopedTasks = listTaskLedgerTasks({
    ...taskFilters,
    limit: Math.max(1000, maxTasks)
  });
  const allScopedEvents = listTaskLedgerEvents({
    ...eventFilters,
    limit: Math.max(2000, maxEvents)
  });
  const taskLimit = clampInt(options.taskLimit ?? options.limit, 80, 1, Math.max(1000, maxTasks));
  const eventLimit = clampInt(options.eventLimit, 120, 1, Math.max(2000, maxEvents));
  const tasks = allScopedTasks.slice(0, taskLimit);
  const events = allScopedEvents.slice(0, eventLimit);
  const scopedSummary = summarizeDoc({
    tasks: allScopedTasks,
    events: allScopedEvents
  });
  return {
    version: doc.version,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    summary: scopedSummary,
    globalSummary: summarizeDoc(doc),
    tasks,
    events
  };
}

function readTaskLedgerDocument() {
  return JSON.parse(JSON.stringify(loadDoc()));
}

function writeTaskLedgerDocument(doc) {
  return writeDoc(doc);
}

module.exports = {
  TASK_STATUSES,
  TASK_PRIORITIES,
  taskLedgerPath,
  getTaskLedgerSummary,
  getTaskLedgerState,
  readTaskLedgerDocument,
  writeTaskLedgerDocument,
  listTaskLedgerTasks,
  getTaskLedgerTask,
  createTaskLedgerTask,
  updateTaskLedgerTask,
  deleteTaskLedgerTask,
  listTaskLedgerEvents,
  addTaskLedgerEvent
};
