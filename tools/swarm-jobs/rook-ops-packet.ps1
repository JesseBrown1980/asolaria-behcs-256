$ErrorActionPreference='Stop'
Set-Location C:\Users\acer
$report='C:\Users\acer\Asolaria\reports\ops-unblock-packet-shutdown-continuation-20260308-exec.md'
$taskLines = rg -n '^- \[ \]' C:\Users\acer\Asolaria\TASKS.md
$lines = @(
  '# Ops Unblock Packet (Shutdown Continuation)',
  '',
  ('Generated: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')),
  '',
  '## Open Blockers Snapshot'
)
$lines += $taskLines
$lines += @(
  '',
  '## Owner-Facing Asks (John/Oli)',
  '1. Provide real HTTPS push_url/sms_url/voice_url for PPO-005 cutover in John runtime.',
  '2. Confirm maintenance window and rollback owner for provider cutover.',
  '3. Share sandbox credential channel to execute dry-run safely (no plaintext in chat/logs).',
  '4. Confirm phone-side approval owner and availability window for manual closeout.',
  '5. Confirm evidence destination path and required sign-off names.',
  '',
  '## Local Prechecks (Automatable)',
  '- C:\Users\acer\codex-bridge\bridgectl.ps1 -Command status',
  '- Invoke-RestMethod http://127.0.0.1:4781/api/health',
  '- Confirm latest reports exist: phone-tunnel-smoke-latest.md and one-button-start-latest.md',
  '',
  '## Closure Criteria',
  '- PPO-005: URLs delivered, dry-run logged, production cutover logged, rollback test documented.',
  '- Phone activation: on-device approval completed, push path confirmed, evidence captured with timestamp.',
  '',
  '## Proposed TASKS.md Edit Guidance',
  '- Keep PPO-005 labeled external dependency until John runtime URLs are delivered.',
  '- Keep phone activation labeled manual closeout with explicit owner/date.',
  '- Keep audio real-meeting validation blocked-manual until a real sessionId/laneId capture is recorded.'
)
$lines | Set-Content -Path $report -Encoding UTF8
Write-Output ('wrote=' + $report)
