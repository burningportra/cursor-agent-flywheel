# Changelog

## [Unreleased]

_No plugin-only changes beyond monorepo root._

---

## [3.20.0] — 2026-05-26

### Fixed

- **Wave review** — `flywheel_wave_review_gate` `confirmAction: looks-good-all` closes every bead; fresh-eyes / self-review / duel-review dispatch from confirm (optional `reviewBeadId`).
- **Commit-batch fresh-eyes** — threshold from config/env, persisted at impl pre-flight; `impl_tick` reads snake_case YAML keys.
- **Compliance audit** — Cursor-native defer (`compliance_audit_deferred` + `afterTask`); per-bead `FW_COMPLIANCE_OVERRIDE`.
- **`FW_MAX_OUTCOME_ITERATIONS`** — env fallback when checkpoint cap unset.
- **`profile.staleAction: auto_refresh`** — debounced background refresh on `flywheel_impl_tick`.

### Changed

- Capabilities docs for compliance/grader env vars; `AGENTS.md` log level → `FW_LOG_LEVEL`.
- `recover-gates.md`, `_implement.cursor.md` — wave gate confirmAction flow.

---

## [3.19.0] — 2026-05-20

### Added

- **`coordinator-epoch.ts`** — `getCoordinatorEpoch`, `bumpCoordinatorEpoch`, persisted bumps on gate steering.
- **`profile-staleness.ts`** — plan/config drift detection; `profileStale` in observe, doctor, impl tick.
- **`next-action-hint.ts`** — capped `nextActionHint` on wave complete and advance wave; `steering-events.ts` FIFO suppression.
- **`flywheel_impl_tick`** — `data.epoch` on all responses; `kind: 'stale'` drops stale `implTasks` when epoch guards enabled.

### Changed

- **`tools/advance-wave.ts`**, **`tools/review.ts`**, **`tools/user-gate.ts`** — bump coordinator epoch on user steering.
- **`skills/start/_implement.cursor.md`** — epoch check + advisory `nextActionHint` usage.

---

## [3.18.1+visual] — 2026-05-20

### Added

- **`visual_prototype`** skill — planning-only browser companion (superpowers Visual Companion port); `skills/visual-prototype/`, Step 4.55 in `_planning.cursor.md` / `_planning.md`.
- WS protocol tests under `tests/visual-prototype/`.
- Skills bundle entry for `agent-flywheel:visual_prototype`.

---

## [3.18.1+gates] — 2026-05-20

### Added

- **`flywheel_bead_approval_gate`** — Cursor AskQuestion menus for bead review, quality score, polish, coverage, dedup, and launch (`step`: `review` → `launch`).
- **`flywheel_impl_tick`** — Implement-phase supervision (~240s): commit-batch review dispatch, wave advance on closed beads.
- **`flywheel_wave_review_gate`**, **`flywheel_wrap_up_gate`** — post-wave and wrap-up AskQuestion gates.
- Slash commands: **`/flywheel-beads-review`**, **`/flywheel-impl-tick`**, **`/flywheel-recover-gates`**; full `flywheel-*` parity in monorepo `.cursor/commands/`.
- Playbooks: `skills/start/_beads.cursor.md`, `_implement.cursor.md` updates for native gates + impl tick polling.
- `scripts/install-flywheel-cursor.sh` — rsync to `~/.cursor/plugins/local/`, MCP rebuild, global command copies.
- Large upstream skills sync via `scripts/sync-agent-flywheel-upstream.mjs` (see monorepo commit [`3e1ebbe`](https://github.com/burningportra/cursor-agent-flywheel/commit/3e1ebbe)).

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
