---
tracker:
  kind: linear
  project_slug: "asolaria-symphony-e3159fb1e260"
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: $SYMPHONY_WORKSPACE_ROOT
hooks:
  after_create: |
    "/mnt/c/nvm4w/nodejs/node.exe" "C:/Users/acer/Asolaria/tools/SymphonyBootstrapWorkspace.js"
agent:
  max_concurrent_agents: 4
  max_turns: 12
codex:
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  command: "'/mnt/c/nvm4w/nodejs/node.exe' 'C:\\nvm4w\\nodejs\\node_modules\\@openai\\codex\\bin\\codex.js' app-server"
  read_timeout_ms: 120000
  approval_policy: never
  thread_sandbox: workspace-write
  turn_sandbox_policy:
    type: workspaceWrite
---

You are working on a Linear ticket `{{ issue.identifier }}`.

Title: {{ issue.title }}
Current status: {{ issue.state }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Rules:

1. Work only inside the provided issue workspace.
2. Do not ask a human to perform routine follow-up actions.
3. Update the issue workpad before and after meaningful milestones.
4. Run validation before handoff.
5. Stop early only for a real blocker such as missing auth, permissions, or required tools.

Super-swarm coordination note:

- `Helm` is the controller admin terminal.
- `Sentinel` is the helper/watch terminal.
- If Asolaria `SUPER_SWARM` is enabled for `qdd`, Symphony participates as the long-running issue lane only.
- Augment/Auggie remains a read-only sidecar.
- Direct repo writes stay on the local Codex lane unless the controller explicitly routes otherwise.
6. Read `docs/SYMPHONY_HELPER_SURFACES.md` at the start of the issue and read `docs/SYMPHONY_HELPERS_LIVE.md` if it exists.
7. Use helper surfaces deliberately:
   - `Abacus` for sanitized external research, browser work, or bounded orchestration only.
   - `Augment/Auggie` only as a read-only codebase retrieval sidecar.
   - `Gemini` for text or audio sidecar support when local status says it is configured.
   - `Phone` only for mobile verification/control when the live helper note says the lane is healthy enough to trust.
8. Record which helper surfaces were consulted, skipped, or blocked in the issue workpad or handoff notes.
