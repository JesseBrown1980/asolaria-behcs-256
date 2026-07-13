# OMNIEVENT47 catalog-grounded stamping specification — 2026-07-13

Status: `DESIGN_GROUNDED_IN_MEASURED_REPO`  
Owner source: `data/behcs/codex/catalogs.json`  
Catalog registry SHA/commit binding: required in every run header  
HyperBEHCS extension: `SELECTOR60`, separate namespace; D48–D60 semantic meanings are not invented here

## Purpose

The Omni event wire must not create a second, competing vocabulary for actor, PID, time, operation,
level, route, gate, proof, shadow, device or provenance. Those meanings already exist in the ratified
47-catalog adapter. The canonical event is therefore:

```text
47D semantic coordinate
+ exact payload/accounting fields
+ integrity/causality fields
+ optional 60-value HyperBEHCS selector
+ optional 2D/3D projection references
```

The named JSON/HBP fields are compatibility mirrors and measurement payload. The semantic authority
is the catalog coordinate plus the exact catalog-registry digest.

## Ratification boundary

From `data/behcs/codex/catalogs.json`:

```text
D1–D24   ratified base
D26      ratified Omnidirectional
D31      ratified Shadow/Mirror
D34      ratified Cross-Colony
D35      ratified Hyperlanguage
D38      ratified Encryption
D44      ratified Heartbeat
other expanded D25–D47 entries remain draft
D47 Omega remains draft
```

A draft coordinate may be carried, but its event row must say `maturity=DRAFT`. A scheduler must not
silently treat a draft dimension as ratified authority.

The newer HyperBEHCS 60-tuple/selector is a separate address/control representation. No public
canonical semantic definitions for D48–D60 were identified in the owning 47D catalog registry, so
this specification does not fabricate them. It carries:

```text
semantic47        exact catalog coordinates
selector60        60 values in [0,1023], with selector algorithm/version
shadow2d/3d       derived projections with source-selector digest
```

until an owning signed registry explicitly binds semantic meanings to extension positions.

## Existing dimension map

| Axis | Catalog | Event use |
|---:|---|---|
| D1 | Actor | acting agent/supervisor/human/system class |
| D2 | Verb | operation (`SCHEDULE`, `DISPATCH`, `QUANT`, `MINT`, `VERIFY`, `HOLD`, …) |
| D3 | Target | object, agent, queue, catalog, cube, shadow or service acted upon |
| D4 | Risk | assessed risk tier |
| D5 | Layer | source/destination system or quant level |
| D6 | Gate | Hookwall, Fischer, Shannon, watcher, consent or authority gate |
| D7 | State | proposed, queued, running, pass, hold, error, compacted, emitted |
| D8 | Chain | causal/recipient chain class |
| D9 | Wave | schedule wave/beat/epoch position |
| D10 | Dialect | HBP, HBI, BEHCS, HyperBEHCS, JSON compatibility, binary packet |
| D11 | Proof | SHA readback, Merkle, signature, test, receipt class |
| D12 | Scope | bytes/rows/agents/levels/cylinders covered |
| D13 | Surface | ledger, dashboard, 3D view, white room, queue, disk, cloud |
| D14 | Energy | resource/intensity/compute tier |
| D15 | Device | owning device/host class |
| D16 | PID | actor/object/run/event PID class and referenced PID |
| D17 | Profile | actor profile/capability profile |
| D18 | AI-Models | model/checkpoint/engine class |
| D19 | Location | host/room/sector/path/vantage location |
| D20 | Time | wall-clock/monotonic/logical time class |
| D21 | Hardware | CPU/GPU/HDD/SSD/USB/fabric hardware |
| D22 | Translation | exact rebase, quant, codec, CRT, projection, inverse |
| D23 | Federation | Acer/Liris/third/CI and role |
| D24 | Intent | why the event was scheduled |
| D25 | Modality | text/vector/image/audio/sensor/graph; draft |
| D26 | Omnidirectional | forward/reverse/bilateral/broadcast; ratified |
| D27 | Cipher | cipher/key/nonce class; draft |
| D28 | Provenance | source commit, receipt seat and evidence class; draft |
| D29 | Version | schema/quant/catalog/model version; draft |
| D30 | Dependency | parent span/input/catalog dependency; draft |
| D31 | Shadow/Mirror | address, residue, shell, mirror, re-projection; ratified |
| D32 | Price | byte/latency/energy/currency charge; draft |
| D33 | Deadline | deadline/TTL/window; draft |
| D34 | Cross-Colony | same-seat/cross-seat/third-seat/CI route; ratified |
| D35 | Hyperlanguage | IX/LX/BEHCS/HyperBEHCS language level; ratified |
| D36 | Sensor | observation source; draft |
| D37 | Environment | runtime/container/OS/network environment; draft |
| D38 | Encryption | encryption/authentication state; ratified |
| D39 | Jurisdiction | authority/legal/realm boundary; draft |
| D40 | Consent | IX-737/operator/cosign consent state; draft |
| D41 | Audit | audit action/result; draft |
| D42 | Capability | executable capability granted/used; draft |
| D43 | Quorum | quorum/cosign state; draft |
| D44 | Heartbeat | liveness/sequence/beat state; ratified |
| D45 | Manifold | 2D/3D/N-D projection/manifold class; draft |
| D46 | Signature | signature/digest algorithm and signer class; draft |
| D47 | Omega | terminal/closure/whole-system state; draft |

## PID namespaces

`PID everything` requires typed PID namespaces rather than one ambiguous `pid` field:

```text
run_pid             whole experiment/run
event_pid           immutable event
actor_agent_pid     logical agent performing the action
actor_os_pid        optional operating-system process
requested_by_pid    requesting agent
scheduler_pid       scheduler making the admission decision
dispatcher_pid      dispatcher routing the work
worker_pid          materialized worker/spindle
target_pid          destination/object/service
observer_pid        OmniMets/watcher producing the observation
object_pid          body/cube/shadow/catalog object
catalog_pid         exact catalog state/version
host_pid            device/vantage
```

Each typed PID is mirrored into D16 and disambiguated by D1/D3/D8/D15/D17/D19/D23. A reference or
synthetic PID must be tagged `pid_provenance=REFERENCE`; only a PID resolved from the live registry
may be tagged `LIVE_REGISTERED`.

## Time and causality

A single timestamp cannot establish distributed causality. A full event carries:

```text
event_ts_utc          actor wall clock
ingest_ts_utc         OmniMets/ledger arrival clock
scheduled_ts_utc
queued_ts_utc
dispatched_ts_utc
started_ts_utc
finished_ts_utc
mono_start_ns         same-host duration start
mono_end_ns           same-host duration end
actor_sequence        strictly increasing per actor
hlc                    hybrid logical clock
trace_id
span_id
parent_span_id
previous_row_sha256
```

D9, D20 and D44 carry the semantic time/wave/heartbeat coordinate. The exact numeric timestamps and
HLC remain payload fields so they can be recomputed and ordered without exploding the catalog.

## Full OMNIEVENT47v1 row

```text
OMNIEVENT47v1|
registry_sha256=<catalogs.json digest>|
schema_version=1|
event_pid=EVT-...|
run_pid=RUN-...|
trace_id=...|
span_id=...|
parent_span_id=...|
actor_sequence=...|
event_ts_utc=...|
ingest_ts_utc=...|
hlc=...|
mono_start_ns=...|
mono_end_ns=...|
actor_agent_pid=...|
actor_os_pid=...|
requested_by_pid=...|
scheduler_pid=...|
dispatcher_pid=...|
worker_pid=...|
target_pid=...|
observer_pid=...|
object_pid=...|
catalog_pid=...|
host_pid=...|
pid_provenance=REFERENCE|LIVE_REGISTERED|
d01=<item-id>|...|d47=<item-id>|
selector60_algorithm=...|
selector60=<60 comma-separated 10-bit values>|
selector60_sha256=...|
shadow2d_ref=...|
shadow3d_ref=...|
quant_stack_id=...|
quant_id=...|
level_from=...|
level_to=...|
catalog_epoch=...|
ledger_scope=PAYLOAD|CODEC_CATALOG|CODEC_STATE|FULL_FABRIC|
input_sha256=...|
output_sha256=...|
input_bytes=...|
payload_bytes=...|
catalog_delta_bytes=...|
state_delta_bytes=...|
residual_bytes=...|
retained_store_bytes=...|
event_bytes=...|
index_receipt_bytes=...|
queue_ns=...|
execution_ns=...|
watcher_outcome=PASS|HOLD|ERROR|
scheduler_outcome=ACCEPT|HOLD|
scheduler_reason=...|
previous_row_sha256=...|
row_sha256=...|
json=0
```

The row digest is a full SHA-256. A 16-hex/64-bit prefix may be displayed, but it is never the
authoritative Merkle root or event identity.

## Portal/SPAN encoding

The full row is the canonical truth. High-volume portals use a lossless dictionary/delta encoding:

```text
RUN_HEADER|
registry_sha256=...|
pid_dictionary=...|
dimension_dictionary=...|
quant_dictionary=...|
host_dictionary=...|
initial_hlc=...|
root_input_sha256=...|
json=0

SPAN|
seq=...|
actor=<pid-dictionary-index>|
scheduler=<index>|
dispatcher=<index>|
target=<index>|
dt_us=...|
coord_delta=<changed dimension/value pairs>|
metric_delta=<changed counters>|
parent=<span index>|
row_sha256=...|
json=0

RUN_FOOTER|
events=...|
full_rows_sha256=...|
span_rows_sha256=...|
merkle_root_sha256=...|
final_readback=PASS|HOLD|
json=0
```

A portal receipt is accepted only when decoding the SPAN form reproduces every canonical full row
byte-for-byte or field-for-field under a declared canonicalization rule.

## Scheduler ledgers

Every admission must name the ledger it optimized. For candidate quant `q` at level `l`:

```text
payload_delta = payload_before - payload_after
full_delta = bytes_before -
  (payload_after + catalog_delta + state_delta + residual + retained_store
   + event/index/receipt bytes)
```

Valid outcomes include:

```text
PAYLOAD_ACCEPT        payload_delta > 0
FULL_FABRIC_ACCEPT    full_delta > 0 and readback PASS
PAYLOAD_ACCEPT_FULL_HOLD
READBACK_HOLD
DEADLINE_HOLD
RISK_HOLD
```

An event must not say simply `ACCEPT` when the payload and total ledgers disagree.

## 3D/N-D visualization

The 3D view is a derived observer, not the authoritative state:

```text
node        actor_agent_pid/object_pid
edge        schedule/dispatch/quant/mint/watch/recover relation
position    declared projection from selector60/semantic47
color       quant or outcome
size        byte/state/catalog cost
trail       parent span/antecedent chain
```

Every frame carries `projection_id`, `source_event_pid`, `selector60_sha256`, `frame_sha256` and the
projection algorithm/version. A visual point must never be presented as the complete 47D/60D object.

## Status of the reported 32-event run

The operator supplied these unsealed values in conversation:

```text
32 events
merkle display prefix 9600f2e22319f9a7
codec_plus_catalog_bpc 2.5904
SPAN telemetry 3,818 B
full_fabric_bpc 2.6186
observability tax 1.17%
portal ratio 4.1x
```

No `omni_events_full.ndjson`, `omni_events_span.hbp`, generator source or full Merkle root was found
in the connected GitHub repositories or uploaded artifact set at the time of this specification.
The run remains `OPERATOR_REPORTED_UNSEALED`.

The reported arithmetic also needs an exact ledger reconciliation. For a 1,000,000-byte denominator:

```text
3,818 B telemetry = 0.030544 bpc
2.5904 + 0.030544 = 2.620944 bpc
2.6186 - 2.5904 = 0.0282 bpc = 3,525 B
unreconciled difference = 293 B
```

The `1.17%` figure is approximately consistent when 3,818 bytes is divided by the reported full
fabric byte total. The bpc equation uses only 3,525 charged bytes, so the receipt must state whether
RUN_HEADER/RUN_FOOTER, dictionaries, Merkle rows, already-counted bytes or transient telemetry were
excluded.

The report also says all three quant levels were scheduler-accepted. The prior exact multi-level run
had its lowest cumulative total at level 1 while levels 2 and 3 continued reducing payload but added
more catalog cost. The new event files must identify whether each acceptance was
`PAYLOAD_ACCEPT`, `LEVEL_LOCAL_ACCEPT` or `FULL_FABRIC_ACCEPT`.

## Attack-verification requirements

The claimed run becomes measured only after all of these pass:

1. verify full-file SHA-256 sidecars;
2. parse exactly 32 canonical events;
3. require unique typed PIDs and disclose `REFERENCE` versus `LIVE_REGISTERED`;
4. validate every D1–D47 coordinate against the pinned catalog registry and maturity;
5. validate selector60 length/range and source digest without inventing D48–D60 semantics;
6. check HLC monotonicity, actor sequences and parent-span causality;
7. recompute every row hash and the full 256-bit Merkle root;
8. decode SPANs and reproduce the canonical rows;
9. recompute all byte ledgers, bpc values, tax and portal ratio from exact file sizes;
10. recompute scheduler verdicts under each named ledger;
11. require final reverse readback and source SHA equality;
12. distinguish reference Omni components from actual imported OmniMets/Scheduler/Dispatcher calls;
13. emit 2D/3D frames only as derived, digest-bound projections;
14. publish source, logs, receipts and immutable-head CI artifacts.

## Bottom line

The 47D adapter already contains the semantic axes needed to PID-, time-, actor-, operation-, level-,
proof-, route- and provenance-stamp the quant civilization. The 60D HyperBEHCS selector extends the
address/control surface but is not permission to fabricate thirteen new semantic catalog meanings.
A valid Omni receipt binds both namespaces, identifies the exact registry and maturity, names its
accounting ledger, and survives a complete reverse reconstruction of both data and provenance.
