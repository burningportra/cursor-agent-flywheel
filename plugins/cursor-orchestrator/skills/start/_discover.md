---
name: start_discover
description: "Flywheel Steps 2–4 and 5.45: profile, discover, select goal, picked-up plan gate."
---

> **CURSOR PORT:** **`AskQuestion`** + gate MCP `askQuestion`. No `AskUserQuestion` JSON blocks.

## Step 5.45: Picked-up-plan stage menu

Gate: `state.planSource === "picked-up-existing-plan"` only (after `flywheel_plan({ planFile, source: "picked-up-existing-plan" })`).

Call `flywheel_convergence({ planSlug })` when available; append score to question text only — never auto-select.

| AskQuestion id | label | route |
|----------------|-------|-------|
| validate | Validate against code (Recommended) | Section vs git coverage → gaps plan → 5.5 |
| approve | Approve and bead-ify | Step 5.5 directly |
| refine | Refine plan first | `/superpowers:writing-plans` → re-plan → re-fire 5.45 |
| scrap | Scrap and restart | Retire plan block → Step 0d |

**Validate path:** parse `##` sections → path claims → `git log` coverage table → **AskQuestion** (Bead-ify gaps / everything / Retire / Inspect).

**One-time gate:** after any choice, clear `planSource` except Refine re-register.

## Step 2: Profile

`flywheel_profile({ cwd })` — cache hit skips Explore; `force: true` to re-scan. If `MCP_DEGRADED`, Explore fallback.

**AskQuestion** after brief findings:

| id | label |
|----|-------|
| discover | Discover ideas (Recommended) |
| set-goal | Set a goal |
| rescan | Re-scan (force: true) |

## Step 3: Discover

CASS search for past goals (advisory). **AskQuestion** depth:

| id | label | path |
|----|-------|------|
| fast | Fast (default) | `flywheel_discover` |
| deep | Deep (idea-wizard) | `/idea-wizard` → goal menu |
| duel | Duel (Cursor-native) | `flywheel_duel` + Task wizards; NTM only if `FW_DUEL_BACKEND=ntm` |

Triangulated (Codex/Gemini/Grok): optional disk skill `/multi-model-triangulation` — not bundled.

`flywheel_discover` or Explore fallback → top ideas → **AskQuestion** goal pick (≤4 ideas + custom in Other).

Custom goal in Other → `/brainstorming` → **AskQuestion** scope (Full flywheel / Plan only / Quick fix).

## Step 4: Select goal

`flywheel_select({ cwd, goal })`.

**Stay-in-turn:** after brainstorming, same turn: select → load `_planning.cursor.md` (or `_planning.md` if NTM) → Step 5 gates — do not end turn on "Ready to plan?" prose.
