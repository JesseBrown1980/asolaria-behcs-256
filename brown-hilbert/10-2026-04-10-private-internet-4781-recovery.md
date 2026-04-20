<!-- provenance: file=brown-hilbert/10-2026-04-10-private-internet-4781-recovery.md author=codex-bhc-sync-worker-20260410 dispatch=2026-04-10T00:00Z brief_id=LX-4781-LIRIS-DIRECT-LANE-2026-04-10 -->
# LX-4781-LIRIS-DIRECT-LANE — 2026-04-10

- Surface recovered: `http://192.168.100.2:4781`
- Bind verified: `192.168.100.2:4781`
- Health verified: `GET /api/health -> 200`
- Advertised base URL verified: `remoteBaseUrl = http://192.168.100.2:4781`
- Auth plane verified on `channel=private_internet`
- Verified endpoints:
  - `GET /api/mobile/session`
  - `GET /api/mobile/control/status`
  - `POST /api/mobile/control/arm`
- Authority state at verification:
  - `superMasterControlAllowed = true`
  - `armed = true`
- Operational rule:
  - `4781` is primary authenticated app-plane
  - `4820` is fallback only
- Blocker removed:
  - prior loopback-only bind on `127.0.0.1:4781`
- Local anchors:
  - Brown-Hilbert root: `C:\Users\rayss\Asolaria\BROWN-HILBERT.md`
  - Liris profile: `C:\Users\rayss\Asolaria\tools\profiles\liris.json`
- Next work:
  - operate through tokenized `remoteConsole` / `remoteApprovals` or direct authenticated `4781` endpoints
