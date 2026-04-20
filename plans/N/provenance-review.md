# Item 178 · Recovered artifacts provenance review

## Review checklist (per recovered file)
- [ ] sha256 computed
- [ ] source device recorded (acer | liris | USB)
- [ ] original mtime preserved
- [ ] no secrets (grep against `.githooks/pre-commit` patterns)
- [ ] no proprietary client/brand names (public-repo redaction rule)
- [ ] classification: original | copy | derivative
- [ ] justification for public-ship (if chosen)

## Verdict gate
File ships to public repo ONLY if all 7 checks pass AND operator cosigns.

## Current status
Scaffold only. Zero recovered files shipped in this repo to date.
