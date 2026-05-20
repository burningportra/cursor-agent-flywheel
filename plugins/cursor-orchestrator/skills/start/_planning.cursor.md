---
name: start_planning
description: "Cursor Steps 4.5–5.6: deep plan Task trinity, duel gate, standard plan."
---

> **Cursor default.** NTM/Claude deep plan: `FW_DEEP_PLAN_BACKEND=claude` + `skills/legacy/ntm/planning-ntm.md`.

## Step 4.5 — Brainstorm pressure-test

Skip when discover confidence ≥ 0.8 or detailed `USER_INPUT` (>100 chars). Else three **AskQuestion** rounds (smallest / 10x / adjacents) → write `docs/brainstorms/<slug>-<date>.md`.

## Step 4.55 — Visual prototype server (optional)

When the next planning questions are **visual** (mockups, layouts, diagrams — not scope/tradeoff text):

1. Offer the browser companion in **its own message** (consent; token note). Wait for yes/no.
2. `flywheel_get_skill({ name: "agent-flywheel:visual_prototype" })` — follow `visual-companion.md`.
3. Start: `plugins/cursor-orchestrator/skills/visual-prototype/scripts/start-server.sh --project-dir <cwd>` (Cursor: prefer `--foreground` + background shell; read `state/server-info` next turn).
4. **Write** HTML to `screen_dir`; read `state/events` after user replies; stop server when entering Step 5 plan mode or beads.

Do **not** use during implement/review — **AskQuestion** gates only there.

## Step 5 — Plan mode

**AskQuestion** plan shape: Standard / Deep / Duel / Skip to beads.

| Mode | Cursor path |
|------|-------------|
| Standard | `flywheel_plan({ mode: "standard" })` |
| Deep | `flywheel_plan({ mode: "deep" })` — spawn 3 **Task** planners + synthesis per [`cursor-deep-plan.ts`](../../mcp-server/src/cursor-deep-plan.ts) |
| Duel | `flywheel_duel` — **AskQuestion** `duelModelsGate` → Task wizards → synthesis |

After plan: Step 5.55 alignment (gate MCP) → Step 5.6 if needed → `start_discover` Step 5.45 when `picked-up-existing-plan`.

## Step 5.5+

Load `_beads.cursor.md` (or `_beads.md`): `br create`, `flywheel_bead_approval_gate` (coverage → dedup → review → launch) → `_implement.cursor.md`.
