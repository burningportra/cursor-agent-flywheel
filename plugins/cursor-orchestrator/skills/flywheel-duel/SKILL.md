---
name: flywheel-duel
description: Run Cursor-native dueling idea wizards inside the flywheel (or legacy NTM). Routes artifacts into discovery, plan, or review. Use for /flywheel-duel and start.md Duel menu.
---

# /flywheel-duel — state-aware adversarial duel

> **Cursor-native (default).** Use `flywheel_duel` MCP tool — 2–3 Cursor **Task** wizards with **different** models from `flywheel.config.yaml` → `duel:`, cross-score, synthesize. No NTM or external Codex/Gemini CLIs unless `FW_DUEL_BACKEND=ntm`.

This skill routes artifacts after the duel and picks `--mode` from checkpoint phase.

## Step 1: Model gate (MANDATORY first duel per run)

```text
flywheel_duel({ cwd, mode: "<auto or user>", focus: "<optional>" })
```

- If `duelModelsGate` is returned: explain `rationale`, show the model table, present **numbered** `options`, **wait** for the user.
- Re-call with `confirmDuelModels: "recommended"` (option 1), `{ wizard_a, wizard_b }` (option 2 — two wizards only), custom slugs (option 3), or `"defaults"` (option 4).

Do **not** use Claude `AskUserQuestion` in Cursor.

## Step 2: Detect phase and pick defaults

Read `.pi-flywheel/checkpoint.json` (best-effort):

| `state.phase` | Default `mode` | Output destination | Post-duel chaining |
|---------------|----------------|--------------------|--------------------|
| `idle` / no state | `ideas` | `docs/discovery/duel-<date>.md` | Summary only |
| `discovering` / `awaiting_selection` | `ideas` | `docs/discovery/duel-<date>.md` | `flywheel_discover` + provenance |
| `planning` | `architecture` | `docs/plans/<date>-<slug>-duel.md` | `flywheel_plan({ mode: "duel", planFile })` |
| `awaiting_plan_approval` | `architecture` | `docs/plans/...-duel-refine.md` | Replace plan → Step 5.55 |
| `reviewing` / `iterating` | `reliability` or `security` | `docs/reviews/<beadId>-duel-report.md` | Per `_review.md` §8 duel row |
| Other | `architecture` | `docs/duels/<phase>-<date>.md` | Summary only |

User-supplied `mode` / `focus` / `output` in `$ARGUMENTS` or tool args override auto-detect.

For **planning**, you may use `flywheel_plan({ mode: "duel" })` instead — it shares the same Cursor duel payload once models are confirmed.

## Step 3: Spawn Cursor wizards

After `confirmDuelModels`, `flywheel_duel` returns `data.cursorDuel`:

1. Parallel **study** Tasks — each `Task({ model: "<wizard model>", run_in_background: true, ... })` using `wizards[].studyTask`.
2. Parallel **ideate** Tasks — `wizards[].ideateTask` after study files exist.
3. Coordinator runs **cross-score + reveal** per `coordinatorPlaybook` (relay scores between wizards via follow-up Tasks or agent-mail).
4. **Synthesis** Task — `synthesisAgent` → final report at `outputPath`.

Each wizard: `macro_start_session(human_key: cwd, program: "cursor", model: <slug>, ...)`.

## Step 4: Wait for completion

Block until `outputPath` exists and is non-empty (~30s poll). On stall, offer numbered: Salvage / Retry / Abort (do not use AskUserQuestion in Cursor — plain numbered menu).

## Step 5: Route artifacts (unchanged semantics)

### Discovering / awaiting_selection

Parse consensus + contested → `flywheel_discover({ ideas: [...] })` with `provenance.source: "duel"`. Goal menu: **Consensus winners** / **Contested** / dead-ideas footnote.

### Planning / awaiting_plan_approval

`flywheel_plan({ cwd, mode: "duel", planFile: "<outputPath>" })` → Step 5.55.

### Reviewing

Per `_review.md` duel review row (Cursor Tasks, not NTM).

## Legacy appendix: NTM + external CLIs

Only when `FW_DUEL_BACKEND=ntm` or user explicitly requires tmux panes:

1. Pre-flight: `ntm deps -v` + ≥2 of `{claude, codex, gemini}` on PATH.
2. Invoke `/dueling-idea-wizards` with phase-appropriate `--mode` and `--output`.
3. Follow the global `dueling-idea-wizards` skill for pane orchestration.

On NTM failure, fall back to `flywheel_duel` (Cursor-native) or `mode=deep` with a one-line warning.

## Step 6: Summary to the user

```
Duel complete — <mode>, <N> Cursor wizards, report at <outputPath>
Next: <flywheel_discover | flywheel_plan planFile | review routing>
```
