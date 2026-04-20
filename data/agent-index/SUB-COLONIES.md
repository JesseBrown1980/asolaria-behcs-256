# Sub-Colony Registry

Master index owner: **Jesse Daniel Brown** (plasmatoid@gmail.com)
Master devices: Desktop (C:\Users\acer) + Samsung Galaxy S24 FE (Falcon)

## Registered Sub-Colonies

| Colony | Prefix | Owner | Device | Connection | Exported IX | Last Sync |
|--------|--------|-------|--------|------------|-------------|-----------|
| Liris | LX- | Rayssa | C:\Users\rayss\Asolaria | MQTT (asolaria/liris/commands) @ 192.168.1.3:18886 | 218 entries | 2026-03-24 |
| Felipe | FX- | Felipe | phone 192.168.1.10:5555 | ADB (needs auth tap) | — | never (pending setup) |

## Liris Colony Snapshot (2026-03-24)

**218 LX entries across 10 types:**

| Type | Count |
|------|-------|
| pattern | 91 |
| skill | 28 |
| mistake | 27 |
| plan | 24 |
| tool | 24 |
| task | 8 |
| rule | 8 |
| project | 2 |
| identity | 1 |

**spawnContextBuilder:** 7 roles, persistent PID registry, queryTasksForRole

**Key files stored in `sub-colonies/liris/`:**
- `CATALOG.md` — master lookup (218 LX entries)
- `PID-REGISTRY.md` — persistent process ID registry
- `XREF.md` — cross-references between LX entries and Gaia IX entries
- `spawnContextBuilder.js` — role-based context builder with 7 roles
- `CATALOG-TASKS.md` — task-type catalog
- `LX-211.md` through `LX-215.md` — active task entries

> Note: Individual LX-*.md files for pattern/mistake/skill/plan/tool/rule/project/identity types are NOT stored locally. They live on Liris's machine. Only reference files and active tasks are mirrored here.

## How to Register a New Sub-Colony
1. Assign a unique prefix (2 letters + hyphen)
2. Add row to this table
3. Create their index template: `CATALOG.md` + `README.md` with their prefix
4. Export any shared IX entries with `source: master` tag
5. Notify Helm to create the simulation construct
