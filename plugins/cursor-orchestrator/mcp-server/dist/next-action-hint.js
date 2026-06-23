/**
 * Template-only coordinator next-action hints (pi-prompt-suggester port v1).
 * One-line nudges for wave completion / dispatch without parsing full MCP JSON.
 */
import { shouldSuppressNextActionHint } from './steering-events.js';
/** Hard cap on hint text length (bead AC + synthesized plan). */
export const HINT_MAX_CHARS = 160;
/** When bead id lists exceed this, hint text uses count only and omits beadIds. */
export const HINT_BEAD_ID_CAP = 50;
/** Gate action id used when checking steering suppression for each hint kind. */
const HINT_SUPPRESSION_ACTION = {
    wave_complete: 'fresh-eyes',
    advance_wave: 'skip',
    dispatch_impl_tasks: 'skip',
};
function truncateHintText(text, max = HINT_MAX_CHARS) {
    if (text.length <= max)
        return text;
    return `${text.slice(0, max - 1)}…`;
}
function normalizeBeadIds(beadIds) {
    if (!beadIds?.length) {
        return { count: 0, beadIds: undefined };
    }
    if (beadIds.length > HINT_BEAD_ID_CAP) {
        return { count: beadIds.length, beadIds: undefined };
    }
    return { count: beadIds.length, beadIds: [...beadIds] };
}
function finalizeHint(text, primaryTool, generationEpoch, beadIds) {
    const { beadIds: ids } = normalizeBeadIds(beadIds);
    return {
        text: truncateHintText(text),
        primaryTool,
        ...(ids?.length ? { beadIds: ids } : {}),
        generationEpoch,
    };
}
/** Re-export config gate for hint consumers. */
export { areNextActionHintsEnabled } from './flywheel-config.js';
export function buildWaveCompleteHint(generationEpoch, beadIds, opts) {
    const { count, beadIds: ids } = normalizeBeadIds(beadIds);
    const n = count || beadIds.length;
    const auto = opts?.autoBatchReview !== false;
    const text = auto
        ? n > 0
            ? `Wave done (${n} beads). Batch fresh-eyes or wrap-up per commit count.`
            : 'Wave done. Batch fresh-eyes or wrap-up per commit count.'
        : n > 0
            ? `Wave done (${n} beads). Run wave review gate, then spawn next wave or wrap up.`
            : 'Wave done. Run wave review gate, then spawn next wave or wrap up.';
    const primaryTool = auto ? 'flywheel_impl_tick' : 'flywheel_wave_review_gate';
    return finalizeHint(text, primaryTool, generationEpoch, ids ?? beadIds);
}
export function buildQueueDrainedHint(generationEpoch, commitsSinceBaseline, batchThreshold) {
    const text = commitsSinceBaseline > 0
        ? `Queue drained (${commitsSinceBaseline} commits). Batch review or wrap-up next.`
        : 'Queue drained. Call flywheel_wrap_up_gate.';
    return finalizeHint(text, 'flywheel_wrap_up_gate', generationEpoch);
}
export function buildAdvanceWaveHint(generationEpoch, beadCount, beadIds) {
    const text = `Next wave ready (${beadCount} beads). Spawn impl Tasks from tick, stagger ~30s.`;
    return finalizeHint(text, 'flywheel_impl_tick', generationEpoch, beadIds);
}
export function buildDispatchImplTasksHint(generationEpoch, beadCount, beadIds) {
    const text = `Idle capacity — ${beadCount} ready beads. Spawn Tasks or wait for in-progress.`;
    return finalizeHint(text, 'flywheel_impl_tick', generationEpoch, beadIds);
}
export function buildNextActionHint(kind, generationEpoch, opts) {
    const suppressionActionId = HINT_SUPPRESSION_ACTION[kind];
    if (opts.state &&
        shouldSuppressNextActionHint(opts.state, suppressionActionId, opts.beadIds)) {
        return undefined;
    }
    const count = opts.beadCount ?? opts.beadIds?.length ?? 0;
    switch (kind) {
        case 'wave_complete':
            return buildWaveCompleteHint(generationEpoch, opts.beadIds ?? [], {
                autoBatchReview: opts.autoBatchReview,
            });
        case 'advance_wave':
            if (count <= 0)
                return undefined;
            return buildAdvanceWaveHint(generationEpoch, count, opts.beadIds);
        case 'dispatch_impl_tasks':
            if (count <= 0)
                return undefined;
            return buildDispatchImplTasksHint(generationEpoch, count, opts.beadIds);
        default:
            return undefined;
    }
}
//# sourceMappingURL=next-action-hint.js.map