# Item 139 · Cross-host reach test post firewall-apply

## Procedure
From liris (direct-wire 192.168.100.2 → acer 192.168.100.1):

```
Test-NetConnection 192.168.100.1 -Port 4820   # supervised /type peer
Test-NetConnection 192.168.100.1 -Port 4947   # LAW-001 primary (MUST succeed)
Test-NetConnection 192.168.100.1 -Port 4950   # LAW-001 backup (MUST succeed)
```

From acer to liris (same ports, reversed IP):

```
Test-NetConnection 192.168.100.2 -Port 4820
Test-NetConnection 192.168.100.2 -Port 4947
Test-NetConnection 192.168.100.2 -Port 4950
```

## Acceptance
- 4947 + 4950: TcpTestSucceeded = True from BOTH sides, else firewall regressed.
- 4820: TcpTestSucceeded = True (LAN profile).

## Run status
Deferred — operator runs post-apply. Test-plan documented.
