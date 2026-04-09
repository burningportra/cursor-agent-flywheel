import type { ToolContext, McpToolResult } from '../types.js';
interface ApproveArgs {
    cwd: string;
    action: 'start' | 'polish' | 'reject' | 'advanced' | 'git-diff-review';
    advancedAction?: 'fresh-agent' | 'same-agent' | 'blunder-hunt' | 'dedup' | 'cross-model' | 'graph-fix';
}
/**
 * orch_approve_beads — Review and approve bead graph before implementation.
 *
 * action="start"    — Approve beads and launch implementation
 * action="polish"   — Request another refinement round
 * action="reject"   — Reject and stop orchestration
 * action="advanced" — Advanced refinement (requires advancedAction param)
 */
export declare function runApprove(ctx: ToolContext, args: ApproveArgs): Promise<McpToolResult>;
export {};
//# sourceMappingURL=approve.d.ts.map