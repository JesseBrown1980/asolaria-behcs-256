---
ix: IX-456
name: PLAN — Roll out selector catalog + hardware tumbler from architecture into live runtime
type: plan
tags: [selector-catalog, omnispindle, tumbler, worker-router, api, mobile, admin, rollout, execution, backend-control, ACTIVE]
chain: [IX-455, IX-323, IX-378]
pid: gaia-20260329-selector-rollout
createdBy: gaia
agents: gaia, all
---

# IX-456 — Selector Catalog Rollout Execution

## Objective

Move the selector catalog and tumbler from static architecture into a live, trusted runtime surface without breaking existing Asolaria control flows.

## Phase order

### 1. Runtime surfacing

- confirm `server.js` mounts `/api/catalog` correctly
- verify the safest runtime validation path
- avoid unnecessary restarts until the validation plan is clear

### 2. Worker-router enforcement

- identify the exact `workerRouter` dispatch boundaries
- acquire tumbler leases before heavy lane execution
- release leases on completion and error
- preserve request identity so queued/autoloaded work is attributable

### 3. Truthful UI surfacing

- expose selector summary and tumbler state in admin/mobile surfaces
- keep `reference` selectors visibly distinct from `control` selectors
- do not imply AnyDesk / ExpressVPN / RDP product control until executors exist

### 4. Capability probes

- add explicit path/port health probes where useful
- keep runtime availability derived from the live machine
- do not bake transient machine state into canon

### 5. Executor expansion

- only after the above is stable, add dedicated executors for safe categories
- treat AnyDesk / ExpressVPN / RDP as later slices, not day-one promises

## First execution target

The highest-value immediate slice is:

1. make `/api/catalog` live in the running runtime
2. validate summary/selectors/tumblers endpoints
3. wire `workerRouter` to tumbler acquire/release around heavy lane execution

## Law for rollout

- one mutation slice at a time
- preserve truthful control boundaries
- do not overstate authority
- do not let runtime rollout outrun the index
