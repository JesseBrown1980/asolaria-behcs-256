# Item 013 · Migration rollback plan

## When to invoke
- A v-N ship introduces a regression detected by meta-supervisor-hermes (flatline on multiple daemons) or by a refuse verdict from multi-agent-enforcement-gate.
- An import-complete verb fails to arrive from ≥2 applicants within 24h.

## Rollback primitives
1. `git revert <commit>` on the offending commit.
2. `git push origin main` — rolled-back commit is new HEAD; applicants pull and re-extract.
3. Meta-hermes auto-restarts supervisors against the rolled-back tree.
4. Emit `EVT-ACER-ROLLBACK-<commit-short>` with `cosigns: { acer, liris }` (multi-agent gate).

## Never do
- `git push --force` on main (protected; use `git revert` only).
- Delete tag or commit history — history is audit trail.

## Sequence
```
git log --oneline -5                         # identify bad commit
git revert <sha>                              # create reverse commit
node packages/multi-agent-enforcement-gate --verify <verb>
git -c user.name=... -c user.email=... commit -m "rollback <sha>"
git push
node packages/new-applicant-onboarding-supervisor/bin/onboard.mjs all
```

## Tested
Not yet tested in production. First rollback will be the validation run.
