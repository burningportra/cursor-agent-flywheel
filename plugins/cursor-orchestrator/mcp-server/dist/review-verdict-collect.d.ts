/**
 * Shared verdict parse + branch logic for batch_review and hit-me collect phases.
 */
import type { McpToolResult, ToolContext } from './types.js';
export type ReviewVerdictKind = 'batch_review_verdict' | 'hit_me_review_verdict';
export interface CollectReviewVerdictOpts {
    verdictPath: string;
    provenanceKey: string;
    expectedShaRange: string;
    kind: ReviewVerdictKind;
    /** CASS / log tag */
    memoryTag: string;
    passMessage: string;
    needsAttentionMessage: string;
    blockingMessagePrefix: string;
    /** When true, clear pending batch review state after successful parse. */
    clearBatchPending?: boolean;
    /** When set, skip reading verdictPath from disk (caller already read it). */
    rawVerdict?: string;
    labels?: string[];
}
export declare function collectReviewVerdict(ctx: ToolContext, opts: CollectReviewVerdictOpts): Promise<McpToolResult>;
//# sourceMappingURL=review-verdict-collect.d.ts.map