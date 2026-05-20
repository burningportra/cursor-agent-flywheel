---
name: flywheel-resume
description: "Resume in-flight flywheel work on open beads using Cursor Task swarm (replaces NTM auto-swarm)."
argument-hint: "[bead-id ...]"
---

**Cursor-native resume** for projects with open beads or an active checkpoint. Replaces the legacy **Auto-swarm** → `_inflight_prompt.md` path.

## Step 1 — observe

`flywheel_observe({ cwd })` — workspace root. Use `structuredContent` only; do not paste the full report.

## Step 2 — route from checkpoint

Read `observe.checkpoint` (phase, `selectedGoal`, `activeBeadIds`). If phase is `implementing` or open beads exist, continue. If idle with no beads, tell the user to run `/start` instead.

## Step 3 — confirm goal if needed

If `flywheel_approve_beads` returns `missing_prerequisite`, call `flywheel_select` with a synthesized goal from checkpoint or bead titles, then retry.

## Step 4 — launch swarm

Follow [`commands/flywheel-swarm.md`](commands/flywheel-swarm.md):

1. `flywheel_confirm_impl_models` → **AskQuestion** with `implModelsGate` (once per run).
2. `flywheel_approve_beads({ action: "start" })` for ready beads (or use `$ARGUMENTS` bead ids if provided).
3. Spawn **Task** subagents per bead with worktrees and `program: "cursor"`.
4. After the wave: `flywheel_wave_review_gate` → **AskQuestion** → `flywheel_review`.

## NTM opt-in

Only if the user requests tmux panes: `FW_IMPL_BACKEND=ntm` and `skills/legacy/ntm/inflight-prompt.md` from disk.
