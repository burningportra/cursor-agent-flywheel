---
name: orchestrate-swarm-status
description: Check the status of running swarm agents and bead progress.
argument-hint: "[--json]"
---

**First action:** Parse `$ARGUMENTS` for `--json`. Run `br list --json` and `fetch_inbox` either way. If `--json`, assemble a single JSON envelope `{tool:"flywheel_swarm_status", version, status, phase, data:{beads, inbox, stuck, recommendation}}`, print it to stdout, and exit. Otherwise render the human-friendly sections below.

Check swarm status.

## --json output schema

When invoked with `--json`, this command emits to stdout a single JSON envelope
combining the live bead table, agent-mail inbox, stuck-bead detection, and the
recommended next action. Pin the contract shape via `flywheel_capabilities`
(`data.contract_version`).

Top-level: `{tool:"flywheel_swarm_status", version, status, phase, data}`
Status:    `"ok" | "error"` (errors carry `data.kind:"error"` + `data.error.{code,message,hint,try_this,retryable}`)
`data` keys: `beads[]`, `inbox[]`, `stuck[]`, `recommendation`.


1. Run `br list --json` via Bash. Display a status table:
   ```
   ID | Title | Status | Updated
   ```
   Highlight any beads `in_progress`.

2. Call `fetch_inbox` via `agent-mail` MCP tool. Display messages from running agents (sender, subject, time).

3. Flag beads that appear stuck: `updated_at` older than 30 minutes and still `in_progress`.

4. Show todo list status via TodoRead.

5. Recommend next action:
   - **Stuck agents detected** → suggest `/agent-flywheel:flywheel-swarm-stop` and restarting.
   - **All swarm beads have finished** → run **`/flywheel-recover-gates`** (or call `flywheel_wave_review_gate` + `flywheel_wrap_up_gate` directly). Present numbered options, wait for the user — **do not** ask "commit?" in prose. See `commands/flywheel-swarm.md` steps 7–8 and `commands/flywheel-recover-gates.md`.
   - **Mid-flight, no stalls** → report progress and stay idle (or `ScheduleWakeup` per `_implement.md` cadence).
