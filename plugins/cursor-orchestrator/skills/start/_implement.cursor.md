---
name: start_implement
description: "Cursor Step 7: Task subagents, single branch + Agent Mail, impl model gate, impl_tick supervision loop."
---

> **Cursor default.** Load this slice when `FW_IMPL_BACKEND` is unset. NTM path: `skills/legacy/ntm/implement-ntm.md` on disk.

## Step 7: Implement

### Pre-loop

1. `flywheel_confirm_impl_models({ cwd })` if not confirmed this run — **AskQuestion** with `implModelsGate` / compact payload from MCP.
2. **Commit-batch threshold** — when `impl_tick.auto_batch_review: true` (default), threshold is **persisted from config** (`commit_batch_threshold: 5` team default). No separate AskQuestion. Legacy mode (`auto_batch_review: false`): **AskQuestion** Off | 5 | 8 | 12 or `FW_COMMIT_BATCH_THRESHOLD`.
3. **Only after** Step 6 launch gate (**Launch** / **Launch anyway** / swarm mode): `flywheel_approve_beads({ action: "start" })` — on `missing_prerequisite`, bootstrap goal via `flywheel_select` first. If beads were just created, run `flywheel_bead_approval_gate` first (`_beads.cursor.md`).
4. Parallelism: ask user 2–4 agents (cap `impl_tick.max_parallel_impl` in config, default 3).

### Supervision loop (native — `flywheel_impl_tick`)

After the first impl **Task** wave is dispatched, **arm `/loop`** when `impl_tick.auto_loop: true` (default):

```
/loop dynamic wake ~240s
Prompt: flywheel_impl_tick({ cwd, closedBeadIds? })
```

Manual re-call also works:

```
flywheel_impl_tick({ cwd })
flywheel_impl_tick({ cwd, closedBeadIds: ["br-1", "br-2"] })
```

**Epoch check (before spawning Tasks):** Read `data.epoch`. Confirm it matches checkpoint `coordinatorEpoch`. If `kind: stale` or epochs differ, discard `implTasks` / `batchReviewTask` and re-call `flywheel_impl_tick` — do not spawn.

| `data.kind` | Coordinator action |
|-------------|-------------------|
| `monitor` | **AskQuestion** with `data.askQuestion` (impl supervision menu). Map via `data.actions`. On `impl-supervision-tick` → `flywheel_impl_tick`; on `impl-supervision-loop` → arm `/loop` (redundant when `auto_loop` on); on `impl-force-batch-review` → `flywheel_impl_tick({ forceBatchReview: true })`. |
| `stale` | Re-call `flywheel_impl_tick` immediately; do not spawn Tasks |
| `batch_review_dispatch` | Epoch check → spawn **one** Task with `data.batchReviewTask` **immediately** (no supervision menu when auto batch review); re-tick when verdict JSON exists |
| `batch_review_in_progress` | **AskQuestion** (supervision menu) or re-tick; do not start another review |
| `batch_review_verdict` | **AskQuestion** with synthesized beads or supervision; approve → merge into wave → tick |
| `advance_wave` | Epoch check → spawn `data.implTasks` (stagger ~30s) → re-call `flywheel_impl_tick` |
| `dispatch_impl_tasks` | Epoch check → spawn ready-bead tasks → re-call `flywheel_impl_tick` |
| `wrap_up_ready` | Queue drained, no pending batch review — `flywheel_wrap_up_gate({ cwd })` → **AskQuestion** → `_wrapup.md` |
| `wave_complete` | **Legacy only** (`auto_batch_review: false`) — inlined wave review gate; confirm via `flywheel_wave_review_gate` → `flywheel_review` |

### Hint discipline (context budget)

- **Chat:** At most one line from `data.nextActionHint.text` per tick.
- **Never** echo full `coordinatorPlaybook`, `implTasks[].prompt`, or gate JSON.
- Hints are **advisory**; `data.kind`, gate MCP tools, and `nextStep` are authoritative.
- When both hint and structured fields exist, verify `nextActionHint.generationEpoch === data.epoch` before acting.

Do **not** use `codex exec` or `claude --print` for commit-batch review in Cursor.

### Per bead (Task + single branch)

See [`mcp-server/src/cursor-implement-swarm.ts`](../../mcp-server/src/cursor-implement-swarm.ts) for model routing by complexity.

**Preflight:** Agent Mail must be reachable — `flywheel_confirm_impl_models` and `flywheel_advance_wave` block parallel dispatch otherwise.

```
Task({
  model: "<from confirmed table>",
  subagent_type: "generalPurpose",
  run_in_background: true,
  description: "Impl <bead-id>",
  prompt: "<marching orders — flywheel-swarm template>"
})
```

- **Single branch:** all Tasks work in the repo root checkout on the same branch. Do **not** use `git worktree add`. Coordinator `git pull` before wave 1; agents `git pull --rebase` before edits.
- **Agent Mail:** `program: "cursor"` in `macro_start_session`; exclusive `file_reservation_paths` before edits; release on completion.
- **Completion:** `.pi-flywheel/completion/<bead-id>.json` + inbox message to coordinator + `git commit` + `git push`.

### Wave end (queue drained)

With **auto batch review** (default): `flywheel_impl_tick` returns `wrap_up_ready` when no commits pending, or `batch_review_dispatch` when threshold crossed or final drain review applies. **No wave review AskQuestion menu** between waves.

Legacy (`auto_batch_review: false`): `wave_complete` → `flywheel_wave_review_gate` → **AskQuestion** → `flywheel_review`. Then `flywheel_wrap_up_gate` → `_wrapup.md`.

### Coordinator duties

Poll `fetch_inbox` between ticks if useful; nudge stuck Tasks; never use free-text "commit now?" — gates only.

**Hard rules (impl supervision):**

1. **Every `flywheel_impl_tick` ends with AskQuestion** while agents are running — never end the turn on prose alone.
2. After spawning impl or batch-review Tasks, **re-call `flywheel_impl_tick` in the same session** before waiting for the user.
3. When `auto_loop: true`, **arm `/loop` on first impl dispatch** — dynamic wake re-calls `flywheel_impl_tick` (~`interval_seconds`).
4. Commit-batch fresh-eyes fires automatically when `commitsSinceBaseline ≥ commitBatchThreshold` (default **5** from config).

**Hard rule:** After the queue drains, continue to wrap-up (`flywheel_wrap_up_gate` → `_wrapup.md`). Implementation is the middle of the flywheel — not the end.
