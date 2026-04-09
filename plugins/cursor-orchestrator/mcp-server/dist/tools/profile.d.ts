import type { ToolContext, McpToolResult } from '../types.js';
interface ProfileArgs {
    cwd: string;
    goal?: string;
}
/**
 * orch_profile — Scan the current repo and build a profile.
 *
 * Runs git log, finds key files, detects language/framework/CI/test tooling.
 * Detects the br CLI (beads) for coordination backend.
 * Returns a structured profile and discovery instructions.
 */
export declare function runProfile(ctx: ToolContext, args: ProfileArgs): Promise<McpToolResult>;
export {};
//# sourceMappingURL=profile.d.ts.map