---
tracker:
  kind: linear
  project_slug: "<linear-project-slug>"
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
    git clone --depth 1 "$SOURCE_REPO_URL" .
agent:
  max_concurrent_agents: 4
  max_turns: 12
codex:
  command: "eval \"$CODEX_COMMAND\""
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
