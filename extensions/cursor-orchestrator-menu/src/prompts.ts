/** Agent chat prompts — paste into Cursor Agent (or Plan mode where noted). */

export function buildOrchestratePrompt(cwd: string, opts: { goal?: string; planningMode: "standard" | "deep" | "unspecified"; freshSession: boolean }): string {
  const goalLine = opts.goal?.trim()
    ? `My goal: ${opts.goal.trim()}`
    : `Use the orchestrator MCP tools (orch_profile, orch_discover, …) starting from the repo profile. Pick or propose goals.`;

  const planHint =
    opts.planningMode === "deep"
      ? `Planning: I want **deep plan** (three perspectives + synthesis). Follow the /orchestrate command: bootstrap agent-mail if available, parallel planners, synthesize to docs/plans/, then orch_plan with planFile.`
      : opts.planningMode === "standard"
        ? `Planning: **Standard** single-pass plan, then beads.`
        : `Planning: you choose standard vs deep based on complexity.`;

  const sessionHint = opts.freshSession
    ? `Session: **start fresh** (checkpoint cleared or new).`
    : `Session: **resume** from .pi-orchestrator/checkpoint.json if present.`;

  return [
    `Run the full **orchestrate** flywheel for this workspace.`,
    ``,
    `**cwd:** \`${cwd}\``,
    sessionHint,
    goalLine,
    planHint,
    ``,
    `Constraints: use **only** Cursor-selectable models (no external model CLIs). Use \`br\` / \`bv\` / git / agent-mail as documented in plugins/cursor-orchestrator.`,
    ``,
    `Start with \`orch_profile\` if needed, then continue per the plugin orchestrate workflow.`,
  ].join("\n");
}

export function buildSetupPrompt(cwd: string): string {
  return [
    `Run **orchestrate-setup** for this workspace.`,
    ``,
    `**cwd:** \`${cwd}\``,
    ``,
    `Check br, bv, agent-mail, pre-commit guard, orchestrator MCP build, and report the health checklist.`,
  ].join("\n");
}

export function buildStatusPrompt(cwd: string): string {
  return [
    `Run **orchestrate-status** for this workspace.`,
    ``,
    `**cwd:** \`${cwd}\``,
    ``,
    `Summarize phase from checkpoint (if any), beads (br list), and agent-mail inbox if available.`,
  ].join("\n");
}
