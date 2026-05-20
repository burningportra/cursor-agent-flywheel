---
name: start
description: "Start or resume the full agentic coding flywheel. Drives the complete workflow: scan → discover → plan → implement → review."
argument-hint: "[goal-or-options]"
---

**Context budget (strict):** observe (small) → `flywheel_start_menu` or ceremony (~9k) → discover only when routed.

## Step 1 — observe (always first)

`flywheel_observe({ cwd })` with `cwd` = workspace root. Read **`structuredContent` only** — do not paste the report into chat.

## Step 2 — ceremony (menu)

`flywheel_start_menu({ cwd, …from observe })` then **AskQuestion**; optionally `flywheel_get_skill({ name: "agent-flywheel:start_ceremony" })` for routing tables. Pass **`$ARGUMENTS`** into Step 0 preflight.

## Step 3 — discover (on demand)

Only after Step 0 routes to scan/discover/goal (not "pick up plan → jump to 5.5"):

`flywheel_get_skill({ name: "agent-flywheel:start_discover" })`

## Cursor

- Menus: **`AskQuestion`** + gate MCP `askQuestion`.
- Phase 5+: one `start_<phase>` skill per boundary.
- MCP missing: `/flywheel-doctor` then `/flywheel-setup`.

## Degraded path

If skills fail: `Read plugins/cursor-orchestrator/skills/start/_ceremony.md` (not the full legacy bootstrap monolith).
