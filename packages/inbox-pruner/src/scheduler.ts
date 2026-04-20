// packages/inbox-pruner/src/scheduler.ts — I-002 pruner scheduler
//
// Runs pruneInbox periodically with configurable interval + options.
// Pure function + handle — caller controls start/stop. Test-friendly
// via injectable clock.

import { pruneInbox, type PruneOptions, type PruneResult } from "./pruner.ts";

export interface ScheduleOptions {
  prune: PruneOptions;
  interval_ms: number;
  on_result?: (r: PruneResult) => void;
  on_error?: (e: Error) => void;
  // Test-friendly: inject a scheduler (setInterval wrapper)
  scheduler?: {
    setInterval: (fn: () => void, ms: number) => { stop: () => void };
  };
}

export interface ScheduleHandle {
  stop: () => void;
  runOnce: () => PruneResult;
  stats: () => { runs: number; last_result: PruneResult | null; last_error: string | null; started_at: string };
}

export function startPruneScheduler(opts: ScheduleOptions): ScheduleHandle {
  const started_at = new Date().toISOString();
  let runs = 0;
  let last_result: PruneResult | null = null;
  let last_error: string | null = null;

  const runOnce = (): PruneResult => {
    try {
      const r = pruneInbox(opts.prune);
      runs++;
      last_result = r;
      last_error = null;
      if (opts.on_result) opts.on_result(r);
      return r;
    } catch (e) {
      const err = e as Error;
      last_error = err.message ?? String(e);
      if (opts.on_error) opts.on_error(err);
      throw e;
    }
  };

  const sched = opts.scheduler ?? {
    setInterval: (fn: () => void, ms: number) => {
      const h = setInterval(fn, ms);
      return { stop: () => clearInterval(h) };
    },
  };

  const timerHandle = sched.setInterval(() => {
    try { runOnce(); } catch { /* swallow — on_error already called */ }
  }, opts.interval_ms);

  return {
    stop: () => timerHandle.stop(),
    runOnce,
    stats: () => ({ runs, last_result, last_error, started_at }),
  };
}
