# Item 137 · LAW-001 verify · 4947 + 4950 remain always-open

## Rule
No firewall rule, no script, no env change may close or filter ports 4947 or 4950.

## Check
- `scripts/firewall-apply.ps1` explicitly ADDS allow-rules for 4947 + 4950 (inbound, all profiles).
- No rule in this repo adds a block for 4947/4950.
- Pre-commit hook (`.githooks/pre-commit` item 010) rejects any commit that tries to introduce a block pattern matching these ports.

## Verdict
**PASS**.
