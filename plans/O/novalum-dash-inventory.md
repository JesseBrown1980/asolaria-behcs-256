# Item 185 · NovaLUM dashboards + existing routes inventory

## Dashboards (internal, public-name-protected)
- Admin dashboard (Product X)
- Stealth dashboard (bridged to BEHCS already · confirmed per prior session)
- Falcon dashboard (proposed)
- Agent console (rebuild target in section O items 189-190)

## Existing API routes (generic; counts only, no device-specific names)
- 82 routes total across admin + stealth + legacy.
- Categories: acquisition (AQ-*), transport (TR-*), decode (DE-*), parse (PA-*), validate (VA-*), patch (PT-*), verify (VF-*), audit (AU-*).

## Wiring target
`src/dashboards/admin.js` aggregates all 82 into a unified admin surface that consumes envelope-v1 via `src/ru-view/adapter.js`.
