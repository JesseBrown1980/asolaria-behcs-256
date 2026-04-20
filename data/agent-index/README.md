# Agent Index System

Chain-linked knowledge entries for all Asolaria agents.

## How It Works
- Each entry is a small numbered file: `IX-001.md`, `IX-002.md`, etc.
- Entries have a type: `skill`, `tool`, `pattern`, `mistake`, `plan`
- Each entry links to related entries via `chain:` field
- Agents follow chains to reconstruct full context without loading everything
- CATALOG.md is the master lookup — search by keyword, type, or chain

## Entry Format
```yaml
---
ix: 003
name: Short name
type: skill | tool | pattern | mistake | plan
tags: [keyword, keyword]
chain: [IX-001, IX-017]
agents: [gaia, dasein, helm, all]
---
Content here. Keep it short — 5-15 lines max.
```

## Who Writes Entries
Any agent can append. Gaia auto-indexes at session end.
Helm validates inside simulation. Dasein contributes from local work.

## Chain Examples
- `IX-001 → IX-002 → IX-005`: How to orchestrate (pattern → plan-loop → handoff protocol)
- `IX-003 → IX-004`: pnpm on Windows (mistake → skill workaround)
