---
name: flywheel-impl-tick
description: Cursor-native implementation supervision loop — call repeatedly during Step 7 implement (~4 min default).
argument-hint: "[closed-bead-ids...]"
---

Cursor-native implementation supervision loop. Call repeatedly during Step 7 implement (~4 min default).

## Usage

```
flywheel_impl_tick({ cwd: "<absolute-project-path>" })
```

When beads close since the last tick:

```
flywheel_impl_tick({ cwd: "<path>", closedBeadIds: ["br-42", "br-43"] })
```

Force commit-batch fresh-eyes before threshold:

```
flywheel_impl_tick({ cwd: "<path>", forceBatchReview: true })
```

## Setup

1. Confirm impl models via `flywheel_confirm_impl_models` before the first wave. With `auto_batch_review: true` (default), threshold **5** is persisted from `flywheel.config.yaml` → `impl_tick.commit_batch_threshold` — no separate AskQuestion.
2. After first impl dispatch, **arm `/loop`** when `auto_loop: true` (default): dynamic wake ~`interval_seconds` with prompt `flywheel_impl_tick({ cwd, closedBeadIds? })`.
3. Re-call manually every `data.nextTickInSeconds` (default 240) if not using loop.

## Gate discipline

**Every tick returns `data.askQuestion`** while agents are running (monitor / in-progress batch review / verdict with findings). Present **AskQuestion**; map selections via `data.actions`. Do not end the turn on prose alone.

**Auto batch review (default):** `batch_review_dispatch` has **no** supervision AskQuestion — spawn `data.batchReviewTask` immediately, then re-tick.

| Action id | Do |
|-----------|-----|
| `impl-supervision-tick` | `flywheel_impl_tick({ cwd, closedBeadIds? })` |
| `impl-supervision-loop` | Arm `/loop` dynamic wake (mandatory when `auto_loop: true` on first dispatch) |
| `impl-force-batch-review` | `flywheel_impl_tick({ cwd, forceBatchReview: true })` |

## Branch on `data.kind`

| Kind | Action |
|------|--------|
| `monitor` | **AskQuestion** (supervision menu) |
| `batch_review_in_progress` | **AskQuestion** — wait for verdict file |
| `batch_review_dispatch` | Spawn Task with `data.batchReviewTask` **immediately**, then tick again (no menu when auto) |
| `batch_review_verdict` | **AskQuestion** — merge synthesized beads |
| `advance_wave` | Spawn `data.implTasks`, then tick again |
| `dispatch_impl_tasks` | Spawn ready-bead tasks, then tick again |
| `wrap_up_ready` | `flywheel_wrap_up_gate({ cwd })` → **AskQuestion** |
| `wave_complete` | Legacy only — **AskQuestion** (inlined wave review) → `flywheel_wave_review_gate` |

See `skills/start/_implement.cursor.md` for the full coordinator playbook.
