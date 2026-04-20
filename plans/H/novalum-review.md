# Item 112 · Product X workflow review · PROBE → READ → PARSE → PATCH → VERIFY

## 5-step contract (generic · safe)
| Step | Responsibility | Failure mode | Recovery |
|---|---|---|---|
| PROBE  | detect device present + healthy | timeout / not-found | report-and-skip |
| READ   | pull current raw state          | read-error | retry × 2 + log |
| PARSE  | structured from raw             | parse-error | quarantine raw + alert |
| PATCH  | apply diff                      | conflict | abort + restore |
| VERIFY | post-patch integrity check       | mismatch | rollback patch |

## Compliance check
- `src/product-x/novalum-csi.js` implements PROBE + READ.
- `src/product-x/nl2-bridge.js` normalizes frames → envelope-v1 for PARSE downstream.
- `src/product-x/ix-buckets.js` namespaces the 87 buckets across the 5 steps.
- DeviceAdapter contract (plans/H/adapter-map.md) binds all 5 methods.

## Verdict
**PASS** · workflow contract preserved, brand/device names not leaked, adapter contract is generic.
