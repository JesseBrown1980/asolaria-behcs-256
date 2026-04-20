// hardware-registry.ts — TRUE UNITY at the hardware level. Every physical
// component (CPU, GPU, disk, RAM, NIC, USB, camera, microphone, firmware
// blob, radio, sensor) gets a BEHCS-256 HW-* glyph and a Brown-Hilbert PID
// address, and qualifies for its own supervisor.
//
// Brown-Hilbert addressing scheme for hardware:
//   hw_pid = HW-H<hilbert-level>-K<kind-code>-D<device-glyph>-I<instance-idx>-S<serial-hash>
//     hilbert-level: 01-99 (depth in the device hierarchy)
//     kind-code:     CPU/GPU/DSK/MEM/NIC/USB/CAM/MIC/BAT/FMW/RAD/SEN (3 chars)
//     device-glyph:  the DEV-* parent (LIRIS, ACER, etc)
//     instance-idx:  000-999 (multiple of same kind)
//     serial-hash:   first 8 hex of sha256(serial || model || firmware)
//
// Example: HW-H02-KGPU-DLIRIS-I001-S3f8a21c9
//          "level-2 GPU #1 on Liris with serial-hash 3f8a21c9"
//
// Every HW-<KIND>-<DEV>-<IDX> glyph:
//   - addressable via the glyph family (emits delta to kernel/glyph-families.json)
//   - qualifies for PROF-HW-<KIND>-<DEV>-<IDX>-SUPERVISOR (auto-generated)
//   - emits to dev-<dev>-hw-<kind>-events.ndjson (auto-rotated by GC)

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir, cpus, networkInterfaces, totalmem, freemem, platform, arch, hostname } from "node:os";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const HW_REGISTRY_PATH = join(homedir(), ".asolaria-workers", "hardware-registry.json");
const HW_REGISTRY_EVENTS = join(homedir(), ".asolaria-workers", "hardware-registry-events.ndjson");
const HW_FAMILY_DELTA = join(homedir(), ".asolaria-workers", "hw-family-delta.json");
mkdirSync(dirname(HW_REGISTRY_PATH), { recursive: true });

export type HardwareKind =
  | "CPU" | "GPU" | "DSK" | "MEM" | "NIC" | "USB" | "CAM" | "MIC" | "BAT" | "FMW" | "RAD" | "SEN"
  | "BUS"   // PCIe, USB-bus, SATA, NVMe, I2C, SPI, DMI, QPI/UPI, DDR, HDMI-bus, DP-bus
  | "PRT"   // physical port/connector: USB-A/C, HDMI, DP, RJ45, audio-jack, PCIe-slot
  | "CHP"   // chipset / SoC / platform-controller-hub / NVMe controller / PHY chip
  | "CHE"   // cache level: L1/L2/L3 per core or shared
  | "CTL"   // controller: SATA/NVMe/USB/audio/video controller (different from parent CHP)
  | "PCH"   // platform controller hub (northbridge/southbridge modern equivalent)
  | "SLT"   // slot: DIMM slot, PCIe slot, M.2 slot (when distinguishable from installed device)
  | "GPI";  // GPU internal: SM/CU/RT-core/tensor-core — future-expansion for discrete GPU probes

export interface HardwareEntry {
  /** HW-H##-K<KIND>-D<DEV>-I###-S<hash8> — BEHCS-256 glyph, Brown-Hilbert address */
  glyph: string;
  /** 3-char kind code */
  kind: HardwareKind;
  /** Parent device glyph (DEV-LIRIS, DEV-ACER, …) */
  parent_device: string;
  /** Parent HW-* glyph if this piece lives inside another piece
   *  (e.g. L1 cache → CPU core, DIMM → slot, GPU → PCIe-slot).
   *  null when attached directly at the device level. */
  parent_hw: string | null;
  /** Ordinal within kind on this device (0-indexed) */
  instance_idx: number;
  /** Canonical descriptive name (vendor + model + size when available) */
  canonical_name: string;
  /** Serial-hash first 8 hex chars of sha256(serial||model||firmware) */
  serial_hash8: string;
  /** Hilbert-level (depth in the hw hierarchy: 01 device-attached, 02 board, 03 chip, 04 chip-internal, 05 bus, 06 port, 07 subcomponent) */
  hilbert_level: number;
  /** Brown-Hilbert PID if mintable (reference to pid-100B) */
  brown_hilbert_pid: string;
  /** OBSERVED if enumerated live; DECLARED if operator-added for remote device */
  d11_level: "OBSERVED" | "DECLARED" | "ASSUMED";
  /** Free-form discoverable facts (model, size_bytes, freq_mhz, mac, etc) */
  facts: Record<string, unknown>;
  /** Registration timestamp */
  registered_at: string;
  /** Operator who witnessed */
  operator_witness: string;
}

export interface HardwareRegistry {
  version: string;
  updated_at: string;
  hardware: HardwareEntry[];
  notes: string[];
}

export function hwGlyphFromKind(kind: HardwareKind, dev: string, idx: number, serialHash: string, hilbertLevel = 2): string {
  const devShort = dev.replace(/^DEV-/, "").toUpperCase();
  const level = String(hilbertLevel).padStart(2, "0");
  const i = String(idx).padStart(3, "0");
  const s = serialHash.slice(0, 8).padStart(8, "0");
  return `HW-H${level}-K${kind}-D${devShort}-I${i}-S${s}`;
}

export function hwSupervisorGlyphFor(hwGlyph: string): string {
  // PROF-HW-KCPU-DLIRIS-I000-SUPERVISOR (drop hilbert + serial for supervisor name)
  const m = hwGlyph.match(/^HW-H\d{2}-K([A-Z]{3})-D([A-Z0-9_]+)-I(\d{3})-S/);
  if (!m) throw new Error(`hwSupervisorGlyphFor: invalid hw glyph "${hwGlyph}"`);
  return `PROF-HW-${m[1]}-${m[2]}-I${m[3]}-SUPERVISOR`;
}

export function hwEventStreamPathFor(hwGlyph: string): string {
  const m = hwGlyph.match(/^HW-H\d{2}-K([A-Z]{3})-D([A-Z0-9_]+)-I(\d{3})-S/);
  if (!m) throw new Error(`hwEventStreamPathFor: invalid hw glyph "${hwGlyph}"`);
  return join(homedir(), ".asolaria-workers", `hw-${m[1].toLowerCase()}-${m[2].toLowerCase()}-i${m[3]}.ndjson`);
}

function sha256Short(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 8);
}

function brownHilbertPidFor(entry: Omit<HardwareEntry, "brown_hilbert_pid" | "glyph" | "registered_at" | "operator_witness">): string {
  // Deterministic Brown-Hilbert PID from (kind, parent, idx, serial).
  // Level 02 hw, agent-type = HW-<KIND>, worker = idx, nonce = first-3-hex-of-hash
  const hash = sha256Short(`${entry.kind}|${entry.parent_device}|${entry.instance_idx}|${entry.serial_hash8}`);
  const worker = (parseInt(hash.slice(0, 8), 16) % 1_000_000_000).toString().padStart(9, "0");
  const partition = (parseInt(hash.slice(2, 5), 16) % 1000).toString().padStart(3, "0");
  const nonce = (parseInt(hash.slice(5, 8), 16) % 100_000).toString().padStart(5, "0");
  return `PID-H02-A01-W${worker}-P${partition}-N${nonce}`;
}

// ── Canonical hardware manifest per DEV-* (declared for remote devices) ──────

export const CANONICAL_HARDWARE: HardwareEntry[] = [
  // DEV-LIRIS (will be fully-enumerated live by enumerateLocalHardware; these are fallback declarations)
  // DEV-ACER — declared rich set; awaits live absorption via federation-acer-bundle
  // deep-enum-on-acer.mjs. Until then, these are operator-declared D11:DECLARED.
  ...expandDeclared("DEV-ACER", [
    { kind: "CHP", idx: 0, name: "Acer CPU package (declared; model pending live enum)", serial: "acer-cpu-package-declared", facts: { declared: true, cores: 4, pending_live_enum: true, expected_family: "Intel Core (laptop)" } },
    { kind: "CPU", idx: 0, name: "Acer CPU core 0 (declared)",   serial: "acer-cpu-c0", facts: { declared: true, core_index: 0 } },
    { kind: "CPU", idx: 1, name: "Acer CPU core 1 (declared)",   serial: "acer-cpu-c1", facts: { declared: true, core_index: 1 } },
    { kind: "CPU", idx: 2, name: "Acer CPU core 2 (declared)",   serial: "acer-cpu-c2", facts: { declared: true, core_index: 2 } },
    { kind: "CPU", idx: 3, name: "Acer CPU core 3 (declared)",   serial: "acer-cpu-c3", facts: { declared: true, core_index: 3 } },
    { kind: "CHE", idx: 0, name: "Acer L2 cache (declared)",     serial: "acer-l2",     facts: { declared: true, level: "L2", pending_live_enum: true } },
    { kind: "CHE", idx: 1, name: "Acer L3 cache (declared)",     serial: "acer-l3",     facts: { declared: true, level: "L3", pending_live_enum: true } },
    { kind: "GPU", idx: 0, name: "Acer integrated GPU (declared; model pending live enum)", serial: "acer-gpu-igpu", facts: { declared: true, integrated: true, pending_live_enum: true } },
    { kind: "MEM", idx: 0, name: "Acer RAM 8GB (declared)",       serial: "acer-mem-declared", facts: { size_bytes: 8 * 2 ** 30, declared: true, total_gb: 8 } },
    { kind: "SLT", idx: 0, name: "Acer DIMM slot 0 (declared)",   serial: "acer-dimm-0", facts: { declared: true, pending_live_enum: true } },
    { kind: "DSK", idx: 0, name: "Acer primary disk (declared)",  serial: "acer-dsk-0", facts: { declared: true, role: "primary", pending_live_enum: true } },
    { kind: "DSK", idx: 1, name: "Acer E: RAW partition (USB)",   serial: "acer-dsk-e-raw", facts: { declared: true, role: "sovereignty-usb", state: "RAW-needs-TestDisk" } },
    { kind: "NIC", idx: 0, name: "Acer NIC (declared, 5 channels)", serial: "acer-nic-0", facts: { declared: true, ports: [4781, 4947, 4782, 4792], ethernet_declared: true } },
    { kind: "BUS", idx: 0, name: "Acer PCI bus (declared)",       serial: "acer-bus-pci", facts: { declared: true, pending_live_enum: true } },
    { kind: "BUS", idx: 1, name: "Acer USB bus (declared)",       serial: "acer-bus-usb", facts: { declared: true, pending_live_enum: true } },
    { kind: "CTL", idx: 0, name: "Acer USB controller (declared)", serial: "acer-ctl-usb", facts: { declared: true } },
    { kind: "CTL", idx: 1, name: "Acer audio controller (declared)", serial: "acer-ctl-audio", facts: { declared: true } },
  ]),
  // DEV-FALCON (Samsung S24 phone)
  ...expandDeclared("DEV-FALCON", [
    { kind: "CPU", idx: 0, name: "S24 Snapdragon (declared)",   serial: "falcon-cpu", facts: { declared: true, vendor: "Qualcomm" } },
    { kind: "RAD", idx: 0, name: "S24 5G modem",                 serial: "falcon-rad-5g", facts: { declared: true } },
    { kind: "RAD", idx: 1, name: "S24 WiFi",                     serial: "falcon-rad-wifi", facts: { declared: true } },
    { kind: "RAD", idx: 2, name: "S24 BT",                       serial: "falcon-rad-bt", facts: { declared: true } },
    { kind: "CAM", idx: 0, name: "S24 main camera",              serial: "falcon-cam-main", facts: { declared: true } },
    { kind: "MIC", idx: 0, name: "S24 mic",                      serial: "falcon-mic", facts: { declared: true } },
    { kind: "BAT", idx: 0, name: "S24 battery",                  serial: "falcon-bat", facts: { declared: true } },
    { kind: "FMW", idx: 0, name: "NovaLUM firmware",             serial: "falcon-fmw-novalum", facts: { declared: true, shield_role: true } },
  ]),
  // DEV-AETHER (Debian Trixie node)
  ...expandDeclared("DEV-AETHER", [
    { kind: "CPU", idx: 0, name: "Aether CPU (declared)",       serial: "aether-cpu", facts: { declared: true } },
    { kind: "MEM", idx: 0, name: "Aether RAM (declared)",       serial: "aether-mem", facts: { declared: true } },
    { kind: "DSK", idx: 0, name: "Aether disk (declared)",      serial: "aether-dsk", facts: { declared: true } },
    { kind: "NIC", idx: 0, name: "Aether NIC (declared)",       serial: "aether-nic", facts: { declared: true, pulsing_to: "acer:4947" } },
  ]),
  // DEV-GAIA (Mac)
  ...expandDeclared("DEV-GAIA", [
    { kind: "CPU", idx: 0, name: "Gaia CPU (declared)",         serial: "gaia-cpu", facts: { declared: true } },
    { kind: "MEM", idx: 0, name: "Gaia RAM (declared)",         serial: "gaia-mem", facts: { declared: true } },
    { kind: "DSK", idx: 0, name: "Gaia disk (declared)",        serial: "gaia-dsk", facts: { declared: true } },
    { kind: "NIC", idx: 0, name: "Gaia NIC (declared)",         serial: "gaia-nic", facts: { declared: true } },
  ]),
];

function expandDeclared(dev: string, specs: Array<{ kind: HardwareKind; idx: number; name: string; serial: string; facts: Record<string, unknown> }>): HardwareEntry[] {
  return specs.map((s) => {
    const serial_hash8 = sha256Short(`${s.serial}||${s.name}`);
    const hilbert_level = 2;
    const base: Omit<HardwareEntry, "brown_hilbert_pid" | "glyph" | "registered_at" | "operator_witness"> = {
      kind: s.kind, parent_device: dev, parent_hw: null, instance_idx: s.idx,
      canonical_name: s.name, serial_hash8, hilbert_level,
      d11_level: "DECLARED", facts: s.facts,
    };
    return {
      ...base,
      glyph: hwGlyphFromKind(s.kind, dev, s.idx, serial_hash8, hilbert_level),
      brown_hilbert_pid: brownHilbertPidFor(base),
      registered_at: "2026-04-18",
      operator_witness: "rayssa+jesse",
    };
  });
}

/** Build one HW entry at arbitrary depth, optionally parented to another HW. */
function buildHwEntry(args: {
  kind: HardwareKind; dev: string; idx: number; name: string;
  serial: string; facts: Record<string, unknown>;
  hilbert_level: number; parent_hw: string | null;
  d11_level?: HardwareEntry["d11_level"]; witness?: string;
}): HardwareEntry {
  const serial_hash8 = sha256Short(`${args.serial}||${args.name}`);
  const base: Omit<HardwareEntry, "brown_hilbert_pid" | "glyph" | "registered_at" | "operator_witness"> = {
    kind: args.kind, parent_device: args.dev, parent_hw: args.parent_hw,
    instance_idx: args.idx, canonical_name: args.name, serial_hash8,
    hilbert_level: args.hilbert_level,
    d11_level: args.d11_level ?? "OBSERVED",
    facts: args.facts,
  };
  return {
    ...base,
    glyph: hwGlyphFromKind(args.kind, args.dev, args.idx, serial_hash8, args.hilbert_level),
    brown_hilbert_pid: brownHilbertPidFor(base),
    registered_at: new Date().toISOString(),
    operator_witness: args.witness ?? "live-enum-liris",
  };
}

/** Run a bounded wmic query on Windows. Returns [] on failure. */
function wmicQuery(expr: string, timeoutMs = 5000): Array<Record<string, string>> {
  try {
    const raw = execSync(`wmic ${expr} /format:csv`, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: timeoutMs });
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map((h) => h.trim());
    const out: Array<Record<string, string>> = [];
    for (const l of lines.slice(1)) {
      const parts = l.split(",");
      if (parts.length < header.length) continue;
      const rec: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) rec[header[i]] = parts[i]?.trim() ?? "";
      out.push(rec);
    }
    return out;
  } catch {
    return [];
  }
}

// ── Live enumeration for DEV-LIRIS (this process's own hardware) ─────────────

export function enumerateLocalHardware(): HardwareEntry[] {
  const out: HardwareEntry[] = [];
  const dev = "DEV-LIRIS";
  const host = hostname();

  // ── Level 03: CPU cores ───────────────────────────────────────────────────
  const cpuList = cpus();
  cpuList.forEach((c, i) => {
    out.push(buildHwEntry({
      kind: "CPU", dev, idx: i,
      name: `${c.model.trim()} (core ${i})`,
      serial: `${c.model}||${host}||${i}`,
      hilbert_level: 3, parent_hw: null,
      facts: { model: c.model.trim(), speed_mhz: c.speed, arch: arch(), platform: platform(), core_index: i },
    }));
  });

  // ── Level 04: cache levels per CPU (L1/L2/L3) via wmic Win32_Processor ───
  if (platform() === "win32") {
    const procs = wmicQuery("cpu get Name,NumberOfCores,NumberOfLogicalProcessors,L2CacheSize,L3CacheSize,MaxClockSpeed,SocketDesignation");
    procs.forEach((p, procIdx) => {
      // Pin this "package-level" CPU chip entry (level 02, parent of the logical cores)
      const chipGlyphEntry = buildHwEntry({
        kind: "CHP", dev, idx: procIdx,
        name: `CPU package: ${p.Name || "(unknown)"} @ socket ${p.SocketDesignation || "?"}`,
        serial: `cpu-package||${host}||${p.Name}||${p.SocketDesignation}`,
        hilbert_level: 2, parent_hw: null,
        facts: { name: p.Name, cores: parseInt(p.NumberOfCores, 10) || 0, logical_procs: parseInt(p.NumberOfLogicalProcessors, 10) || 0, max_mhz: parseInt(p.MaxClockSpeed, 10) || 0, socket: p.SocketDesignation },
      });
      out.push(chipGlyphEntry);
      // L2 + L3 cache entries parented to the chip
      const l2 = parseInt(p.L2CacheSize, 10) || 0;
      const l3 = parseInt(p.L3CacheSize, 10) || 0;
      if (l2 > 0) {
        out.push(buildHwEntry({
          kind: "CHE", dev, idx: procIdx * 3 + 1,
          name: `L2 cache (${l2} KB) on ${p.Name}`,
          serial: `l2||${host}||${procIdx}||${l2}`,
          hilbert_level: 4, parent_hw: chipGlyphEntry.glyph,
          facts: { level: "L2", size_kb: l2, parent_chip: chipGlyphEntry.glyph },
        }));
      }
      if (l3 > 0) {
        out.push(buildHwEntry({
          kind: "CHE", dev, idx: procIdx * 3 + 2,
          name: `L3 cache (${l3} KB) on ${p.Name}`,
          serial: `l3||${host}||${procIdx}||${l3}`,
          hilbert_level: 4, parent_hw: chipGlyphEntry.glyph,
          facts: { level: "L3", size_kb: l3, parent_chip: chipGlyphEntry.glyph },
        }));
      }
    });
  }

  // ── Level 02: Memory total (already had) + DIMM slots (via Win32_PhysicalMemory) ──
  {
    const total = totalmem();
    out.push(buildHwEntry({
      kind: "MEM", dev, idx: 0,
      name: `System RAM total`, serial: `mem-total||${host}||${total}`,
      hilbert_level: 2, parent_hw: null,
      facts: { total_bytes: total, free_bytes_at_enum: freemem(), total_gb: Math.round(total / 2 ** 30) },
    }));
  }
  if (platform() === "win32") {
    const dimms = wmicQuery("memorychip get BankLabel,Capacity,ConfiguredClockSpeed,DeviceLocator,Manufacturer,PartNumber,SerialNumber");
    dimms.forEach((d, i) => {
      if (!d.Capacity) return;
      out.push(buildHwEntry({
        kind: "SLT", dev, idx: i,
        name: `DIMM slot ${d.DeviceLocator || i} · ${d.Manufacturer || "?"} ${d.PartNumber || "?"} · ${Math.round((parseInt(d.Capacity, 10) || 0) / 2 ** 30)}GB`,
        serial: `dimm||${host}||${d.SerialNumber || i}||${d.PartNumber}`,
        hilbert_level: 3, parent_hw: null,
        facts: { bank: d.BankLabel, capacity_bytes: parseInt(d.Capacity, 10) || 0, clock_mhz: parseInt(d.ConfiguredClockSpeed, 10) || 0, locator: d.DeviceLocator, manufacturer: d.Manufacturer, part_number: d.PartNumber, serial_number: d.SerialNumber },
      }));
    });
  }

  // ── Level 02: Network interfaces ──────────────────────────────────────────
  const nifs = networkInterfaces();
  let nicIdx = 0;
  for (const [name, addrs] of Object.entries(nifs)) {
    if (!addrs || addrs.length === 0) continue;
    const mac = addrs[0].mac && addrs[0].mac !== "00:00:00:00:00:00" ? addrs[0].mac : `noMAC-${name}`;
    out.push(buildHwEntry({
      kind: "NIC", dev, idx: nicIdx,
      name: `${name} (${mac})`, serial: `nic||${host}||${name}||${mac}`,
      hilbert_level: 2, parent_hw: null,
      facts: { iface: name, mac, addresses: addrs.map((a) => ({ family: a.family, address: a.address, internal: a.internal })) },
    }));
    nicIdx++;
  }

  // ── Level 02: Disks (logical) ─────────────────────────────────────────────
  if (platform() === "win32") {
    const disks = wmicQuery("logicaldisk get DeviceID,Size,VolumeSerialNumber,FileSystem,DriveType");
    disks.forEach((d, i) => {
      if (!d.DeviceID || !d.DeviceID.match(/^[A-Z]:/)) return;
      out.push(buildHwEntry({
        kind: "DSK", dev, idx: i,
        name: `${d.DeviceID} (volSerial=${d.VolumeSerialNumber}, fs=${d.FileSystem})`,
        serial: `disk||${host}||${d.DeviceID}||${d.VolumeSerialNumber}`,
        hilbert_level: 2, parent_hw: null,
        facts: { device_id: d.DeviceID, size_bytes: parseInt(d.Size, 10) || 0, size_gb: Math.round((parseInt(d.Size, 10) || 0) / 2 ** 30), volume_serial: d.VolumeSerialNumber, filesystem: d.FileSystem, drive_type: d.DriveType },
      }));
    });
  }

  // ── Level 05: Busses (Win32_Bus) ──────────────────────────────────────────
  if (platform() === "win32") {
    const busses = wmicQuery("path Win32_Bus get DeviceID,BusType");
    busses.forEach((b, i) => {
      if (!b.DeviceID) return;
      out.push(buildHwEntry({
        kind: "BUS", dev, idx: i,
        name: `Bus ${b.DeviceID} (type=${b.BusType || "?"})`,
        serial: `bus||${host}||${b.DeviceID}||${b.BusType}`,
        hilbert_level: 5, parent_hw: null,
        facts: { device_id: b.DeviceID, bus_type: b.BusType },
      }));
    });
  }

  // ── Level 06: Ports (Win32_PortConnector) ─────────────────────────────────
  if (platform() === "win32") {
    const ports = wmicQuery("path Win32_PortConnector get ExternalReferenceDesignator,InternalReferenceDesignator,ConnectorType,PortType");
    ports.forEach((p, i) => {
      const label = p.ExternalReferenceDesignator || p.InternalReferenceDesignator || `port-${i}`;
      if (!label) return;
      out.push(buildHwEntry({
        kind: "PRT", dev, idx: i,
        name: `Port ${label} (type=${p.PortType || "?"})`,
        serial: `port||${host}||${label}||${p.ConnectorType}`,
        hilbert_level: 6, parent_hw: null,
        facts: { ext_label: p.ExternalReferenceDesignator, int_label: p.InternalReferenceDesignator, connector_type: p.ConnectorType, port_type: p.PortType },
      }));
    });
  }

  // ── Level 05: USB hubs / controllers (Win32_USBHub + Win32_USBController) ─
  if (platform() === "win32") {
    const hubs = wmicQuery("path Win32_USBHub get DeviceID,Name,Status", 4000);
    hubs.forEach((h, i) => {
      if (!h.DeviceID) return;
      out.push(buildHwEntry({
        kind: "USB", dev, idx: i,
        name: `USB hub: ${h.Name || h.DeviceID}`,
        serial: `usbhub||${host}||${h.DeviceID}`,
        hilbert_level: 5, parent_hw: null,
        facts: { device_id: h.DeviceID, name: h.Name, status: h.Status },
      }));
    });
    const usbCtrls = wmicQuery("path Win32_USBController get DeviceID,Name,Status", 4000);
    usbCtrls.forEach((u, i) => {
      if (!u.DeviceID) return;
      out.push(buildHwEntry({
        kind: "CTL", dev, idx: i,
        name: `USB controller: ${u.Name || u.DeviceID}`,
        serial: `usbctl||${host}||${u.DeviceID}`,
        hilbert_level: 4, parent_hw: null,
        facts: { device_id: u.DeviceID, name: u.Name, status: u.Status, controller_type: "USB" },
      }));
    });
  }

  // ── Level 02-03: GPUs (multi-GPU deep probe) ──────────────────────────────
  // Primary source: Win32_VideoController (catches everything Windows sees).
  // Enriched with: nvidia-smi (NVIDIA details — SM count, CUDA ver, driver),
  //                rocm-smi (AMD — AMDGPU) when present,
  //                registry-level PCIe ID extraction from PNPDeviceID.
  if (platform() === "win32") {
    const gpus = wmicQuery(
      "path Win32_VideoController get Name,AdapterCompatibility,AdapterRAM,DriverVersion,VideoProcessor,PNPDeviceID,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate,Status",
      6000,
    );
    gpus.forEach((g, i) => {
      if (!g.Name) return;
      // Parse PCI vendor+device from PNPDeviceID (e.g. PCI\VEN_8086&DEV_8A52&...)
      const pnp = g.PNPDeviceID || "";
      const venMatch = pnp.match(/VEN_([0-9A-F]{4})/i);
      const devMatch = pnp.match(/DEV_([0-9A-F]{4})/i);
      const ven = venMatch ? venMatch[1].toUpperCase() : null;
      const dev_id = devMatch ? devMatch[1].toUpperCase() : null;
      const vendorName =
        ven === "8086" ? "Intel" :
        ven === "10DE" ? "NVIDIA" :
        ven === "1002" ? "AMD" :
        ven === "1AE0" ? "Google" :
        g.AdapterCompatibility || "unknown";
      const gpuEntry = buildHwEntry({
        kind: "GPU", dev, idx: i,
        name: `${g.Name} (${vendorName}, ${g.VideoProcessor || "?"})`,
        serial: `gpu||${host}||${g.PNPDeviceID || g.Name}||${ven}:${dev_id}`,
        hilbert_level: 3, parent_hw: null,
        facts: {
          name: g.Name, vendor: vendorName,
          pci_vendor_id: ven, pci_device_id: dev_id,
          vram_bytes: parseInt(g.AdapterRAM, 10) || 0,
          driver_version: g.DriverVersion, video_processor: g.VideoProcessor,
          pnp_id: g.PNPDeviceID,
          current_resolution: g.CurrentHorizontalResolution && g.CurrentVerticalResolution
            ? `${g.CurrentHorizontalResolution}x${g.CurrentVerticalResolution}@${g.CurrentRefreshRate}Hz`
            : null,
          status: g.Status,
        },
      });
      out.push(gpuEntry);

      // Vendor-specific deep probes — only for NVIDIA/AMD when their tool is present.
      if (vendorName === "NVIDIA") {
        try {
          const smi = execSync(
            "nvidia-smi --query-gpu=index,name,uuid,driver_version,memory.total,memory.used,utilization.gpu,temperature.gpu,clocks.current.graphics,clocks.current.memory --format=csv,noheader,nounits",
            { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 },
          );
          const lines = smi.split(/\r?\n/).filter(Boolean);
          lines.forEach((l, j) => {
            const parts = l.split(",").map((p) => p.trim());
            if (parts.length < 10) return;
            const [nvIdx, nvName, uuid, driver, memTotal, memUsed, utilGpu, tempGpu, clockGfx, clockMem] = parts;
            // Child GPI entry carrying live telemetry
            out.push(buildHwEntry({
              kind: "GPI", dev, idx: i * 100 + j,
              name: `${nvName} NVIDIA telemetry (idx=${nvIdx})`,
              serial: `nvsmi||${uuid}`,
              hilbert_level: 4, parent_hw: gpuEntry.glyph,
              facts: {
                nvidia_index: parseInt(nvIdx, 10),
                uuid, driver_version: driver,
                memory_total_mib: parseInt(memTotal, 10),
                memory_used_mib: parseInt(memUsed, 10),
                utilization_gpu_pct: parseInt(utilGpu, 10),
                temperature_c: parseInt(tempGpu, 10),
                graphics_clock_mhz: parseInt(clockGfx, 10),
                memory_clock_mhz: parseInt(clockMem, 10),
                source: "nvidia-smi",
              },
            }));
          });
        } catch { /* nvidia-smi not installed or GPU unreachable */ }
      } else if (vendorName === "AMD") {
        try {
          const rocm = execSync("rocm-smi --showproductname --showmeminfo vram --showtemp --json",
            { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 4000 });
          out.push(buildHwEntry({
            kind: "GPI", dev, idx: i * 100,
            name: `AMD ROCm telemetry`,
            serial: `rocm||${gpuEntry.glyph}`,
            hilbert_level: 4, parent_hw: gpuEntry.glyph,
            facts: { rocm_raw_snapshot: rocm.slice(0, 2000), source: "rocm-smi" },
          }));
        } catch { /* rocm not present */ }
      }
    });

    // dxdiag enrichment — best-effort DirectX report for 1 extra telemetry layer.
    // Not run by default because dxdiag takes ~10s. Gated behind env var.
    if (process.env.ASOLARIA_ENUMERATE_DXDIAG === "1") {
      try {
        const tmpXml = join(homedir(), ".asolaria-workers", "dxdiag-snapshot.xml");
        execSync(`dxdiag /x "${tmpXml}"`, { stdio: "ignore", timeout: 15000 });
        // Parse minimal fields — just record that it ran; full XML parsing deferred.
        if (existsSync(tmpXml)) {
          out.push(buildHwEntry({
            kind: "FMW", dev, idx: 900,
            name: "DirectX dxdiag snapshot",
            serial: `dxdiag||${host}||${new Date().toISOString().slice(0, 10)}`,
            hilbert_level: 3, parent_hw: null,
            facts: { dxdiag_xml_path: tmpXml, source: "dxdiag" },
          }));
        }
      } catch { /* dxdiag unavailable */ }
    }
  }

  // ── Level 04: Audio devices (Win32_SoundDevice) ───────────────────────────
  if (platform() === "win32") {
    const snds = wmicQuery("path Win32_SoundDevice get Name,Manufacturer,PNPDeviceID,Status", 4000);
    snds.forEach((s, i) => {
      if (!s.Name) return;
      out.push(buildHwEntry({
        kind: "CTL", dev, idx: 100 + i,
        name: `Audio controller: ${s.Name}`,
        serial: `snd||${host}||${s.PNPDeviceID || s.Name}`,
        hilbert_level: 4, parent_hw: null,
        facts: { name: s.Name, manufacturer: s.Manufacturer, pnp_id: s.PNPDeviceID, status: s.Status, controller_type: "audio" },
      }));
    });
  }

  // ── Level 03: PnP entities (Win32_PnPEntity) — sampled, not exhaustive ────
  // Skip — would produce 200+ entries. Leave as future enumeration target.

  return out;
}

/** LIVE Task-Manager-equivalent snapshot piped into the system as a glyph
 *  sentence envelope. Captures: totals (CPU util, memory, process count) +
 *  top-N processes by CPU or memory. Uses wmic for portability. */
export interface TaskManagerSnapshot {
  captured_at: string;
  host: string;
  total_processes: number;
  total_threads: number;
  mem_used_bytes: number;
  mem_total_bytes: number;
  top_by_memory: Array<{ pid: number; name: string; ws_bytes: number; threads: number }>;
  load_avg_mhz: number;
  glyph_sentence: string;
}

/** INTERACTIVE Task Manager — live polling stream. Runs for durationMs,
 *  emits a snapshot every tickMs, returns all snapshots + writes each tick
 *  to ~/.asolaria-workers/taskmgr-events.ndjson for GC/Gulp pickup. Also
 *  emits a BEHCS-256 EVT-TASKMGR-TICK sentence per tick for speakable telemetry. */
export async function runInteractiveTaskManager(opts: { durationMs?: number; tickMs?: number; topN?: number; onTick?: (snap: TaskManagerSnapshot, tick: number) => void } = {}): Promise<TaskManagerSnapshot[]> {
  const durationMs = opts.durationMs ?? 8000;
  const tickMs = opts.tickMs ?? 1000;
  const topN = opts.topN ?? 5;
  const snaps: TaskManagerSnapshot[] = [];
  const startedAt = Date.now();
  let tick = 0;
  while (Date.now() - startedAt < durationMs) {
    const snap = snapshotTaskManager(topN);
    snaps.push(snap);
    opts.onTick?.(snap, tick);
    tick++;
    await new Promise((r) => setTimeout(r, tickMs));
  }
  return snaps;
}

export function snapshotTaskManager(topN = 10): TaskManagerSnapshot {
  const host = hostname();
  const mem_total_bytes = totalmem();
  const mem_used_bytes = totalmem() - freemem();
  let total_processes = 0, total_threads = 0;
  const top_by_memory: TaskManagerSnapshot["top_by_memory"] = [];
  if (platform() === "win32") {
    const procs = wmicQuery("process get ProcessId,Name,WorkingSetSize,ThreadCount", 8000);
    total_processes = procs.length;
    for (const p of procs) {
      total_threads += parseInt(p.ThreadCount, 10) || 0;
    }
    const sorted = procs
      .map((p) => ({ pid: parseInt(p.ProcessId, 10) || 0, name: p.Name || "?", ws_bytes: parseInt(p.WorkingSetSize, 10) || 0, threads: parseInt(p.ThreadCount, 10) || 0 }))
      .filter((p) => p.ws_bytes > 0)
      .sort((a, b) => b.ws_bytes - a.ws_bytes)
      .slice(0, topN);
    top_by_memory.push(...sorted);
  }
  const load_avg_mhz = cpus().reduce((a, c) => a + c.speed, 0) / Math.max(1, cpus().length);
  const glyph_sentence = `EVT-TASKMGR-SNAPSHOT · host=${host} · procs=${total_processes} · threads=${total_threads} · mem=${Math.round((mem_used_bytes / mem_total_bytes) * 100)}pct · top=${top_by_memory.length} @ M-EYEWITNESS .`;

  // Pipe into the system via dedicated NDJSON stream (GC/Gulp covered).
  const streamPath = join(homedir(), ".asolaria-workers", "taskmgr-events.ndjson");
  try {
    appendFileSync(streamPath, JSON.stringify({
      ts: new Date().toISOString(),
      event: "EVT-TASKMGR-SNAPSHOT",
      host, total_processes, total_threads,
      mem_used_bytes, mem_total_bytes, mem_used_pct: Math.round((mem_used_bytes / mem_total_bytes) * 100),
      load_avg_mhz: Math.round(load_avg_mhz),
      top_by_memory,
      glyph_sentence,
    }) + "\n");
  } catch { /* non-fatal */ }

  return {
    captured_at: new Date().toISOString(),
    host, total_processes, total_threads,
    mem_used_bytes, mem_total_bytes, top_by_memory, load_avg_mhz,
    glyph_sentence,
  };
}

export function registerHardware(entry: Omit<HardwareEntry, "registered_at" | "brown_hilbert_pid" | "glyph"> & { glyph?: string; brown_hilbert_pid?: string }): HardwareEntry {
  const serial_hash8 = entry.serial_hash8 || sha256Short(entry.canonical_name);
  const glyph = entry.glyph ?? hwGlyphFromKind(entry.kind, entry.parent_device, entry.instance_idx, serial_hash8, entry.hilbert_level);
  const brown_hilbert_pid = entry.brown_hilbert_pid ?? brownHilbertPidFor({ ...entry, serial_hash8 });
  const full: HardwareEntry = {
    ...entry, glyph, brown_hilbert_pid, serial_hash8,
    registered_at: new Date().toISOString(),
  };

  let existing: HardwareEntry[] = [];
  if (existsSync(HW_REGISTRY_PATH)) {
    try { existing = (JSON.parse(readFileSync(HW_REGISTRY_PATH, "utf-8")) as HardwareRegistry).hardware ?? []; } catch { /* empty */ }
  }
  const filtered = existing.filter((h) => h.glyph !== full.glyph);
  filtered.push(full);
  const reg: HardwareRegistry = {
    version: "0.1.0", updated_at: new Date().toISOString(),
    hardware: filtered,
    notes: [`last_added=${full.glyph}`, `operator_witness=${full.operator_witness}`],
  };
  writeFileSync(HW_REGISTRY_PATH, JSON.stringify(reg, null, 2), "utf-8");

  // Delta for kernel/glyph-families.json promotion
  let delta: { candidates: HardwareEntry[]; status: string } = { candidates: [], status: "AWAITING_6_BODY_REVIEW" };
  if (existsSync(HW_FAMILY_DELTA)) {
    try { delta = JSON.parse(readFileSync(HW_FAMILY_DELTA, "utf-8")); } catch { /* start fresh */ }
  }
  delta.candidates = delta.candidates.filter((c) => c.glyph !== full.glyph);
  delta.candidates.push(full);
  writeFileSync(HW_FAMILY_DELTA, JSON.stringify(delta, null, 2), "utf-8");

  appendFileSync(HW_REGISTRY_EVENTS, JSON.stringify({
    ts: new Date().toISOString(),
    event: "EVT-HARDWARE-REGISTERED",
    glyph: full.glyph,
    kind: full.kind,
    parent_device: full.parent_device,
    brown_hilbert_pid: full.brown_hilbert_pid,
    d11_level: full.d11_level,
    glyph_sentence: `EVT-HARDWARE-REGISTERED { ${full.glyph} } · ${full.kind} · parent=${full.parent_device} · pid=${full.brown_hilbert_pid} @ M-${full.d11_level === "OBSERVED" ? "EYEWITNESS" : "SUBJUNCTIVE"} .`,
  }) + "\n");

  return full;
}

export function loadHardwareRegistry(): HardwareRegistry {
  let runtime: HardwareEntry[] = [];
  if (existsSync(HW_REGISTRY_PATH)) {
    try {
      runtime = (JSON.parse(readFileSync(HW_REGISTRY_PATH, "utf-8")) as HardwareRegistry).hardware ?? [];
    } catch { /* empty */ }
  }
  const byGlyph = new Map<string, HardwareEntry>();
  for (const h of CANONICAL_HARDWARE) byGlyph.set(h.glyph, h);
  for (const h of runtime) byGlyph.set(h.glyph, h);
  return {
    version: "0.1.0", updated_at: new Date().toISOString(),
    hardware: Array.from(byGlyph.values()),
    notes: [
      `Canonical declared: ${CANONICAL_HARDWARE.length}`,
      `Runtime-registered: ${runtime.length}`,
      "Every HW-* glyph gets Brown-Hilbert PID + PROF-HW-*-SUPERVISOR + per-piece NDJSON stream (GC+Gulp covered)",
      "Live-enumerable on DEV-LIRIS via enumerateLocalHardware()",
    ],
  };
}
