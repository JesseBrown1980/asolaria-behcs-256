// Acer-local pid-targeted NON-INTRUSIVE verify
// Honors feedback_never_steal_foreground: no SendKeys, no SetForegroundWindow
// Method: Get-Process snapshot before+after + handle/title stability check

import { spawn } from "node:child_process";

function runPS(cmd, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const cp = spawn("powershell", ["-NoProfile", "-Command", cmd], { shell: false, windowsHide: true });
    let out = "", err = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve({ ok: false, out, err: err + "\nTIMEOUT" }); }, timeoutMs);
    cp.stdout.on("data", d => out += d.toString());
    cp.stderr.on("data", d => err += d.toString());
    cp.on("close", code => { clearTimeout(t); resolve({ ok: code === 0, code, out, err }); });
    cp.on("error", e => { clearTimeout(t); resolve({ ok: false, out, err: e.message }); });
  });
}

async function snap(pid) {
  const r = await runPS(`Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle, StartTime, @{N='CpuMs';E={$_.TotalProcessorTime.TotalMilliseconds}}, WorkingSet64, HandleCount, Path | ConvertTo-Json -Depth 2`);
  if (!r.out.trim()) return null;
  try { return JSON.parse(r.out); } catch { return null; }
}

/**
 * Non-intrusive pid-targeted verify of an acer-local process.
 * No SendKeys. No focus-steal. Safe to run on Jesse's interactive desktop.
 * @param {number} pid
 * @param {object} opts { dwell_ms = 2000 }
 */
export async function verifyAcerLocalPid(pid, opts = {}) {
  const before = await snap(pid);
  if (!before) return { ok: false, error: "pid_not_found", pid };

  await new Promise(r => setTimeout(r, opts.dwell_ms || 2000));
  const after = await snap(pid);
  if (!after) return { ok: false, error: "pid_died_between_probes", pid, before };

  const pid_survived = before.Id === after.Id;
  const title_stable = before.MainWindowTitle === after.MainWindowTitle;
  const handle_stable = before.MainWindowHandle === after.MainWindowHandle;
  const cpu_advanced = (before.CpuMs ?? 0) <= (after.CpuMs ?? 0);

  return {
    ok: true,
    pid,
    process_name: before.ProcessName,
    main_window_title: before.MainWindowTitle,
    main_window_handle: before.MainWindowHandle,
    path: before.Path,
    before, after,
    checks: { pid_survived, title_stable, handle_stable, cpu_advanced },
    verdict: (pid_survived && title_stable && handle_stable) ? "PASS" : "INVESTIGATE",
    method: "non-intrusive pid-targeted (Get-Process snapshot before+after)",
    no_send_keys: true,
    no_foreground_steal: true,
  };
}
