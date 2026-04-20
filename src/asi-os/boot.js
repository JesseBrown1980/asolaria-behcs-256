// Item 200 · ASI-OS boot layer · references BEHCS-256 kernel

const kernel = require("../kernel/behcs256-kernel.js");

const BOOT_ORDER = [
  { layer: "L0", name: "BEHCS-256 kernel", ref: kernel, status: "loaded" },
  { layer: "L1", name: "Identity + drift",      ref: "../identity/*" },
  { layer: "L2", name: "Federation bus LAW-001", ref: "port-4947/4950" },
  { layer: "L3", name: "Cosign v2 integrity",    ref: "../cosign/append-v2.js" },
  { layer: "L4", name: "Omni syscalls",          ref: "../omni/*" },
  { layer: "L5", name: "Shannon reasoning core", ref: "../shannon/stage-runner.js" },
  { layer: "L6", name: "Civilization chair",     ref: "R13 role" },
];

async function boot() {
  const report = { booted_at: new Date().toISOString(), layers: [] };
  for (const l of BOOT_ORDER) {
    report.layers.push({ layer: l.layer, name: l.name, ok: true, note: l.status || "ref-only" });
  }
  return { ok: true, report, kernel_kind: typeof kernel === "object" ? "loaded" : "missing" };
}

module.exports = { boot, BOOT_ORDER, kernel };
