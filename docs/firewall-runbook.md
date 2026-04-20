# Item 140 · Firewall Operator Runbook

## Apply (Admin PowerShell)
```
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\firewall-apply.ps1
```

## Verify LAW-001 preserved
```
netsh advfirewall firewall show rule name="Asolaria-LAW001-4947-inbound"
netsh advfirewall firewall show rule name="Asolaria-LAW001-4950-inbound"
Test-NetConnection 127.0.0.1 -Port 4947
Test-NetConnection 127.0.0.1 -Port 4950
```

## Reach check from peers
Run `plans/L/reach-test.md` procedure.

## Rollback
```
netsh advfirewall firewall delete rule name="Asolaria-4781-lan"
netsh advfirewall firewall delete rule name="Asolaria-4782-lan"
netsh advfirewall firewall delete rule name="Asolaria-4820-peer"
# NEVER delete Asolaria-LAW001-4947-inbound or Asolaria-LAW001-4950-inbound
```

## Never
- Never add a `block` rule for 4947 or 4950.
- Never set profile=public on LAW-001 rules unless operator explicitly requests.
- Never apply without a snapshot (`netsh advfirewall export 'backup.wfw'`) first.
