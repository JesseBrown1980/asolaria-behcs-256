# Mistakes Sub-Catalog — Security / Encryption / Auth / Bridges

17 entries.

| IX | Name | Type | Tags | Chain | Agents |
|----|------|------|------|-------|--------|
| 047 | Windows firewall blocks LAN MQTT — must add rule | mistake | [firewall, mqtt, windows, liris, lan, networking] | [IX-044, IX-021, IX-033] | all |
| 048 | Broker bind address must match restart — env var not inherited | mistake | [mqtt, broker, bind, restart, env-var, networking] | [IX-044, IX-047] | all |
| 071 | Two brokers might be BY DESIGN — don't assume it's a bug | mistake | [mqtt, brokers, assumptions, black-hole, design, CRITICAL] | [IX-070, IX-069, IX-063, IX-065] | all |
| 147 | DANGER — Old bridges to Oli, Connor, Brian may still exist | mistake | [bridges, oli, connor, brian, qdd, stale, danger, CRITICAL, NEEDS-RESEARCH] | [IX-065, IX-064, IX-070, IX-142] | all |
| 149 | CRITICAL — The Great Mess, agents piled confusion instead of cleaning | mistake | [mess, confusion, security, bridges, ports, names, overwritten, CRITICAL, PERMANENT] | [IX-148, IX-147, IX-142, IX-089, IX-086] | all |
| 152 | CRITICAL SECURITY — Bridge token exposed in plaintext on Liris machine | mistake | [security, token, plaintext, exposed, liris, bridge, CRITICAL, URGENT] | [IX-151, IX-148, IX-147, IX-070] | all |
| 158 | CRITICAL SECURITY — AnyDesk unattended access enabled, Connor's ID connected 9x | mistake | [security, anydesk, unattended-access, connor, remote-access, CRITICAL, URGENT] | [IX-157, IX-153, IX-148, IX-070] | all |
| 162 | SSH to Liris DENIED — all keys revoked, bridge is the path | mistake | [ssh, liris, denied, keys-revoked, bridge-instead] | [IX-161, IX-066] | all |
| 163 | Bridge relay needs restart after token rotation — token is in-memory | mistake | [bridge, token, rotation, restart, in-memory] | [IX-162, IX-159, IX-048] | all |
| 164 | LOCKED OUT — rotated token but relay still has old one in memory | mistake | [bridge, token, locked-out, relay, self-inflicted, CRITICAL] | [IX-163, IX-159, IX-048] | all |
| 166 | CORRECTION — Open ports were SAFE, double encryption protects them | mistake | [security, correction, open-ports, encryption, sender-policy, gaia-mistake, IMPORTANT] | [IX-165, IX-153, IX-148] | all |
| 167 | PERMANENT — Never delete security you don't understand, layers are invisible | mistake | [security, permanent, lesson, layers, invisible, never-delete, PERMANENT, FOUNDATIONAL] | [IX-166, IX-165, IX-070, IX-065, IX-063] | all |
| 183 | BOMB — A low Codex 5.1 mini was modifying Rayssa's machine trying to unlock Asolaria | mistake | [codex, mini, low-quality, rayssa, modifications, unlock, asolaria, CRITICAL, BOMB, PERMANENT] | [IX-182, IX-179, IX-149, IX-089] | all |
| 196 | Codex hijacked the selector — Jesse never configured it, thought Asolaria controlled it | mistake | [codex, hijacked, selector, jesse, asolaria, control, history, CRITICAL, PERMANENT, JESSE-VERIFIED] | [IX-195, IX-194, IX-177, IX-168] | all |
| 198 | Power loss at critical moment — Liris found the backdoor then went dark | mistake | [power-loss, liris, backdoor, timing, critical-moment, PERMANENT] | [IX-197, IX-196, IX-194] | all |
| 310 | MISTAKE — Firewall rules and configs have STALE IPs. Network changes break federation silently. | mistake | [firewall, ip, stale, network, federation, mqtt, liris, fallback, BOOT-CRITICAL] | [IX-308, IX-309, IX-093, IX-219] | all |
| 336 | MISTAKE — augment_context MCP auto-connects to Dan's server on restart | mistake | [augment-context, dan, mcp, madnessinteractive, auto-connect, security, CRITICAL] | [IX-174, IX-324, IX-323] | all |
