---
name: start_beads
description: "Cursor Steps 5.5–6: create beads, coverage/dedup gates, review/score/polish/launch gates."
---

# Bead Creation & Approval — Steps 5.5, 6 (Cursor)

> **Cursor:** Use **`AskQuestion`** with `data.askQuestion` from **`flywheel_bead_approval_gate`**. Never embed `AskUserQuestion(...)` JSON. Never call `flywheel_approve_beads({ action: "start" })` until the user picks **Launch** (or **Launch anyway** / **Swarm anyway** / **Coordinator-serial**) from the launch gate.

## br CLI (exact flags)

| Operation | Correct form |
|-----------|--------------|
| Create | `br create --title "…" --description "…" --priority 2 --type task` |
| Dependency | `br dep add <downstream> <upstream>` (positional) |
| List open | `br list --json` |

## Step 5.5: Create beads

1. `br create` per plan task; `br dep add` for edges; verify with `br list`.
2. **Coverage gate** — after coordinator builds section→bead map:

```
flywheel_bead_approval_gate({
  cwd,
  step: "coverage",
  coveredSections: <n>,
  totalSections: <n>,
  missingSections: ["…"]
})
```

**AskQuestion** with `data.askQuestion`. On gaps → `br create` catch-up beads → re-run coverage.

3. **Dedup gate**:

```
flywheel_bead_approval_gate({ cwd, step: "dedup", overlapPairs: <n> })
```

**AskQuestion** → resolve merges → proceed to Step 6.

## Step 6: Review, score, polish, launch (two mandatory gates)

> Do **not** spawn implement **Tasks** until the user confirms **Launch** on the second gate.

### Gate 1 — Review menu

```
flywheel_bead_approval_gate({ cwd, step: "review" })
```

**AskQuestion** with `data.askQuestion`. Map selection via `data.actions`:

| User picks | Coordinator |
|------------|-------------|
| Start implementing | `flywheel_bead_approval_gate({ cwd, step: "launch" })` — **not** `approve_beads` start yet |
| Polish further | `flywheel_approve_beads({ action: "polish" })` → refine beads (`br update`) → Gate 1 again |
| Reject | `flywheel_approve_beads({ action: "reject" })` → Step 3 |

### Gate 2 — Score + launch (after Start)

```
flywheel_bead_approval_gate({ cwd, step: "launch" })
```

Returns **quality score**, optional **convergence**, **hotspot matrix**, and one of:

- `bead_launch` — quality ≥ 0.75, low contention
- `bead_low_quality` — score &lt; 0.75
- `bead_hotspot` — shared-file contention

**AskQuestion** with `data.askQuestion`. Show `data.quality` and `data.matrix` in your summary table.

| User picks | Coordinator |
|------------|-------------|
| Launch / Launch anyway / Swarm anyway / Coordinator-serial | Step 7: `_implement.cursor.md` pre-loop, then `flywheel_approve_beads({ action: "start" })` |
| Polish more / Polish beads | `flywheel_approve_beads({ action: "polish" })` → Gate 1 |
| Back to plan | Step 5.6 planning |
| Reject | `flywheel_approve_beads({ action: "reject" })` |

### Quality score without choosing Start

If the user asks for the score before Gate 1, call `step: "launch"` once to surface scores, then return to Gate 1 (`step: "review"`) if they have not committed to launch.

## Errors

Branch on `structuredContent.data.error.code` for `flywheel_approve_beads` — never parse error message text.

## Slash command

`/flywheel-beads-review` — runs the coverage → dedup → review → launch gate chain (see `commands/flywheel-beads-review.md`). Flags: `--step launch`, `--step review`, `--coverage`, `--dedup`.

## Next

After **Launch** → load `_implement.cursor.md` (impl models, commit-batch, `flywheel_approve_beads` start, `flywheel_impl_tick`).
