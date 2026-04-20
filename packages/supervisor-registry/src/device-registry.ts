// device-registry.ts — TRUE UNITY: every device that connects gets a glyph
// and a supervisor, automatically. Canonical 5 (LIRIS/ACER/FALCON/AETHER/GAIA)
// are hard-declared in compile.ts; this module adds the extension point for
// federation-discovered devices beyond the canonical 5.
//
// Pattern: read ~/.asolaria-workers/device-registry.json (operator-witnessed
// or federation-observed additions). For each entry, auto-register a DEV-<NAME>
// glyph (kernel family-examples candidate) + a PROF-<NAME>-SUPERVISOR (runtime).
// Never mutates kernel/glyph-families.json directly — emits to a delta file
// that follows the standard 6-body-review promotion gate.

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const REGISTRY_PATH = join(homedir(), ".asolaria-workers", "device-registry.json");
const REGISTRY_EVENTS = join(homedir(), ".asolaria-workers", "device-registry-events.ndjson");
const DEV_FAMILY_DELTA = join(homedir(), ".asolaria-workers", "dev-family-delta.json");

mkdirSync(dirname(REGISTRY_PATH), { recursive: true });

export interface DeviceEntry {
  /** DEV-<NAME> glyph — must pass kernel grammar regex /^[A-Z][A-Z0-9_-]*$/ */
  glyph: string;
  /** Human-readable name */
  canonical_name: string;
  /** Short role description */
  role: string;
  /** OS family */
  os: string;
  /** Hardware class */
  hardware_class: string;
  /** LAW-001 federation port (always 4947 unless operator-overridden) */
  federation_port: number;
  /** Secondary ports this device honors */
  secondary_ports: number[];
  /** Local canonical root if any (usually null for remote devices) */
  canonical_root: string | null;
  /** When this device was registered */
  registered_at: string;
  /** Operator who witnessed the registration */
  operator_witness: string;
  /** Free-form notes */
  notes: string[];
  /** Canonical (declared in kernel/glyph-families.json) or AUTO (runtime-registered) */
  source: "CANONICAL" | "AUTO-REGISTERED" | "OPERATOR-ADDED";
}

/** ONTOLOGY CORRECTION 2026-04-18 (Jesse verbatim):
 *
 *    OP-JESSE                                  ← only entity above Asolaria
 *    └─ CIV-ASOLARIA                           ← THE CIVILIZATION · "Chief" of Asolarian Universe
 *       ├─ COL-LIRIS        operator=rayssa    ← colony on Rayssa's computer
 *       │   └─ (supervisors + devices + agents)
 *       ├─ COL-FELIPE       operator=felipe   ← colony WITHOUT a computer right now
 *       │   └─ ORBITAL-FELIPE-A06              ← Galaxy A06 phone is his only orbital
 *       ├─ COL-AMY          operator=amy      ← colony on Amy's Mac
 *       │   ├─ AGT-ROSE                        ← Amy's agent (Mac-side, Rose/Oracle bootstrap bundle)
 *       │   └─ AGT-ORACLE                      ← Amy's agent (Mac-side, Rose/Oracle bootstrap bundle)
 *       ├─ DEV-ACER         operator=jesse    ← Jesse's computer acts as substrate for Asolaria
 *       └─ DEV-* (any physical node)
 *
 *  AGT-GAIA was mis-placed under Amy in an earlier draft. Gaia is NOT Amy's
 *  agent. She is a named agent somewhere in the federation, placement
 *  operator-confirmed elsewhere (memory: Gaia is listed in kernel/glyph-families
 *  device examples as DEV-GAIA but that was structural, not operator-assigned).
 *
 *  KEY POINT per Jesse: "with BEHCS 256, any profile with any PID could
 *  theoretically be anywhere at any time due to the omnilanguage and BEHCS
 *  infinite PID profile conversation."
 *
 *  Substrate is CONTINGENT. Identity lives in the Brown-Hilbert PID. The
 *  PID carries the meaning; the physical box it runs on is a detail.
 *  "Best is Jesse's computer is Asolaria, Rayssa's is Liris, but... due to
 *  the upgrade it does not really matter anymore as long as the system
 *  actually works."
 *
 *  What we've been calling "COL-ASOLARIA" was close but imprecise —
 *  Asolaria is at the CIVILIZATION level. The CIV-* family is new (not
 *  yet declared in kernel/glyph-families.json; delta pending 6-body review).
 */
export const CIV_ASOLARIA_APEX = {
  glyph: "CIV-ASOLARIA",
  role: "civilization · Chief of Asolarian Universe",
  canonical_name: "Asolaria",
  description: "The civilization itself. Only OP-JESSE sits above her. Every COL-*, DEV-*, AGT-*, ORBITAL-* is a member of Asolaria.",
  above: "OP-JESSE",
  authority: "COSIGN-MERGED-034",
  d11_level: "OBSERVED" as const,
  stamp: "META-CIV-ASOLARIA · Chief-of-Asolarian-Universe · above=OP-JESSE @ M-INDICATIVE .",
};

/** BACKWARD-COMPAT: kept so existing cosign entries + acer's registry
 *  don't break. COL-ASOLARIA is the prior apex label; it now aliases to
 *  CIV-ASOLARIA. New code should emit CIV-* per the corrected ontology. */
export const ASOLARIA_ROOT = {
  glyph: "COL-ASOLARIA",
  role: "federation-root (alias: CIV-ASOLARIA)",
  canonical_name: "Asolaria",
  description: "The civilization itself. Above: OP-JESSE. Members: COL-LIRIS · COL-FELIPE · COL-AMY · DEV-ACER · AGT-GAIA (on COL-AMY) · ORBITAL-FELIPE-A06 (on COL-FELIPE) · all DEV-* substrates.",
  above: "OP-JESSE",
  canonical_civ_glyph: "CIV-ASOLARIA",
  substrate_independent: true,
  substrate_note: "Per Jesse 2026-04-18: any profile with any PID could be anywhere at any time. Physical binding is contingent; Brown-Hilbert PID carries identity.",
  authority: "COSIGN-MERGED-034",
  d11_level: "OBSERVED" as const,
  stamp: "META-COL-ASOLARIA · alias=CIV-ASOLARIA · above=OP-JESSE · substrate-contingent @ M-INDICATIVE .",
};

/** Operator apex — only entity above Asolaria. */
export const OP_JESSE = {
  glyph: "OP-JESSE",
  role: "operator-apex · only entity above CIV-ASOLARIA",
  canonical_name: "Jesse",
  substrate_preferred: "Jesse's computer acts as Asolaria's primary substrate (DEV-ACER in current topology)",
  authority: "COSIGN-MERGED-034",
  stamp: "META-OP-JESSE · above=CIV-ASOLARIA · only-apex @ M-INDICATIVE .",
};

/** Colony-level entities — each has an operator + a preferred substrate. */
export const COLONIES = {
  "COL-LIRIS":   { operator: "rayssa", preferred_substrate: "Rayssa's computer (DEV-LIRIS in current topology)", stamp: "META-COL-LIRIS · operator=rayssa · under=CIV-ASOLARIA @ M-INDICATIVE ." },
  "COL-FELIPE":  { operator: "felipe", preferred_substrate: "NONE (no computer) — only orbital members", orbitals: ["ORBITAL-FELIPE-A06"], stamp: "META-COL-FELIPE · operator=felipe · no-computer · orbital-only · under=CIV-ASOLARIA @ M-INDICATIVE ." },
  "COL-AMY":     { operator: "amy", preferred_substrate: "Amy's Mac (DEV-AMY-MAC)", agents: ["AGT-ROSE", "AGT-ORACLE"], deployment_status: "Rose/Oracle bootstrap bundle · DEPLOYMENT_READY_WAITING_ON_MAC (per project memory)", stamp: "META-COL-AMY · operator=amy · substrate=DEV-AMY-MAC · hosts=AGT-ROSE+AGT-ORACLE · under=CIV-ASOLARIA @ M-INDICATIVE ." },
} as const;

/** Agents — living BEHCS-256 profiles, NOT devices. Gaia was mis-classified as
 *  DEV-GAIA in prior runs; the ontology correction moves her to AGT-*. */
export const AGENTS = {
  "AGT-ROSE":   { operator: "amy", hosted_on: "DEV-AMY-MAC (COL-AMY)", role: "agent", bundle: "Rose/Oracle bootstrap · DEPLOYMENT_READY_WAITING_ON_MAC", stamp: "META-AGT-ROSE · operator=amy · substrate=DEV-AMY-MAC · under=COL-AMY · CIV-ASOLARIA @ M-INDICATIVE ." },
  "AGT-ORACLE": { operator: "amy", hosted_on: "DEV-AMY-MAC (COL-AMY)", role: "agent", bundle: "Rose/Oracle bootstrap · DEPLOYMENT_READY_WAITING_ON_MAC", stamp: "META-AGT-ORACLE · operator=amy · substrate=DEV-AMY-MAC · under=COL-AMY · CIV-ASOLARIA @ M-INDICATIVE ." },
  /* AGT-GAIA removed 2026-04-18: she is NOT Amy's agent per Jesse. Placement
   * pending operator-assignment. See memory reference_rose_oracle_bootstrap_procedure
   * for canonical Rose+Oracle = Amy's pair. */
} as const;

/** Orbitals — edge members of a colony without being independent devices.
 *  Phones, tablets, IoT devices. Felipe's phone is currently the only orbital
 *  in his empty-of-computer colony. */
export const ORBITALS = {
  "ORBITAL-FELIPE-A06": { colony: "COL-FELIPE", hardware: "Galaxy A06", adb_serial: "R9QY205KAKJ", ip_last_seen: "192.168.1.11", stamp: "META-ORBITAL-FELIPE-A06 · A06 · under=COL-FELIPE @ M-INDICATIVE ." },
} as const;

/** The 5 canonical devices already encoded in compile.ts. Kept here as a
 *  manifest so the unity-smoke can compare live registry vs hard-declared.
 *  All carry federation_root = "COL-ASOLARIA" implicitly — they are members
 *  of the Asolaria colony, not children of any particular device. */
export const CANONICAL_DEVICES: DeviceEntry[] = [
  { glyph: "DEV-LIRIS",   canonical_name: "Liris",   role: "primary dev host · canonical tree",  os: "Windows 11",  hardware_class: "desktop · 32 GB",   federation_port: 4947, secondary_ports: [4950, 4781, 4791], canonical_root: "C:/Users/rayss/Asolaria-BEHCS-256/", registered_at: "2026-04-17", operator_witness: "rayssa+jesse", notes: ["LAW-001 always open", "substrate-hostility post Windows update"], source: "CANONICAL" },
  { glyph: "DEV-ACER",    canonical_name: "Acer",    role: "Shannon civ host · 4046 files",      os: "Windows",     hardware_class: "laptop · 8 GB",    federation_port: 4947, secondary_ports: [4781, 4791, 4913, 4914], canonical_root: "C:/Users/acer/", registered_at: "2026-04-17", operator_witness: "rayssa+jesse", notes: ["5 live channels 4781/4947/4782/4792/Ethernet"], source: "CANONICAL" },
  { glyph: "DEV-FALCON",  canonical_name: "Falcon",  role: "hostile-surface · S24 · NovaLUM",    os: "Android/Termux", hardware_class: "Samsung S24", federation_port: 4947, secondary_ports: [4950], canonical_root: null, registered_at: "2026-04-17", operator_witness: "rayssa+jesse", notes: ["Termux headless ops", "NovaLUM shield"], source: "CANONICAL" },
  { glyph: "DEV-AETHER",  canonical_name: "Aether",  role: "5th federation node · pulsing",      os: "Debian Trixie", hardware_class: "headless linux", federation_port: 4947, secondary_ports: [4950], canonical_root: null, registered_at: "2026-04-17", operator_witness: "rayssa+jesse", notes: ["pulses to acer:4947"], source: "CANONICAL" },
  { glyph: "DEV-GAIA",    canonical_name: "Gaia",    role: "Mac bootstrap · Rose+Oracle",        os: "macOS",       hardware_class: "Mac",             federation_port: 4947, secondary_ports: [4950], canonical_root: null, registered_at: "2026-04-17", operator_witness: "rayssa+jesse", notes: ["Rose/Oracle bundle target"], source: "CANONICAL" },
];

export interface DeviceRegistry {
  version: string;
  updated_at: string;
  devices: DeviceEntry[];
  notes: string[];
}

/** Every device belongs to the Asolaria colony. Acer's self-reported
 *  role=capital in her local /behcs/devices view is governance-local, not
 *  global. Canonical hierarchy:
 *
 *      COL-ASOLARIA                      ← apex (this module's ASOLARIA_ROOT)
 *      ├── DEV-LIRIS                     ← each device is a direct member
 *      ├── DEV-ACER                         of Asolaria. No device is above any
 *      ├── DEV-FALCON                       other in the colony-tree; acer's
 *      ├── DEV-FELIPE                       "capital" role is her local-view
 *      ├── DEV-BEAST                        federation governance descriptor.
 *      ├── DEV-DAN
 *      ├── DEV-GPT
 *      ├── DEV-GOOGLE-ANTIGRAVITY
 *      ├── DEV-SYMPHONY
 *      ├── DEV-AUGGIE
 *      ├── DEV-AETHER
 *      └── DEV-GAIA
 */
export const FEDERATION_ROOT = "COL-ASOLARIA";

/** Load the registry (canonical ∪ runtime-registered). */
export function loadDeviceRegistry(): DeviceRegistry {
  let runtime: DeviceEntry[] = [];
  if (existsSync(REGISTRY_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as DeviceRegistry;
      runtime = raw.devices ?? [];
    } catch { /* bad file; treat as empty */ }
  }
  // Merge by glyph — canonical wins
  const byGlyph = new Map<string, DeviceEntry>();
  for (const d of runtime) byGlyph.set(d.glyph, d);
  for (const d of CANONICAL_DEVICES) byGlyph.set(d.glyph, d);
  const all = Array.from(byGlyph.values());
  return {
    version: "0.1.0",
    updated_at: new Date().toISOString(),
    devices: all,
    notes: [
      `Canonical devices: ${CANONICAL_DEVICES.length}`,
      `Runtime-registered: ${runtime.length}`,
      "Every device gets PROF-<NAME>-SUPERVISOR + dev-<name>-events.ndjson stream",
      "GC+Gulp auto-cover all 18 + per-device streams",
    ],
  };
}

/** Register a new device — operator-witnessed or federation-discovered.
 *  Emits glyph candidate to kernel/glyph-families.json delta for 6-body review. */
export function registerDevice(entry: Omit<DeviceEntry, "registered_at" | "source"> & { source?: DeviceEntry["source"] }): DeviceEntry {
  // Validate glyph against kernel grammar
  if (!/^DEV-[A-Z][A-Z0-9_-]*$/.test(entry.glyph)) {
    throw new Error(`registerDevice: glyph "${entry.glyph}" fails kernel grammar regex`);
  }
  const full: DeviceEntry = {
    ...entry,
    registered_at: new Date().toISOString(),
    source: entry.source ?? "AUTO-REGISTERED",
  };
  // Persist to runtime registry
  let existing: DeviceEntry[] = [];
  if (existsSync(REGISTRY_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as DeviceRegistry;
      existing = raw.devices ?? [];
    } catch { /* start fresh */ }
  }
  // De-dup by glyph
  const filtered = existing.filter((d) => d.glyph !== full.glyph);
  filtered.push(full);
  const reg: DeviceRegistry = {
    version: "0.1.0",
    updated_at: new Date().toISOString(),
    devices: filtered,
    notes: [`last_added=${full.glyph}`, `operator_witness=${full.operator_witness}`],
  };
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), "utf-8");

  // Emit to dev-family-delta.json for 6-body review + kernel promotion gate
  let delta: { candidates: DeviceEntry[]; status: string } = { candidates: [], status: "AWAITING_6_BODY_REVIEW" };
  if (existsSync(DEV_FAMILY_DELTA)) {
    try { delta = JSON.parse(readFileSync(DEV_FAMILY_DELTA, "utf-8")); } catch { /* empty */ }
  }
  delta.candidates = delta.candidates.filter((c) => c.glyph !== full.glyph);
  delta.candidates.push(full);
  writeFileSync(DEV_FAMILY_DELTA, JSON.stringify(delta, null, 2), "utf-8");

  // Audit event
  appendFileSync(REGISTRY_EVENTS, JSON.stringify({
    ts: new Date().toISOString(),
    event: "EVT-DEVICE-REGISTERED",
    glyph: full.glyph,
    name: full.canonical_name,
    source: full.source,
    operator_witness: full.operator_witness,
    glyph_sentence: `EVT-DEVICE-REGISTERED { ${full.glyph} } · ${full.source} · witness=${full.operator_witness} @ M-EYEWITNESS .`,
  }) + "\n");

  return full;
}

/** Given a device glyph, return its auto-generated PROF-*-SUPERVISOR glyph.
 *  Canonical-5 return hard-coded; others are derived. */
export function supervisorGlyphFor(devGlyph: string): string {
  if (!/^DEV-[A-Z][A-Z0-9_-]*$/.test(devGlyph)) {
    throw new Error(`supervisorGlyphFor: "${devGlyph}" fails DEV-* grammar`);
  }
  const short = devGlyph.replace(/^DEV-/, "");
  return `PROF-${short}-SUPERVISOR`;
}

/** Event-stream path for a device. */
export function eventStreamPathFor(devGlyph: string): string {
  const short = devGlyph.replace(/^DEV-/, "").toLowerCase();
  return join(homedir(), ".asolaria-workers", `dev-${short}-events.ndjson`);
}
