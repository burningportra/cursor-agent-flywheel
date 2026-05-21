/**
 * Coordinator generation epoch — monotonic counter for stale tick guards.
 *
 * Bumped on user steering events (gate clicks, review resolutions) so
 * in-flight impl_tick / advance_wave responses can be discarded safely.
 */

import { createLogger } from "./logger.js";
import type { FlywheelState } from "./types.js";

const log = createLogger("coordinator-epoch");

/** Read the current epoch; undefined, negative, and NaN all normalize to 0. */
export function getCoordinatorEpoch(state: FlywheelState): number {
  const raw = state.coordinatorEpoch;
  if (raw === undefined) {
    return 0;
  }
  if (typeof raw !== "number" || Number.isNaN(raw) || raw < 0) {
    log.warn("coordinatorEpoch invalid; treating as 0", { raw });
    return 0;
  }
  return Math.floor(raw);
}

/** Return a new state with coordinatorEpoch incremented by one. */
export function bumpCoordinatorEpoch(state: FlywheelState): FlywheelState {
  const next = getCoordinatorEpoch(state) + 1;
  return { ...state, coordinatorEpoch: next };
}

/** Minimal sink for persisting a steering bump to checkpoint. */
export type CoordinatorEpochSink = {
  state: FlywheelState;
  saveState: (state: FlywheelState) => Promise<boolean> | void;
};

/** Bump coordinatorEpoch, merge into ctx.state, and persist. Returns new epoch. */
export async function persistCoordinatorEpochBump(
  sink: CoordinatorEpochSink,
): Promise<number> {
  Object.assign(sink.state, bumpCoordinatorEpoch(sink.state));
  await sink.saveState(sink.state);
  return getCoordinatorEpoch(sink.state);
}
