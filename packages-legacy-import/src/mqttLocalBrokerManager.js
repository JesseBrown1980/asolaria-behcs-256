const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const net = require("net");
const { resolveLogPath } = require("./runtimePaths");

const BROKER_SCRIPT_PATH = path.join(__dirname, "..", "services", "mqtt-broker", "server.mjs");
const BROKER_PID_PATH = resolveLogPath("mqtt-broker.pid");
const BROKER_STDOUT_LOG = resolveLogPath("mqtt-broker.out.log");
const BROKER_STDERR_LOG = resolveLogPath("mqtt-broker.err.log");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_TCP_PORT = 18883;
const DEFAULT_WS_PORT = 18884;
const DEFAULT_WSS_PORT = 18885;
const DEFAULT_WS_PATH = "/mqtt";

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function fileExists(targetPath) {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch (_error) {
    return false;
  }
}

function readPidFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const parsed = Number(String(fs.readFileSync(filePath, "utf8") || "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch (_error) {
    return 0;
  }
}

function writePidFile(filePath, pid) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${Number(pid || 0) || 0}\n`, "utf8");
}

function removeFileQuietly(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_error) {
    // ignore
  }
}

function isPidRunning(pid) {
  const value = Number(pid || 0);
  if (!Number.isFinite(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function checkPort(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch (_error) {
        // ignore
      }
      resolve(Boolean(ok));
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function readHttpsPassphrase(passPath) {
  const targetPath = normalizeText(passPath, "");
  if (!targetPath || !fileExists(targetPath)) return "";
  try {
    return normalizeText(fs.readFileSync(targetPath, "utf8"), "");
  } catch (_error) {
    return "";
  }
}

function resolveBrokerConfig() {
  const host = normalizeText(process.env.ASOLARIA_MQTT_BIND_HOST, DEFAULT_HOST);
  const tcpPort = normalizeInt(process.env.ASOLARIA_MQTT_TCP_PORT, DEFAULT_TCP_PORT, 1, 65535);
  const wsPort = normalizeInt(process.env.ASOLARIA_MQTT_WS_PORT, DEFAULT_WS_PORT, 1, 65535);
  const wssPort = normalizeInt(process.env.ASOLARIA_MQTT_WSS_PORT, DEFAULT_WSS_PORT, 1, 65535);
  const wsPath = normalizeText(process.env.ASOLARIA_MQTT_WS_PATH, DEFAULT_WS_PATH);
  const pfxPath = normalizeText(process.env.ASOLARIA_HTTPS_PFX_PATH || path.join(__dirname, "..", "certs", "asolaria-local.pfx"), "");
  const passPath = normalizeText(process.env.ASOLARIA_HTTPS_PFX_PASS_PATH || path.join(__dirname, "..", "certs", "asolaria-local.pass"), "");
  const passphrase = readHttpsPassphrase(passPath);
  return {
    host,
    tcpPort,
    wsPort,
    wssPort,
    wsPath,
    pfxPath,
    passPath,
    hasPfx: fileExists(pfxPath),
    hasPassphrase: Boolean(passphrase)
  };
}

async function getLocalMqttBrokerStatus() {
  const config = resolveBrokerConfig();
  const pid = readPidFile(BROKER_PID_PATH);
  const running = isPidRunning(pid);
  const [tcpOnline, wsOnline, wssOnline] = await Promise.all([
    checkPort(config.host, config.tcpPort),
    checkPort(config.host, config.wsPort),
    config.hasPfx ? checkPort(config.host, config.wssPort) : Promise.resolve(false)
  ]);
  return {
    ok: true,
    managed: true,
    scriptPath: BROKER_SCRIPT_PATH,
    pidFilePath: BROKER_PID_PATH,
    pid,
    running,
    host: config.host,
    tcp: {
      protocol: "mqtt",
      port: config.tcpPort,
      url: `mqtt://${config.host}:${config.tcpPort}`,
      online: tcpOnline
    },
    ws: {
      protocol: "ws",
      port: config.wsPort,
      path: config.wsPath,
      url: `ws://${config.host}:${config.wsPort}${config.wsPath}`,
      online: wsOnline
    },
    wss: {
      enabled: config.hasPfx,
      protocol: "wss",
      port: config.wssPort,
      path: config.wsPath,
      url: config.hasPfx ? `wss://${config.host}:${config.wssPort}${config.wsPath}` : "",
      online: wssOnline,
      certPath: config.hasPfx ? config.pfxPath : "",
      passPath: config.hasPfx ? config.passPath : ""
    },
    logs: {
      stdout: BROKER_STDOUT_LOG,
      stderr: BROKER_STDERR_LOG
    }
  };
}

async function waitForBrokerReady(config, timeoutMs = 12000) {
  const deadline = Date.now() + Math.max(2000, timeoutMs);
  while (Date.now() < deadline) {
    const [tcpOnline, wsOnline, wssOnline] = await Promise.all([
      checkPort(config.host, config.tcpPort),
      checkPort(config.host, config.wsPort),
      config.hasPfx ? checkPort(config.host, config.wssPort) : Promise.resolve(true)
    ]);
    if (tcpOnline && wsOnline && wssOnline) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function ensureLocalMqttBroker() {
  const config = resolveBrokerConfig();
  const current = await getLocalMqttBrokerStatus();
  if (current.running && current.tcp.online && current.ws.online && (!current.wss.enabled || current.wss.online)) {
    return current;
  }

  if (!fileExists(BROKER_SCRIPT_PATH)) {
    throw new Error("local_mqtt_broker_script_missing");
  }

  const env = {
    ...process.env,
    ASOLARIA_MQTT_BIND_HOST: config.host,
    ASOLARIA_MQTT_TCP_PORT: String(config.tcpPort),
    ASOLARIA_MQTT_WS_PORT: String(config.wsPort),
    ASOLARIA_MQTT_WSS_PORT: String(config.wssPort),
    ASOLARIA_MQTT_WS_PATH: config.wsPath,
    ASOLARIA_MQTT_PFX_PATH: config.pfxPath,
    ASOLARIA_MQTT_PFX_PASS_PATH: config.passPath
  };

  fs.mkdirSync(path.dirname(BROKER_STDOUT_LOG), { recursive: true });
  const stdoutFd = fs.openSync(BROKER_STDOUT_LOG, "a");
  const stderrFd = fs.openSync(BROKER_STDERR_LOG, "a");
  const child = childProcess.spawn(process.execPath, [BROKER_SCRIPT_PATH], {
    cwd: path.dirname(BROKER_SCRIPT_PATH),
    env,
    windowsHide: true,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd]
  });
  child.unref();
  writePidFile(BROKER_PID_PATH, child.pid);
  const ready = await waitForBrokerReady(config, 15000);
  if (!ready) {
    throw new Error("local_mqtt_broker_start_timeout");
  }
  return getLocalMqttBrokerStatus();
}

function stopLocalMqttBroker() {
  const pid = readPidFile(BROKER_PID_PATH);
  if (!pid || !isPidRunning(pid)) {
    removeFileQuietly(BROKER_PID_PATH);
    return {
      ok: true,
      stopped: false
    };
  }
  try {
    childProcess.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 15000
    });
  } catch (_error) {
    try {
      process.kill(pid);
    } catch (__error) {
      // ignore
    }
  }
  removeFileQuietly(BROKER_PID_PATH);
  return {
    ok: true,
    stopped: true,
    pid
  };
}

module.exports = {
  resolveBrokerConfig,
  getLocalMqttBrokerStatus,
  ensureLocalMqttBroker,
  stopLocalMqttBroker
};
