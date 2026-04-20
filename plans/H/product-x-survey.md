# Item 106 · Product X · recoverable code survey

**Note to readers:** "Product X" in this repo refers to a bench-side workflow system used privately by our operator. Names of the proprietary device/model family + the upstream client are intentionally NOT published here. Refer to Product X by that label only.

## Survey scope
Old repo tree (private) has the original product implementation with: device-specific routes, models (Globals/Patients/etc proprietary), LIMS glue, proprietary PPTX specs.

## Recoverable-without-leaking list
- Workflow state machine (PROBE → READ → PARSE → PATCH → VERIFY) — generic, safe.
- 5-step sensor-adapter pattern — safe (not tied to brand).
- IX-bucket namespace (87 buckets) — safe (bucket NAMES only, no device data).
- Integration-test harness structure — safe.
- CSV/LIMS round-trip shape — safe.

## Not recoverable into public repo
- Device names, model numbers, brand trademarks.
- Client name, agency name.
- Any CHARM/Charm/EZ/LIMS-brand string.
- Field-specific proprietary values (bac thresholds, mask patterns, patient fields).

## Process
Strip proprietary strings → rename to "Product X" + "Device Adapter" → port workflow + IX buckets into this repo under `src/product-x/`.
