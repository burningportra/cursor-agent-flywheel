import type { ToolContext, McpToolResult } from '../types.js';
interface ReviewArgs {
    cwd: string;
    beadId: string;
    action: 'hit-me' | 'looks-good' | 'skip';
}
/**
 * orch_review — Submit implementation work for review.
 *
 * action="hit-me"    — Return parallel review agent task specs for CC to spawn
 * action="looks-good"— Mark bead done, advance to next or enter gates
 * action="skip"      — Skip this bead (mark deferred), move to next
 */
export declare function runReview(ctx: ToolContext, args: ReviewArgs): Promise<McpToolResult>;
export {};
//# sourceMappingURL=review.d.ts.map