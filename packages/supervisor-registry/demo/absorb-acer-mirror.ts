// absorb-acer-mirror.ts — read the mirror at acer:4947/behcs/devices,
// merge into our local device-registry, derive DEV-* glyph + supervisor
// glyph for every entry acer knows about that we don't.
//
// LAW-008 filesystem-is-mirror: acer's registry is a mirror of the federation
// she governs. We don't dispute; we absorb.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerDevice, loadDeviceRegistry } from "../src/device-registry.ts";

const __here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__here, "..", "..", "..");
const SNAPSHOT_PATH = join(REPO_ROOT, "research", "acer-absorption", "acer-devices-snapshot.json");

interface AcerDevice {
  id: string;
  label: string;
  role: string;
  endpoints?: string[];
  capabilities?: string[];
  cube?: Record<string, unknown>;
  adb_serial?: string;
  note?: string;
  model?: string;
  transport?: string;
}

console.log("=== ABSORB ACER MIRROR (LAW-008 filesystem-is-mirror) ===");
console.log("");

if (!existsSync(SNAPSHOT_PATH)) {
  console.error(`FATAL: snapshot not found at ${SNAPSHOT_PATH}`);
  console.error("Run: curl -s http://192.168.100.1:4947/behcs/devices > " + SNAPSHOT_PATH);
  process.exit(1);
}

const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as { ok: boolean; devices: Record<string, AcerDevice> };
const acerDevices = Object.entries(snap.devices);
console.log(`[mirror] acer knows ${acerDevices.length} devices`);

const localReg = loadDeviceRegistry();
const localGlyphs = new Set(localReg.devices.map((d) => d.glyph));
console.log(`[local] we know ${localReg.devices.length} devices: ${[...localGlyphs].join(", ")}`);

// Map acer's id → our DEV-* glyph convention
function acerIdToDevGlyph(id: string): string {
  return "DEV-" + id.toUpperCase().replace(/[^A-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function roleToSummary(role: string): string {
  switch (role) {
    case "capital":              return "capital federation node · full compute · dashboard · gate pipeline · cube engine";
    case "sub_colony":           return "sub colony · full compute · gslgnn · omni processor";
    case "orbital":              return "orbital edge-compute node";
    case "collaborator":         return "external collaborator · github webhook";
    case "sidecar_intelligence": return "sidecar intelligence · cross-model federation member";
    default:                     return role;
  }
}

function roleToOs(role: string, id: string, caps: string[]): string {
  if (caps.includes("termux")) return "Android + Termux";
  if (caps.includes("mtp_only")) return "Android (MTP only)";
  if (caps.includes("github_webhook")) return "github.com (remote)";
  if (role === "sidecar_intelligence") return `${id} browser-sidecar (manual relay)`;
  if (id === "acer") return "Windows (Acer laptop)";
  if (id === "liris") return "Windows 11 Home (Liris desktop)";
  return "declared";
}

function roleToHardwareClass(role: string, caps: string[], id: string, adb_serial?: string): string {
  if (id === "acer") return "laptop · capital federation node";
  if (id === "liris") return "desktop · 32GB";
  if (caps.includes("mtp_only")) return `Samsung S22 Ultra (screen broken, adb=${adb_serial ?? "?"})`;
  if (adb_serial) return `Android phone (adb=${adb_serial})`;
  if (role === "collaborator") return "human + github";
  if (role === "sidecar_intelligence") return "LLM sidecar (no hardware)";
  return "declared";
}

const absorbed: Array<{ glyph: string; source: "CANONICAL" | "AUTO-REGISTERED" | "OPERATOR-ADDED"; status: "ALREADY-KNOWN" | "NEW-ABSORBED" }> = [];

for (const [id, dev] of acerDevices) {
  const glyph = acerIdToDevGlyph(id);
  if (localGlyphs.has(glyph)) {
    absorbed.push({ glyph, source: "CANONICAL", status: "ALREADY-KNOWN" });
    console.log(`  ✓ ${glyph.padEnd(24)} already in local registry (canonical)`);
    continue;
  }
  // Register it
  const caps = dev.capabilities ?? [];
  const firstEndpoint = dev.endpoints?.[0] ?? "declared";
  const entry = registerDevice({
    glyph,
    canonical_name: dev.label || id,
    role: roleToSummary(dev.role),
    os: roleToOs(dev.role, id, caps),
    hardware_class: roleToHardwareClass(dev.role, caps, id, dev.adb_serial),
    federation_port: 4947,
    secondary_ports: [4950],
    canonical_root: null,
    operator_witness: "acer-mirror-absorption-2026-04-18",
    notes: [
      `absorbed from acer /behcs/devices snapshot`,
      `role=${dev.role}`,
      `capabilities=[${caps.join(",")}]`,
      `endpoint=${firstEndpoint}`,
      ...(dev.adb_serial ? [`adb_serial=${dev.adb_serial}`] : []),
      ...(dev.note ? [`note=${dev.note.slice(0, 120)}`] : []),
      ...(dev.model ? [`model=${dev.model}`] : []),
    ],
    source: "AUTO-REGISTERED",
  });
  absorbed.push({ glyph: entry.glyph, source: entry.source, status: "NEW-ABSORBED" });
  console.log(`  ✚ ${entry.glyph.padEnd(24)} NEW · ${dev.label}`);
}

console.log("");
const newCount = absorbed.filter((a) => a.status === "NEW-ABSORBED").length;
const knownCount = absorbed.filter((a) => a.status === "ALREADY-KNOWN").length;
console.log(`[absorb] new=${newCount}  already-known=${knownCount}`);

const finalReg = loadDeviceRegistry();
console.log(`[final] local registry now contains ${finalReg.devices.length} devices`);
console.log("");
console.log(`  breakdown by source:`);
const bySource: Record<string, number> = {};
for (const d of finalReg.devices) bySource[d.source] = (bySource[d.source] ?? 0) + 1;
for (const [src, n] of Object.entries(bySource)) console.log(`    ${src.padEnd(18)} ${n}`);

console.log("");
console.log(`  all device glyphs:`);
for (const d of finalReg.devices) console.log(`    ${d.glyph.padEnd(24)} ${d.canonical_name}`);

console.log("");
console.log("=== META ===");
console.log(`META-ACER-MIRROR-ABSORBED · acer_registry=${acerDevices.length} · local_total=${finalReg.devices.length} · newly_absorbed=${newCount} · @ M-EYEWITNESS .`);
process.exit(newCount > 0 || knownCount > 0 ? 0 : 1);
