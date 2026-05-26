---
name: start
description: "Start or resume the full agentic coding flywheel. Thin index — observe, then ceremony, then phase skills on demand."
---

# Orchestrate: Full Flywheel (index)

Run the agent-flywheel for this project. `$ARGUMENTS` (optional: initial goal or `--mode single-branch`)

> ## CURSOR PORT
>
> **User gates:** `AskQuestion` with `askQuestion` from gate MCP tools.
>
> **Swarm:** Cursor **Task** + worktrees + Agent Mail (`program: "cursor"`).
>
> **Models:** Cursor tiers A/B/C only (`rules/orchestrator-cursor-models.mdc`).

> ## UNIVERSAL RULE 3 — on-demand (`flywheel_get_skill`, `includeBodyInText: false`)
>
> | When | Skill | ~size |
> |------|-------|-------|
> | `/start` step 1 | `flywheel_observe` | compact JSON |
> | Step 0 menu | `flywheel_start_menu` + `start_ceremony` | ~9k ceremony |
> | Steps 2–4, 5.45 | `agent-flywheel:start_discover` | ~2–3k |
> | Step 5+ | `start_planning` (`.cursor.md`), `start_implement` (`.cursor.md`), `start_beads`, `start_review`, `start_wrapup` | one at a time |
>
> **Never** load ceremony + discover + a phase skill in the same turn.

## Execution order

1. `flywheel_observe({ cwd })` — use `structuredContent` only; do not echo the report.
2. `flywheel_get_skill({ name: "agent-flywheel:start_ceremony" })` — banner + Step 0 (0d/0e menus).
3. When ceremony routes to scan/discover/goal → `start_discover` (not before).
4. At Step 5+ boundaries → the matching `start_<phase>` skill only.

## Recovery quick index (minimal context)

| Situation | Slash | MCP | Skill (`flywheel_get_skill`) |
|-----------|-------|-----|------------------------------|
| Skipped wave review | `/recover-gates [ids]` | `flywheel_wave_review_gate` | `start_review` if spawning reviewers |
| Skipped wrap-up | `/recover-gates --wrap-up-only` | `flywheel_wrap_up_gate` | `start_wrapup` after confirm |
| Skipped __gates__ checklist | `/recover-gates --gates-only` | `flywheel_review` `__gates__` | `start_review` |
| Skipped bead launch | `/flywheel-beads-review` | `flywheel_bead_approval_gate` | `_beads.cursor.md` via `start_beads` |

Do **not** load `start_ceremony` or `start_discover` for any row above.
