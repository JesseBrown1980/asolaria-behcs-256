$ErrorActionPreference='Stop'
Set-Location C:\Users\acer
$report='C:\Users\acer\Asolaria\reports\phone-closeout-pack-shutdown-continuation-20260308-exec.md'
$healthErr = ''
$voiceErr = ''
$relayErr = ''
$health = try { Invoke-RestMethod -Uri 'http://127.0.0.1:4781/api/health' -TimeoutSec 8 } catch { $healthErr = $_.Exception.Message; $null }
$voice = try { Invoke-RestMethod -Uri 'http://127.0.0.1:4781/api/voice/live/status' -TimeoutSec 8 } catch { $voiceErr = $_.Exception.Message; $null }
$relay = try { Invoke-RestMethod -Uri 'http://127.0.0.1:8788/health' -TimeoutSec 8 } catch { $relayErr = $_.Exception.Message; $null }
$latestTunnel = if (Test-Path 'C:\Users\acer\Asolaria\reports\phone-tunnel-smoke-latest.md') { 'present' } else { 'missing' }
$latestStart = if (Test-Path 'C:\Users\acer\Asolaria\reports\one-button-start-latest.md') { 'present' } else { 'missing' }

$apiHealth = if ($health) { [string]$health.ok } else { 'error: ' + $healthErr }
$relayHealth = if ($relay) { [string]$relay.ok } else { 'error: ' + $relayErr }
$voiceRunning = if ($voice -and $voice.live) { [string]$voice.live.running } else { if ($voiceErr) { 'error: ' + $voiceErr } else { 'n/a' } }
$orchestratorMode = if ($health -and $health.voice -and $health.voice.bridgeOrchestrator) { [string]$health.voice.bridgeOrchestrator.mode } else { 'n/a' }
$colonyCounts = if ($health -and $health.agentColony -and $health.agentColony.counts) { 'online=' + $health.agentColony.counts.online + '/' + $health.agentColony.counts.total } else { 'n/a' }
$keeperRunning = if ($health -and $health.networkPolicy -and $health.networkPolicy.phoneBridgeKeeper) { [string]$health.networkPolicy.phoneBridgeKeeper.running } else { 'n/a' }
$smokePass = if ($health -and $health.networkPolicy -and $health.networkPolicy.phoneTunnelMonitor) { [string]$health.networkPolicy.phoneTunnelMonitor.latestReportPass } else { 'n/a' }
$pushSubscriptions = if ($health -and $health.networkPolicy -and $health.networkPolicy.mobilePush) { [string]$health.networkPolicy.mobilePush.subscriptions } else { 'n/a' }
$routeChannel = if ($health -and $health.connectionRouting -and $health.connectionRouting.selected) { [string]$health.connectionRouting.selected.channel } else { 'n/a' }

$lines = @(
  '# Phone Closeout Pack (Shutdown Continuation)',
  '',
  ('Generated: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')),
  '',
  '## Diagnostics Snapshot',
  ('- api_health_ok: ' + $apiHealth),
  ('- relay_health_ok: ' + $relayHealth),
  ('- voice_live_running: ' + $voiceRunning),
  ('- bridge_orchestrator_mode: ' + $orchestratorMode),
  ('- colony_counts: ' + $colonyCounts),
  ('- phone_bridge_keeper_running: ' + $keeperRunning),
  ('- tunnel_smoke_latest_pass: ' + $smokePass),
  ('- mobile_push_subscriptions: ' + $pushSubscriptions),
  ('- connection_route_channel: ' + $routeChannel),
  ('- phone-tunnel-smoke-latest.md: ' + $latestTunnel),
  ('- one-button-start-latest.md: ' + $latestStart),
  '',
  '## Automatable vs Manual',
  '### Automatable completed now',
  '- Relay and API health endpoints checked.',
  '- Latest tunnel/start artifacts presence verified.',
  '### Manual on-device actions required',
  '- Confirm notifier approval prompt on phone.',
  '- Confirm app notification permission remains enabled.',
  '- Trigger push test and verify real notification receipt.',
  '',
  '## One-Pass User Checklist',
  '1. Unlock phone and keep it connected to the active bridge path.',
  '2. Open notifier target app and keep notifications allowed.',
  '3. Trigger one controlled push test from desktop.',
  '4. Confirm phone receives notification and approval action succeeds.',
  '5. Capture screenshot/timestamp and append evidence to reports.',
  '',
  '## Re-test Commands and Pass Criteria',
  '- C:\Users\acer\codex-bridge\bridgectl.ps1 -Command status => key bots running.',
  '- Invoke-RestMethod http://127.0.0.1:4781/api/health => ok=true.',
  '- Refresh tunnel smoke report => timestamp updates.',
  '- PASS when on-device notification + approval evidence is captured.'
)
$lines | Set-Content -Path $report -Encoding UTF8
Write-Output ('wrote=' + $report)
