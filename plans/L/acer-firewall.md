# Item 136 · Acer firewall rules · ports 4781 / 4782 / 4820

## Non-LAW-001 ports acer exposes

| Port | Purpose | Access policy |
|---|---|---|
| 4781 | (reserved) | LAN-only, allow from 192.168.0.0/16 |
| 4782 | (reserved) | LAN-only, allow from 192.168.0.0/16 |
| 4820 | supervised /type cross-host peer | LAN-only, allow from 192.168.100.0/24 (direct-wire) + 192.168.1.0/24 (wifi) |

## Always-open (LAW-001)
| Port | Purpose |
|---|---|
| 4947 | primary bus — MUST REMAIN OPEN |
| 4950 | backup bus — MUST REMAIN OPEN |

## Firewall rule format (Windows netsh)
See `scripts/firewall-apply.ps1` for the applied rules.
