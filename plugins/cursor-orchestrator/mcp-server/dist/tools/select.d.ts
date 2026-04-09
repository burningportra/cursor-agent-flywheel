import type { ToolContext, McpToolResult } from '../types.js';
interface SelectArgs {
    cwd: string;
    goal: string;
}
/**
 * orch_select — Set the selected goal and transition to planning phase.
 *
 * The calling Claude agent presents ideas to the user (via conversation),
 * then calls this tool with the user's chosen goal string.
 * Returns workflow choice instructions — the agent should ask the user
 * which workflow to use (plan-first, deep-plan, or direct-to-beads).
 */
export declare function runSelect(ctx: ToolContext, args: SelectArgs): Promise<McpToolResult>;
export {};
//# sourceMappingURL=select.d.ts.map