const dgram = require("dgram");
const { getSecret, setSecret, deleteSecret } = require("../secureVault");

const WOL_SECRET_NAME = "power.wol";

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeMac(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const cleaned = raw.replace(/[^a-f0-9]/g, "");
  if (cleaned.length !== 12) return "";
  if (!/^[a-f0-9]{12}$/.test(cleaned)) return "";
  return cleaned;
}

function formatMac(cleaned) {
  const mac = normalizeMac(cleaned);
  if (!mac) return "";
  return mac.match(/.{2}/g).join(":");
}

function normalizeDeviceName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "255.255.255.255";
  if (/^[0-9.]{7,15}$/.test(raw)) return raw;
  if (/^[a-z0-9.-]{1,200}$/i.test(raw)) return raw;
  return "255.255.255.255";
}

function normalizeDevice(input = {}) {
  const name = normalizeDeviceName(input.name || "");
  const mac = normalizeMac(input.mac || input.macAddress || "");
  if (!name || !mac) {
    return null;
  }
  const host = normalizeHost(input.host || input.broadcast || input.broadcastHost || "");
  const port = clampInt(input.port, 9, 1, 65535);
  return {
    name,
    mac,
    host,
    port,
    label: String(input.label || "").trim().slice(0, 80)
  };
}

function loadWolConfig() {
  const secret = getSecret(WOL_SECRET_NAME, { namespace: "owner" });
  const devices = Array.isArray(secret?.value?.devices) ? secret.value.devices : [];
  const normalized = devices
    .map((row) => normalizeDevice(row))
    .filter(Boolean);
  return {
    updatedAt: secret?.updatedAt || null,
    devices: normalized
  };
}

function getWolConfigSummary() {
  const config = loadWolConfig();
  return {
    configured: config.devices.length > 0,
    updatedAt: config.updatedAt,
    devices: config.devices.map((device) => ({
      name: device.name,
      label: device.label || "",
      mac: formatMac(device.mac),
      host: device.host,
      port: device.port
    }))
  };
}

function setWolConfig(input = {}) {
  if (input?.clear === true) {
    deleteSecret(WOL_SECRET_NAME, { namespace: "owner" });
    return getWolConfigSummary();
  }
  const devices = Array.isArray(input.devices) ? input.devices : [];
  const normalized = devices
    .map((row) => normalizeDevice(row))
    .filter(Boolean)
    .slice(0, 30);
  setSecret(WOL_SECRET_NAME, {
    devices: normalized,
    updatedAt: new Date().toISOString()
  }, {
    app: "Asolaria",
    component: "wol",
    credentialOwner: "owner",
    actor: "owner",
    updatedBy: "api"
  }, { namespace: "owner" });
  return getWolConfigSummary();
}

function buildMagicPacket(macClean) {
  const mac = normalizeMac(macClean);
  if (!mac) {
    throw new Error("Invalid MAC address.");
  }
  const macBytes = Buffer.from(mac, "hex");
  const packet = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i += 1) {
    macBytes.copy(packet, 6 + i * 6);
  }
  return packet;
}

function resolveDeviceByName(name) {
  const key = normalizeDeviceName(name);
  if (!key) {
    throw new Error("WOL device name is required.");
  }
  const config = loadWolConfig();
  const found = config.devices.find((device) => device.name === key);
  if (!found) {
    throw new Error(`WOL device not found: ${key}`);
  }
  return found;
}

async function sendWakeOnLan(input = {}) {
  const device = input.name
    ? resolveDeviceByName(input.name)
    : normalizeDevice({ name: "adhoc", mac: input.mac, host: input.host, port: input.port });
  if (!device || !device.mac) {
    throw new Error("Wake-on-LAN requires a configured device name or a MAC address.");
  }
  const packet = buildMagicPacket(device.mac);

  const socket = dgram.createSocket("udp4");
  const host = device.host || "255.255.255.255";
  const port = clampInt(device.port, 9, 1, 65535);

  await new Promise((resolve, reject) => {
    socket.once("error", (err) => reject(err));
    socket.bind(() => {
      try {
        socket.setBroadcast(true);
      } catch (_error) {
        // Non-fatal; continue.
      }
      socket.send(packet, 0, packet.length, port, host, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }).finally(() => {
    try {
      socket.close();
    } catch (_error) {
      // ignore
    }
  });

  return {
    at: new Date().toISOString(),
    sentTo: `${host}:${port}`,
    bytes: packet.length,
    device: {
      name: device.name,
      label: device.label || "",
      mac: formatMac(device.mac),
      host,
      port
    }
  };
}

function manifest() {
  return {
    id: "wol",
    version: "1.0.0",
    description: "Wake-on-LAN connector that manages device configurations and sends UDP magic packets to wake remote machines",
    capabilities: ["wake-on-lan", "device-management", "udp-broadcast"],
    readScopes: ["vault:power.wol"],
    writeScopes: ["vault:power.wol", "network:udp-broadcast"],
    approvalRequired: false,
    healthCheck: false,
    retrySemantics: "none",
    timeoutMs: 30000,
    secretRequirements: ["power.wol"],
    sideEffects: ["udp-packet-send", "vault-write-on-config-update"],
    failureModes: ["invalid-mac-address", "device-not-found", "udp-send-error"],
    emittedEvents: []
  };
}

module.exports = {
  WOL_SECRET_NAME,
  getWolConfigSummary,
  setWolConfig,
  sendWakeOnLan,
  manifest
};

