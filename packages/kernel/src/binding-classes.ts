// packages/kernel/src/binding-classes.ts — D-056 binding_class taxonomy
//
// Generalizes the D-054 two-layer rule into a machine-checkable taxonomy:
//   each entity kind declares whether it is substrate-independent, device-bound,
//   or hybrid (some facets live on one side, some on the other).
//
// This turns "ontology says substrate_independent=true on ASOLARIA_ROOT" — a
// one-off boolean on one entity — into a per-kind invariant that a validator
// can assert at runtime.
//
// References:
//   plans/D/device-bound-instance-as-root.md  (D-054 policy)
//   packages/kernel/src/ed25519-registry.ts   (D-055 uses device-bound)
//   packages/kernel/src/device-registry.ts    (ONTOLOGY V2 entities)

export type BindingClass =
  | "substrate-independent"  // identity and state float across devices; any peer can hold, serve, verify
  | "device-bound"           // identity and state tied to a specific physical device; migration requires re-issuance
  | "hybrid";                // entity has both facets — taxonomy's `facets` map enumerates which are which

export type EntityKind =
  | "OP"         // operator (human)
  | "CIV"        // civilization
  | "COL"        // colony
  | "AGT"        // agent
  | "DEV"        // device
  | "ORBITAL"   // phone / edge node
  | "HW"         // hardware piece
  | "AGT-KEY";   // signing key (ed25519, future HSM-backed)

export interface EntityKindDecl {
  kind: EntityKind;
  binding_class: BindingClass;
  /** For HYBRID entities: which facet is device-bound, which is substrate-independent. */
  facets?: Record<string, BindingClass>;
  /** Human-readable rationale — survives into docs. */
  rationale: string;
  /** Invariants that MUST hold for this kind. Each string is a human rule. */
  invariants: string[];
}

// ──────────────────────────────────────────────────────────────────────
// Canonical taxonomy — 8 entity kinds
// ──────────────────────────────────────────────────────────────────────

export const ENTITY_KIND_DECLS: Record<EntityKind, EntityKindDecl> = {
  "OP": {
    kind: "OP",
    binding_class: "substrate-independent",
    rationale: "Operators are humans (OP-JESSE). Humans are not literal processes — the operator identity floats across laptops, phones, sessions. What's bound to a device is the operator's *witness* (physical possession of a co-signing device), not the operator itself.",
    invariants: [
      "OP-* entity MUST NOT encode a specific DEV-* as its root substrate",
      "Witness signatures from an OP-* MAY reference device-bound keys, but the OP-* itself is substrate-independent",
    ],
  },
  "CIV": {
    kind: "CIV",
    binding_class: "substrate-independent",
    rationale: "Civilization (CIV-ASOLARIA) is the federation concept. Outlives any one machine. Already has substrate_independent=true on ASOLARIA_ROOT per D-054.",
    invariants: [
      "CIV-* entity MUST NOT have a canonical_substrate field",
      "CIV-* survives loss of any DEV-*",
    ],
  },
  "COL": {
    kind: "COL",
    binding_class: "substrate-independent",
    rationale: "Colony (COL-LIRIS, COL-AMY, COL-FELIPE) is the social unit. `preferred_substrate` is a hint for current operational home, not an identity binding. When the preferred device dies the colony survives.",
    invariants: [
      "COL-* MUST have an operator",
      "COL-*.preferred_substrate is a hint (string), not an identity claim",
      "COL-* MUST survive rotation to a new preferred_substrate",
    ],
  },
  "AGT": {
    kind: "AGT",
    binding_class: "substrate-independent",
    rationale: "Agents (AGT-ROSE, AGT-ORACLE) are BEHCS profiles carrying Brown-Hilbert PIDs. The PID is the identity; the silicon hosting the runtime is contingent. An agent can migrate from DEV-AMY-MAC to DEV-AMY-LINUX without becoming a new agent.",
    invariants: [
      "AGT-* identity MUST be encoded in the Brown-Hilbert PID, not in the hosting DEV-*",
      "AGT-*.hosted_on is a hint (string), not an identity claim",
      "AGT-* can migrate between DEV-*; migration keeps the glyph",
    ],
  },
  "DEV": {
    kind: "DEV",
    binding_class: "hybrid",
    facets: {
      "hardware":         "device-bound",
      "profile":          "substrate-independent",
      "federation_port":  "device-bound",
      "canonical_root":   "device-bound",
      "role":             "substrate-independent",
      "capabilities":     "substrate-independent",
    },
    rationale: "A device (DEV-ACER, DEV-LIRIS) is literally a physical machine — its hardware, ports, and local filesystem paths are device-bound. But a DEV-*'s *role* in the federation (capital, primary-dev-host, orbital) and its *capabilities* are substrate-independent descriptions that could in principle be reassigned to a new device if the old one dies.",
    invariants: [
      "DEV-*.federation_port MUST belong to the specific host (no portable port number)",
      "DEV-*.canonical_root MUST be a local filesystem path (no federation-global path)",
      "DEV-*.role MAY be reassigned to a different physical host without changing the role's meaning",
      "DEV-*'s hardware-registered HW-* PIDs encode the device glyph + serial hash — those are device-bound by construction",
    ],
  },
  "ORBITAL": {
    kind: "ORBITAL",
    binding_class: "device-bound",
    rationale: "Orbitals (ORBITAL-FELIPE-A06) are specific phones / edge devices. A Galaxy A06 is one physical phone with one IMEI and one serial; the orbital IS the device. Different from DEV-* because orbitals typically don't offer general compute — they serve as sensors, beacons, USB-attached bridges.",
    invariants: [
      "ORBITAL-* MUST reference a specific device serial or equivalent hardware-unique ID",
      "ORBITAL-* identity cannot migrate to a new physical device — losing the device retires the orbital",
      "ORBITAL-* MAY be part of a COL-* even when its operator has no full computer (see COL-FELIPE)",
    ],
  },
  "HW": {
    kind: "HW",
    binding_class: "device-bound",
    rationale: "Hardware pieces (HW-H02-KCPU-DACER-I001-S3f8a21c9) are physical components. The PID encodes the parent device glyph and a sha8 of the serial number. Hardware IS its device; you can't float an Intel Core i7 to another laptop by changing a config.",
    invariants: [
      "HW-* PID MUST include parent DEV-* code (D<dev-short>)",
      "HW-* PID MUST include serial-hash (S<hex8>)",
      "HW-* cannot be substrate-independent by any reasonable reading — it is the substrate",
    ],
  },
  "AGT-KEY": {
    kind: "AGT-KEY",
    binding_class: "device-bound",
    rationale: "Signing keys (D-055 ed25519) must never leave the host. A private key that can be copied to another machine is indistinguishable from a leaked key. Already enforced in ed25519-registry.ts (mintKey returns private_key_b64 for caller to stash locally; saveRegistry never writes the private bytes).",
    invariants: [
      "AGT-KEY (any signing key) MUST declare binding_class='device-bound'",
      "AGT-KEY.host_device MUST be a DEV-*",
      "AGT-KEY private bytes MUST NOT appear in any public registry",
      "AGT-KEY.d11_level=OBSERVED requires operator-witness co-signature",
      "Rotation MUST be non-destructive (stamp rotated_at, don't delete the entry)",
    ],
  },
};

// ──────────────────────────────────────────────────────────────────────
// Glyph → EntityKind
// ──────────────────────────────────────────────────────────────────────

const GLYPH_PREFIX_TO_KIND: Array<{ re: RegExp; kind: EntityKind }> = [
  { re: /^OP-[A-Z][A-Z0-9_-]*$/,          kind: "OP" },
  { re: /^CIV-[A-Z][A-Z0-9_-]*$/,         kind: "CIV" },
  { re: /^COL-[A-Z][A-Z0-9_-]*$/,         kind: "COL" },
  { re: /^AGT-[A-Z][A-Z0-9_-]*$/,         kind: "AGT" },
  { re: /^DEV-[A-Z][A-Z0-9_-]*$/,         kind: "DEV" },
  { re: /^ORBITAL-[A-Z][A-Z0-9_-]*$/,     kind: "ORBITAL" },
  { re: /^HW-[A-Za-z0-9-]+$/,             kind: "HW" },
];

/** Return the entity kind for a glyph, or null if the glyph doesn't match any known prefix. */
export function entityKindOf(glyph: string): EntityKind | null {
  for (const { re, kind } of GLYPH_PREFIX_TO_KIND) if (re.test(glyph)) return kind;
  return null;
}

/** Return the declared binding class for a glyph, or null if unknown. */
export function bindingClassOf(glyph: string): BindingClass | null {
  const k = entityKindOf(glyph);
  if (!k) return null;
  return ENTITY_KIND_DECLS[k].binding_class;
}

/** Return the full declaration for a glyph. */
export function declOf(glyph: string): EntityKindDecl | null {
  const k = entityKindOf(glyph);
  return k ? ENTITY_KIND_DECLS[k] : null;
}

// ──────────────────────────────────────────────────────────────────────
// Invariant checks
// ──────────────────────────────────────────────────────────────────────

export interface InvariantCheckResult {
  ok: boolean;
  glyph: string;
  kind: EntityKind | null;
  declared_binding: BindingClass | null;
  violations: string[];
}

/** Check whether a key-registry entry satisfies the AGT-KEY invariants. */
export function validateKeyEntry(entry: {
  key_id?: string;
  owner_glyph?: string;
  binding_class?: string;
  host_device?: string;
  public_key_b64?: string;
  private_key_b64?: string;  // SHOULD never be set on a registry entry
}): InvariantCheckResult {
  const violations: string[] = [];
  if (entry.binding_class !== "device-bound") violations.push("AGT-KEY must be device-bound");
  if (!entry.host_device || !entry.host_device.startsWith("DEV-")) violations.push("AGT-KEY.host_device must be a DEV-* glyph");
  if ((entry as any).private_key_b64) violations.push("AGT-KEY registry entry MUST NOT contain private_key_b64");
  if (!entry.public_key_b64) violations.push("AGT-KEY must have public_key_b64");
  return {
    ok: violations.length === 0,
    glyph: entry.key_id ?? "(no-key-id)",
    kind: "AGT-KEY",
    declared_binding: "device-bound",
    violations,
  };
}

/** Check whether a device entry agrees with the DEV-* hybrid declaration. */
export function validateDeviceEntry(entry: {
  glyph?: string;
  federation_port?: number | string;
  canonical_root?: string | null;
  role?: string;
}): InvariantCheckResult {
  const violations: string[] = [];
  if (!entry.glyph || entityKindOf(entry.glyph) !== "DEV") violations.push("glyph must be a DEV-*");
  if (entry.federation_port == null) violations.push("DEV-*.federation_port is device-bound (required)");
  // canonical_root may be null (for phone/remote devices), but if set must be a local fs path
  if (entry.canonical_root && !/^[A-Za-z]:\/|^\//.test(entry.canonical_root)) violations.push("DEV-*.canonical_root must be a local filesystem path");
  return {
    ok: violations.length === 0,
    glyph: entry.glyph ?? "(no-glyph)",
    kind: "DEV",
    declared_binding: "hybrid",
    violations,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Summary helpers
// ──────────────────────────────────────────────────────────────────────

export function taxonomySummary() {
  const by_binding: Record<BindingClass, EntityKind[]> = {
    "substrate-independent": [],
    "device-bound": [],
    "hybrid": [],
  };
  for (const k of Object.keys(ENTITY_KIND_DECLS) as EntityKind[]) {
    by_binding[ENTITY_KIND_DECLS[k].binding_class].push(k);
  }
  return {
    kind_count: Object.keys(ENTITY_KIND_DECLS).length,
    by_binding,
    summary_sentence: `META-BINDING-TAXONOMY · substrate-independent=[${by_binding["substrate-independent"].join(",")}] · device-bound=[${by_binding["device-bound"].join(",")}] · hybrid=[${by_binding["hybrid"].join(",")}] @ M-INDICATIVE .`,
  };
}
