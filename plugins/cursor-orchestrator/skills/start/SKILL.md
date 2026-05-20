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

Recover-gates / mid-loop: gate MCP + `start_review` or `start_wrapup` only — not ceremony or discover.
