#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const POLICY_RELATIVE_PATH = path.join('data', 'behcs', 'maps', 'behcs-file-cap-policy.json');
const RESOURCE_BUDGET_RELATIVE_PATH = path.join('data', 'behcs', 'resource-budget-snapshot.json');
const RESOURCE_BUDGET_BUILDER_RELATIVE_PATH = path.join('sovereignty', 'src', 'resourceBudgetSnapshot.js');

const DEFAULT_POLICY = Object.freeze({
  policyId: 'behcs-file-cap.v1',
  scope: 'BEHCS important-data, codex, cube, state, and garbage-collector surfaces on C:',
  mode: 'fail_closed',
  maxTrackedFiles: 2000,
  warnAt: 1800,
  gcTriggerMessages: 2000,
  labels: {
    spec: 'IX-700',
    dialect: 'IX',
    hyperlanguage: '47D',
    wave: 'cube_cube_cubed',
    room: 'whiteroom',
    translation: 'glyph',
    boundary: 'boundary_typed',
    inferenceSurface: 'gnn_local',
    chain: 'ix-chain-fabricate',
    skillId: 'behcs_file_cap',
    toolId: 'behcs_file_cap',
  },
  surfaces: [
    { id: 'behcs_index', label: 'BEHCS Index', relativePath: 'data/behcs/index', recursive: true },
    { id: 'behcs_codex', label: 'BEHCS Codex', relativePath: 'data/behcs/codex', recursive: true },
    { id: 'behcs_cubes', label: 'BEHCS Cubes', relativePath: 'data/behcs/cubes', recursive: true },
    { id: 'ix_codex', label: 'IX Codex', relativePath: 'data/behcs/sovereignty/ix/codex', recursive: true },
    { id: 'ix_cubes', label: 'IX Cubes', relativePath: 'data/behcs/sovereignty/ix/cubes', recursive: true },
    { id: 'behcs_state', label: 'BEHCS State', relativePath: 'data/behcs/state', recursive: true },
    { id: 'ix_state', label: 'IX State', relativePath: 'data/behcs/sovereignty/ix/state', recursive: true },
    { id: 'behcs_gc', label: 'BEHCS Garbage Collector', relativePath: 'data/behcs/garbage-collector', recursive: true },
  ],
  allowed: [
    'count_tracked_files',
    'warn_near_1800',
    'deny_new_file_creation_above_2000',
    'label_guard_status_in_language_outputs',
    'surface_guard_status_in_gc_reports',
  ],
  denied: [
    'silent_overflow',
    'unbounded_cube_generation',
    'unbounded_gc_artifact_growth',
    'new_file_creation_without_file_cap_check',
  ],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function safeNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clipText(value, max = 160) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim().slice(0, Math.max(1, max));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (_) {
    return null;
  }
}

function isFreshTimestamp(timestamp, maxAgeMs = 5 * 60 * 1000) {
  const epoch = new Date(timestamp || 0).getTime();
  if (!Number.isFinite(epoch) || epoch <= 0) return false;
  return Date.now() - epoch <= maxAgeMs;
}

function loadResourceBudgetSnapshot(rootDir = ROOT) {
  const snapshotPath = path.join(rootDir, RESOURCE_BUDGET_RELATIVE_PATH);
  const direct = readJson(snapshotPath);
  if (isPlainObject(direct)) {
    return {
      available: true,
      source: 'snapshot_file',
      snapshotPath,
      snapshot: direct,
    };
  }
  try {
    const builderPath = path.join(rootDir, RESOURCE_BUDGET_BUILDER_RELATIVE_PATH);
    const builder = require(builderPath);
    if (builder && typeof builder.buildResourceBudgetSnapshot === 'function') {
      const built = builder.buildResourceBudgetSnapshot({ instanceRoot: rootDir, write: false });
      if (isPlainObject(built)) {
        return {
          available: true,
          source: 'snapshot_builder',
          snapshotPath,
          snapshot: built,
        };
      }
    }
  } catch (_) {}
  return {
    available: false,
    source: 'unavailable',
    snapshotPath,
    snapshot: null,
  };
}

function summarizeTaskManager(rootDir = ROOT) {
  const loaded = loadResourceBudgetSnapshot(rootDir);
  if (!loaded.available || !isPlainObject(loaded.snapshot)) {
    return {
      available: false,
      source: loaded.source,
      snapshotPath: loaded.snapshotPath,
      snapshotGeneratedAt: '',
      sampledAt: '',
      fresh: false,
      coverage: 'none',
      pressureLevel: 'unknown',
      pressureScore: null,
      dispatchReady: false,
      linkedDevices: 0,
      busiestProcess: null,
      managedFamilies: {},
      namedFamilyTotal: 0,
    };
  }

  const snapshot = loaded.snapshot;
  const summary = isPlainObject(snapshot.summary) ? snapshot.summary : {};
  const devices = Array.isArray(snapshot.devices) ? snapshot.devices : [];
  const linkedDevices = devices.filter((device) => {
    return isPlainObject(device) && isPlainObject(device.taskManager) && String(device.taskManager.source || '').trim().length > 0;
  });
  const preferredDevice = linkedDevices.find((device) => String(device.id || '').toLowerCase() === 'acer') || linkedDevices[0] || null;
  const taskManager = preferredDevice && isPlainObject(preferredDevice.taskManager) ? preferredDevice.taskManager : {};
  const topProcessRows = Array.isArray(taskManager.topProcessRows) ? taskManager.topProcessRows : [];
  const busiestProcess = topProcessRows
    .map((row) => ({
      name: clipText(row.name || 'unknown', 80),
      family: clipText(row.family || row.name || 'unknown', 80),
      pid: safeInt(row.pid, 0) || null,
      workingSetMb: safeNumber(row.workingSetMb, null),
    }))
    .filter((row) => row.name)
    .sort((left, right) => (right.workingSetMb || 0) - (left.workingSetMb || 0))[0] || null;

  const rawCounts = isPlainObject(taskManager.runtimeProcessCounts) ? taskManager.runtimeProcessCounts : {};
  const managedFamilies = {};
  for (const [rawKey, rawValue] of Object.entries(rawCounts)) {
    const count = Math.max(0, safeInt(rawValue, 0));
    if (count <= 0) continue;
    managedFamilies[clipText(rawKey, 40)] = count;
  }
  const namedFamilyTotal = Object.values(managedFamilies).reduce((sum, value) => sum + safeInt(value, 0), 0);
  const snapshotGeneratedAt = clipText(snapshot.generatedAt || '', 64);
  const sampledAt = clipText(taskManager.sampledAt || snapshotGeneratedAt, 64);
  const pressureLevel = clipText(
    summary.pressureLevel
      || (preferredDevice && preferredDevice.pressure && preferredDevice.pressure.level)
      || 'unknown',
    24
  ) || 'unknown';
  const pressureScore = safeNumber(
    summary.pressureScore
      || (preferredDevice && preferredDevice.pressure && preferredDevice.pressure.score),
    null
  );
  return {
    available: linkedDevices.length > 0,
    source: clipText(taskManager.source || loaded.source, 48),
    snapshotPath: loaded.snapshotPath,
    snapshotGeneratedAt,
    sampledAt,
    fresh: isFreshTimestamp(sampledAt || snapshotGeneratedAt),
    coverage: clipText(taskManager.coverage || 'none', 40) || 'none',
    pressureLevel,
    pressureScore,
    dispatchReady: Boolean(summary.dispatchReady),
    linkedDevices: safeInt(summary.taskManagerLinkedDevices, linkedDevices.length),
    busiestProcess,
    managedFamilies,
    namedFamilyTotal,
  };
}

function buildProcessAdvisory(fileCapState, taskManager) {
  const hasTaskManager = Boolean(taskManager && taskManager.available);
  const pressureLevel = clipText(taskManager && taskManager.pressureLevel ? taskManager.pressureLevel : 'unknown', 24);
  const remaining = Math.max(0, safeInt(fileCapState.remaining, 0));
  let mode = 'steady';
  let recommendedCreates = Math.min(remaining, 64);
  let checkpointEvery = 32;
  let gcAction = 'observe';
  let exploreAction = 'normal_batches';
  let rationale = 'file_cap_and_process_nominal';

  if (fileCapState.status === 'deny') {
    mode = 'hold';
    recommendedCreates = 0;
    checkpointEvery = 1;
    gcAction = 'trigger_now';
    exploreAction = 'halt_new_files';
    rationale = 'file_cap_exceeded';
  } else if (fileCapState.status === 'warn') {
    mode = 'cautious';
    recommendedCreates = Math.min(remaining, 16);
    checkpointEvery = 8;
    gcAction = 'prepare_gc_before_next_gulp';
    exploreAction = 'micro_batches';
    rationale = 'file_cap_warning_band';
  }

  if (hasTaskManager) {
    if (pressureLevel === 'critical') {
      mode = 'hold';
      recommendedCreates = Math.min(recommendedCreates, 1);
      checkpointEvery = 1;
      gcAction = 'trigger_now';
      exploreAction = 'pause_until_pressure_recovers';
      rationale = 'critical_process_pressure';
    } else if (pressureLevel === 'high') {
      mode = mode === 'hold' ? mode : 'throttle';
      recommendedCreates = Math.min(recommendedCreates, 6);
      checkpointEvery = Math.min(checkpointEvery, 3);
      gcAction = gcAction === 'trigger_now' ? gcAction : 'trigger_preemptive';
      exploreAction = 'bounded_micro_batches';
      rationale = rationale === 'file_cap_exceeded' ? rationale : 'high_process_pressure';
    } else if (pressureLevel === 'medium') {
      mode = mode === 'hold' ? mode : 'cautious';
      recommendedCreates = Math.min(recommendedCreates, 12);
      checkpointEvery = Math.min(checkpointEvery, 6);
      gcAction = gcAction === 'trigger_now' ? gcAction : 'prepare_gc_window';
      exploreAction = 'small_batches_with_checkpoints';
      rationale = rationale === 'file_cap_exceeded' ? rationale : 'medium_process_pressure';
    }
  } else {
    recommendedCreates = Math.min(recommendedCreates, 12);
    checkpointEvery = Math.min(checkpointEvery, 6);
    gcAction = gcAction === 'trigger_now' ? gcAction : 'guard_only_observe';
    exploreAction = mode === 'hold' ? 'halt_new_files' : 'guard_only_small_batches';
    rationale = rationale === 'file_cap_exceeded' ? rationale : 'task_manager_unavailable_guard_only';
  }

  return {
    processAware: hasTaskManager,
    mode,
    rationale,
    exploration: {
      mode: exploreAction,
      recommendedCreates,
      checkpointEvery,
      useProcessTruth: hasTaskManager,
    },
    gc: {
      action: gcAction,
      trigger: gcAction === 'trigger_now' || gcAction === 'trigger_preemptive',
      reason: rationale,
    },
  };
}

function renderFamilySummary(families = {}) {
  if (!isPlainObject(families)) return 'none';
  const pairs = Object.entries(families)
    .filter(([, value]) => safeInt(value, 0) > 0)
    .sort((left, right) => safeInt(right[1], 0) - safeInt(left[1], 0))
    .slice(0, 6)
    .map(([key, value]) => `${clipText(key, 24)}:${safeInt(value, 0)}`);
  return pairs.length > 0 ? pairs.join('|') : 'none';
}

function loadFileCapPolicy(rootDir = ROOT) {
  const policyPath = path.join(rootDir, POLICY_RELATIVE_PATH);
  const policy = clone(DEFAULT_POLICY);
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  } catch (_) {}
  if (isPlainObject(raw)) {
    if (raw.policyId) policy.policyId = clipText(raw.policyId, 80);
    if (raw.scope) policy.scope = clipText(raw.scope, 220);
    if (raw.mode) policy.mode = clipText(raw.mode, 40);
    policy.maxTrackedFiles = Math.max(1, safeInt(raw.maxTrackedFiles, policy.maxTrackedFiles));
    policy.warnAt = Math.max(1, Math.min(policy.maxTrackedFiles, safeInt(raw.warnAt, policy.warnAt)));
    policy.gcTriggerMessages = Math.max(1, safeInt(raw.gcTriggerMessages, policy.gcTriggerMessages));
    if (isPlainObject(raw.labels)) policy.labels = { ...policy.labels, ...raw.labels };
    if (Array.isArray(raw.surfaces) && raw.surfaces.length > 0) {
      policy.surfaces = raw.surfaces
        .filter((surface) => isPlainObject(surface) && surface.id && surface.relativePath)
        .map((surface) => ({
          id: clipText(surface.id, 80),
          label: clipText(surface.label || surface.id, 120),
          relativePath: String(surface.relativePath).replace(/[\\/]+/g, path.sep),
          recursive: surface.recursive !== false,
        }));
    }
    if (Array.isArray(raw.allowed)) policy.allowed = raw.allowed.map((item) => clipText(item, 80)).filter(Boolean);
    if (Array.isArray(raw.denied)) policy.denied = raw.denied.map((item) => clipText(item, 80)).filter(Boolean);
  }
  policy.policyPath = policyPath;
  return policy;
}

function countFiles(dir, recursive = true) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile()) {
        count += 1;
      } else if (entry.isDirectory() && recursive) {
        stack.push(fullPath);
      }
    }
  }
  return count;
}

function buildLanguage(status, reason, policy, trackedFiles, projectedFiles, remaining, processContext = null) {
  const stateWord = status === 'deny' ? 'blocked' : status === 'warn' ? 'executing' : 'completed';
  const actionWord = status === 'deny' ? 'hold_new_files' : status === 'warn' ? 'approach_cap' : 'count';
  const language = {
    human: clipText(`File cap guard ${status}: ${projectedFiles}/${policy.maxTrackedFiles} tracked files after planned writes ${reason ? `for ${reason}` : ''}; remaining ${remaining}.`, 220),
    agent: clipText(`(chief, guard.file_cap, omniverse.file_budget, 2, runtime, hookwall, ${stateWord}, [${actionWord}], ${policy.labels.wave || 'single'}, ${policy.labels.dialect || 'IX'}, log, persistent, ${policy.labels.room || 'whiteroom'}, light)`, 220),
    device: clipText(`file_cap status=${status} tracked=${trackedFiles} projected=${projectedFiles} max=${policy.maxTrackedFiles} remaining=${remaining} reason=${reason || 'runtime'}`, 220),
  };
  if (!processContext) return language;

  const taskManager = processContext.taskManager || {};
  const advisory = processContext.advisory || {};
  const busiest = taskManager.busiestProcess || null;
  const busyText = busiest && busiest.name
    ? `${busiest.name}${Number.isFinite(busiest.workingSetMb) ? `:${busiest.workingSetMb.toFixed(1)}MB` : ''}`
    : 'none';
  language.process = {
    human: clipText(
      `Task Manager ${taskManager.available ? 'linked' : 'missing'}: pressure ${taskManager.pressureLevel || 'unknown'}${Number.isFinite(taskManager.pressureScore) ? ` (${taskManager.pressureScore.toFixed(1)})` : ''}, busiest ${busyText}, advisory ${advisory.mode || 'steady'}/${advisory.exploration && advisory.exploration.mode ? advisory.exploration.mode : 'normal'}.`,
      220
    ),
    agent: clipText(
      `(chief, guard.process_truth, ${taskManager.available ? 'taskmanager.linked' : 'taskmanager.missing'}, pressure.${taskManager.pressureLevel || 'unknown'}, advise.${advisory.mode || 'steady'}, gc.${advisory.gc && advisory.gc.action ? advisory.gc.action : 'observe'}, ${policy.labels.translation || 'glyph'}, ${policy.labels.wave || 'single'}, log, persistent)`,
      220
    ),
    device: clipText(
      `task_manager linked=${taskManager.available ? 'yes' : 'no'} pressure=${taskManager.pressureLevel || 'unknown'} source=${taskManager.source || 'none'} families=${renderFamilySummary(taskManager.managedFamilies)} advisory=${advisory.mode || 'steady'} gc=${advisory.gc && advisory.gc.action ? advisory.gc.action : 'observe'}`,
      220
    ),
  };
  return language;
}

function evaluateFileCap(options = {}) {
  const rootDir = options.rootDir || ROOT;
  const policy = options.policy || loadFileCapPolicy(rootDir);
  const reason = clipText(options.reason || 'runtime', 120);
  const plannedCreates = Math.max(0, safeInt(options.plannedCreates, 0));
  const requestedIds = Array.isArray(options.surfaceIds) && options.surfaceIds.length > 0
    ? new Set(options.surfaceIds.map((item) => String(item)))
    : null;

  const surfaces = policy.surfaces
    .filter((surface) => !requestedIds || requestedIds.has(surface.id))
    .map((surface) => {
      const absolutePath = path.join(rootDir, surface.relativePath);
      const fileCount = countFiles(absolutePath, surface.recursive !== false);
      return {
        id: surface.id,
        label: surface.label,
        relativePath: surface.relativePath.replace(/[\\/]+/g, '/'),
        absolutePath,
        recursive: surface.recursive !== false,
        fileCount,
      };
    });

  const trackedFiles = surfaces.reduce((sum, surface) => sum + surface.fileCount, 0);
  const projectedFiles = trackedFiles + plannedCreates;
  const remaining = Math.max(0, policy.maxTrackedFiles - projectedFiles);
  const status = projectedFiles > policy.maxTrackedFiles ? 'deny' : projectedFiles >= policy.warnAt ? 'warn' : 'pass';
  const taskManager = summarizeTaskManager(rootDir);
  const advisory = buildProcessAdvisory({
    status,
    trackedFiles,
    projectedFiles,
    remaining,
  }, taskManager);
  const labels = {
    ...policy.labels,
    reason,
    status,
    taskManager: taskManager.available ? 'linked' : 'missing',
    taskPressure: taskManager.pressureLevel || 'unknown',
    processMode: advisory.mode,
    gcAction: advisory.gc.action,
    explorationMode: advisory.exploration.mode,
  };

  return {
    policyId: policy.policyId,
    scope: policy.scope,
    mode: policy.mode,
    reason,
    status,
    trackedFiles,
    projectedFiles,
    plannedCreates,
    maxTrackedFiles: policy.maxTrackedFiles,
    warnAt: policy.warnAt,
    gcTriggerMessages: policy.gcTriggerMessages,
    remaining,
    policyPath: policy.policyPath,
    allowed: policy.allowed.slice(),
    denied: policy.denied.slice(),
    labels,
    language: buildLanguage(status, reason, policy, trackedFiles, projectedFiles, remaining, { taskManager, advisory }),
    taskManager,
    processAware: advisory.processAware,
    advisoryMode: advisory.mode,
    explorationAdvisory: advisory.exploration,
    gcAdvisory: advisory.gc,
    surfaces,
  };
}

function summarizeFileCapStatus(status) {
  if (!status) return null;
  return {
    policyId: status.policyId,
    scope: status.scope,
    mode: status.mode,
    reason: status.reason,
    status: status.status,
    trackedFiles: status.trackedFiles,
    projectedFiles: status.projectedFiles,
    plannedCreates: status.plannedCreates,
    maxTrackedFiles: status.maxTrackedFiles,
    warnAt: status.warnAt,
    gcTriggerMessages: status.gcTriggerMessages,
    remaining: status.remaining,
    labels: { ...status.labels },
    language: { ...status.language },
    taskManager: status.taskManager ? { ...status.taskManager } : null,
    processAware: Boolean(status.processAware),
    advisoryMode: status.advisoryMode || '',
    explorationAdvisory: status.explorationAdvisory ? { ...status.explorationAdvisory } : null,
    gcAdvisory: status.gcAdvisory ? { ...status.gcAdvisory } : null,
    surfaces: (status.surfaces || []).map((surface) => ({
      id: surface.id,
      label: surface.label,
      relativePath: surface.relativePath,
      fileCount: surface.fileCount,
    })),
  };
}

function assertFileCap(options = {}) {
  const status = evaluateFileCap(options);
  if (status.status === 'deny') {
    const error = new Error(`BEHCS file cap exceeded: ${status.projectedFiles}/${status.maxTrackedFiles} tracked files for ${status.reason}`);
    error.code = 'BEHCS_FILE_CAP_EXCEEDED';
    error.fileCap = status;
    throw error;
  }
  return status;
}

module.exports = {
  ROOT,
  loadFileCapPolicy,
  evaluateFileCap,
  summarizeFileCapStatus,
  assertFileCap,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const plannedArg = args.find((arg) => arg.startsWith('--planned='));
  const reasonArg = args.find((arg) => arg.startsWith('--reason='));
  const plannedCreates = plannedArg ? safeInt(plannedArg.split('=').slice(1).join('='), 0) : 0;
  const reason = reasonArg ? reasonArg.split('=').slice(1).join('=') : 'cli';
  const status = evaluateFileCap({ plannedCreates, reason });
  if (json) {
    console.log(JSON.stringify(summarizeFileCapStatus(status), null, 2));
  } else {
    console.log(`[behcs-file-cap] ${status.status.toUpperCase()} ${status.projectedFiles}/${status.maxTrackedFiles} tracked files (planned +${status.plannedCreates}, remaining ${status.remaining})`);
    for (const surface of status.surfaces) {
      console.log(`  ${surface.id}: ${surface.fileCount} (${surface.relativePath})`);
    }
  }
  process.exit(status.status === 'deny' ? 2 : 0);
}
