// packages/dashboard/src/aggregator.ts — N-001 federation health aggregator
//
// Polls every known peer /health endpoint, collects:
//   - ok/port/service per peer
//   - process_started_at + source_commit + uptime_s (G-090 staleness)
// Returns a structured federation snapshot for dashboards/monitoring.
//
// Detects:
//   - peers down (timeout/connection-refused)
//   - stale peers (source_commit older than a reference or uptime
//     older than a max-age)

export interface PeerEndpoint {
  name: string;         // human label
  url: string;          // full /health URL
  bearer?: string;      // optional auth token
  reference_commit?: string;  // if set, warn when peer's source_commit differs
}

export interface PeerHealth {
  name: string;
  url: string;
  ok: boolean;
  http_status: number | null;
  latency_ms: number;
  service?: string;
  port?: number;
  apex?: string;
  process_started_at?: string;
  source_commit?: string;
  uptime_s?: number;
  error?: string;
  // derived
  stale_vs_reference: boolean;
  uptime_exceeds_max: boolean;
}

export interface AggregatorInput {
  peers: PeerEndpoint[];
  timeout_ms?: number;
  max_uptime_s?: number;  // warn if uptime_s > this
  transport?: (url: string, bearer?: string) => Promise<{ ok: boolean; status: number; body: string; latency_ms: number }>;
}

export interface FederationSnapshot {
  polled_at: string;
  peer_count: number;
  ok_count: number;
  fail_count: number;
  stale_count: number;
  peers: PeerHealth[];
  by_commit: Record<string, string[]>;  // commit → peer names
  glyph_sentence: string;
}

async function defaultTransport(url: string, bearer?: string) {
  const t0 = Date.now();
  const headers: Record<string, string> = {};
  if (bearer) headers["Authorization"] = "Bearer " + bearer;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message, latency_ms: Date.now() - t0 };
  }
}

export async function pollFederation(input: AggregatorInput): Promise<FederationSnapshot> {
  const polled_at = new Date().toISOString();
  const transport = input.transport ?? defaultTransport;
  const maxUptime = input.max_uptime_s ?? Number.POSITIVE_INFINITY;

  const results = await Promise.all(input.peers.map(async p => {
    const r = await transport(p.url, p.bearer);
    let parsed: any = {};
    try { parsed = JSON.parse(r.body); } catch {}

    const health: PeerHealth = {
      name: p.name,
      url: p.url,
      ok: r.ok && (parsed.ok === undefined || parsed.ok === true),
      http_status: r.status || null,
      latency_ms: r.latency_ms,
      service: parsed.service,
      port: parsed.port,
      apex: parsed.apex,
      process_started_at: parsed.process_started_at,
      source_commit: parsed.source_commit,
      uptime_s: parsed.uptime_s,
      error: r.ok ? undefined : (r.status ? `http_${r.status}` : r.body.slice(0, 100)),
      stale_vs_reference: !!(p.reference_commit && parsed.source_commit && parsed.source_commit !== p.reference_commit),
      uptime_exceeds_max: typeof parsed.uptime_s === "number" && parsed.uptime_s > maxUptime,
    };
    return health;
  }));

  const ok_count = results.filter(h => h.ok).length;
  const fail_count = results.filter(h => !h.ok).length;
  const stale_count = results.filter(h => h.stale_vs_reference || h.uptime_exceeds_max).length;

  const byCommit: Record<string, string[]> = {};
  for (const h of results) {
    const c = h.source_commit ?? "(unknown)";
    if (!byCommit[c]) byCommit[c] = [];
    byCommit[c].push(h.name);
  }

  return {
    polled_at,
    peer_count: input.peers.length,
    ok_count,
    fail_count,
    stale_count,
    peers: results,
    by_commit: byCommit,
    glyph_sentence: `EVT-FEDERATION-HEALTH · peers=${input.peers.length} · ok=${ok_count} · fail=${fail_count} · stale=${stale_count} · commits=${Object.keys(byCommit).length} · @ M-EYEWITNESS .`,
  };
}

// Convenience: default federation map for today's topology
export function defaultFederationEndpoints(acer_keyboard_token?: string): PeerEndpoint[] {
  return [
    { name: "acer-behcs",     url: "http://127.0.0.1:4947/behcs/health" },
    { name: "acer-static",    url: "http://127.0.0.1:9998/health" },
    { name: "acer-keyboard",  url: "http://127.0.0.1:4913/health", bearer: acer_keyboard_token },
    { name: "liris-server",   url: "http://192.168.100.2:9999/health" },
    { name: "liris-keyboard", url: "http://192.168.100.2:4913/health" },
  ];
}
