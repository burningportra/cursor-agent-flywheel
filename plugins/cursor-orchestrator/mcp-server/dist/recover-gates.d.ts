/**
 * Recovery context resolver — checkpoint trust, bead scan, and manual fallback.
 * Read-only: never mutates flywheel state.
 */
import type { CheckpointEnvelope, FlywheelState, RecoverGateContext, RecoverGateMode, ToolContext } from "./types.js";
export declare const RECOVER_CHECKPOINT_STALE_MS: number;
export declare const RECOVER_BEAD_SCAN_TIMEOUT_MS = 1500;
export declare const RECOVER_CANDIDATE_CAP = 25;
export declare const RECOVER_WARNING_CAP = 5;
export declare const RECOVER_GIT_HEAD_TIMEOUT_MS = 1000;
export interface RecoverGateResolveArgs {
    beadIds?: string[];
    mode?: RecoverGateMode;
}
export interface RecoverGateCaps {
    checkpointStaleMs?: number;
    beadScanTimeoutMs?: number;
    candidateCap?: number;
    warningCap?: number;
}
export interface CheckpointTrustOpts {
    currentGitHead?: string;
    nowMs?: number;
    checkpointStaleMs?: number;
    knownBeadIds?: Set<string>;
}
export interface CheckpointTrustClassification {
    trusted: boolean;
    confidence: RecoverGateContext["confidence"];
    ageMs: number;
    branchMismatch: boolean;
    warnings: string[];
    phase?: string;
}
export declare function extractCheckpointCandidateIds(state: FlywheelState): string[];
export declare function classifyCheckpointTrust(envelope: CheckpointEnvelope, opts?: CheckpointTrustOpts): CheckpointTrustClassification;
export declare function scanBeadCandidates(ctx: ToolContext, opts?: {
    timeoutMs?: number;
    cap?: number;
}): Promise<{
    beadIds: string[];
    truncated: boolean;
    warnings: string[];
}>;
export declare function degradeToManual(warnings: string[], caps?: Pick<RecoverGateCaps, "warningCap">): RecoverGateContext;
export declare function resolveRecoveryContext(ctx: ToolContext, args?: RecoverGateResolveArgs, caps?: RecoverGateCaps): Promise<RecoverGateContext>;
//# sourceMappingURL=recover-gates.d.ts.map