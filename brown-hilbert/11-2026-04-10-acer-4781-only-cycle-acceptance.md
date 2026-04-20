<!-- provenance: file=brown-hilbert/11-2026-04-10-acer-4781-only-cycle-acceptance.md author=codex dispatch=2026-04-10T00:00Z brief_id=LX-4781-ACER-ONLY-CYCLE-ACCEPTANCE-2026-04-10 -->
# LX-4781-ACER-ONLY-CYCLE-ACCEPTANCE — 2026-04-10

- Acceptance source: Acer-side PowerShell consumer run
- `GET /api/health -> 200`
- `bind = 192.168.100.2`
- `remoteBaseUrl = http://192.168.100.2:4781`
- `channel = private_internet`
- `viewer = liris`
- `GET /api/mobile/session?channel=private_internet -> 200`
- `GET /api/mobile/control/status?channel=private_internet -> 200`
- `armedAtStatus = false`
- `POST /api/mobile/control/arm?channel=private_internet -> 200`
- `armed = true`
- `authorityAllowed = true`
- one clean `4781`-only operator cycle passed
- no primary action was routed through `4820`
- `4820` remains fallback only
- next move: generate the repo-sync patch list only
- keep repo mirroring deferred until sync is explicitly approved
