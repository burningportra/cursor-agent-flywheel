import type { ToolContext, McpToolResult } from '../types.js';
interface PlanArgs {
    cwd: string;
    mode?: 'standard' | 'deep';
    planContent?: string;
    planFile?: string;
}
/**
 * orch_plan — Generate a plan document for the selected goal.
 *
 * mode="standard": Returns a prompt for the agent to generate a single plan
 * mode="deep": Returns spawn configs for 3 parallel planning agents (correctness, robustness, ergonomics)
 *              If planContent is provided, uses it directly to create beads.
 */
export declare function runPlan(ctx: ToolContext, args: PlanArgs): Promise<McpToolResult>;
export {};
//# sourceMappingURL=plan.d.ts.map