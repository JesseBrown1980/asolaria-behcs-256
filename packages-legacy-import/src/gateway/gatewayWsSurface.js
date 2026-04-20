function wsTokenFromRequest(req) {
  try {
    const url = new URL(req.url || "", "http://localhost");
    const token = String(url.searchParams.get("token") || "").trim();
    if (token) {
      return token;
    }
  } catch {
    return "";
  }
  return "";
}

function originAllowed(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.length) {
    return false;
  }
  return allowedOrigins.includes(origin);
}

function createBroadcastToClients(clients, WebSocketImpl) {
  return function broadcastToClients(message) {
    const text = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocketImpl.OPEN) {
        client.send(text);
      }
    }
  };
}

function createGatewayWsConnectionHandler(input = {}) {
  const clients = input.clients;
  const allowedOrigins = Array.isArray(input.allowedOrigins) ? input.allowedOrigins : [];
  const gatewayToken = String(input.gatewayToken || "").trim();
  const messageValidator = input.messageValidator;
  const redactPayload = typeof input.redactPayload === "function" ? input.redactPayload : (value) => value;
  const routeWsMessage = typeof input.routeWsMessage === "function" ? input.routeWsMessage : () => {};

  return function handleGatewayWsConnection(ws, req) {
    const origin = String(req?.headers?.origin || "").trim();
    if (!originAllowed(origin, allowedOrigins)) {
      ws.close(1008, "origin_not_allowed");
      return;
    }

    const token = wsTokenFromRequest(req);
    if (!token || token !== gatewayToken) {
      ws.close(1008, "unauthorized");
      return;
    }

    clients.add(ws);
    ws.send(JSON.stringify({
      type: "hello",
      payload: {
        ok: true,
        service: "asolaria-gateway",
        at: new Date().toISOString()
      }
    }));

    ws.on("message", (raw) => {
      let parsed = null;
      try {
        parsed = JSON.parse(String(raw || ""));
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "Invalid JSON payload." }));
        return;
      }

      if (!messageValidator(parsed)) {
        ws.send(JSON.stringify({
          type: "error",
          error: "Invalid message schema.",
          details: messageValidator.errors || []
        }));
        return;
      }

      routeWsMessage(ws, redactPayload(parsed));
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  };
}

module.exports = {
  createBroadcastToClients,
  createGatewayWsConnectionHandler,
  originAllowed,
  wsTokenFromRequest
};
