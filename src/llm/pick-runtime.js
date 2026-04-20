// Item 038 · GPU/CPU detection + auto-pick runtime

const os = require("node:os");
const { spawn } = require("node:child_process");

async function detectGpu() {
  return new Promise((resolve) => {
    const cp = spawn("powershell", ["-NoProfile", "-Command",
      "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress"
    ], { shell: false, windowsHide: true });
    let out = "";
    const t = setTimeout(() => { try { cp.kill(); } catch {} resolve({ has_gpu: false }); }, 8000);
    cp.stdout.on("data", d => out += d.toString());
    cp.on("close", () => {
      clearTimeout(t);
      try {
        const j = JSON.parse(out || "[]");
        const arr = Array.isArray(j) ? j : [j];
        const gpus = arr.filter(g => g && g.Name && !/Microsoft Basic Display/i.test(g.Name));
        if (gpus.length) {
          const biggest = gpus.reduce((a, b) => (a.AdapterRAM || 0) > (b.AdapterRAM || 0) ? a : b);
          resolve({ has_gpu: true, name: biggest.Name, vram_bytes: biggest.AdapterRAM });
        } else resolve({ has_gpu: false });
      } catch { resolve({ has_gpu: false }); }
    });
  });
}

async function pickRuntime() {
  const gpu = await detectGpu();
  const ramBytes = os.totalmem();
  const cpuCores = os.cpus().length;
  return {
    gpu,
    ram_gb: Math.round(ramBytes / (1024**3)),
    cpu_cores: cpuCores,
    recommended_model_tier: gpu.has_gpu && (gpu.vram_bytes || 0) > 12 * 1024**3 ? "13B"
                              : ramBytes > 24 * 1024**3 ? "13B-cpu"
                              : "7B",
  };
}

module.exports = { detectGpu, pickRuntime };
