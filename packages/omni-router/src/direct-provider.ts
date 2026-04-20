// Direct-provider dispatch: OUR OWN wire, not routed through opencode serve.
// D11:ASSUMED — works against any OpenAI-compatible /chat/completions endpoint.
// Provers: Ollama (http://127.0.0.1:11434), llama.cpp-server, vLLM, OpenRouter,
// plus any cloud provider that speaks OpenAI chat-completions.
//
// Why this matters (LAW-014): opencode's /session/{id}/message carries opencode's
// agent/build system prompt (~9k tokens baseline). A direct OpenAI-compat call
// with empty or 1-sentence system prompt costs ~20-100 tokens per request. That's
// the 100-500× token-compression Jesse and big-pickle were pointing at.

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";

export interface DirectProviderConfig {
  /** e.g. "http://127.0.0.1:11434/v1/chat/completions" (Ollama OpenAI-compat)
   *  or   "http://127.0.0.1:8080/v1/chat/completions" (llama.cpp-server)
   *  or   "https://openrouter.ai/api/v1/chat/completions" */
  endpoint: string;
  /** model name e.g. "llama3.2:3b" or "openrouter/auto" */
  model: string;
  /** optional bearer token (OpenRouter, cloud providers). Anonymous for local. */
  bearerToken?: string;
  /** optional minimal system prompt. Keep short for LAW-014 compliance. */
  systemPrompt?: string;
  /** max tokens for the response. Default 200. */
  maxTokens?: number;
  /** request timeout ms. Default 60000. */
  timeoutMs?: number;
  /** optional extra headers (e.g. OpenRouter's HTTP-Referer/X-Title). */
  extraHeaders?: Record<string, string>;
}

export interface DirectProviderResult {
  ok: boolean;
  status: number;
  completion: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  error?: string;
  raw?: unknown;
}

/** Single OpenAI-compatible POST. No retries. No streaming. No tool-use wrappers. */
export async function dispatchDirect(config: DirectProviderConfig, userMessage: string): Promise<DirectProviderResult> {
  const started = Date.now();
  const url = new URL(config.endpoint);
  const isHttps = url.protocol === "https:";
  const port = url.port ? Number(url.port) : (isHttps ? 443 : 80);
  const timeoutMs = config.timeoutMs ?? 60000;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (config.systemPrompt && config.systemPrompt.length > 0) {
    messages.push({ role: "system", content: config.systemPrompt });
  }
  messages.push({ role: "user", content: userMessage });

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: config.maxTokens ?? 200,
    stream: false,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body).toString(),
    ...(config.extraHeaders ?? {}),
  };
  if (config.bearerToken) headers["Authorization"] = `Bearer ${config.bearerToken}`;

  const options = {
    host: url.hostname,
    port,
    path: url.pathname + url.search,
    method: "POST",
    headers,
    timeout: timeoutMs,
  };

  return new Promise<DirectProviderResult>((resolve) => {
    const req = (isHttps ? httpsRequest : httpRequest)(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        const latency_ms = Date.now() - started;
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          resolve({
            ok: false, status, completion: "",
            model: config.model, tokens_in: 0, tokens_out: 0, cost_usd: 0,
            latency_ms, error: `HTTP ${status}`, raw: parsed,
          });
          return;
        }
        const obj = parsed as Record<string, unknown>;
        const choices = obj?.choices as Array<{ message?: { content?: string } }> | undefined;
        const completion = choices?.[0]?.message?.content ?? "";
        const usage = obj?.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
        resolve({
          ok: true, status, completion: completion.trim(),
          model: (obj?.model as string) ?? config.model,
          tokens_in: usage?.prompt_tokens ?? 0,
          tokens_out: usage?.completion_tokens ?? 0,
          cost_usd: 0,  // direct mode doesn't compute cost; leave to caller
          latency_ms,
          raw: parsed,
        });
      });
      res.on("error", (err) => resolve({
        ok: false, status: 0, completion: "", model: config.model,
        tokens_in: 0, tokens_out: 0, cost_usd: 0,
        latency_ms: Date.now() - started, error: `response_error: ${err.message}`,
      }));
    });
    req.on("error", (err) => resolve({
      ok: false, status: 0, completion: "", model: config.model,
      tokens_in: 0, tokens_out: 0, cost_usd: 0,
      latency_ms: Date.now() - started, error: `request_error: ${err.message}`,
    }));
    req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.write(body);
    req.end();
  });
}

/** Probe a candidate OpenAI-compat endpoint. Does NOT consume quota on providers that charge. */
export async function probeDirect(endpoint: string): Promise<{ reachable: boolean; status?: number; error?: string; ms: number }> {
  const started = Date.now();
  try {
    const url = new URL(endpoint.replace(/\/chat\/completions$/, "/models"));
    const isHttps = url.protocol === "https:";
    return await new Promise<{ reachable: boolean; status?: number; error?: string; ms: number }>((resolve) => {
      const req = (isHttps ? httpsRequest : httpRequest)({
        host: url.hostname,
        port: url.port ? Number(url.port) : (isHttps ? 443 : 80),
        path: url.pathname,
        method: "GET",
        timeout: 5000,
      }, (res) => {
        // Drain the body so the socket closes cleanly
        res.on("data", () => { /* ignore */ });
        res.on("end", () => resolve({ reachable: true, status: res.statusCode, ms: Date.now() - started }));
      });
      req.on("error", (err) => resolve({ reachable: false, error: err.message, ms: Date.now() - started }));
      req.on("timeout", () => { req.destroy(); resolve({ reachable: false, error: "timeout", ms: Date.now() - started }); });
      req.end();
    });
  } catch (err) {
    return { reachable: false, error: (err as Error).message, ms: Date.now() - started };
  }
}
