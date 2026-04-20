// scan-dispatcher.ts — Section G-085 scan-request dispatcher + persistent state.
//
// Bridges L0-L2 liris-local gates (immune-wiring.ts) to L3-L5 acer-civ workers
// via BEHCS bus at /behcs/send. Persists every scan to an append-only NDJSON
// file at data/shannon/scans/<scan_id>.ndjson; each phase transition appends
// a record with ts + phase + verdict + dispatch_result.
//
// LAW-008: scan store is the mirror. LAW-012: L0-L2 precede any dispatch.
// named_agent: liris-smp-v5-G-085-builder (2026-04-18).

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { runL0ToL2, type FullCheckResult, type L0Input, type L2Input } from "./immune-wiring.ts";
import { validateSpawnRequest, type SpawnRequest } from "./profile-schema.ts";

export const SCAN_STORE_ROOT_DEFAULT = "./data/shannon/scans";

export type ScanPhase =
  | "received"
  | "l0_l2_checked"
  | "l0_l2_halted"
  | "l3_recon_dispatched"
  | "l4_vuln_dispatched"
  | "l5_exploit_dispatched"
  | "l6_synthesized"
  | "completed"
  | "failed";

export interface ScanStoreRecord {
  ts: string;
  scan_id: string;
  phase: ScanPhase;
  verdict: "pass" | "halt" | "ok" | "fail";
  detail?: unknown;
}

export interface DispatchOptions {
  scan_store_root?: string;
  acer_behcs_endpoint?: string;
  behcs_timeout_ms?: number;
}

export interface DispatchResult {
  scan_id: string;
  l0_l2: FullCheckResult;
  dispatched: boolean;
  behcs_status?: number;
  behcs_error?: string;
  scan_store_path: string;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function appendRecord(storeRoot: string, rec: ScanStoreRecord): string {
  ensureDir(storeRoot);
  const file = join(storeRoot, `${rec.scan_id}.ndjson`);
  appendFileSync(file, JSON.stringify(rec) + "\n");
  return file;
}

function postJson(
  endpoint: string,
  body: string,
  timeoutMs: number,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(endpoint);
    const req = http.request(
      {
        host: u.hostname,
        port: u.port ? Number(u.port) : 80,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      try {
        req.destroy(new Error("dispatch_timeout"));
      } catch {}
      reject(new Error("dispatch_timeout"));
    });
    req.write(body);
    req.end();
  });
}

/** Full flow: validate → L0-L2 → persist → dispatch to acer if pass. */
export async function dispatchScan(
  spawn_request: SpawnRequest,
  l0Input: Omit<L0Input, "allowed_hosts" | "target_host"> & { target_host: string },
  l2Input: L2Input,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const storeRoot = opts.scan_store_root ?? SCAN_STORE_ROOT_DEFAULT;
  const scan_id = spawn_request.scan_id;

  // Record received
  const storePath = appendRecord(storeRoot, {
    ts: new Date().toISOString(),
    scan_id,
    phase: "received",
    verdict: "ok",
    detail: { profile_name: spawn_request.profile_name, scope: spawn_request.scope },
  });

  // Shallow-validate spawn first (L1 will re-do inside runL0ToL2)
  const v = validateSpawnRequest(spawn_request);
  if (!v.ok) {
    appendRecord(storeRoot, { ts: new Date().toISOString(), scan_id, phase: "failed", verdict: "fail", detail: v.violations });
    return {
      scan_id,
      l0_l2: { ok: false, verdicts: [], halted_at: null, elapsed_ms: 0 },
      dispatched: false,
      behcs_error: "spawn_request validation failed",
      scan_store_path: storePath,
    };
  }

  // Run L0 → L1 → L2
  const fullL0Input: L0Input = {
    ...l0Input,
    allowed_hosts: spawn_request.scope.allowed_hosts,
  };
  const gates = runL0ToL2({
    l0: fullL0Input,
    spawn_request,
    l2: l2Input,
  });
  appendRecord(storeRoot, {
    ts: new Date().toISOString(),
    scan_id,
    phase: gates.ok ? "l0_l2_checked" : "l0_l2_halted",
    verdict: gates.ok ? "pass" : "halt",
    detail: gates.verdicts,
  });

  if (!gates.ok) {
    return { scan_id, l0_l2: gates, dispatched: false, scan_store_path: storePath };
  }

  // Dispatch to acer civilization. L3/L4/L5 phase is a single envelope — acer
  // routes within its 13-agent pipeline.
  if (opts.acer_behcs_endpoint === undefined) {
    return {
      scan_id,
      l0_l2: gates,
      dispatched: false,
      behcs_error: "no acer_behcs_endpoint (test mode)",
      scan_store_path: storePath,
    };
  }

  const envelope = {
    verb: "shannon-scan-dispatch",
    actor: "liris-shannon-civ",
    target: "acer",
    d1: "IDENTITY",
    body: {
      scan_id,
      spawn_request,
      l0_l2_verdicts: gates.verdicts,
    },
    glyph_sentence: `EVT-SHANNON-SCAN-DISPATCH · scan_id=${scan_id} · profile=${spawn_request.profile_name} · apex=COL-ASOLARIA @ M-INDICATIVE .`,
  };
  const timeoutMs = opts.behcs_timeout_ms ?? 5000;
  try {
    const { status } = await postJson(opts.acer_behcs_endpoint, JSON.stringify(envelope), timeoutMs);
    const ok = status >= 200 && status < 300;
    appendRecord(storeRoot, {
      ts: new Date().toISOString(),
      scan_id,
      phase: "l3_recon_dispatched",
      verdict: ok ? "ok" : "fail",
      detail: { status },
    });
    return { scan_id, l0_l2: gates, dispatched: ok, behcs_status: status, scan_store_path: storePath };
  } catch (e) {
    const err = (e as Error).message;
    appendRecord(storeRoot, {
      ts: new Date().toISOString(),
      scan_id,
      phase: "failed",
      verdict: "fail",
      detail: { error: err },
    });
    return { scan_id, l0_l2: gates, dispatched: false, behcs_error: err, scan_store_path: storePath };
  }
}

/** Read the per-scan append-only log. Caller reads + parses JSON lines. */
export function scanStorePath(scan_id: string, storeRoot: string = SCAN_STORE_ROOT_DEFAULT): string {
  return join(storeRoot, `${scan_id}.ndjson`);
}
