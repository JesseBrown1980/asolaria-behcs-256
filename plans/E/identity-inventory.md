# Item 061 · _asolaria_identity.json inventory across devices

## Known paths
- acer: `C:\Users\acer\Asolaria\_asolaria_identity.json` (if present)
- liris: `C:\Users\rayss\Asolaria-BEHCS-256\_asolaria_identity.json`
- falcon: `/data/data/com.termux/files/home/asolaria/_asolaria_identity.json`
- aether (felipe): `/data/data/com.termux/files/home/asolaria/_asolaria_identity.json`
- USB (if liris mounts): `E:\sovereignty\_asolaria_identity.json` (historic — disabled by MS)

## Shape (observed from past sessions)
```json
{
  "hw_pid": "PID-COL-ACER-H04-A01-W027000000-P027-N00001",
  "surface": "acer-desktop",
  "parent": null,
  "stable_tuple": ["cpu_id", "motherboard_uuid", "primary_disk_serial"],
  "shape_fingerprint": "sha256:...",
  "provenance": { "origin": "jesse-operator", "ts": "2026-04-18T00:00:00Z" }
}
```

## Gaps
- No current sha-check across copies
- No rejection if USB carrying file moves to wrong host (item 066 fixes this)
