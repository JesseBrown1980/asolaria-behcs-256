import fs from "fs";
import net from "net";
import http from "http";
import https from "https";
import { Aedes } from "aedes";
import { WebSocketServer, createWebSocketStream } from "ws";

function normalizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeInt(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function readPassphrase(passPath) {
  const targetPath = normalizeText(passPath, "");
  if (!targetPath || !fs.existsSync(targetPath)) {
    return "";
  }
  try {
    return normalizeText(fs.readFileSync(targetPath, "utf8"), "");
  } catch (_error) {
    return "";
  }
}

function createInfoServer(label, protocol, host, port) {
  return http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: true,
      service: "asolaria_mqtt_local_broker",
      label,
      protocol,
      host,
      port,
      at: new Date().toISOString()
    }));
  });
}

function attachWsBroker(server, broker, pathName) {
  const wss = new WebSocketServer({
    server,
    path: pathName
  });
  wss.on("connection", (socket) => {
    const stream = createWebSocketStream(socket, { binary: true });
    broker.handle(stream);
  });
  return wss;
}

async function main() {
  const host = normalizeText(process.env.ASOLARIA_MQTT_BIND_HOST, "127.0.0.1");
  const tcpPort = normalizeInt(process.env.ASOLARIA_MQTT_TCP_PORT, 18883, 1, 65535);
  const wsPort = normalizeInt(process.env.ASOLARIA_MQTT_WS_PORT, 18884, 1, 65535);
  const wssPort = normalizeInt(process.env.ASOLARIA_MQTT_WSS_PORT, 18885, 1, 65535);
  const wsPath = normalizeText(process.env.ASOLARIA_MQTT_WS_PATH, "/mqtt");
  const pfxPath = normalizeText(process.env.ASOLARIA_MQTT_PFX_PATH, "");
  const passPath = normalizeText(process.env.ASOLARIA_MQTT_PFX_PASS_PATH, "");

  const broker = await Aedes.createBroker();
  const servers = [];

  const tcpServer = net.createServer((socket) => broker.handle(socket));
  await new Promise((resolve, reject) => {
    tcpServer.once("error", reject);
    tcpServer.listen(tcpPort, host, resolve);
  });
  servers.push(tcpServer);

  const wsServer = createInfoServer("ws", "ws", host, wsPort);
  attachWsBroker(wsServer, broker, wsPath);
  await new Promise((resolve, reject) => {
    wsServer.once("error", reject);
    wsServer.listen(wsPort, host, resolve);
  });
  servers.push(wsServer);

  let wssEnabled = false;
  if (pfxPath && fs.existsSync(pfxPath)) {
    const passphrase = readPassphrase(passPath);
    const httpsOptions = passphrase
      ? { pfx: fs.readFileSync(pfxPath), passphrase }
      : { pfx: fs.readFileSync(pfxPath) };
    const wssServer = https.createServer(httpsOptions, (_req, res) => {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        ok: true,
        service: "asolaria_mqtt_local_broker",
        label: "wss",
        protocol: "wss",
        host,
        port: wssPort,
        path: wsPath,
        at: new Date().toISOString()
      }));
    });
    attachWsBroker(wssServer, broker, wsPath);
    await new Promise((resolve, reject) => {
      wssServer.once("error", reject);
      wssServer.listen(wssPort, host, resolve);
    });
    servers.push(wssServer);
    wssEnabled = true;
  }

  const shutdown = async () => {
    for (const server of servers) {
      try {
        await new Promise((resolve) => server.close(() => resolve()));
      } catch (_error) {
        // ignore
      }
    }
    try {
      await broker.close();
    } catch (_error) {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(JSON.stringify({
    ok: true,
    service: "asolaria_mqtt_local_broker",
    host,
    tcpPort,
    wsPort,
    wssPort,
    wsPath,
    wssEnabled,
    startedAt: new Date().toISOString()
  }));
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error || "mqtt_broker_start_failed"));
  process.exit(1);
});
