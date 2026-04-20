# Asolaria Skills (v1)

This folder contains **Asolaria-native, declarative skills**. Skills are intended to be:

- Local-first (run from this Asolaria instance)
- Auditable (versioned JSON, no opaque remote code)
- Safe by default (limited to a small allowlist of internal step actions)

## Layout
- `skills/<skill-folder>/skill.json`

## skill.json schema (v1)
- `id` (required): stable identifier, example: `integrations.snapshot`
- `title` (required)
- `description` (optional)
- `version` (optional)
- `risk` (optional): `low|medium|high|critical` (informational; enforcement is done by policy/guardian)
- `permissions` (optional): string array (capabilities required; used for auditing/policy)
- `tags` (optional): string array
- `steps` (required): ordered steps
  - `action` (required): one of the supported internal actions (see `Asolaria/src/skillRunner.js`)
  - `payload` (optional): JSON object passed to the action handler
  - `note` (optional): shown in logs/reports
  - `permissions` (optional): string array (capabilities required by the step)
  - `requiresApproval` (optional): boolean (force owner approval before running this step)

## Run (chat)
- `skills`
- `skill info <id>`
- `skill run <id>`
