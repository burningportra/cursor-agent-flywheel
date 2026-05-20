---
name: orchestrate-recover-gates
description: "Recover dropped post-implement gates — wave review menu and wrap-up menu via MCP (no ad-hoc commit prompts)."
argument-hint: "[bead-id ...] [--wrap-up-only] [--review-only] [--gates-only]"
---

**Use when** implement finished but the session skipped Step 8 review, jumped to ad-hoc commit prompts, or you need to re-open the wrap-up menu.

**First action:** Parse `$ARGUMENTS`:
- Positional tokens matching bead ids (e.g. `tb-12`, `agent-flywheel-plugin-abc`) → use as the wave's `beadIds`.
- `--wrap-up-only` → skip wave review; call `flywheel_wrap_up_gate` only.
- `--review-only` → call `flywheel_wave_review_gate` only (no wrap-up this turn).
- `--gates-only` → call `flywheel_review` with `beadId="__gates__"` (guided review gates after all beads closed — different from wave review).

Default `cwd` = workspace root (absolute path for MCP).

## Step 1: Snapshot context

1. Read `.pi-flywheel/checkpoint.json` if present — note `phase`, `selectedGoal`, `wrapUpConfirmed`, `beadResults`.
2. Run `br list --json` via Bash (or rely on MCP `readBeads` indirectly through tools).

## Step 2: Resolve bead IDs (wave review)

If the user passed bead ids in `$ARGUMENTS`, use that list.

Otherwise build `beadIds` from:
- Keys in `checkpoint.beadResults` with `status: "success"` from this session, **or**
- Beads with `status: "closed"` from `br list` that look like this wave (prefer those still `open`/`in_progress` if the wave is not fully closed yet — include every bead the swarm was implementing).

If the list is empty, ask once (numbered):
1. Paste bead IDs (comma-separated)
2. Run `/flywheel-swarm-status` to infer from swarm state
3. Cancel

Do **not** proceed with an empty `beadIds` for wave review.

## Step 3: Wave review gate (Step 8) — unless `--wrap-up-only`

Skip this section when `--wrap-up-only`.

Call:

```text
flywheel_wave_review_gate({ cwd: "<absolute cwd>", beadIds: ["<id>", ...] })
```

Then:
1. **Do not** paste the full MCP JSON into chat (compact payload: `gateMeta`, `askQuestion`, `actions` only).
2. **Call `AskQuestion`** with `data.askQuestion`. Map the clicked id via `data.actions` (`looks-good-all`, `self-review`, `fresh-eyes`, …). Load `agent-flywheel:start_review` only if you need `_review.md` detail — **not** `agent-flywheel:start`.
3. **Never** ask "want to commit?" in prose. **Fallback:** numbered choices only if `AskQuestion` fails.

If `--review-only`, stop after step 3 completes (user chose review path and you executed it). Tell them to run `/flywheel-recover-gates --wrap-up-only` when the bead queue is empty.

## Step 4: Guided review gates — only when `--gates-only`

When the user needs the **__gates__** loop (tests/docs/integration checklist) after all beads are closed:

```text
flywheel_review({ cwd, beadId: "__gates__", action: "looks-good" })
```

Repeat until the tool returns `review_gates_complete` with `nextStep.kind: "wrap_up_gate"`, or the user chooses `hit-me` / `skip` per tool text.

Do **not** combine `--gates-only` with `--wrap-up-only` in one invocation.

## Step 5: Wrap-up gate (Step 9.5) — unless `--review-only`

Skip when `--review-only`.

When all beads are reviewed and the queue is empty (or the user explicitly wants wrap-up), call:

```text
flywheel_wrap_up_gate({ cwd: "<absolute cwd>" })
```

**AskQuestion** + `confirmWrapUp`. After the user picks, call again with:

```text
flywheel_wrap_up_gate({ cwd, confirmWrapUp: "full" | "commit_only" | "skip" })
```

Then follow `skills/start/_wrapup.md` for the chosen branch (sub-steps still use numbered choices).

## Step 6: Default path when flags omitted

If neither flag is set, run in order **when each precondition holds**:

| Condition | Action |
|-----------|--------|
| Implement wave done, review not done | Step 3 (`flywheel_wave_review_gate`) |
| User says all beads accepted / queue empty | Step 5 (`flywheel_wrap_up_gate`) |
| Checkpoint shows review gates incomplete | Offer `--gates-only` or run Step 4 if user confirms |

Prefer **one gate per user message** unless they ask for the full chain in one go.

## Recovery one-liner (for the user)

> `/flywheel-recover-gates tb-1 tb-2` — wave review menu for those beads  
> `/flywheel-recover-gates --wrap-up-only` — wrap-up menu only  
> `/flywheel-recover-gates --gates-only` — guided `__gates__` checklist  

Short form: `/recover-gates`. Back-compat: `/orchestrate-recover-gates`.
