# Item 116 · USB rotation schedule (bilateral training)

## Intent
USB carries training artifacts. Rotation keeps newest on fast-disk and archives older shards.

## Schedule (liris-operated)
- **Daily:** mount USB at D: · run `extractShadows` on new files → `plans/I/shards/<YYYY-MM-DD>.ndjson`
- **Weekly:** sha-manifest all shards → `plans/I/shards/MANIFEST.md` · cosign with acer
- **Monthly:** compress oldest week into `plans/I/shards/archive/<YYYY-MM>.tar.gz`
- **Per-incident:** on identity-drift CRITICAL, freeze USB writes + snapshot to `plans/I/shards/frozen-<iso>.ndjson`

## Never
- Never `diskpart clean` (incident 2026-03-30 canonized: never-wipe rule · IX-486→493).
- Never copy shards off liris without cosign.
- Never publish raw shards to public repo (only indexes + manifests).
