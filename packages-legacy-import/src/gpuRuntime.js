"use strict";

const childProcess = require("child_process");
const { resolveToolPaths } = require("./connectors/systemPaths");

function cleanText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function normalizeColonyId(value) {
  const normalized = cleanText(value || "sovereign")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "sovereign";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsvLine(line) {
  const text = String(line || "");
  const fields = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current.trim());
  return fields;
}

function parseCsvOutput(output = "", columns = []) {
  return String(output || "")
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter((line) => line && !/^no running processes found/i.test(line))
    .map((line) => {
      const values = parseCsvLine(line);
      return columns.reduce((acc, key, index) => {
        acc[key] = cleanText(values[index] || "");
        return acc;
      }, {});
    });
}

function buildGpuDevices(output) {
  return parseCsvOutput(output, [
    "index",
    "uuid",
    "name",
    "driverVersion",
    "memoryTotalMb",
    "memoryUsedMb",
    "memoryFreeMb",
    "utilizationGpuPct",
    "utilizationMemoryPct",
    "temperatureC",
    "performanceState",
    "powerDrawW",
    "powerLimitW"
  ]).map((row) => ({
    index: row.index,
    uuid: row.uuid,
    name: row.name,
    driverVersion: row.driverVersion,
    memoryTotalMb: toNumber(row.memoryTotalMb),
    memoryUsedMb: toNumber(row.memoryUsedMb),
    memoryFreeMb: toNumber(row.memoryFreeMb),
    utilizationGpuPct: toNumber(row.utilizationGpuPct),
    utilizationMemoryPct: toNumber(row.utilizationMemoryPct),
    temperatureC: toNumber(row.temperatureC),
    performanceState: row.performanceState,
    powerDrawW: toNumber(row.powerDrawW),
    powerLimitW: toNumber(row.powerLimitW)
  }));
}

function buildGpuProcesses(output) {
  return parseCsvOutput(output, [
    "gpuUuid",
    "pid",
    "processName",
    "usedMemoryMb"
  ]).map((row) => ({
    gpuUuid: row.gpuUuid,
    pid: row.pid,
    processName: row.processName,
    usedMemoryMb: toNumber(row.usedMemoryMb)
  }));
}

function queryNvidiaCsv(spawnSync, executable, args = []) {
  try {
    const result = spawnSync(executable, args, {
      windowsHide: true,
      encoding: "utf8",
      timeout: 10000
    });
    return {
      ok: Number(result.status) === 0,
      status: Number.isInteger(result.status) ? result.status : null,
      stdout: String(result.stdout || ""),
      stderr: cleanText(result.stderr || result.error?.message || "")
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: cleanText(error?.message || error)
    };
  }
}

function buildSummary(devices = [], processes = []) {
  return {
    totalDevices: devices.length,
    totalMemoryMb: devices.reduce((sum, row) => sum + toNumber(row.memoryTotalMb), 0),
    usedMemoryMb: devices.reduce((sum, row) => sum + toNumber(row.memoryUsedMb), 0),
    freeMemoryMb: devices.reduce((sum, row) => sum + toNumber(row.memoryFreeMb), 0),
    activeProcesses: processes.length
  };
}

function createGpuRuntime(deps = {}) {
  const resolveToolPathsFn = typeof deps.resolveToolPaths === "function" ? deps.resolveToolPaths : resolveToolPaths;
  const spawnSync = typeof deps.spawnSync === "function" ? deps.spawnSync : childProcess.spawnSync;
  const env = deps.env || process.env;

  function getStatus() {
    const toolPaths = resolveToolPathsFn();
    const colonyId = normalizeColonyId(env.ASOLARIA_NODE_ID || "sovereign");
    const gpuToolPath = cleanText(toolPaths?.nvidiaSmiPath || "");
    const base = {
      colonyId,
      controllerPid: process.pid,
      gpuToolPath,
      detected: false,
      available: Boolean(gpuToolPath),
      devices: [],
      processes: [],
      summary: buildSummary(),
      warnings: []
    };

    if (!gpuToolPath) {
      return {
        ok: true,
        reason: "gpu_tool_missing",
        ...base
      };
    }

    const gpuQuery = queryNvidiaCsv(spawnSync, gpuToolPath, [
      "--query-gpu=index,uuid,name,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,pstate,power.draw,power.limit",
      "--format=csv,noheader,nounits"
    ]);
    if (!gpuQuery.ok) {
      return {
        ok: false,
        reason: "gpu_query_failed",
        error: gpuQuery.stderr || "nvidia_smi_gpu_query_failed",
        ...base
      };
    }

    const devices = buildGpuDevices(gpuQuery.stdout);
    const processQuery = queryNvidiaCsv(spawnSync, gpuToolPath, [
      "--query-compute-apps=gpu_uuid,pid,process_name,used_gpu_memory",
      "--format=csv,noheader,nounits"
    ]);
    const warnings = [];
    if (!processQuery.ok && processQuery.stderr) {
      warnings.push("gpu_process_query_failed");
    }
    const processes = processQuery.ok ? buildGpuProcesses(processQuery.stdout) : [];
    return {
      ok: true,
      reason: devices.length ? "gpu_runtime_ready" : "gpu_not_detected",
      colonyId,
      controllerPid: process.pid,
      gpuToolPath,
      detected: devices.length > 0,
      available: true,
      devices,
      processes,
      summary: buildSummary(devices, processes),
      warnings
    };
  }

  return {
    getStatus
  };
}

module.exports = {
  buildGpuDevices,
  buildGpuProcesses,
  buildSummary,
  createGpuRuntime,
  normalizeColonyId,
  parseCsvLine,
  parseCsvOutput
};
