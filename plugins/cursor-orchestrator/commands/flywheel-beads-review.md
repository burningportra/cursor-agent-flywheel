---
name: flywheel-beads-review
description: "Step 5.5–6 bead gates — coverage, dedup, review, score, polish, launch via AskQuestion (Cursor-native)."
argument-hint: "[--launch] [--coverage] [--dedup] [--step review|launch|coverage|dedup]"
---

**Use when** beads exist (or you just finished `br create`) and the session skipped Step 6 — no review/score/polish/launch **AskQuestion** menus.

**Do not** call `flywheel_approve_beads({ action: "start" })` until the user picks **Launch** (or **Launch anyway** / **Swarm anyway** / **Coordinator-serial**) from the launch gate.

Default `cwd` = workspace root (absolute path for MCP).

## Parse `$ARGUMENTS`

| Flag | Behavior |
|------|----------|
| (none) | Full chain: coverage → dedup → review → launch (when each step applies) |
| `--step review` | Gate 1 only (Start / Polish / Reject) |
| `--step launch` | Gate 2 only (score + Launch / low-quality / hotspot menu) |
| `--step coverage` | Plan–bead coverage menu (pass counts below) |
| `--step dedup` | Dedup menu (`overlapPairs` from coordinator scan) |
| `--coverage` | Same as `--step coverage` (coordinator must supply section counts) |
| `--dedup` | Same as `--step dedup` |
| `--launch` | Same as `--step launch` (skip review menu) |

## Step 0: Context

1. Read `.pi-flywheel/checkpoint.json` — note `phase`, `selectedGoal`, `planDocument`, `polishRound`.
2. Run `br list --json` and show a short bead table (id, title, status).

## Step 1: Coverage gate — unless `--launch` / `--dedup` / `--step review` / `--step launch`

Skip when the user only wants review or launch.

1. Parse `##` / `###` headers from `checkpoint.planDocument` (or ask the user for the plan path).
2. Build section → bead mapping; count `coveredSections`, `totalSections`, `missingSections[]`.

```text
flywheel_bead_approval_gate({
  cwd: "<absolute cwd>",
  step: "coverage",
  coveredSections: <n>,
  totalSections: <n>,
  missingSections: ["…"]
})
```

**AskQuestion** with `data.askQuestion`. On **Create catch-up beads** → `br create` → re-run coverage. On **All covered** or **out of scope** → Step 2.

## Step 2: Dedup gate — unless `--launch` / `--coverage` / `--step review` / `--step launch`

Scan titles/descriptions for overlap pairs; set `overlapPairs` count.

```text
flywheel_bead_approval_gate({ cwd: "<absolute cwd>", step: "dedup", overlapPairs: <n> })
```

**AskQuestion** → resolve merges (`br update`, `br close`) → Step 3.

## Step 3: Review gate (Gate 1) — unless `--launch` / `--step launch`

```text
flywheel_bead_approval_gate({ cwd: "<absolute cwd>", step: "review" })
```

**AskQuestion** with `data.askQuestion`. Map via `data.actions`:

| Option | Next |
|--------|------|
| Start implementing | Step 4 (`step: launch`) — **not** `approve_beads` start yet |
| Polish further | `flywheel_approve_beads({ action: "polish" })` → refine beads → Step 3 again |
| Reject | `flywheel_approve_beads({ action: "reject" })` |

## Step 4: Launch gate (Gate 2) — score + confirm

```text
flywheel_bead_approval_gate({ cwd: "<absolute cwd>", step: "launch" })
```

Present **`data.quality`** (score, weak beads) and **`data.matrix`** when hotspot contention applies. **AskQuestion** with `data.askQuestion`.

| Option | Next |
|--------|------|
| Launch / Launch anyway / Swarm / Coordinator-serial | Step 5 |
| Polish more / Polish beads | `flywheel_approve_beads({ action: "polish" })` → Step 3 |
| Back to plan | Step 5.6 planning (`start_planning`) |
| Reject | `flywheel_approve_beads({ action: "reject" })` |

## Step 5: Start implementation (only after Launch)

Load `skills/start/_implement.cursor.md`:

1. `flywheel_confirm_impl_models({ cwd })` if not confirmed this run.
2. Commit-batch threshold **AskQuestion** (or `FW_COMMIT_BATCH_THRESHOLD=8`).
3. `flywheel_approve_beads({ action: "start" })`.
4. Dispatch impl **Tasks**; run `flywheel_impl_tick` on the supervision interval.

## One gate per message

Unless the user asks for the full chain, run **one** `flywheel_bead_approval_gate` call + **AskQuestion** per turn.

## Reference

Full playbook: `skills/start/_beads.cursor.md`. MCP tool: `flywheel_bead_approval_gate`.
