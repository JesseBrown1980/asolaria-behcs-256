# IX <-> Skill Cross-Reference

Mapping IX entries of type "skill" to their corresponding skill folders in `Asolaria/skills/`.

## IX Skill Entries with Matching Skill Folders

| IX | Name | Skill Folder | Match Confidence |
|----|------|-------------|------------------|
| 011 | Phone bidirectional index — Falcon bridge | phone-browser-history-check | partial (phone tag) |
| 014 | WhatsApp as agent comms channel | whatsapp-adb-send | partial (whatsapp tag, broader scope) |
| 019 | Codex agents available — gpt-5.4 xhigh | codex-ref-* (30 folders) | category match |
| 020 | Claude Dispatch — native phone bridge | phone-mode-desktop-control | partial (phone+desktop tag) |
| 028 | Gaia can read local git config directly | -- | knowledge skill, no folder |
| 034 | Dan's advice — gh CLI + private remotes | -- | knowledge skill, no folder |
| 080 | Admin terminal API — ensure, stop, prompt endpoints | -- | knowledge skill, no folder |
| 082 | Gaia's correct method to reach Helm — API not CLI | -- | knowledge skill, no folder |
| 093 | MQTT addressing — 192.168.1.5 is Jesse, 192.168.1.8 is Liris | -- | knowledge skill, no folder |
| 100 | SKILL — RSS feeds bypass browser requirement | -- | knowledge skill, no folder |
| 140 | SKILL — Install Poppler for native PDF reading | codex-ref-pdf | partial (pdf tag) |
| 145 | SKILL — How to restart Asolaria with MQTT LAN access | -- | knowledge skill, no folder |
| 201 | HIJACK UNDONE — brainPrimaryProvider changed to anthropic | -- | knowledge skill, no folder |
| 311 | SKILL — WhatsApp ADB Send | whatsapp-adb-send | exact match |

## Exact Matches (1)

| IX | Skill Folder |
|----|-------------|
| 311 | whatsapp-adb-send |

## Partial/Conceptual Matches (5)

| IX | Skill Folder | Reason |
|----|-------------|--------|
| 011 | phone-browser-history-check | Both involve phone diagnostics, but IX-011 is the bidirectional index concept |
| 014 | whatsapp-adb-send | IX-014 is the broader WhatsApp-as-comms concept; IX-311 is the operational skill |
| 019 | codex-ref-* (30 folders) | IX-019 documents Codex agent availability; the 30 codex-ref folders are individual Codex wrapper skills |
| 020 | phone-mode-desktop-control | IX-020 is the Claude Dispatch phone bridge concept; the folder is the desktop control skill |
| 140 | codex-ref-pdf | IX-140 is about Poppler install for native PDF; codex-ref-pdf is the Codex PDF wrapper |

## IX Skill Entries with NO Matching Skill Folder (Knowledge Skills)

These IX entries describe learned knowledge, procedures, or configurations — not runnable skill folders:

| IX | Name | Why No Folder |
|----|------|---------------|
| 004 | Corepack auto-resolves pnpm per project | Learned behavior, not a runnable skill |
| 008 | Reverse lookup system | Index architecture knowledge |
| 028 | Gaia can read local git config directly | Agent capability discovery |
| 029 | EZ Protect unit tests — COMPLETE | QDD test knowledge |
| 030 | EZ Protect integration tests — COMPLETE | QDD test knowledge |
| 031 | Bitbucket access granted to Liris | Access credential record |
| 034 | Dan's advice — gh CLI + private remotes | Learned advice |
| 039 | Jest auth error message pattern | Testing pattern knowledge |
| 041 | Parallel agent dispatch — split by type | Orchestration knowledge |
| 043 | Jest mock hoisting — use closures | Testing technique |
| 072 | Port 18886 is the LAN port | Networking knowledge |
| 080 | Admin terminal API — endpoints | API documentation |
| 081 | Admin terminal API — exact request formats | API documentation |
| 082 | Gaia's correct method to reach Helm | Procedure knowledge |
| 093 | MQTT addressing — IPs | Network configuration |
| 100 | RSS feeds bypass browser requirement | Technique knowledge |
| 144 | Myth killed — 18886 references corrected | Historical correction |
| 145 | How to restart Asolaria with MQTT LAN | Procedure knowledge |
| 153 | Security fixes applied | Applied fix record |
| 201 | HIJACK UNDONE — provider changed | Applied fix record |

## Skill Folders with NO IX Entry

These skill folders in `Asolaria/skills/` have no matching IX entry:

### Operational Skills (no IX entry)
- avatar-npc-business
- captures-prune-desktop-auto
- captures-prune-desktop-auto-dry-run
- captures-stats
- chrome-profiles-list
- desktop-capture
- desktop-diagnostics
- desktop-dual-capture
- gemini-enterprise-backend-probe
- gemini-enterprise-business-open
- integrations-snapshot
- local-secure-rebuild-lab
- mistake-avoidance-hints
- phone-mode-desktop-control
- playwright-mcp-browser-automation
- swarm-mode-status
- ui-visual-audit

### Codebase Review Skills (no IX entry)
- codebase-review-composite-tools-baseline
- codebase-review-external-mcp-cache
- codebase-review-kickoff
- codebase-review-token-efficiency-snapshot

### Codex Reference Wrappers (no individual IX entries — covered as category by IX-019)
- codex-ref-cloudflare-deploy
- codex-ref-develop-web-game
- codex-ref-doc
- codex-ref-figma
- codex-ref-figma-implement-design
- codex-ref-gh-address-comments
- codex-ref-gh-fix-ci
- codex-ref-google-code-wiki
- codex-ref-imagegen
- codex-ref-jupyter-notebook
- codex-ref-linear
- codex-ref-netlify-deploy
- codex-ref-notion-knowledge-capture
- codex-ref-notion-meeting-intelligence
- codex-ref-notion-research-documentation
- codex-ref-notion-spec-to-implementation
- codex-ref-openai-docs
- codex-ref-pdf
- codex-ref-playwright
- codex-ref-render-deploy
- codex-ref-screenshot
- codex-ref-security-best-practices
- codex-ref-security-ownership-map
- codex-ref-security-threat-model
- codex-ref-sentry
- codex-ref-sora
- codex-ref-speech
- codex-ref-spreadsheet
- codex-ref-system-skill-creator
- codex-ref-system-skill-installer
- codex-ref-system-slides
- codex-ref-system-spreadsheets
- codex-ref-transcribe
- codex-ref-vercel-deploy
- codex-ref-yeet

## Summary

| Category | Count |
|----------|-------|
| IX skill entries total | 26 |
| Exact folder matches | 1 |
| Partial/conceptual matches | 5 |
| Knowledge-only (no folder needed) | 20 |
| Skill folders total | 58 |
| Folders with no IX entry | 57 |
| Coverage gap (operational folders needing IX) | 17 |
| Codex wrappers (covered as category by IX-019) | 30 |
| Codebase review (no IX entry) | 4 |
