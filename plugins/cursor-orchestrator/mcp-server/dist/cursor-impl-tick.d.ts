/**
 * Cursor-native implementation coordinator tick — commit-batch fresh-eyes,
 * wave advance, and ready-bead dispatch hints in one MCP call.
 */
import { buildAskQuestionFromGate } from './cursor-user-gates.js';
import type { AdvanceWaveOutcome } from './tools/advance-wave.js';
import type { ToolContext } from './types.js';
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
}
export type ImplTickKind = 'monitor' | 'batch_review_in_progress' | 'batch_review_dispatch' | 'batch_review_collect_verdict' | 'batch_review_verdict' | 'advance_wave' | 'dispatch_impl_tasks' | 'wave_complete';
export interface ImplTickStructured {
    tool: 'flywheel_impl_tick';
    version: 1;
    status: 'ok';
    data: {
        kind: ImplTickKind;
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
        askQuestion?: ReturnType<typeof buildAskQuestionFromGate>;
    };
}
export declare function resolveImplTickConfig(cwd: string): ImplTickConfig;
export declare function buildImplTickCoordinatorPlaybook(cfg: ImplTickConfig): string;
export declare function runImplTickCore(ctx: ToolContext, args: ImplTickArgs): Promise<{
    text: string;
    structured: ImplTickStructured;
}>;
//# sourceMappingURL=cursor-impl-tick.d.ts.map