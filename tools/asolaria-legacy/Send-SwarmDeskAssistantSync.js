#!/usr/bin/env node
"use strict";

const { buildSwarmDeskExportPayload } = require("../src/swarmDeskExport");

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) {
      return String(arg.slice(prefix.length)).trim();
    }
  }
  return fallback;
}

async function main() {
  const baseUrl = readArg("baseUrl", process.env.MADNESS_BASE_URL || "https://madnessinteractive.cc");
  const rawAuth = readArg("authToken", process.env.MADNESS_AUTH_TOKEN || process.env.MADNESS_AUTHORIZATION || "");
  if (!rawAuth) {
    throw new Error("Missing dashboard auth token. Set MADNESS_AUTH_TOKEN or pass --authToken=...");
  }
  const authHeader = rawAuth.startsWith("Bearer ") ? rawAuth : `Bearer ${rawAuth}`;
  const payload = buildSwarmDeskExportPayload({});

  const providerRes = await fetch(`${baseUrl}/api/ai-provider-keys`, {
    headers: {
      Authorization: authHeader
    }
  });
  if (!providerRes.ok) {
    const text = await providerRes.text();
    throw new Error(`Provider config request failed: ${providerRes.status} ${text.slice(0, 200)}`);
  }
  const providerData = await providerRes.json();
  const providers = Array.isArray(providerData?.providers) ? providerData.providers : [];
  const provider = String(readArg("provider", providers[0]?.provider || "")).trim();
  if (!provider) {
    throw new Error("No configured AI provider was returned by the dashboard.");
  }

  const body = {
    provider,
    messages: payload.assistantSync.messages,
    options: {
      temperature: 0.2,
      maxTokens: 12000
    }
  };

  const chatRes = await fetch(`${baseUrl}/api/ai/chat-completion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader
    },
    body: JSON.stringify(body)
  });
  const chatText = await chatRes.text();
  let chatData = null;
  try {
    chatData = chatText ? JSON.parse(chatText) : null;
  } catch (_error) {
    chatData = { raw: chatText };
  }
  if (!chatRes.ok) {
    throw new Error(`Chat completion failed: ${chatRes.status} ${String(chatText || "").slice(0, 240)}`);
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    baseUrl,
    provider,
    response: chatData
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error?.message || error || "swarmdesk_sync_failed")}\n`);
  process.exitCode = 1;
});
