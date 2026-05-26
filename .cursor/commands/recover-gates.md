---
name: recover-gates
description: "Recover post-implement gates (wave review + wrap-up) — compact MCP + AskQuestion."
argument-hint: "[bead-id ...] [--wrap-up-only] [--review-only] [--gates-only]"
---

**Compact agent contract.** Full playbook (decision tree, naming matrix, anti-patterns, bead-resolution priority): [`flywheel-recover-gates.md`](flywheel-recover-gates.md).

**Context:** Use compact gate MCP + `AskQuestion` only. Do **not** load `start_bootstrap` or phase skills here. For review routing: `flywheel_get_skill({ name: "agent-flywheel:start_review" })` only if the action needs `_review.md`.

Parse `$ARGUMENTS`: bead ids; `--wrap-up-only` | `--review-only` | `--gates-only`. If both `--gates-only` and `--wrap-up-only`, stop and surface: "These flags target different gates; pick one and re-invoke." `cwd` = workspace root.

## Wave review (unless `--wrap-up-only`)

`flywheel_wave_review_gate({ cwd, beadIds })` → **`AskQuestion(data.askQuestion)`** → map `data.actions[optionId]`:

| action | Do |
|--------|-----|
| `looks-good-all` | `flywheel_wave_review_gate({ confirmAction: "looks-good-all", beadIds })` — closes all beads |
| `self-review` | `flywheel_wave_review_gate({ confirmAction: "self-review", beadIds, reviewBeadId? })` — follow `selfReviewPlaybook` |
| `fresh-eyes` | `flywheel_wave_review_gate({ confirmAction: "fresh-eyes", beadIds, reviewBeadId? })` — spawn Tasks from `reviewOutcome` |
| `duel-review` | `flywheel_wave_review_gate({ confirmAction: "duel-review", beadIds })` — follow `duelReviewPlaybook` |

## Wrap-up (unless `--review-only`)

When queue empty: `flywheel_wrap_up_gate({ cwd })` → **AskQuestion** → `confirmWrapUp: "full" | "commit_only" | "skip"`. Wrap-up skill: `agent-flywheel:start_wrapup` only if needed.

## `--gates-only`

`flywheel_review({ beadId: "__gates__", action: "looks-good" })` until `review_gates_complete`.

## On error

| Code | Cause | Recovery |
|------|-------|----------|
| `invalid_input` | `beadIds` empty / `confirmAction` typo / extra args | Re-call with corrected args; do not retry blindly |
| `unsupported_action` | `confirmAction` not in {looks-good-all, self-review, fresh-eyes, duel-review} | Surface to user; map only via `data.actions` |
| `not_found` | A bead id no longer exists in `br list` | Drop it; re-call with remaining; do not bump epoch |
| `cli_failure` | `br update --status closed` failed mid-loop | Read `partiallyClosed: string[]`; resume with remaining |
| `wave_review_bead_pick_required` | Multi-bead self/fresh-eyes without `reviewBeadId` | Forward `nextAskQuestion` via AskQuestion; re-call with `reviewBeadId` |
| `idempotentReplay: true` | Duplicate confirm | Report "already resolved"; do **not** re-spawn reviewers |
| `wrap_up_already_confirmed` | Wrap-up choice already recorded | Surface state; load `start_wrapup` only if user asks for details |
| `recoverySource: "manual_required"` / `confidence: "degraded"` | Resolver could not infer | Ask user to paste bead ids; never auto-select stale candidates |

**Mutually exclusive flags:** `--gates-only` and `--wrap-up-only` cannot combine.
