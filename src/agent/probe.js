// Item 054 · probe-before-spawn · avoid duplicate instances

const { spawn } = require("node:child_process");

async function probeNamedAgentRunning(named_agent) {
  return new Promise((resolve) => {
    const cp = spawn("powershell", ["-NoProfile", "-Command",
      `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'ASOLARIA_NAMED_AGENT.*${named_agent.replace(/[^a-zA-Z0-9_-]/g, "")}' } | Select-Object ProcessId | ConvertTo-Json -Compress`
    ], { shell: false, windowsHide: true });
    let out = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve({ ok: false, running: false }); }, 8000);
    cp.stdout.on("data", d => out += d.toString());
    cp.on("close", () => {
      clearTimeout(t);
      try {
        const j = JSON.parse(out || "[]");
        const arr = Array.isArray(j) ? j : (j ? [j] : []);
        resolve({ ok: true, running: arr.length > 0, pids: arr.map(p => p.ProcessId) });
      } catch { resolve({ ok: false, running: false }); }
    });
  });
}

module.exports = { probeNamedAgentRunning };
