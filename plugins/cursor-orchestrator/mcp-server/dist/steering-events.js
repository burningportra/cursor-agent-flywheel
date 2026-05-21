/**
 * Steering event ledger — gate action history for hint deduplication.
 */
import { createHash } from 'node:crypto';
import { persistCoordinatorEpochBump } from './coordinator-epoch.js';
import { createLogger } from './logger.js';
const log = createLogger('steering-events');
export const STEERING_EVENTS_CAP = 20;
export const STEERING_SUPPRESS_WINDOW = 3;
/** Default gate actions that trigger hint suppression after repeat. */
export const DEFAULT_SUPPRESS_REPEAT_ACTIONS = [
    'skip',
    'defer',
    'wrap-up-skip',
    'bead-coverage-defer',
    'fresh-eyes',
    'self-review',
];
export function buildSteeringNormalizedKey(actionId, beadIds) {
    const sorted = [...(beadIds ?? [])].sort().join(',');
    return createHash('sha256').update(`${actionId}|${sorted}`).digest('hex');
}
export function appendSteeringEvent(state, partial) {
    const actionId = partial.actionId.trim();
    if (!actionId) {
        log.warn('steering event skipped: empty actionId');
        return undefined;
    }
    const event = {
        at: new Date().toISOString(),
        source: partial.source,
        actionId,
        ...(partial.beadIds?.length ? { beadIds: [...partial.beadIds] } : {}),
        normalizedKey: buildSteeringNormalizedKey(actionId, partial.beadIds),
    };
    const prev = state.steeringEvents ?? [];
    const next = [...prev, event];
    state.steeringEvents =
        next.length > STEERING_EVENTS_CAP
            ? next.slice(next.length - STEERING_EVENTS_CAP)
            : next;
    return event;
}
export function shouldSuppressNextActionHint(state, actionId, beadIds, suppressActions = DEFAULT_SUPPRESS_REPEAT_ACTIONS) {
    if (!suppressActions.includes(actionId)) {
        return false;
    }
    const events = state.steeringEvents ?? [];
    if (events.length < STEERING_SUPPRESS_WINDOW) {
        return false;
    }
    const key = buildSteeringNormalizedKey(actionId, beadIds);
    const tail = events.slice(-STEERING_SUPPRESS_WINDOW);
    return tail.every((e) => e.normalizedKey === key);
}
/** Bump coordinator epoch, append steering event, and persist checkpoint. */
export async function recordGateSteering(ctx, partial) {
    const epoch = await persistCoordinatorEpochBump(ctx);
    appendSteeringEvent(ctx.state, partial);
    await ctx.saveState(ctx.state);
    return epoch;
}
export function wrapUpConfirmActionId(confirmWrapUp) {
    switch (confirmWrapUp) {
        case 'full':
            return 'wrap-up-full';
        case 'commit_only':
            return 'wrap-up-commit-only';
        case 'skip':
            return 'wrap-up-skip';
        default:
            return confirmWrapUp;
    }
}
//# sourceMappingURL=steering-events.js.map