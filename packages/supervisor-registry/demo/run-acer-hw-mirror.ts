import { enumerateLocalHardware, loadHardwareRegistry, registerHardware } from "../src/hardware-registry.ts";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

console.log("=== ACER-SIDE HW MIRROR (post-paired-convergence) ===");

const local = enumerateLocalHardware();
console.log("acer live-enumerated:", local.length);
for (const hw of local) registerHardware({ ...hw, operator_witness: "fed-mirror-acer-live-post-convergence" } as any);

const absorbedPath = join(homedir(), ".asolaria-workers", "acer-hw-absorbed.json");
if (existsSync(absorbedPath)) {
  const raw = JSON.parse(readFileSync(absorbedPath, "utf-8")) as { hardware?: Array<Record<string, unknown>> };
  const n = (raw.hardware ?? []).length;
  console.log("acer-absorbed json on disk:", n);
  for (const hw of (raw.hardware ?? [])) {
    registerHardware({ ...(hw as any), operator_witness: "fed-mirror-acer-absorbed-file" } as any);
  }
}

const reg = loadHardwareRegistry();
const byDev: Record<string, number> = {};
const byKind: Record<string, number> = {};
for (const hw of reg.hardware) {
  const d = (hw as any).device ?? "UNKNOWN";
  const k = (hw as any).kind ?? "UNK";
  byDev[d] = (byDev[d] || 0) + 1;
  byKind[k] = (byKind[k] || 0) + 1;
}
console.log("total:", reg.hardware.length);
console.log("by_device:", JSON.stringify(byDev));
console.log("by_kind:", JSON.stringify(byKind));

const outDir = join("C:/asolaria-acer", "data", "cosign");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "acer-hw-mirror-2026-04-18.json");
writeFileSync(outFile, JSON.stringify({ total: reg.hardware.length, by_device: byDev, by_kind: byKind, hardware: reg.hardware }, null, 2));
console.log("wrote:", outFile);

const stamp = `META-ACER-HW-MIRROR { ${reg.hardware.length}-pieces } · ` +
  Object.entries(byDev).map(([d, n]) => `${d}=${n}`).join(" · ") +
  " · apex=COL-ASOLARIA @ M-EYEWITNESS .";
console.log(stamp);
