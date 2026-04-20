// Probe common OpenAI-compat endpoints on localhost. Zero quota consumed.
// Reports which ones are reachable. Proves our direct-provider wire works
// as soon as any local inference server is running (Ollama, llama.cpp-server, vLLM).

import { probeDirect, dispatchDirect } from "../src/direct-provider.ts";

const CANDIDATES = [
  { name: "Ollama",            url: "http://127.0.0.1:11434/v1/chat/completions",  model: "llama3.2:3b" },
  { name: "llama.cpp-server",  url: "http://127.0.0.1:8080/v1/chat/completions",   model: "local" },
  { name: "vLLM",              url: "http://127.0.0.1:8000/v1/chat/completions",   model: "local" },
  { name: "LM Studio",         url: "http://127.0.0.1:1234/v1/chat/completions",   model: "local" },
  { name: "KoboldCpp",         url: "http://127.0.0.1:5001/v1/chat/completions",   model: "local" },
];

async function main(): Promise<void> {
  console.log("[direct-probe] probing local OpenAI-compat endpoints (zero quota cost)...\n");
  const results: Array<{ name: string; url: string; model: string; reachable: boolean; status?: number; error?: string; ms: number; completion?: string; tokens_in?: number; tokens_out?: number }> = [];

  for (const c of CANDIDATES) {
    const probe = await probeDirect(c.url);
    const row: typeof results[number] = { name: c.name, url: c.url, model: c.model, reachable: probe.reachable, status: probe.status, error: probe.error, ms: probe.ms };
    if (probe.reachable && probe.status && probe.status >= 200 && probe.status < 400) {
      // Try an actual completion
      console.log(`[direct-probe] ${c.name} reachable; testing completion...`);
      const resp = await dispatchDirect({
        endpoint: c.url,
        model: c.model,
        systemPrompt: "",  // LAW-014: minimum tokens
        maxTokens: 50,
      }, "Reply with only the single word: OK");
      if (resp.ok) {
        row.completion = resp.completion;
        row.tokens_in = resp.tokens_in;
        row.tokens_out = resp.tokens_out;
      } else {
        row.error = resp.error;
      }
    }
    results.push(row);
    console.log(`[direct-probe] ${c.name}: reachable=${probe.reachable} status=${probe.status ?? "-"} ${probe.error ? `err=${probe.error}` : ""}`);
  }

  console.log("\n=== FINAL_JSON ===");
  console.log(JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));

  const anyReachable = results.some((r) => r.reachable);
  const anyCompleted = results.some((r) => r.completion && r.completion.length > 0);
  process.exit(anyCompleted ? 0 : (anyReachable ? 3 : 4));
}

main().catch((err) => { console.error("[direct-probe] fatal:", err); process.exit(2); });
