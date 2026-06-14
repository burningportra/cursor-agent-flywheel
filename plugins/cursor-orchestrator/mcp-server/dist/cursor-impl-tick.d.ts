/**
 * Cursor-native implementation coordinator tick — commit-batch fresh-eyes,
 * wave advance, and ready-bead dispatch hints in one MCP call.
 */
import type { AdvanceWaveOutcome } from './tools/advance-wave.js';
import type { CompactGatePayload, ToolContext } from './types.js';
import type { CoordinatorNextActionHint, FlywheelState } from './types.js';
export interface ImplTickConfig {
    intervalSeconds: number;
    reviewModel: string;
    maxParallelImpl: number;
}
export interface ImplTickArgs {
    cwd: string;
    /** Beads closed since the previous tick — triggers verify + advance_wave when non-empty. */
    closedBeadIds?: string[];
    /** Agent Mail name for inbox probe (optional). */
    coordinatorAgent?: string;
    /** Override / persist commit-batch threshold for this session (0 = disable). */
    commitBatchThreshold?: number;
    /** Trigger commit-batch fresh-eyes review even when below threshold (requires commits since baseline > 0). */
    forceBatchReview?: boolean;
}
export type ImplTickKind = 'monitor' | 'batch_review_in_progress' | 'batch_review_dispatch' | 'batch_review_collect_verdict' | 'batch_review_verdict' | 'advance_wave' | 'dispatch_impl_tasks' | 'wave_complete' | 'stale';
export interface ImplTickStructured {
    tool: 'flywheel_impl_tick';
    version: 1;
    status: 'ok';
    data: {
        kind: ImplTickKind;
        /** Coordinator generation epoch captured at tick start. */
        epoch: number;
        tickAt: string;
        nextTickInSeconds: number;
        snapshot: {
            headSha: string;
            commitsSinceBaseline: number;
            commitBatchThreshold: number;
            pendingBatchReviewRange?: string;
            readyCount: number;
            inProgressCount: number;
            closedCount: number;
            profileStale: boolean;
        };
        coordinatorPlaybook: string;
        batchReviewTask?: {
            model: string;
            subagent_type: string;
            description: string;
            prompt: string;
            shaRange: string;
            verdictRel: string;
        };
        implTasks?: Array<{
            beadId: string;
            model: string;
            subagent_type: string;
            description: string;
            prompt: string;
        }>;
        advanceWave?: AdvanceWaveOutcome;
        reviewEnvelope?: unknown;
        askQuestion?: CompactGatePayload['askQuestion'];
        gateMeta?: CompactGatePayload['gateMeta'];
        actions?: CompactGatePayload['actions'];
        waveReviewBeadIds?: string[];
        /** Advisory one-line coordinator nudge (template v1). */
        nextActionHint?: CoordinatorNextActionHint;
    };
}
export declare function resolveImplTickConfig(cwd: string): ImplTickConfig;
export declare function buildImplTickCoordinatorPlaybook(cfg: ImplTickConfig): string;
type ImplTickData = ImplTickStructured['data'];
type ImplTickDataInput = Omit<ImplTickData, 'epoch'>;
/**
 * Apply epoch guard before returning task-bearing tick payloads.
 * When epoch drifted mid-tick and guards are enabled, drop spawn specs.
 */
export declare function finalizeTickPayload(epochAtTickStart: number, state: FlywheelState, payload: ImplTickDataInput, epochGuards: boolean): ImplTickData;
export declare function runImplTickCore(ctx: ToolContext, args: ImplTickArgs): Promise<{
    text: string;
    structured: ImplTickStructured;
}>;
export {};
//# sourceMappingURL=cursor-impl-tick.d.ts.map