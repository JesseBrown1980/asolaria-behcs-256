// manifest-schema.test.ts — E-067 validator tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateManifest,
  checkAppendOnlyDiff,
  type AsolariaIdentityManifest,
  CONSTITUTIONAL_CLAUSES,
} from "../src/index.ts";

function valid(): AsolariaIdentityManifest {
  return {
    permanent_name: "liris-primary",
    hilbert_pid: "PID-H01-A01-W000000001-P001-N00001",
    shape_fingerprint: {
      scale_1: "sha1",
      scale_10: "sha10",
      scale_100: "sha100",
      scale_1k: "sha1k",
      scale_10k: "sha10k",
    },
    first_observation_tuple: {
      ts: "2026-04-18T23:00:00Z",
      observer_pid: "PID-OBS-1",
      observer_surface: "liris",
      operator_id: "rayssa",
      host_surface: "liris",
    },
    provenance: "original",
    last_verified_at: "2026-04-18T23:00:00Z",
    last_verified_by: "rayssa",
    constitutional_clauses: [...CONSTITUTIONAL_CLAUSES],
    location_history: [],
    drift_log: [],
    schema_version: "1.0.0",
  };
}

test("happy path — canonical manifest returns ok:true", () => {
  const r = validateManifest(valid());
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test("not_object — reject null / array / primitive", () => {
  for (const bad of [null, [], 42, "x", true]) {
    const r = validateManifest(bad);
    assert.equal(r.ok, false);
  }
});

test("bad permanent_name format rejected", () => {
  const m = valid();
  (m as any).permanent_name = "HasCapsAndSpace ";
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.field === "permanent_name" && v.kind === "bad_format"));
});

test("schema_version literal enforced", () => {
  const m = valid();
  (m as any).schema_version = "2.0.0";
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.field === "schema_version"));
});

test("constitutional_clauses < 3 rejected", () => {
  const m = valid();
  m.constitutional_clauses = [CONSTITUTIONAL_CLAUSES[0], CONSTITUTIONAL_CLAUSES[1]];
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.kind === "constitutional_clauses_insufficient"));
});

test("unknown constitutional clause rejected", () => {
  const m = valid();
  (m as any).constitutional_clauses = [CONSTITUTIONAL_CLAUSES[0], CONSTITUTIONAL_CLAUSES[1], "no_such_clause"];
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.kind === "bad_enum"));
});

test("observer_surface enum enforced", () => {
  const m = valid();
  (m as any).first_observation_tuple.observer_surface = "martian";
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.field?.endsWith("observer_surface")));
});

test("location_history entry — bad enum status rejected", () => {
  const m = valid();
  m.location_history.push({
    ts: "2026-04-18T23:01:00Z",
    host: "liris",
    drive_letter: "C:",
    disk_number: 0,
    partition_number: 1,
    partition_guid: "{abc}",
    mount_path: "C:/",
    observer: "liris",
    operator: "rayssa",
    status: "invalid-status" as any,
  });
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.field?.endsWith("status")));
});

test("drift_log entry — bad classification rejected", () => {
  const m = valid();
  m.drift_log.push({
    ts: "2026-04-18T23:02:00Z",
    type: "location",
    observed_location: "E:/",
    expected_location: "D:/",
    broadcast_to: [],
    broadcast_ack: [],
    resolution: "pending",
    classification: "unknown-class" as any,
  });
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.field?.endsWith("classification")));
});

test("shape_fingerprint — missing scale_1k flagged", () => {
  const m = valid();
  delete (m as any).shape_fingerprint.scale_1k;
  const r = validateManifest(m);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.field === "shape_fingerprint.scale_1k"));
});

test("checkAppendOnlyDiff — no violations on pure append", () => {
  const prior = valid();
  const next: AsolariaIdentityManifest = {
    ...prior,
    location_history: [
      {
        ts: "2026-04-18T23:10:00Z", host: "liris", drive_letter: "C:",
        disk_number: 0, partition_number: 1, partition_guid: null, mount_path: "C:/",
        observer: "liris", operator: "rayssa", status: "sanctioned",
      },
    ],
  };
  const v = checkAppendOnlyDiff(prior, next);
  assert.equal(v.length, 0);
});

test("checkAppendOnlyDiff — shrinking location_history flagged", () => {
  const prior: AsolariaIdentityManifest = {
    ...valid(),
    location_history: [
      { ts: "2026-04-18T23:10:00Z", host: "liris", drive_letter: "C:", disk_number: 0, partition_number: 1, partition_guid: null, mount_path: "C:/", observer: "liris", operator: "rayssa", status: "sanctioned" },
    ],
  };
  const next: AsolariaIdentityManifest = { ...prior, location_history: [] };
  const v = checkAppendOnlyDiff(prior, next);
  assert.ok(v.some((x) => x.kind === "append_only_violation"));
});

test("checkAppendOnlyDiff — mutating permanent_name flagged", () => {
  const prior = valid();
  const next = { ...prior, permanent_name: "different-name" };
  const v = checkAppendOnlyDiff(prior, next);
  assert.ok(v.some((x) => x.field === "permanent_name"));
});

test("checkAppendOnlyDiff — modifying existing location_history entry flagged", () => {
  const entry = { ts: "2026-04-18T23:10:00Z", host: "liris", drive_letter: "C:", disk_number: 0, partition_number: 1, partition_guid: null, mount_path: "C:/", observer: "liris", operator: "rayssa" as const, status: "sanctioned" as const };
  const prior: AsolariaIdentityManifest = { ...valid(), location_history: [entry] };
  const next: AsolariaIdentityManifest = { ...valid(), location_history: [{ ...entry, status: "rejected" }] };
  const v = checkAppendOnlyDiff(prior, next);
  assert.ok(v.some((x) => x.field === "location_history[0]"));
});
