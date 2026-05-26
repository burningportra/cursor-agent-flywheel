---
name: start_implement
description: "Cursor Step 7: Task subagents, worktrees, impl model gate, Agent Mail program cursor, impl_tick supervision loop."
---

> **Cursor default.** Load this slice when `FW_IMPL_BACKEND` is unset. NTM path: `skills/legacy/ntm/implement-ntm.md` on disk.

## Step 7: Implement

### Pre-loop

1. `flywheel_confirm_impl_models({ cwd })` if not confirmed this run — **AskQuestion** with `implModelsGate` / compact payload from MCP.
2. **Commit-batch threshold** — **AskQuestion** (or `FW_COMMIT_BATCH_THRESHOLD=8`):
   - Off (`0`) | 5 | **8 (recommended)** | 12
   - Routes to `state.commitBatchThreshold`.
3. **Only after** Step 6 launch gate (**Launch** / **Launch anyway** / swarm mode): `flywheel_approve_beads({ action: "start" })` — on `missing_prerequisite`, bootstrap goal via `flywheel_select` first. If beads were just created, run `flywheel_bead_approval_gate` first (`_beads.cursor.md`).
4. Parallelism: ask user 2–4 agents (cap `impl_tick.max_parallel_impl` in config, default 3).

### Supervision loop (native — `flywheel_impl_tick`)

After the first impl **Task** wave is dispatched:

```
flywheel_impl_tick({ cwd })
```

**Re-call every `data.nextTickInSeconds` seconds** (default **240** ≈ 4 min from `flywheel.config.yaml` → `impl_tick.interval_seconds` or `FW_IMPL_TICK_INTERVAL_SECONDS`).

When beads finish, pass their IDs:

```
flywheel_impl_tick({ cwd, closedBeadIds: ["br-1", "br-2"] })
```

**Epoch check (before spawning Tasks):** Read `data.epoch` from the tick response. Confirm it matches checkpoint `coordinatorEpoch` (`flywheel_observe` or same-session state). If `kind: stale` or epochs differ, discard `implTasks` / `batchReviewTask` and re-call `flywheel_impl_tick` — do not spawn.

| `data.kind` | Coordinator action |
|-------------|-------------------|
| `monitor` | Wait; schedule next tick |
| `stale` | Epoch mismatch or user steered mid-tick — re-call `flywheel_impl_tick` immediately; do not spawn Tasks |
| `batch_review_dispatch` | Epoch check → spawn **one** Task with `data.batchReviewTask` (`model` = decorrelated reviewer, default `opus-4.6`); tick again when verdict JSON exists |
| `batch_review_in_progress` | Do not start another review; tick later |
| `batch_review_verdict` | **AskQuestion** with `data.askQuestion`; approve synthesized beads → merge into wave → tick |
| `advance_wave` | Epoch check → spawn `data.implTasks` (stagger ~30s) |
| `dispatch_impl_tasks` | Epoch check → idle capacity — spawn ready-bead tasks |
| `wave_complete` | Quote `nextActionHint.text` if present → `flywheel_wave_review_gate({ cwd, beadIds })` → **AskQuestion** → `flywheel_review` |

### Hint discipline (context budget)

- **Chat:** At most one line from `data.nextActionHint.text` per tick — use it for quick scan only.
- **Never** echo full `coordinatorPlaybook`, `implTasks[].prompt`, or gate JSON.
- Hints are **advisory**; `data.kind`, gate MCP tools, and `nextStep` are authoritative — never skip mandatory gates because a hint exists.
- When both hint and structured fields exist, verify `nextActionHint.generationEpoch === data.epoch` before acting on the hint.

Do **not** use `codex exec` or `claude --print` for commit-batch review in Cursor.

### Per bead (Task + worktree)

See [`mcp-server/src/cursor-implement-swarm.ts`](../../mcp-server/src/cursor-implement-swarm.ts) for model routing by complexity.

```
Task({
  model: "<from confirmed table>",
  subagent_type: "generalPurpose",
  run_in_background: true,
  description: "Impl <bead-id>",
  prompt: "<marching orders — flywheel-swarm template>"
})
```

- **Worktree:** one path per bead under `.pi-flywheel/worktrees/<bead-id>` (or project convention in AGENTS.md).
- **Agent Mail:** `program: "cursor"` in `macro_start_session`; reserve paths before edits.
- **Completion:** `.pi-flywheel/completion/<bead-id>.json` + inbox message to coordinator.

### Wave end (queue drained)

`flywheel_impl_tick` returns `wave_complete` → `flywheel_wave_review_gate` → **AskQuestion** → re-call gate with `confirmAction` (+ `reviewBeadId` when needed). Then `flywheel_wrap_up_gate` → `_wrapup.md`.

### Coordinator duties

Poll `fetch_inbox` between ticks if useful; nudge stuck Tasks; never use free-text "commit now?" — gates only.

**Hard rule:** After a wave completes, continue to Step 8 (`_review.md`). Implementation is the middle of the flywheel — not the end.
