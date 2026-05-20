/**
 * Read-only bead approval metrics for flywheel_bead_approval_gate.
 * Does not transition to implementing or mutate br status.
 */
import { parseBrList } from "./parsers.js";
import { computeBeadQualityScore, computeConvergenceScore, formatBeadQualityScore, } from "./tools/shared.js";
import { beadsToHotspotInput, formatHotspotSummary, shouldOfferCoordinatorSerial, } from "./tools/approve.js";
import { computeHotspotMatrix } from "./plan-simulation.js";
export async function loadOpenBeadsForGate(ctx) {
    const { exec, cwd, signal } = ctx;
    const brListResult = await exec("br", ["list", "--json"], {
        cwd,
        timeout: 10000,
        signal,
    });
    if (brListResult.code !== 0) {
        return {
            ok: false,
            code: "cli_failure",
            message: brListResult.stderr || `br list exited ${brListResult.code}`,
        };
    }
    const parsed = parseBrList(brListResult.stdout);
    if (!parsed.ok) {
        return { ok: false, code: "parse_failure", message: parsed.error };
    }
    const beads = parsed.data.filter((b) => b.status === "open" || b.status === "in_progress");
    return { ok: true, beads };
}
export function computeBeadApprovalMetrics(state, beads) {
    const quality = computeBeadQualityScore(beads);
    const convergenceScore = state.polishChanges.length >= 3
        ? computeConvergenceScore(state.polishChanges, state.polishOutputSizes)
        : undefined;
    const matrix = computeHotspotMatrix(beadsToHotspotInput(beads));
    const offerCoordinatorSerial = shouldOfferCoordinatorSerial(matrix);
    const hotspotSummary = formatHotspotSummary(matrix);
    return {
        beads,
        beadCount: beads.length,
        quality,
        convergenceScore,
        matrix,
        offerCoordinatorSerial,
        hotspotSummary,
    };
}
export function formatQualityLine(metrics) {
    const q = (metrics.quality.score * 100).toFixed(0);
    const conv = metrics.convergenceScore != null
        ? ` | Convergence ${(metrics.convergenceScore * 100).toFixed(0)}`
        : "";
    return `Quality ${q}/100${conv} — ${formatBeadQualityScore(metrics.quality)}`;
}
//# sourceMappingURL=bead-approval-metrics.js.map