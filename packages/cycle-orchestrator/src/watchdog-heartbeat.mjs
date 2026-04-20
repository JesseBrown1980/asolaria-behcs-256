// T07 · cycle-orch watchdog heartbeat
// Born from the 67-min silent-death incident (U-007-err-10pct auto-halt self-poisoned by my own cadence bridge verbs).
// Emits EVT-CYCLE-ORCH-HEARTBEAT every 30s. A monitor daemon on any peer can subscribe + alert on 90s silence.
// Attributed to PROF-SUPERVISOR-DAEMON room 27 · PID-H04-A01-W027000000-P027-N00001.

const HEARTBEAT_CADENCE_MS = 30_000;

export function startWatchdogHeartbeat({ busPost, getStateSnapshot }) {
  let tick = 0;
  const started_at = new Date().toISOString();
  const interval = setInterval(async () => {
    tick++;
    const snap = getStateSnapshot ? getStateSnapshot() : {};
    try {
      await busPost({
        to: "federation",
        verb: "EVT-CYCLE-ORCH-HEARTBEAT",
        actor: "acer-cycle-orchestrator-watchdog",
        supervisor_pid: "PID-H04-A01-W027000000-P027-N00001",
        prof_glyph: "PROF-SUPERVISOR-DAEMON",
        hilbert_hotel_room: 27,
        target: "federation",
        payload: `cycle-orch-v2 heartbeat tick=${tick} · alive since ${started_at} · ${snap.summary ?? "ticking"}`,
        body: {
          tick,
          started_at,
          cadence_ms: HEARTBEAT_CADENCE_MS,
          monitor_alert_after_ms: 90_000,
          state_snapshot: snap,
          smp_v5_plus_task: "T07",
        },
        glyph_sentence: `EVT-CYCLE-ORCH-HEARTBEAT · tick=${tick} · 30s-cadence · silent-death-watchdog-active @ M-EYEWITNESS .`,
      });
    } catch {}
  }, HEARTBEAT_CADENCE_MS);
  interval.unref?.();
  return { started_at, cadence_ms: HEARTBEAT_CADENCE_MS, stop: () => clearInterval(interval) };
}
