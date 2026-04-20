# IX-768 — LIRIS direct cable gate and 100BN / Gemini evidence

- Direct cable is live on `192.168.100.1 <-> 192.168.100.2`
- LIRIS keyboard health is reachable on `192.168.100.2:4820`
- Control routes are still gated because LIRIS has not allowlisted `192.168.100.1`
- This is the blocker before `liris_remote_root_ingest`

Canonical proof / infra anchors:

- `E:\runtime\federation-rehydration-batch-v1\ROSE-ORACLE-BOOTSTRAP-BUNDLE-2026-04-09\payload\MEMORY.md`
- `E:\runtime\federation-rehydration-batch-v1\ROSE-ORACLE-BOOTSTRAP-BUNDLE-2026-04-09\payload\feedback_200B_gnn_validation_complete.md`
- `E:\runtime\federation-rehydration-batch-v1\ROSE-ORACLE-BOOTSTRAP-BUNDLE-2026-04-09\payload\feedback_msys_pid_namespace_mismatch.md`
- `C:\Users\acer\Asolaria\data\agent-index\rules\IX-481.md`
- `C:\Users\acer\Asolaria\data\vault\owner\observations\gemini-enterprise-licenses-20260325.md`

Next order:

1. `liris_keyboard_allowlist_rebind`
2. `liris_remote_root_ingest`
3. `mirror_candidate_review`
4. `selective_c_to_e_materialization`
5. `startup_launcher_rebinding`
