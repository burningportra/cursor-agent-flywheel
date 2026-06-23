/**
 * Template-only coordinator next-action hints (pi-prompt-suggester port v1).
 * One-line nudges for wave completion / dispatch without parsing full MCP JSON.
 */
import type { CoordinatorNextActionHint, FlywheelState } from './types.js';
/** Hard cap on hint text length (bead AC + synthesized plan). */
export declare const HINT_MAX_CHARS = 160;
/** When bead id lists exceed this, hint text uses count only and omits beadIds. */
export declare const HINT_BEAD_ID_CAP = 50;
export type NextActionHintKind = 'wave_complete' | 'advance_wave' | 'dispatch_impl_tasks';
/** Re-export config gate for hint consumers. */
export { areNextActionHintsEnabled } from './flywheel-config.js';
export declare function buildWaveCompleteHint(generationEpoch: number, beadIds: string[], opts?: {
    autoBatchReview?: boolean;
}): CoordinatorNextActionHint;
export declare function buildQueueDrainedHint(generationEpoch: number, commitsSinceBaseline: number, batchThreshold: number): CoordinatorNextActionHint;
export declare function buildAdvanceWaveHint(generationEpoch: number, beadCount: number, beadIds?: string[]): CoordinatorNextActionHint;
export declare function buildDispatchImplTasksHint(generationEpoch: number, beadCount: number, beadIds?: string[]): CoordinatorNextActionHint;
export declare function buildNextActionHint(kind: NextActionHintKind, generationEpoch: number, opts: {
    beadIds?: string[];
    beadCount?: number;
    state?: FlywheelState;
    autoBatchReview?: boolean;
}): CoordinatorNextActionHint | undefined;
//# sourceMappingURL=next-action-hint.d.ts.map