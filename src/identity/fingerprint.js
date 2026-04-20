// Item 063 · Hardware fingerprinter (cpu, board, disk serial)

const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const os = require("node:os");

function runPS(cmd) {
  return new Promise((resolve) => {
    const cp = spawn("powershell", ["-NoProfile", "-Command", cmd], { shell: false, windowsHide: true });
    let out = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve(""); }, 10_000);
    cp.stdout.on("data", d => out += d.toString());
    cp.on("close", () => { clearTimeout(t); resolve(out.trim()); });
  });
}

async function fingerprint() {
  // Windows path; unix callers should subclass
  const [cpu, mobo, disk] = await Promise.all([
    runPS("Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty ProcessorId"),
    runPS("Get-CimInstance Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"),
    runPS("Get-CimInstance Win32_DiskDrive | Where-Object { $_.MediaType -like '*Fixed*' } | Select-Object -First 1 -ExpandProperty SerialNumber"),
  ]);
  const mac = (Object.values(os.networkInterfaces()).flat().find(i => !i.internal && i.mac && i.mac !== "00:00:00:00:00:00") || {}).mac || "unknown";
  const stable_tuple = [
    (cpu || "unknown-cpu").trim(),
    (mobo || "unknown-mobo").trim(),
    (disk || "unknown-disk").trim(),
    mac,
  ];
  const shape_fingerprint = "sha256:" + crypto.createHash("sha256").update(stable_tuple.join("|")).digest("hex");
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    stable_tuple,
    shape_fingerprint,
    collected_at: new Date().toISOString(),
  };
}

module.exports = { fingerprint };
