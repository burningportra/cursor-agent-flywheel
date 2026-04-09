import type { ToolContext, McpToolResult, CandidateIdea } from '../types.js';
interface DiscoverArgs {
    cwd: string;
    ideas: CandidateIdea[];
}
/**
 * orch_discover — Accept LLM-generated ideas and store them in state.
 *
 * The calling Claude agent generates 5-15 ideas based on the repo profile
 * from orch_profile, then calls this tool with the structured list.
 * After storing, it instructs the agent to call orch_select.
 */
export declare function runDiscover(ctx: ToolContext, args: DiscoverArgs): Promise<McpToolResult>;
export {};
//# sourceMappingURL=discover.d.ts.map