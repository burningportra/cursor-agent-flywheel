/**
 * Shared batch-review dispatch payload for Cursor impl ticks and flywheel_review.
 */
import type { ToolContext } from './types.js';
export interface BatchReviewDispatchPayload {
    shaRange: string;
    reviewSha: string;
    verdictPath: string;
    verdictRel: string;
    changedFiles: string[];
    prompt: string;
}
export declare function batchReviewVerdictRel(shaRange: string): string;
export declare function batchReviewVerdictPath(cwd: string, shaRange: string): string;
export declare function resolveHeadSha(cwd: string, exec: ToolContext['exec']): Promise<string>;
export declare function buildShaRange(fromSha: string | undefined, toSha: string): string;
export declare function prepareBatchReviewDispatch(ctx: ToolContext, shaRange: string, reviewSha: string): Promise<BatchReviewDispatchPayload>;
//# sourceMappingURL=batch-review-dispatch.d.ts.map