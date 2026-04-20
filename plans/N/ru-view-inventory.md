# Item 166 · RU View surface inventory

## Definition
"RU View" = read-only viewer component (observer surface) for federation state. Dashboard variant; does not emit write-envelopes by default.

## Known surfaces (acer-side legacy)
- `packages/dashboard/` — dashboard-daemon pid 78256 observed earlier
- `packages-legacy-import/public/mobile-console.js` — mobile RU view
- `reports/desktop-phone-mirror-*` — historic mirror-visibility reports

## Liris-side
- Mobile console + phone-mirror-lane viewer.

## Status
Inventory-only. No code changes.
