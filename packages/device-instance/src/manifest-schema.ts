// manifest-schema.ts — Section E-067 canonical _asolaria_identity.json schema.
//
// Section E plan used zod shape; we implement the same semantics with zero
// external deps (vanilla Node + tsx). The list-every-violation posture
// mirrors @asolaria/envelope validator.
//
// Every device-bound AsolariaInstance has EXACTLY ONE manifest on disk.
// Arrays location_history + drift_log are append-only (enforced elsewhere at
// write time; this validator just checks shape).
//
// LAW-001 / LAW-008 / LAW-012 compliant; pure function.
// named_agent: liris-smp-v5-E-067-builder (2026-04-18).

export const OBSERVER_SURFACES = ["liris", "asolaria", "gaia", "falcon", "felipe"] as const;
export type ObserverSurface = (typeof OBSERVER_SURFACES)[number];

export const OPERATOR_IDS = ["rayssa", "jesse"] as const;
export type OperatorId = (typeof OPERATOR_IDS)[number];

export const PROVENANCE_VALUES = ["original", "rebound", "cloned-acknowledged"] as const;
export type Provenance = (typeof PROVENANCE_VALUES)[number];

export const LOCATION_STATUS_VALUES = ["sanctioned", "pending_bless", "rejected"] as const;
export type LocationStatus = (typeof LOCATION_STATUS_VALUES)[number];

export const DRIFT_TYPES = ["location", "fingerprint", "identity", "no_history"] as const;
export type DriftType = (typeof DRIFT_TYPES)[number];

export const DRIFT_RESOLUTIONS = ["cleared", "halted", "pending", "escalated"] as const;
export type DriftResolution = (typeof DRIFT_RESOLUTIONS)[number];

export const DRIFT_CLASSIFICATIONS = [
  "lined-up",
  "sanctioned-remount",
  "new-location",
  "masquerade",
  "NO_HISTORY",
] as const;
export type DriftClassification = (typeof DRIFT_CLASSIFICATIONS)[number];

export const CONSTITUTIONAL_CLAUSES = [
  "no_mutation_without_operator_acknowledged_rebind",
  "verify_on_every_touch",
  "halt_on_fingerprint_drift",
] as const;
export type ConstitutionalClause = (typeof CONSTITUTIONAL_CLAUSES)[number];

export interface ShapeFingerprint {
  scale_1: string;
  scale_10: string;
  scale_100: string;
  scale_1k: string;
  scale_10k: string;
}

export interface FirstObservationTuple {
  ts: string;
  observer_pid: string;
  observer_surface: ObserverSurface;
  operator_id: OperatorId;
  host_surface: string;
}

export interface LocationHistoryEntry {
  ts: string;
  host: string;
  drive_letter: string | null;
  disk_number: number | null;
  partition_number: number | null;
  partition_guid: string | null;
  mount_path: string;
  observer: string;
  operator: OperatorId;
  status: LocationStatus;
  note?: string;
}

export interface DriftLogEntry {
  ts: string;
  type: DriftType;
  observed_location: string;
  expected_location: string | null;
  broadcast_to: string[];
  broadcast_ack: string[];
  resolution: DriftResolution;
  classification: DriftClassification;
}

export interface AsolariaIdentityManifest {
  permanent_name: string; // /^[a-z0-9-]+$/
  hilbert_pid: string;
  shape_fingerprint: ShapeFingerprint;
  first_observation_tuple: FirstObservationTuple;
  provenance: Provenance;
  last_verified_at: string;
  last_verified_by: string;
  constitutional_clauses: ConstitutionalClause[];
  location_history: LocationHistoryEntry[];
  drift_log: DriftLogEntry[];
  schema_version: "1.0.0";
}

export type ViolationKind =
  | "not_object"
  | "missing_required"
  | "wrong_type"
  | "bad_format"
  | "bad_enum"
  | "constitutional_clauses_insufficient"
  | "append_only_violation";

export interface Violation {
  kind: ViolationKind;
  field?: string;
  message: string;
  detail?: unknown;
}

export interface ValidateResult {
  ok: boolean;
  violations: Violation[];
}

const PERMANENT_NAME_RE = /^[a-z0-9-]+$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}
function isNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function pushMissing(violations: Violation[], field: string): void {
  violations.push({ kind: "missing_required", field, message: `required field '${field}' missing` });
}
function pushWrong(violations: Violation[], field: string, message: string, detail?: unknown): void {
  violations.push({ kind: "wrong_type", field, message, detail });
}

export function validateShapeFingerprint(o: unknown, path: string, violations: Violation[]): void {
  if (!isPlainObject(o)) {
    pushWrong(violations, path, `${path} must be an object`);
    return;
  }
  for (const k of ["scale_1", "scale_10", "scale_100", "scale_1k", "scale_10k"] as const) {
    if (!(k in o)) {
      pushMissing(violations, `${path}.${k}`);
    } else if (typeof o[k] !== "string") {
      pushWrong(violations, `${path}.${k}`, `${path}.${k} must be a string`);
    }
  }
}

export function validateFirstObservationTuple(o: unknown, path: string, violations: Violation[]): void {
  if (!isPlainObject(o)) {
    pushWrong(violations, path, `${path} must be an object`);
    return;
  }
  for (const k of ["ts", "observer_pid", "observer_surface", "operator_id", "host_surface"] as const) {
    if (!(k in o)) pushMissing(violations, `${path}.${k}`);
  }
  if (typeof o.ts === "string" && !ISO_RE.test(o.ts)) {
    violations.push({ kind: "bad_format", field: `${path}.ts`, message: `ts '${o.ts}' is not ISO-8601` });
  }
  if (typeof o.observer_surface === "string" && !OBSERVER_SURFACES.includes(o.observer_surface as ObserverSurface)) {
    violations.push({ kind: "bad_enum", field: `${path}.observer_surface`, message: `observer_surface '${o.observer_surface}' not in ${OBSERVER_SURFACES.join("|")}` });
  }
  if (typeof o.operator_id === "string" && !OPERATOR_IDS.includes(o.operator_id as OperatorId)) {
    violations.push({ kind: "bad_enum", field: `${path}.operator_id`, message: `operator_id '${o.operator_id}' not in ${OPERATOR_IDS.join("|")}` });
  }
}

export function validateLocationHistoryEntry(o: unknown, path: string, violations: Violation[]): void {
  if (!isPlainObject(o)) {
    pushWrong(violations, path, `${path} must be an object`);
    return;
  }
  for (const k of ["ts", "host", "drive_letter", "disk_number", "partition_number", "partition_guid", "mount_path", "observer", "operator", "status"] as const) {
    if (!(k in o)) pushMissing(violations, `${path}.${k}`);
  }
  if (typeof o.ts === "string" && !ISO_RE.test(o.ts)) {
    violations.push({ kind: "bad_format", field: `${path}.ts`, message: `ts '${o.ts}' is not ISO-8601` });
  }
  if (!isStringOrNull(o.drive_letter)) pushWrong(violations, `${path}.drive_letter`, `drive_letter must be string|null`);
  if (!isNumberOrNull(o.disk_number)) pushWrong(violations, `${path}.disk_number`, `disk_number must be number|null`);
  if (!isNumberOrNull(o.partition_number)) pushWrong(violations, `${path}.partition_number`, `partition_number must be number|null`);
  if (!isStringOrNull(o.partition_guid)) pushWrong(violations, `${path}.partition_guid`, `partition_guid must be string|null`);
  if (typeof o.operator === "string" && !OPERATOR_IDS.includes(o.operator as OperatorId)) {
    violations.push({ kind: "bad_enum", field: `${path}.operator`, message: `operator '${o.operator}' not in ${OPERATOR_IDS.join("|")}` });
  }
  if (typeof o.status === "string" && !LOCATION_STATUS_VALUES.includes(o.status as LocationStatus)) {
    violations.push({ kind: "bad_enum", field: `${path}.status`, message: `status '${o.status}' not in ${LOCATION_STATUS_VALUES.join("|")}` });
  }
}

export function validateDriftLogEntry(o: unknown, path: string, violations: Violation[]): void {
  if (!isPlainObject(o)) {
    pushWrong(violations, path, `${path} must be an object`);
    return;
  }
  for (const k of ["ts", "type", "observed_location", "expected_location", "broadcast_to", "broadcast_ack", "resolution", "classification"] as const) {
    if (!(k in o)) pushMissing(violations, `${path}.${k}`);
  }
  if (typeof o.ts === "string" && !ISO_RE.test(o.ts)) {
    violations.push({ kind: "bad_format", field: `${path}.ts`, message: `ts '${o.ts}' is not ISO-8601` });
  }
  if (typeof o.type === "string" && !DRIFT_TYPES.includes(o.type as DriftType)) {
    violations.push({ kind: "bad_enum", field: `${path}.type`, message: `type '${o.type}' not in ${DRIFT_TYPES.join("|")}` });
  }
  if (!Array.isArray(o.broadcast_to)) pushWrong(violations, `${path}.broadcast_to`, `broadcast_to must be an array`);
  if (!Array.isArray(o.broadcast_ack)) pushWrong(violations, `${path}.broadcast_ack`, `broadcast_ack must be an array`);
  if (typeof o.resolution === "string" && !DRIFT_RESOLUTIONS.includes(o.resolution as DriftResolution)) {
    violations.push({ kind: "bad_enum", field: `${path}.resolution`, message: `resolution '${o.resolution}' not in ${DRIFT_RESOLUTIONS.join("|")}` });
  }
  if (typeof o.classification === "string" && !DRIFT_CLASSIFICATIONS.includes(o.classification as DriftClassification)) {
    violations.push({ kind: "bad_enum", field: `${path}.classification`, message: `classification '${o.classification}' not in ${DRIFT_CLASSIFICATIONS.join("|")}` });
  }
}

export function validateManifest(input: unknown): ValidateResult {
  const violations: Violation[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, violations: [{ kind: "not_object", message: "manifest must be a plain object" }] };
  }

  for (const k of [
    "permanent_name",
    "hilbert_pid",
    "shape_fingerprint",
    "first_observation_tuple",
    "provenance",
    "last_verified_at",
    "last_verified_by",
    "constitutional_clauses",
    "location_history",
    "drift_log",
    "schema_version",
  ] as const) {
    if (!(k in input)) pushMissing(violations, k);
  }

  if (typeof input.permanent_name === "string" && !PERMANENT_NAME_RE.test(input.permanent_name)) {
    violations.push({
      kind: "bad_format",
      field: "permanent_name",
      message: `permanent_name '${input.permanent_name}' must match /^[a-z0-9-]+$/`,
    });
  }

  if (typeof input.last_verified_at === "string" && !ISO_RE.test(input.last_verified_at)) {
    violations.push({ kind: "bad_format", field: "last_verified_at", message: "last_verified_at not ISO-8601" });
  }

  if (typeof input.provenance === "string" && !PROVENANCE_VALUES.includes(input.provenance as Provenance)) {
    violations.push({
      kind: "bad_enum",
      field: "provenance",
      message: `provenance '${input.provenance}' not in ${PROVENANCE_VALUES.join("|")}`,
    });
  }

  if (input.schema_version !== "1.0.0") {
    violations.push({
      kind: "bad_enum",
      field: "schema_version",
      message: `schema_version must be literal '1.0.0'`,
    });
  }

  if (input.shape_fingerprint !== undefined) {
    validateShapeFingerprint(input.shape_fingerprint, "shape_fingerprint", violations);
  }
  if (input.first_observation_tuple !== undefined) {
    validateFirstObservationTuple(input.first_observation_tuple, "first_observation_tuple", violations);
  }

  if (Array.isArray(input.constitutional_clauses)) {
    if (input.constitutional_clauses.length < 3) {
      violations.push({
        kind: "constitutional_clauses_insufficient",
        field: "constitutional_clauses",
        message: `constitutional_clauses needs at least 3 entries; got ${input.constitutional_clauses.length}`,
      });
    }
    for (let i = 0; i < input.constitutional_clauses.length; i++) {
      const c = input.constitutional_clauses[i];
      if (typeof c !== "string" || !CONSTITUTIONAL_CLAUSES.includes(c as ConstitutionalClause)) {
        violations.push({
          kind: "bad_enum",
          field: `constitutional_clauses[${i}]`,
          message: `constitutional_clause '${String(c)}' not in ${CONSTITUTIONAL_CLAUSES.join("|")}`,
        });
      }
    }
  } else if (input.constitutional_clauses !== undefined) {
    pushWrong(violations, "constitutional_clauses", "constitutional_clauses must be an array");
  }

  if (Array.isArray(input.location_history)) {
    for (let i = 0; i < input.location_history.length; i++) {
      validateLocationHistoryEntry(input.location_history[i], `location_history[${i}]`, violations);
    }
  } else if (input.location_history !== undefined) {
    pushWrong(violations, "location_history", "location_history must be an array");
  }

  if (Array.isArray(input.drift_log)) {
    for (let i = 0; i < input.drift_log.length; i++) {
      validateDriftLogEntry(input.drift_log[i], `drift_log[${i}]`, violations);
    }
  } else if (input.drift_log !== undefined) {
    pushWrong(violations, "drift_log", "drift_log must be an array");
  }

  return { ok: violations.length === 0, violations };
}

/** Append-only invariant check between a prior manifest and a proposed new one.
 * Returns violations listing any entry that was dropped or re-ordered. */
export function checkAppendOnlyDiff(prior: AsolariaIdentityManifest, next: AsolariaIdentityManifest): Violation[] {
  const violations: Violation[] = [];
  const checkArray = <T>(field: string, priorArr: T[], nextArr: T[], eq: (a: T, b: T) => boolean): void => {
    if (nextArr.length < priorArr.length) {
      violations.push({
        kind: "append_only_violation",
        field,
        message: `${field} shrank from ${priorArr.length} to ${nextArr.length}`,
      });
      return;
    }
    for (let i = 0; i < priorArr.length; i++) {
      if (!eq(priorArr[i], nextArr[i])) {
        violations.push({
          kind: "append_only_violation",
          field: `${field}[${i}]`,
          message: `${field}[${i}] was modified between writes (append-only violation)`,
        });
      }
    }
  };
  checkArray<LocationHistoryEntry>(
    "location_history",
    prior.location_history,
    next.location_history,
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
  checkArray<DriftLogEntry>(
    "drift_log",
    prior.drift_log,
    next.drift_log,
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
  if (prior.permanent_name !== next.permanent_name) {
    violations.push({
      kind: "append_only_violation",
      field: "permanent_name",
      message: "permanent_name is frozen after first write",
    });
  }
  if (JSON.stringify(prior.first_observation_tuple) !== JSON.stringify(next.first_observation_tuple)) {
    violations.push({
      kind: "append_only_violation",
      field: "first_observation_tuple",
      message: "first_observation_tuple is frozen after first write",
    });
  }
  return violations;
}
