/**
 * Cursor flywheel user gates — numbered options + MCP confirm payloads.
 * Replaces Claude `AskUserQuestion` for review, wrap-up, and post-impl flows.
 */
import { type ActionKey, type Bead, type CompactGatePayload, type FlywheelState, type WrapUpConfirmAction } from "./types.js";
export { CompactGatePayloadSchema, type CompactGatePayload } from "./types.js";
export interface FlywheelUserGateOption {
    id: string;
    label: string;
    detail?: string;
    /** Source of truth for `data.actions` mapping. */
    action: ActionKey;
    /** Hint for the coordinator after the user picks this option. */
    coordinatorAction?: string;
}
export interface FlywheelUserGate {
    kind: "wave_review" | "wave_review_bead_pick_required" | "wrap_up" | "wrap_up_verdict" | "wrap_up_already_confirmed" | "review_mode" | "bead_review" | "bead_launch" | "bead_low_quality" | "bead_hotspot" | "bead_coverage" | "bead_dedup";
    title: string;
    rationale: string;
    options: FlywheelUserGateOption[];
    instructions: string;
    /** Set when gate includes per-bead metadata. */
    beadIds?: string[];
    riskyBeadIds?: string[];
}
/** Cursor `AskQuestion` payload — clickable options in Agent/Plan chat. */
export interface CursorAskQuestionPayload {
    title?: string;
    questions: Array<{
        id: string;
        prompt: string;
        options: Array<{
            id: string;
            label: string;
            description?: string;
        }>;
        allow_multiple?: boolean;
    }>;
}
/** Short action keys — map in skills/start/_review.md and _wrapup.md. */
export declare function gateActionsFromOptions(gate: FlywheelUserGate): Record<string, ActionKey>;
/** MCP payload without duplicating options/coordinatorAction (saves ~80% JSON vs full userGate). */
export declare function toCompactGatePayload(gate: FlywheelUserGate): CompactGatePayload;
export declare function buildAskQuestionFromGate(gate: FlywheelUserGate): CursorAskQuestionPayload;
export declare function isStructuralBead(bead: Bead): boolean;
export declare function isRiskyBead(bead: Bead, state: FlywheelState): boolean;
/** Step 8 wave-completion gate (after all impl agents in a wave report back). */
export declare function buildWaveReviewGate(beads: Bead[], state: FlywheelState): FlywheelUserGate;
/** Follow-up when multi-bead wave needs a bead id for self-review or fresh-eyes. */
export declare function buildWaveReviewBeadPickGate(beads: Bead[], confirmAction: "fresh-eyes" | "self-review"): FlywheelUserGate;
export declare const WRAP_UP_ALREADY_CONFIRMED_NEXT_SKILL = "agent-flywheel:start_wrapup";
export declare const WRAP_UP_ALREADY_CONFIRMED_FORCE_HINT = "Pass force=true to re-open the wrap-up menu.";
export type WrapUpAlreadyConfirmedPayload = CompactGatePayload & {
    wrapUpConfirmed: true;
    confirmedAction?: WrapUpConfirmAction;
    nextSkill: typeof WRAP_UP_ALREADY_CONFIRMED_NEXT_SKILL;
    forceHint: typeof WRAP_UP_ALREADY_CONFIRMED_FORCE_HINT;
};
/** Idempotent retry — no AskQuestion; coordinator loads start_wrapup if needed. */
export declare function buildWrapUpAlreadyConfirmedPayload(opts?: {
    confirmedAction?: WrapUpConfirmAction;
}): WrapUpAlreadyConfirmedPayload;
/** Step 9.5 wrap-up gate — commit / docs / version bump. */
export declare function buildWrapUpGate(opts: {
    uncommittedCount: number;
    uncommittedPreview: string[];
    beadCommitCount?: number;
}): FlywheelUserGate;
/** Batch review auto-synthesized beads — approve / reject gate. */
export declare function buildBatchReviewSynthesizedGate(beadCount: number): FlywheelUserGate;
/** Step 9.5.0 outcome grading verdict gate. */
export declare function buildWrapUpVerdictGate(verdict: {
    status: string;
    explanation?: string;
}): FlywheelUserGate;
/** Step 6 — first menu after beads exist (review / polish / reject). */
export declare function buildBeadReviewGate(beadCount: number): FlywheelUserGate;
/** Step 6 — launch confirmation when quality ≥ 0.75 and no hotspot override. */
export declare function buildBeadLaunchGate(opts: {
    qualityScore: number;
    beadCount: number;
    convergencePct?: number;
}): FlywheelUserGate;
/** Step 6 — quality below 0.75. */
export declare function buildBeadLowQualityGate(opts: {
    qualityScore: number;
    weakSummary: string;
}): FlywheelUserGate;
/** Step 6 — shared-file contention across ready beads. */
export declare function buildBeadHotspotGate(matrixSummary: string): FlywheelUserGate;
/** Step 5.5 — plan section coverage check. */
export declare function buildBeadCoverageGate(opts: {
    covered: number;
    total: number;
    missingSections: string[];
}): FlywheelUserGate;
/** Step 5.5 — deduplication sweep. */
export declare function buildBeadDedupGate(pairCount: number): FlywheelUserGate;
//# sourceMappingURL=cursor-user-gates.d.ts.map