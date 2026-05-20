# Changelog

## [Unreleased]

### Added

- **`flywheel_bead_approval_gate`** — Cursor AskQuestion menus for bead review, quality score, polish, coverage, dedup, and launch (`step`: `review` → `launch`).
- **`flywheel_impl_tick`** — Implement-phase supervision (~240s): commit-batch review dispatch, wave advance on closed beads.
- Slash commands: **`/flywheel-beads-review`**, **`/flywheel-impl-tick`**; `/flywheel` menu item **26** (bead gates).
- Playbooks: `skills/start/_beads.cursor.md`, `_implement.cursor.md` updates for native gates + impl tick polling.
- `scripts/install-flywheel-cursor.sh` — global copy of `flywheel-beads-review` to `~/.cursor/commands/`.

### Fixed

- `flywheel_review` / batch review: `clearPendingBatchReview` persists via `ctx.state`.

---

## [3.18.1] — Cursor full parity port

### Added

- Full sync from [agent-flywheel-plugin](https://github.com/burningportra/agent-flywheel-plugin) v3.18.x (`SYNC_MANIFEST.json`, `scripts/sync-agent-flywheel-upstream.mjs`).
- All upstream **flywheel_*** MCP tools (+ deprecated **orch_*** aliases).
- Commands: `flywheel-*`, canonical **`/start`** → `skills/start/SKILL.md`, **`/flywheel`** menu.
- Skills bundle (`skills.bundle.json`), `flywheel_get_skill`, doctor/remediate/observe/verify/advance/compliance tools.
- `flywheel.config.yaml`, Cursor hooks (sessionStart, preToolUse agent-mail guard, postToolUse).
- Rules: `cursor-user-gates.mdc`, `cursor-swarm.mdc`.
- Legacy checkpoint migration: `.pi-orchestrator/` → `.pi-flywheel/` (one-time).
- `scripts/link-cursor-commands.mjs` for workspace slash-command symlinks + `orchestrate-*` back-compat.

### Changed

- State directory: **`.pi-flywheel/`** (was `.pi-orchestrator/` in Cursor port v2.x).
- MCP package **agent-flywheel-mcp@3.18.1** with upstream build pipeline (bundle, schemas, vitest).
- README upstream pin → `agent-flywheel-plugin`.

### Cursor-specific

- `skills/start/SKILL.md` — CURSOR PORT block (numbered gates, Task swarm, Cursor models).
- Swarm: Task subagents + git worktree + Agent Mail (`program: cursor`); NTM optional.
- Root [`.cursor/mcp.json`](../../.cursor/mcp.json) includes orchestrator stdio server.

### Breaking

- Prefer **`flywheel_*`** tool names; **`orch_*`** deprecated (removed upstream in v4.0).
- Run **`/flywheel-setup`** after upgrade; reload Cursor window.
