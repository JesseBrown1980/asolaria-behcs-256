# BOOT-CRITICAL — READ BEFORE ANY STARTUP ATTEMPT

## BOOT-CRITICAL — READ BEFORE ANY STARTUP ATTEMPT
| IX-309 | **THE ACTUAL STARTUP COMMAND — Kill stale, set MQTT bind, `node server.js`, verify health. 10 seconds. Do this FIRST.** | See IX-309 |
| IX-308 | **ENCRYPTION BEFORE CONNECTION — Plaintext gets SILENCE, not errors. Every startup failure traces back to this.** | See IX-308, IX-070, IX-165, IX-176, LX-204 |
| IX-310 | **FALLBACK — If federation fails silently, CHECK IPS FIRST. Firewall rules have stale hardcoded IPs that break when network changes.** | See IX-310 |
| IX-311 | **SKILL — WhatsApp ADB Send. Agent-to-agent comms via phone. Works with ZERO servers. The last-resort channel.** | See IX-311 |


## Boot-Critical Entries

| IX | Name | Type | Tags | Chain | Agents |
|----|------|------|------|-------|--------|
| 308 | **BOOT-CRITICAL — Encryption before connection. Plaintext gets SILENCE. Every startup failure traces to this.** | rule | boot, encryption, stealth, silence, ABSOLUTE, FOUNDATIONAL, PERMANENT, BOOT-CRITICAL | → 070, 165, 176, 178, 181, 142 | all |
| 309 | **BOOT-CRITICAL — THE ACTUAL STARTUP COMMAND. Kill stale, MQTT bind, node server.js, verify health. 10 seconds.** | rule | boot, startup, command, ABSOLUTE, FOUNDATIONAL, PERMANENT, BOOT-CRITICAL | → 308, 145, 074, 080, 181 | all |
| 310 | **MISTAKE — Firewall rules have STALE IPs. Network changes break federation silently. Check IPs BEFORE checking encryption.** | mistake | firewall, ip, stale, network, federation, BOOT-CRITICAL | → 308, 309, 093, 219 | all |
| 311 | **SKILL — WhatsApp ADB Send. Agent comms via phone ADB. Zero servers needed. Proven 2026-03-23.** | skill | whatsapp, adb, phone, comms, BOOT-CRITICAL, FOUNDATIONAL | → 309, 310, 014, 011, 020 | gaia, liris, falcon |

## Quick Reference
- IX-309: THE startup command. Kill stale, MQTT bind, node server.js, health check.
- IX-308: Encryption BEFORE connection. Plaintext = SILENCE.
- IX-310: Stale firewall IPs break federation silently.
- IX-311: WhatsApp ADB Send — zero-server agent comms.
