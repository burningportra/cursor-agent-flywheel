---
name: orchestrate
description: "Start or resume the full agentic coding flywheel. Drives the complete workflow: scan → discover → plan → implement → review."
---

# Orchestrate: Full Flywheel

Run the orchestrator for this project. $ARGUMENTS (optional: initial goal or `--mode single-branch`)

## Cursor model policy (read first)

All LLM work uses **only models available in Cursor** (Chat / Agent model picker — **Settings → Models**). Do **not** invoke external model CLIs (`codex`, raw API scripts, etc.).

| Tier | Role (examples) |
|------|-----------------|
| **A — Strongest** | Correctness planner, plan synthesizer, heavy review |
| **B — Balanced** | Ergonomics planner, default implementation, most reviewers |
| **C — Fast** | Robustness planner angle, lightweight swarm workers |

For each **parallel** subagent (`Task` tool with `run_in_background: true` where supported), set the **Cursor model** to the tier for that role **before** or **when** spawning that subagent (per Cursor UI). Parallelism is preserved as **separate Task invocations**, not one call pretending to be multiple models.

## Step 1: Check for existing session

Read `.pi-orchestrator/checkpoint.json` if it exists. If a non-idle/non-complete session is found, ask the user:

> "I found a previous session (phase: `<phase>`, goal: `<goal>`). What would you like to do?
> 1. Resume from where we left off
> 2. Start fresh (discards previous state)"

If the user chooses to start fresh, delete the checkpoint file.

## Step 2: Scan and profile the repository

Use the **Task** tool with `subagent_type` **`explore`** (or the closest Explore preset available) to analyze the repo structure, languages, frameworks, key files, and recent commits. Then call the `orch_profile` MCP tool (from the `orchestrator` MCP server) with `cwd` set to the current working directory.

## Step 3: Discover improvement ideas

Call `orch_discover` with `cwd`. This returns a list of candidate improvement ideas ranked by potential impact.

Present the top ideas to the user clearly. Ask:

> "Which of these goals would you like to pursue? You can pick one from the list or describe your own goal."

## Step 4: Select goal

Once the user chooses, call `orch_select` with `cwd` and `goal` set to their choice.

## Step 5: Choose planning mode

Ask the user:

> "How would you like to plan?
> 1. **Standard plan** — single planning pass (faster)
> 2. **Deep plan** — 3 competing perspectives (Cursor models **Tier A / B / C**), then synthesize (higher quality, takes longer)"

**Standard plan**: Call `orch_plan` with `cwd` and `mode: "standard"`.

**Deep plan**:

1. **Bootstrap Agent Mail** — call `macro_start_session` with:
   - `human_key`: current working directory
   - `program`: `"cursor"`
   - `model`: the Cursor model id you are using for this coordinator session
   - `task_description`: "Orchestrating deep plan for: <goal>"
   Note your assigned agent name (e.g. "CoralReef") — you are the coordinator.

2. **Create a team** — call `TeamCreate` with a descriptive `team_name` (e.g. `"deep-plan-<slug>"`).

3. **Spawn 3 planner subagents IN PARALLEL** using the **Task** tool with `team_name` set and `run_in_background: true` so you get task IDs (for `TaskStop` if they become unresponsive). Assign **Cursor models** per tier **before each spawn**:
   - **correctness-planner** — **Tier A (strongest)** model in Cursor for this Task
   - **ergonomics-planner** — **Tier B (balanced)** model
   - **robustness-planner** — **Tier C (fast)** or alternate **Tier B** model for a third independent angle (still **only** Cursor models — no Codex CLI)

   Example shape (adapt to Cursor’s actual Task API labels):

   - `Task(subagent_type: "general-purpose" or "explore", name: "correctness-planner", team_name: "<team>", run_in_background: true, prompt: "...")`
   - Same for `ergonomics-planner` and `robustness-planner` with distinct prompts.

   **Save the task ID returned by each Task call** — use `TaskStop(task_id: "<id>")` for stuck workers.

   Each subagent's prompt MUST include:
   - Instructions to call `macro_start_session` first (same `human_key`, `program: "cursor"`, their task)
   - Their focused planning perspective (correctness / ergonomics / robustness)
   - Full repo context (path, stack, goal, recent commits, known bugs)
   - Instruction to **write their plan to disk**: `docs/plans/<date>-<perspective>.md` (use the **Write** tool — do NOT send large plan text through Agent Mail message body)
   - Instruction to send YOU just the file path via `send_message` with subject `"[deep-plan] <perspective> plan"` once written
   - Instruction to message their team lead when done

4. **Monitor and nudge** — subagents go idle between turns (normal). If one has gone idle without delivering their plan:
   - `SendMessage(to: "<agent-name>", message: "Your plan is needed — please send it to <your-name> via Agent Mail and report back.")`
   - `fetch_inbox` for arrivals
   - `TaskList` for task status
   - If unresponsive after nudging: `TaskStop(task_id: "<saved-task-id>")`, then `retire_agent` in Agent Mail
   - **If `TaskStop` fails**: `retire_agent`, then if Agent Mail left stale team metadata on disk (path varies by install—see Agent Mail docs), remove stale `"members"` entries and retry `TeamDelete`.

5. **Collect plans** — `fetch_inbox(project_key: cwd, agent_name: "<your-name>", include_bodies: true)`.

6. **Shutdown teammates individually** — send structured shutdown per agent name (not `"*"`).

7. **Synthesize** — spawn **one** synthesis **Task** with **Tier A** Cursor model, `run_in_background: true`, prompt to read the three plan files from disk and write `docs/plans/<date>-<goal-slug>-synthesized.md`, then notify via Agent Mail. Shutdown with `shutdown_request` when done.

8. Call `orch_plan` with `cwd`, `mode: "deep"`, and `planFile: "docs/plans/<date>-<goal-slug>-synthesized.md"`.
   **Never pass `planContent`** — large text over MCP stdio stalls the server.

## Step 5.5: Create beads from the plan

Beads are **NOT** auto-created by `orch_plan`. The coordinator must create them manually from the plan output:

1. For each task/unit-of-work in the plan, create a bead:
   ```
   br create --title "Verb phrase" --description "WHAT/WHY/HOW" --priority 2 --type task
   ```

2. After all beads are created, add dependency edges:
   ```
   br dep add <downstream-bead-id> <upstream-bead-id>
   ```
   > **Syntax note:** Arguments are positional — `<downstream>` depends on `<upstream>`. The `--depends-on` flag does NOT exist.

3. Verify with `br list`.

> **WARNING:** Use `br list` for read-only bead inspection. Never call `orch_approve_beads` just to preview beads.

## Step 6: Review and approve beads

Use `br list` to display the current beads. Ask:

> "Here are the implementation beads. What would you like to do?
> 1. **Start implementing** — launch the implementation loop
> 2. **Polish further** — refine the beads more
> 3. **Reject** — start over with a different goal"

- "Start" → call `orch_approve_beads` with `action: "start"`
- "Polish" → call `orch_approve_beads` with `action: "polish"`, then `br list`, loop
- "Reject" → call `orch_approve_beads` with `action: "reject"`, return to Step 3

If the user asks for the quality score before choosing to start, call `orch_approve_beads` with `action: "start"` to surface it.

After `action: "start"`, display convergence/quality score and summary table (threshold 0.75). Wait for confirmation before Step 7.

## Step 7: Implement each bead

Use **Task** (and Agent Mail `TaskCreate` if that is how your Agent Mail integration names tasks) per bead. Worktree isolation in Cursor is **explicit git worktrees**, not a built-in `isolation: "worktree"` flag:

1. For each ready bead, create a dedicated worktree from the repo root (example):
   ```bash
   git worktree add ../wt-<bead-id> -b bead-<bead-id>
   ```
   Pass the worktree path to the implementer as **the only cwd** for edits.

2. **Team**: `TeamCreate(team_name: "impl-<goal-slug>")` when parallelizing. Delete or reuse prior teams per Step 5 notes.

3. Spawn an implementation **Task** with `subagent_type` **general-purpose** (or equivalent), `team_name` set, **`run_in_background: true`** for parallel beads. **Agent Mail bootstrap** (STEP 0 below) is required when multiple beads run in parallel; for strictly sequential beads you may omit STEP 0 to reduce overhead.

   ```
   Task(
     subagent_type: "general-purpose",
     name: "impl-<bead-id>",
     team_name: "impl-<goal-slug>",
     run_in_background: true,
     prompt: "
       You work ONLY under the git worktree at: <worktree-path> (cd there first).

       ## STEP 0 — AGENT MAIL (parallel beads only)
       0a. macro_start_session(
             human_key: '<cwd>',
             program: 'cursor',
             model: '<your Cursor model id for Tier B>',
             task_description: 'Implementing bead <id>: <title>')
       0b. file_reservation_paths for every file you plan to edit under <worktree-path>
       0c. send_message '[impl] <bead-id> started' to coordinator

       ## STEP 1 — IMPLEMENT
       <bead title> / <description> / acceptance criteria

       ## STEP 2 — VALIDATE
       Run tests and lint from <worktree-path>.

       ## STEP 3 — COMMIT & CLOSE
       Commit in the worktree; `br update <bead-id> --status closed`

       ## STEP 4 — RELEASE + REPORT
       release_file_reservations; send_message completion summary.
     "
   )
   ```

4. Nudge idle workers via `SendMessage`; on completion send `shutdown_request`.

5. Remove worktrees when done: `git worktree remove ../wt-<bead-id>` (after merge or as documented).

## Step 8: Review completed beads

Offer **Looks good**, **Self review**, or **Fresh-eyes** (5 parallel reviewers).

- **Looks good** → `orch_review` with `action: "looks-good"` and `beadId`.
- **Self review** → `SendMessage` to impl agent; then `orch_review` when done.
- **Fresh-eyes** → `orch_review` with `action: "hit-me"` and `beadId`; spawn **5** **Task** subagents in parallel (`run_in_background: true`), each with a **Cursor model tier** from the README role→tier table and **`agents/parallel-reviewers.md`** (e.g. correctness & security **Tier A**, others **B** or **C** as appropriate—**only** Cursor models), Agent Mail STEP 0 in prompt, distinct personas per `orch_review` specs. Nudge, collect, shutdown individually.

Edge cases (already-closed bead, team name collision) match upstream: manual review from git SHA if `orch_review` errors; reuse `team_name` if `TeamCreate` conflicts.

## Step 9: Loop until complete

Continue until all beads are done. Summarize outcomes.

## Step 10: Store session learnings

Call `orch_memory` with `operation: "store"` and `cwd`.

## Step 11: Refine this command

Run the plugin command **`orchestrate-refine-skill`** with argument `orchestrate` (slash palette: `/cursor-orchestrator:orchestrate-refine-skill`) to improve skills from session evidence.
