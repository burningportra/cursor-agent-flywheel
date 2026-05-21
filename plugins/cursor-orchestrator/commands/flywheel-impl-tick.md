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

## Setup

1. Enable commit-batch threshold at impl pre-flight (8 recommended) or `FW_COMMIT_BATCH_THRESHOLD=8`.
2. Confirm impl models via `flywheel_confirm_impl_models` before the first wave.
3. After dispatching impl Tasks, re-call this tool every `data.nextTickInSeconds` (default 240).

## Branch on `data.kind`

| Kind | Action |
|------|--------|
| `batch_review_dispatch` | Spawn Task with `data.batchReviewTask`, then tick again |
| `batch_review_in_progress` | Wait for verdict file |
| `batch_review_verdict` | AskQuestion + merge synthesized beads |
| `advance_wave` | Spawn `data.implTasks` |
| `dispatch_impl_tasks` | Spawn ready-bead tasks |
| `wave_complete` | `flywheel_wave_review_gate` |
| `monitor` | Schedule next tick |

See `skills/start/_implement.cursor.md` for the full coordinator playbook.
