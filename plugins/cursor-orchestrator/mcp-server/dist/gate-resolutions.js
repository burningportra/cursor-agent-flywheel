/**
 * Gate resolution ledger — idempotent replay for confirmed gate actions.
 *
 * Key inputs (stable across upgrades): kind | actionId | sorted beadIds |
 * reviewBeadId | planDocument | selectedGoal — joined with `|` then sha256 hex.
 */
import { createHash } from "node:crypto";
export const GATE_RESOLUTIONS_CAP = 20;
/** Stable sha256 key; bead IDs are sorted before hashing. */
export function deriveGateResolutionKey(input) {
    const sortedBeads = [...(input.beadIds ?? [])].sort().join(",");
    const parts = [
        input.kind,
        input.actionId.trim(),
        sortedBeads,
        input.reviewBeadId?.trim() ?? "",
        input.planDocument?.trim() ?? "",
        input.selectedGoal?.trim() ?? "",
    ];
    return createHash("sha256").update(parts.join("|")).digest("hex");
}
export function findReplay(state, key) {
    return (state.gateResolutions ?? []).find((entry) => entry.key === key) ?? null;
}
export function appendGateResolution(state, entry) {
    const prev = state.gateResolutions ?? [];
    const next = [...prev, entry];
    state.gateResolutions =
        next.length > GATE_RESOLUTIONS_CAP
            ? next.slice(next.length - GATE_RESOLUTIONS_CAP)
            : next;
    return entry;
}
//# sourceMappingURL=gate-resolutions.js.map