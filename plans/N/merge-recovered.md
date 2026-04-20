# Item 177 · Merge recovered artifacts into migration manifest

## Merge procedure
1. For each recovered file, compute sha256.
2. Cross-reference `plans/A/inventory.json` + current repo — does it duplicate, supersede, or add?
3. If SUPERSEDES existing file: operator authorize + log in `plans/N/merge-log.ndjson`.
4. If ADDS new: namespace-map it per `plans/A/namespace-map.md` + ship in appropriate section.
5. If DUPLICATES: annotate in provenance-review (item 178) as "duplicate-recovery — retain if richer metadata".

## Rule
No recovered file ships publicly without provenance review pass + multi-agent cosign.
