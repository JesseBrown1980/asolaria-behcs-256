const fs = require("fs");
const path = require("path");

function cleanValue(value) {
  return String(value || "").trim();
}

function createSpawnPidRegistry(input = {}) {
  const pidRegistryPath = String(input.pidRegistryPath || "").trim();
  if (!pidRegistryPath) {
    throw new Error("pidRegistryPath is required.");
  }

  function generateVirtualPid(role) {
    const now = new Date();
    const ts = now.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);
    const hash = Buffer.from(`${role}-${ts}-${process.pid}`).toString("base64url").slice(0, 4);
    return `${role}-${ts}-${hash}`;
  }

  function readPidRegistry() {
    try {
      if (!fs.existsSync(pidRegistryPath)) return { active: {}, history: [] };
      return JSON.parse(fs.readFileSync(pidRegistryPath, "utf8"));
    } catch (_) {
      return { active: {}, history: [] };
    }
  }

  function writePidRegistry(registry) {
    const dir = path.dirname(pidRegistryPath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${pidRegistryPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temp, JSON.stringify(registry, null, 2), "utf8");
    fs.renameSync(temp, pidRegistryPath);
  }

  function registerSpawnPid(role, spawnPid, identity = {}) {
    const registry = readPidRegistry();
    const entry = {
      spawnPid,
      role,
      agentId: cleanValue(identity.agentId),
      responsibilityTier: cleanValue(identity.responsibilityTier),
      lifecycle: cleanValue(identity.lifecycle) || "ephemeral",
      spawnedAt: new Date().toISOString(),
      status: "active"
    };

    if (registry.active[role]) {
      const old = registry.active[role];
      old.status = "despawned";
      old.despawnedAt = new Date().toISOString();
      registry.history.push(old);
      if (registry.history.length > 100) {
        registry.history = registry.history.slice(-100);
      }
    }

    registry.active[role] = entry;
    writePidRegistry(registry);
    return entry;
  }

  function despawnPid(role) {
    const registry = readPidRegistry();
    if (registry.active[role]) {
      const entry = registry.active[role];
      entry.status = "despawned";
      entry.despawnedAt = new Date().toISOString();
      registry.history.push(entry);
      delete registry.active[role];
      if (registry.history.length > 100) {
        registry.history = registry.history.slice(-100);
      }
      writePidRegistry(registry);
      return entry;
    }
    return null;
  }

  function getActiveSpawns() {
    const registry = readPidRegistry();
    return Object.entries(registry.active).map(([role, entry]) => ({
      role,
      ...entry
    }));
  }

  return {
    generateVirtualPid,
    readPidRegistry,
    registerSpawnPid,
    despawnPid,
    getActiveSpawns
  };
}

module.exports = {
  createSpawnPidRegistry
};
