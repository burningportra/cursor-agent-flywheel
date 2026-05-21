/**
 * Coordinator generation epoch — monotonic counter for stale tick guards.
 *
 * Bumped on user steering events (gate clicks, review resolutions) so
 * in-flight impl_tick / advance_wave responses can be discarded safely.
 */
import type { FlywheelState } from "./types.js";
/** Read the current epoch; undefined, negative, and NaN all normalize to 0. */
export declare function getCoordinatorEpoch(state: FlywheelState): number;
/** Return a new state with coordinatorEpoch incremented by one. */
export declare function bumpCoordinatorEpoch(state: FlywheelState): FlywheelState;
/** Minimal sink for persisting a steering bump to checkpoint. */
export type CoordinatorEpochSink = {
    state: FlywheelState;
    saveState: (state: FlywheelState) => Promise<boolean> | void;
};
/** Bump coordinatorEpoch, merge into ctx.state, and persist. Returns new epoch. */
export declare function persistCoordinatorEpochBump(sink: CoordinatorEpochSink): Promise<number>;
//# sourceMappingURL=coordinator-epoch.d.ts.map