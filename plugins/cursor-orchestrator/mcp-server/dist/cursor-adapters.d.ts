/**
 * Cursor IDE adaptations for agent-flywheel (Task subagents, model tiers, program label).
 */
export declare const CURSOR_AGENT_MAIL_PROGRAM = "cursor";
/** Shown in swarm / deep-plan prompts when upstream references NTM. */
export declare const CURSOR_SWARM_SUBSTITUTE = "\n## Cursor swarm (substitute for NTM)\n\nDo not use NTM or raw background shells for fan-out unless the user explicitly runs NTM.\nUse Cursor **Task** subagents with `run_in_background: true`, explicit **git worktree** paths per bead,\nand Agent Mail (`macro_start_session` with program: \"cursor\").\nFollow plugins/cursor-orchestrator/commands/flywheel-swarm.md or orchestrate-swarm.md.\n";
/** Replace Claude AskUserQuestion: present numbered options and wait for the user reply. */
export declare const CURSOR_USER_GATES = "\n## Cursor user gates\n\nPresent decisions as numbered options (2\u20134 choices). Wait for the user's reply.\nDo not use Claude-only AskUserQuestion. Do not proceed on implicit assumptions.\n";
/** Tier mapping for deep plan / reviewers (Cursor Settings → Models). */
export declare const CURSOR_MODEL_TIER_HINT = "\n| Tier | Use for |\n|------|---------|\n| A (strongest) | Correctness planner, synthesis, security-heavy review |\n| B (balanced) | Default implementation, ergonomics planner, most reviewers |\n| C (fast) | Third planner angle, lightweight swarm workers |\nUse only models available in Cursor \u2014 no external Codex/Gemini CLI for orchestration.\n";
/** Gate flywheel_emit_codex unless explicitly enabled. */
export declare function cursorEmitCodexEnabled(): boolean;
//# sourceMappingURL=cursor-adapters.d.ts.map