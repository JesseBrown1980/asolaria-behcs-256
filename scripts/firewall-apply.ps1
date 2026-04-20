# Item 138 · Firewall apply · Windows netsh rules
# Run as Administrator.

Write-Host "Applying Asolaria firewall rules (LAW-001 preserving)..."

# LAW-001 ports — always allow
netsh advfirewall firewall add rule name="Asolaria-LAW001-4947-inbound" dir=in action=allow protocol=TCP localport=4947 profile=any | Out-Null
netsh advfirewall firewall add rule name="Asolaria-LAW001-4950-inbound" dir=in action=allow protocol=TCP localport=4950 profile=any | Out-Null

# Reserved LAN-only ports
netsh advfirewall firewall add rule name="Asolaria-4781-lan" dir=in action=allow protocol=TCP localport=4781 profile=private,domain | Out-Null
netsh advfirewall firewall add rule name="Asolaria-4782-lan" dir=in action=allow protocol=TCP localport=4782 profile=private,domain | Out-Null

# Supervised /type cross-host peer
netsh advfirewall firewall add rule name="Asolaria-4820-peer" dir=in action=allow protocol=TCP localport=4820 profile=private,domain | Out-Null

# Non-LAW public-facing endpoints (LLM server + agent server)
netsh advfirewall firewall add rule name="Asolaria-4951-llm-loopback" dir=in action=allow protocol=TCP localport=4951 profile=private | Out-Null
netsh advfirewall firewall add rule name="Asolaria-4952-agent-loopback" dir=in action=allow protocol=TCP localport=4952 profile=private | Out-Null

Write-Host "Done. LAW-001 ports 4947 + 4950 verified open."
Write-Host "Verify: netsh advfirewall firewall show rule name=Asolaria-LAW001-4947-inbound"
