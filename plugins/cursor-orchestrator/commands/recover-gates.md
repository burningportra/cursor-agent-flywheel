---
name: recover-gates
description: "Recover post-implement gates (wave review + wrap-up) — compact MCP + AskQuestion."
argument-hint: "[bead-id ...] [--wrap-up-only] [--review-only] [--gates-only]"
---

**Context:** Use compact gate MCP + `AskQuestion` only. Do **not** load `start_bootstrap` or phase skills here. For review routing: `flywheel_get_skill({ name: "agent-flywheel:start_review" })` only if the action needs `_review.md`.

Parse `$ARGUMENTS`: bead ids; `--wrap-up-only` | `--review-only` | `--gates-only`. `cwd` = workspace root.

## Wave review (unless `--wrap-up-only`)

`flywheel_wave_review_gate({ cwd, beadIds })` → **`AskQuestion(data.askQuestion)`** → map `data.actions[optionId]`:

| action | Do |
|--------|-----|
| `looks-good-all` | `flywheel_review({ action: "looks-good", beadId })` per bead |
| `self-review` | user gives one bead id → self-review path in `_review.md` |
| `fresh-eyes` | user gives one bead id → `flywheel_review({ action: "hit-me", beadId })` |
| `duel-review` | dueling review for risky beads |

## Wrap-up (unless `--review-only`)

When queue empty: `flywheel_wrap_up_gate({ cwd })` → **AskQuestion** → `confirmWrapUp: "full" | "commit_only" | "skip"`. Wrap-up skill: `agent-flywheel:start_wrapup` only if needed.

## `--gates-only`

`flywheel_review({ beadId: "__gates__", action: "looks-good" })` until `review_gates_complete`.
