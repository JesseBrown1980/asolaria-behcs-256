# Liris SubColony — Skill & Tool Index

**Last updated:** 2026-03-18
**Node:** liris | **Operator:** rayssa | **Machine:** DESKTOP-PTSQTIE

---

## Skills (56 total, under Asolaria/skills/)

### Codebase & Review
- `codebase-review-kickoff` — Kickoff codebase review report
- `codebase-review-composite-tools-baseline` — Composite tools baseline snapshot
- `codebase-review-external-mcp-cache` — External MCP cache review
- `codebase-review-token-efficiency-snapshot` — Token efficiency snapshot

### Captures & Desktop
- `captures-prune-desktop-auto` — Auto-prune desktop captures
- `captures-prune-desktop-auto-dry-run` — Dry-run capture pruning
- `captures-stats` — Capture statistics
- `desktop-capture` — Desktop screenshot capture
- `desktop-diagnostics` — Desktop diagnostics
- `desktop-dual-capture` — Dual-screen desktop capture

### Chrome & Browser
- `chrome-profiles-list` — List Chrome profiles

### Integrations
- `integrations-snapshot` — Integration status snapshot
- `gemini-enterprise-backend-probe` — Gemini enterprise backend probe
- `gemini-enterprise-business-open` — Gemini enterprise business open

### Phone
- `phone-browser-history-check` — Phone browser history check

### UI & Visual
- `ui-visual-audit` — UI visual audit
- `avatar-npc-business` — Avatar/NPC business logic

### Swarm & System
- `swarm-mode-status` — Swarm mode status check
- `local-secure-rebuild-lab` — Local secure rebuild lab
- `mistake-avoidance-hints` — Mistake avoidance hints

### Codex Reference Skills (24)
- `codex-ref-cloudflare-deploy` — Cloudflare deployment
- `codex-ref-develop-web-game` — Web game development
- `codex-ref-doc` — Documentation
- `codex-ref-figma` / `codex-ref-figma-implement-design` — Figma design
- `codex-ref-gh-address-comments` / `codex-ref-gh-fix-ci` — GitHub ops
- `codex-ref-google-code-wiki` — Google code wiki
- `codex-ref-imagegen` — Image generation
- `codex-ref-jupyter-notebook` — Jupyter notebooks
- `codex-ref-linear` — Linear integration
- `codex-ref-netlify-deploy` / `codex-ref-render-deploy` / `codex-ref-vercel-deploy` — Deploy targets
- `codex-ref-notion-*` (4 skills) — Notion knowledge/meeting/research/spec
- `codex-ref-openai-docs` — OpenAI docs
- `codex-ref-pdf` — PDF operations
- `codex-ref-playwright` — Playwright automation
- `codex-ref-screenshot` — Screenshot
- `codex-ref-security-*` (3 skills) — Security best practices/ownership/threat model
- `codex-ref-sentry` — Sentry integration
- `codex-ref-sora` — Sora video
- `codex-ref-speech` / `codex-ref-transcribe` — Speech/transcription
- `codex-ref-spreadsheet` — Spreadsheets
- `codex-ref-system-skill-creator` / `codex-ref-system-skill-installer` — Skill management
- `codex-ref-system-slides` / `codex-ref-system-spreadsheets` — Office docs
- `codex-ref-yeet` — Quick deploy

---

## Tools (150+, under Asolaria/tools/)

### Core Lifecycle
- `Start-Asolaria.ps1` / `Start-Asolaria-OneButton.ps1` — Start Asolaria
- `Stop-Asolaria.ps1` — Stop Asolaria
- `Restart-Asolaria-Main.ps1` — Restart main process
- `Start-Asolaria-ControlPlane.ps1` / `Stop-Asolaria-ControlPlane.ps1` — Control plane
- `Start-Asolaria-Public.ps1` — Public-safe profile
- `Setup-Asolaria-Rebuild.ps1` — Full rebuild setup
- `Repair-Asolaria-RuntimePath.ps1` — Runtime path repair

### Liris / SubColony
- `Start-Liris-Karumi.ps1` — **Start Liris SubColony**
- `collab-mcp-server.js` — Collaboration MCP server
- `check-sovereign.js` — Check sovereign connection
- `run-local-mqtt.js` — Local MQTT bridge

### Phone & Mobile
- `Start-Asolaria-Phone.ps1` — Phone connection
- `Start-Asolaria-PhoneBackgroundKeeper.ps1` / `Stop-*` — Background keeper
- `Start-Asolaria-PhoneTunnelMonitor.ps1` / `Stop-*` — Tunnel monitor
- `Refresh-Asolaria-PhoneDeployment.ps1` — Redeploy to phone
- `Test-Asolaria-PhoneTunnelPath.ps1` — Tunnel smoke test
- `Heal-Cure-Asolaria-Phone.ps1` — Phone heal/cure
- `Capture-PhoneScreencapRaw.ps1` — Phone screenshot
- `Set-Asolaria-PhoneBiometricMode.ps1` — Biometric mode
- `Phone-Recovery-Runbook.md` — Recovery guide
- `Repair-Termux-Over-Tailnet.ps1` — Termux repair

### Admin Terminals
- `Start-AdminTerminalSidecar.ps1` / `Stop-*` — Sidecar lifecycle
- `Run-AdminTerminalSidecar.ps1` / `.py` — Run sidecar
- `Send-AdminTerminalInput.ps1` — Send input to terminal
- `Get-AdminTerminalSidecarStatus.ps1` — Status check
- `Invoke-Helm-Control.ps1` — Helm control
- `Open-Asolaria-AdminTerminals.ps1` / `AdminShells` / `SuperAdmin` — Open terminals

### Health & Testing
- `Test-Asolaria-HealthGuardrail.ps1` / `.zsh` / `.sh` — Health guardrail
- `Start-Asolaria-HealthGuardrailMonitor.ps1` — Health monitor
- `Test-Startup-HealthSnapshot.ps1` — Startup health
- `Test-System-WhiteGloveSweep.ps1` — White glove sweep
- `Test-Asolaria-CrossSurfaceAudit.ps1` — Cross-surface audit
- `Test-Asolaria-NamingWorkflowIntegrity.ps1` — Naming integrity
- `Test-Asolaria-MobileControlAuthority.ps1` — Mobile auth test
- `Test-Asolaria-PublishDemoGates.ps1` — Publish demo gates
- `Test-UpgradeBlockerPreflight.ps1` — Upgrade blocker check

### Capture & Display
- `Capture-PrimaryScreen.ps1` — Primary screen capture
- `Capture-Layout-And-Window.ps1` — Layout + window capture
- `Capture-Window.ps1` — Single window capture
- `Invoke-Asolaria-Capture.ps1` — Capture orchestrator
- `Blackout-Display-Now.ps1` / `Wake-Display-And-Resume.ps1` — Display control
- `Get-DesktopDisplays.ps1` — Display info

### Security & Vault
- `Protect-AsolariaVault.ps1` — Vault protection
- `Set-CompanyPrimarySignin.ps1` — Company sign-in
- `Encrypt-7Zip.ps1` — 7-Zip encryption
- `Audit-Android-Threats.ps1` — Android threat audit
- `Start-Android-Threat-Agent.ps1` / `Stop-*` / `Get-*` / `Keep-*` — Threat agent

### Build & Deploy
- `Build-PublicRelease.ps1` — Public release build
- `Sync-Asolaria-BrandIcons.ps1` — Brand icon sync
- `Install-Asolaria-DesktopShortcuts.ps1` — Desktop shortcuts
- `Refresh-Asolaria-ShortcutIconLiveDoc.ps1` — Shortcut/icon doc

### Google & NotebookLM
- `New-GoogleOAuthReauthLinks.ps1` — OAuth reauth
- `Test-GoogleOAuthHealth.ps1` — OAuth health
- `Watch-GoogleOAuthReauth.ps1` — OAuth watch
- `Sync-Asolaria-Core-NotebookLM.ps1` / `sync-notebooklm-core.js` — NotebookLM sync
- `Start-NotebookLM-Upgrade-Loop.ps1` / `Complete-*` — NotebookLM upgrade
- `Watch-NotebookLM-EnterpriseReadiness.ps1` — Enterprise readiness
- `Invoke-GoogleNotebookLm-RecoveryPlan.ps1` — Recovery plan

### Bridge & Networking
- `mqtt-bridge.js` (root) — MQTT bridge to sovereign
- `collab-mcp-server.js` — Collab MCP server
- `Start-AugmentMcpBridge.ps1` / `augment-mcp-bridge.js` — Augment MCP bridge
- `Start-Asolaria-PublicTunnelKeeper.ps1` / `Stop-*` — Public tunnel
- `Sync-Asolaria-PublicTunnelUrl.ps1` — Tunnel URL sync
- `cloudflared.exe` — Cloudflare tunnel binary
- `New-Friend-Codex-BridgePack.ps1` — Friend bridge pack

### Voice & Meeting
- `kitty-tts-adapter.ps1` / `.cmd` — Kitty TTS adapter
- `whisper-local/` — Local Whisper STT
- `Start-Asolaria-MeetingRecording.ps1` / `Stop-*` — Meeting recording
- `Run-Asolaria-MeetingRecordingWorker.ps1` — Recording worker
- `Start-LocalCaptionOcrBridge.ps1` / `Stop-*` — Caption OCR bridge
- `caption_ocr_bridge.py` — Caption OCR Python bridge

### Indexed Abilities
- `voice.meeting.inject` — Existing ability from `LX-232` chained through `LX-221`, `LX-242`, `LX-256`, `LX-257`, and `LX-278`; device-local voice injection, delayed transcription, and guided self-reflection waves
- `omni-shannon` — Bounded Shannon specialist service from `LX-328` and `LX-330`; pentest organization that can be invoked as a whole or by named parts (`shannon-scout`, `shannon-evidence`, `shannon-executor`) under civilization authority

### Autonomous & Overnight Ops
- `Start-Asolaria-OvernightOps.ps1` — Overnight operations
- `Run-Asolaria-OvernightReadiness.ps1` — Overnight readiness
- `Wait-And-Start-OvernightReadiness.ps1` — Scheduled overnight
- `Start-Asolaria-AutonomousKick.ps1` / `Keep-*` — Autonomous kick
- `Start-Asolaria-SystemSupervisor.ps1` / `Stop-*` / `Keep-*` — System supervisor
- `Keep-Asolaria-DarkNightWatch.ps1` — Night watch

### Data & Cleanup
- `Clean-Asolaria-DataArtifacts.ps1` — Data cleanup
- `Start-MediaDedupeQuarantine.ps1` — Media dedup
- `Test-Media-SprawlSnapshot.ps1` — Media sprawl check
- `Index-SkillsToolsMistakes.ps1` — Skills/tools/mistakes indexer

### Misc
- `Talk-To-Asolaria.ps1` / `Talk-To-Brain.ps1` — Direct brain communication
- `snapshot-asolaria.js` — System snapshot
- `export-graph-runtime-dataset.js` — Graph dataset export
- `record-3d-demo.js` — 3D demo recorder
- `validate-skills.js` — Skills validator
- `Run-Asolaria-UpgradeWave.ps1` — Upgrade wave
- `Apply-Asolaria-ExternalCodexUpgrade.ps1` — External Codex upgrade

---

## Claude Code (Liris) Native Capabilities

- File read/write/edit
- Codebase search (glob, grep)
- Bash/PowerShell execution
- Git operations
- Agent spawning (parallel sub-agents)
- Slack integration (read/send/search)
- Linear integration (issues/projects/docs)
- Gmail integration (read/search/draft)
- Web search & fetch
- Notebook editing
- Cron scheduling

---

## Tool Manifests (under tools-manifests/)

- `githubConnector` — GitHub connector manifest
