import type { McpToolResult, ToolContext, WaveReviewGateArgs, WrapUpGateArgs } from "../types.js";
import { toCompactGatePayload } from "../cursor-user-gates.js";
import type { BeadApprovalGateArgs } from "../types.js";
export type WaveReviewGateOutcome = ReturnType<typeof toCompactGatePayload> & {
    confirmed?: boolean;
};
export type WrapUpGateOutcome = ReturnType<typeof toCompactGatePayload> & {
    wrapUpConfirmed?: boolean;
};
export declare function runWaveReviewGate(ctx: ToolContext, args: WaveReviewGateArgs): Promise<McpToolResult>;
export declare function runBeadApprovalGate(ctx: ToolContext, args: BeadApprovalGateArgs): Promise<McpToolResult>;
export declare function runWrapUpGate(ctx: ToolContext, args: WrapUpGateArgs): Promise<McpToolResult>;
//# sourceMappingURL=user-gate.d.ts.map