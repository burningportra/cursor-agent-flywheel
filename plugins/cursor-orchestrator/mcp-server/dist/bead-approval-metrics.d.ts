/**
 * Read-only bead approval metrics for flywheel_bead_approval_gate.
 * Does not transition to implementing or mutate br status.
 */
import type { Bead, FlywheelState, HotspotMatrix } from "./types.js";
import type { ToolContext } from "./types.js";
import { computeBeadQualityScore } from "./tools/shared.js";
export type BeadApprovalStep = "review" | "launch" | "coverage" | "dedup";
export type BeadApprovalMetrics = {
    beads: Bead[];
    beadCount: number;
    quality: ReturnType<typeof computeBeadQualityScore>;
    convergenceScore?: number;
    matrix: HotspotMatrix;
    offerCoordinatorSerial: boolean;
    hotspotSummary: string;
};
export declare function loadOpenBeadsForGate(ctx: ToolContext): Promise<{
    ok: true;
    beads: Bead[];
} | {
    ok: false;
    message: string;
    code: "cli_failure" | "parse_failure";
}>;
export declare function computeBeadApprovalMetrics(state: FlywheelState, beads: Bead[]): BeadApprovalMetrics;
export declare function formatQualityLine(metrics: BeadApprovalMetrics): string;
//# sourceMappingURL=bead-approval-metrics.d.ts.map