/**
 * Gate resolution ledger — idempotent replay for confirmed gate actions.
 *
 * Key inputs (stable across upgrades): kind | actionId | sorted beadIds |
 * reviewBeadId | planDocument | selectedGoal — joined with `|` then sha256 hex.
 */
import type { FlywheelState, GateResolution } from "./types.js";
export declare const GATE_RESOLUTIONS_CAP = 20;
export type GateResolutionKind = GateResolution["kind"];
export interface GateResolutionKeyInput {
    kind: GateResolutionKind;
    actionId: string;
    beadIds?: string[];
    reviewBeadId?: string;
    planDocument?: string;
    selectedGoal?: string;
}
/** Stable sha256 key; bead IDs are sorted before hashing. */
export declare function deriveGateResolutionKey(input: GateResolutionKeyInput): string;
export declare function findReplay(state: FlywheelState, key: string): GateResolution | null;
export declare function appendGateResolution(state: FlywheelState, entry: GateResolution): GateResolution;
//# sourceMappingURL=gate-resolutions.d.ts.map