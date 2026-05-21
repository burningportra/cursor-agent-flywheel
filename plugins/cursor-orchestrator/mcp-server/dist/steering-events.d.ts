/**
 * Steering event ledger — gate action history for hint deduplication.
 */
import { type CoordinatorEpochSink } from './coordinator-epoch.js';
import type { FlywheelState, SteeringEvent, SteeringEventSource } from './types.js';
export declare const STEERING_EVENTS_CAP = 20;
export declare const STEERING_SUPPRESS_WINDOW = 3;
/** Default gate actions that trigger hint suppression after repeat. */
export declare const DEFAULT_SUPPRESS_REPEAT_ACTIONS: readonly string[];
export declare function buildSteeringNormalizedKey(actionId: string, beadIds?: string[]): string;
export declare function appendSteeringEvent(state: FlywheelState, partial: {
    source: SteeringEventSource;
    actionId: string;
    beadIds?: string[];
}): SteeringEvent | undefined;
export declare function shouldSuppressNextActionHint(state: FlywheelState, actionId: string, beadIds?: string[], suppressActions?: readonly string[]): boolean;
/** Bump coordinator epoch, append steering event, and persist checkpoint. */
export declare function recordGateSteering(ctx: CoordinatorEpochSink, partial: {
    source: SteeringEventSource;
    actionId: string;
    beadIds?: string[];
}): Promise<number>;
export declare function wrapUpConfirmActionId(confirmWrapUp: 'full' | 'commit_only' | 'skip'): string;
//# sourceMappingURL=steering-events.d.ts.map