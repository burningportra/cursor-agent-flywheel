/**
 * Cursor IDE adaptations for agent-flywheel (Task subagents, model tiers, program label).
 */
export const CURSOR_AGENT_MAIL_PROGRAM = "cursor";
/** Shown in swarm / deep-plan prompts when upstream references NTM. */
export const CURSOR_SWARM_SUBSTITUTE = `
## Cursor swarm (substitute for NTM)

Do not use NTM or raw background shells for fan-out unless the user explicitly runs NTM.
Use Cursor **Task** subagents with \`run_in_background: true\`, explicit **git worktree** paths per bead,
and Agent Mail (\`macro_start_session\` with program: "${CURSOR_AGENT_MAIL_PROGRAM}").
Follow plugins/cursor-orchestrator/commands/flywheel-swarm.md or orchestrate-swarm.md.
`;
/** Replace Claude AskUserQuestion: present numbered options and wait for the user reply. */
export const CURSOR_USER_GATES = `
## Cursor user gates

Present decisions as numbered options (2–4 choices). Wait for the user's reply.
Do not use Claude-only AskUserQuestion. Do not proceed on implicit assumptions.
`;
/** Tier mapping for deep plan / reviewers (Cursor Settings → Models). */
export const CURSOR_MODEL_TIER_HINT = `
| Tier | Use for |
|------|---------|
| A (strongest) | Correctness planner, synthesis, security-heavy review |
| B (balanced) | Default implementation, ergonomics planner, most reviewers |
| C (fast) | Third planner angle, lightweight swarm workers |
Use only models available in Cursor — no external Codex/Gemini CLI for orchestration.
`;
/** Gate flywheel_emit_codex unless explicitly enabled. */
export function cursorEmitCodexEnabled() {
    return process.env.FW_EMIT_CODEX === "1";
}
//# sourceMappingURL=cursor-adapters.js.map