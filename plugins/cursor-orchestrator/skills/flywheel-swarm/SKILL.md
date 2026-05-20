---
name: flywheel-swarm
description: Launch parallel Cursor Task agents to implement multiple beads with Agent Mail.
---

Launch a parallel implement swarm. $ARGUMENTS

> **Cursor-first (default).** Fan out with Cursor **Task** subagents (`run_in_background: true`), explicit **git worktree** paths per bead, and Agent Mail (`program: "cursor"`). Each Task **must** set `model` from the confirmed implement table (see step 3).
>
> **NTM optional.** Only when the user explicitly wants tmux panes, set `FW_IMPL_BACKEND=ntm` or follow `skills/legacy/ntm/swarm-ntm.md` from disk. Do not silently fall back to NTM.

0. **Bootstrap:** `macro_start_session(human_key: <absolute cwd>, program: "cursor", model: <coordinator model>, task_description: "Swarm coordinator")`.

1. Call `flywheel_approve_beads` with `action: "start"` (or use ready beads from the current wave). If no beads are ready, say "No beads are ready — run planning/start first."

2. Ask the user: "How many agents in parallel? (Recommended: 2–4)"

3. **Recommend models, user chooses (MANDATORY once per flywheel run):**
   - Call `flywheel_confirm_impl_models({ cwd })`.
   - If `confirmed: false`, **explain `implModelsGate.rationale`** to the user, show the **recommended** table (`implModelsGate.recommended`), then present **AskQuestion** with `implModelsGate.askQuestion` (or numbered options). **Wait for their reply.**
   - Map reply → second call:
     - Option **1** (accept recommendation) → `confirmImplModels: "recommended"`
     - Option **2** → `confirmImplModels: { uniform: "<slug>" }`
     - Option **3** → `confirmImplModels: { simple, medium, complex }`
     - Option **4** (config only) → `confirmImplModels: "defaults"`
   - Use `spawnInstructions` from the confirm result when spawning Tasks.

4. **Per ready bead (up to the user's limit), spawn in parallel (~30s stagger):**
   ```
   Task({
     model: "<from table for bead complexity>",
     subagent_type: "generalPurpose",
     run_in_background: true,
     description: "Impl <bead-id>",
     prompt: "<marching orders — see template below>"
   })
   ```
   Complexity → model mapping is in `implModels` / `flywheel.config.yaml` `implement:` (`simple`, `medium`, `complex`).

5. **Marching orders template** (embed in each Task `prompt`):

   ```markdown
   ## Agent Mail Bootstrap
   macro_start_session(human_key: '<cwd>', program: 'cursor', model: '<task model>',
     task_description: 'Implementing bead <id>: <title>')
   file_reservation_paths before edits; release when done.

   ## Bead: <id> — <title>
   <description + acceptance criteria>

   ## Pre-completion gate
   1. /ubs-workflow on changed files (or justify skip)
   2. Repo verify per AGENTS.md
   3. Self-review diff
   4. Write `.pi-flywheel/completion/<bead-id>.json` (CompletionReport v1)

   ## On completion
   send_message to coordinator with UBS + verify + self-review summary; close bead per AGENTS.md.
   ```

6. **Monitor:** Poll `fetch_inbox` for completion messages. Nudge stuck agents via `send_message`. For wave 2+, use `flywheel_advance_wave` (it reuses confirmed models or shows the same gate if not yet confirmed).

7. **Wave-completion review (MANDATORY — before commit or wrap-up):**
   - Collect bead IDs from this wave.
   - Call `flywheel_wave_review_gate({ cwd, beadIds: [...] })`.
   - Present **AskQuestion** with `userGate.askQuestion` from the tool outcome. **Wait for the user.**
   - Execute the matching `coordinatorAction` (e.g. option 1 → `flywheel_review` `looks-good` per bead).
   - **Never** ask "want to commit?" in free text — the MCP gate is the only menu.

8. **When the bead queue is empty after review:**
   - Call `flywheel_wrap_up_gate({ cwd })` — present **AskQuestion** with `askQuestion` from the tool.
   - After the user picks, call again with `confirmWrapUp: "full" | "commit_only" | "skip"`.
   - Follow `skills/start/_wrapup.md` for the chosen branch.

9. Report launch status when spawning; report wave review + wrap-up gates when finishing — do not end the turn after launch only.
