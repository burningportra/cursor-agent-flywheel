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

1. Enable commit-batch threshold at impl pre-flight (8 recommended) or `FW_COMMIT_BATCH_THRESHOLD=8` or `flywheel.config.yaml` → `impl_tick.commit_batch_threshold`.
2. Confirm impl models via `flywheel_confirm_impl_models` before the first wave.
3. After dispatching impl Tasks, re-call this tool every `data.nextTickInSeconds` (default 240).

## Gate discipline

**Every tick returns `data.askQuestion`** while agents are running. Present **AskQuestion**; map selections via `data.actions`. Do not end the turn on prose alone.

| Action id | Do |
|-----------|-----|
| `impl-supervision-tick` | `flywheel_impl_tick({ cwd, closedBeadIds? })` |
| `impl-supervision-loop` | Arm `/loop` dynamic wake; prompt re-calls `flywheel_impl_tick` |
| `impl-force-batch-review` | `flywheel_impl_tick({ cwd, forceBatchReview: true })` |

## Branch on `data.kind`

| Kind | Action |
|------|--------|
| `monitor` | **AskQuestion** (supervision menu) |
| `batch_review_in_progress` | **AskQuestion** — wait for verdict file |
| `batch_review_dispatch` | Spawn Task with `data.batchReviewTask`, then tick again |
| `batch_review_verdict` | **AskQuestion** — merge synthesized beads |
| `advance_wave` | Spawn `data.implTasks`, then tick again |
| `dispatch_impl_tasks` | Spawn ready-bead tasks, then tick again |
| `wave_complete` | **AskQuestion** (inlined wave review) → `flywheel_wave_review_gate` confirm |

See `skills/start/_implement.cursor.md` for the full coordinator playbook.
