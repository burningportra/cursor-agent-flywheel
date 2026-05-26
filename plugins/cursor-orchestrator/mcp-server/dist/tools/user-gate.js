import { recordGateSteering, wrapUpConfirmActionId, } from "../steering-events.js";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readBeads } from "../beads.js";
import { buildBeadCoverageGate, buildBeadDedupGate, buildBeadHotspotGate, buildBeadLaunchGate, buildBeadLowQualityGate, buildBeadReviewGate, buildWaveReviewGate, buildWrapUpGate, toCompactGatePayload, } from "../cursor-user-gates.js";
import { computeBeadApprovalMetrics, formatQualityLine, loadOpenBeadsForGate, } from "../bead-approval-metrics.js";
import { makeOkToolResult, makeToolError } from "./shared.js";
import { acceptWaveBeadsAtReview } from "./review.js";
const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 8_000;
function gateResultText(tool, compact) {
    const beads = compact.gateMeta.beadIds?.length ?? 0;
    return [
        `${tool}: ${compact.gateMeta.kind} | ${compact.gateMeta.title}`,
        `AskQuestion(structuredContent.data.askQuestion) → map selection via structuredContent.data.actions`,
        beads > 0 ? `beads=${beads}` : "",
        "Do not echo full gate JSON or load start_bootstrap/start_* phase bodies for this step.",
    ]
        .filter(Boolean)
        .join("\n");
}
async function gitPorcelain(cwd) {
    try {
        const r = await execFileAsync("git", ["status", "--porcelain"], { cwd, timeout: GIT_TIMEOUT_MS });
        return r.stdout
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => l.slice(3).trim());
    }
    catch {
        return [];
    }
}
async function gitBeadCommitCount(cwd) {
    try {
        const r = await execFileAsync("git", ["log", "--oneline", "-50"], { cwd, timeout: GIT_TIMEOUT_MS });
        const lines = r.stdout.trim().split("\n").filter(Boolean);
        const beadish = lines.filter((l) => /\b(bead|tb-|br-|fw-)/i.test(l));
        return beadish.length > 0 ? beadish.length : lines.length;
    }
    catch {
        return undefined;
    }
}
function resolveBeadsFromIds(all, beadIds) {
    const byId = new Map(all.map((b) => [b.id, b]));
    const missing = beadIds.filter((id) => !byId.has(id));
    const beads = beadIds
        .map((id) => byId.get(id))
        .filter((b) => b != null);
    return { beads, missing };
}
export async function runWaveReviewGate(ctx, args) {
    const { cwd, state, exec } = ctx;
    // E8: record wave review gate action after AskQuestion maps actions id
    if (args.confirmAction !== undefined) {
        const epoch = await recordGateSteering(ctx, {
            source: "wave_review",
            actionId: args.confirmAction,
            beadIds: args.beadIds,
        });
        // looks-good-all must close beads — coordinators often stop after confirmAction.
        if (args.confirmAction === "looks-good-all") {
            const reviewResult = await acceptWaveBeadsAtReview(ctx, args.beadIds);
            const reviewData = reviewResult.structuredContent?.data;
            const { kind: reviewKind, ...reviewRest } = reviewData ?? {};
            return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
                `Wave review accepted: closed ${args.beadIds.length} bead(s) (epoch ${epoch}).`,
                reviewResult.content[0]?.text ?? "",
            ]
                .filter(Boolean)
                .join("\n\n"), {
                kind: "wave_review_confirmed",
                confirmAction: args.confirmAction,
                coordinatorEpoch: epoch,
                beadIds: args.beadIds,
                closedBeadIds: args.beadIds,
                reviewOutcome: { kind: reviewKind, ...reviewRest },
            });
        }
        return makeOkToolResult("flywheel_wave_review_gate", state.phase, `Wave review action recorded: ${args.confirmAction} (epoch ${epoch}).`, {
            kind: "wave_review_confirmed",
            confirmAction: args.confirmAction,
            coordinatorEpoch: epoch,
            beadIds: args.beadIds,
        });
    }
    if (!Array.isArray(args.beadIds) || args.beadIds.length === 0) {
        return makeToolError("flywheel_wave_review_gate", state.phase, "invalid_input", "beadIds must be a non-empty array of beads that finished in this wave.");
    }
    let allBeads;
    try {
        allBeads = await readBeads(exec, cwd);
    }
    catch (err) {
        return makeToolError("flywheel_wave_review_gate", state.phase, "cli_failure", `Could not read beads: ${err instanceof Error ? err.message : String(err)}`);
    }
    const { beads, missing } = resolveBeadsFromIds(allBeads, args.beadIds);
    if (missing.length > 0) {
        return makeToolError("flywheel_wave_review_gate", state.phase, "invalid_input", `Unknown bead id(s): ${missing.join(", ")}`);
    }
    const gate = buildWaveReviewGate(beads, state);
    const outcome = toCompactGatePayload(gate);
    return makeOkToolResult("flywheel_wave_review_gate", state.phase, gateResultText("flywheel_wave_review_gate", outcome), outcome);
}
export async function runBeadApprovalGate(ctx, args) {
    const { state, saveState } = ctx;
    const step = args.step ?? "review";
    if (step === "coverage") {
        const covered = args.coveredSections ?? 0;
        const total = args.totalSections ?? 0;
        const gate = buildBeadCoverageGate({
            covered,
            total,
            missingSections: args.missingSections ?? [],
        });
        const outcome = toCompactGatePayload(gate);
        return makeOkToolResult("flywheel_bead_approval_gate", state.phase, gateResultText("flywheel_bead_approval_gate", outcome), { ...outcome, step });
    }
    if (step === "dedup") {
        const gate = buildBeadDedupGate(args.overlapPairs ?? 0);
        const outcome = toCompactGatePayload(gate);
        return makeOkToolResult("flywheel_bead_approval_gate", state.phase, gateResultText("flywheel_bead_approval_gate", outcome), { ...outcome, step });
    }
    const loaded = await loadOpenBeadsForGate(ctx);
    if (!loaded.ok) {
        return makeToolError("flywheel_bead_approval_gate", state.phase, loaded.code, loaded.message);
    }
    if (loaded.beads.length === 0) {
        return makeToolError("flywheel_bead_approval_gate", state.phase, "missing_prerequisite", "No open beads found. Create beads with br create, then call flywheel_bead_approval_gate again.", { hint: "Run Step 5.5 br create / br dep add first." });
    }
    state.activeBeadIds = loaded.beads.map((b) => b.id);
    if (state.phase !== "refining_beads" &&
        state.phase !== "implementing") {
        state.phase = "awaiting_bead_approval";
    }
    saveState(state);
    const metrics = computeBeadApprovalMetrics(state, loaded.beads);
    if (step === "review") {
        const gate = buildBeadReviewGate(metrics.beadCount);
        const outcome = toCompactGatePayload(gate);
        return makeOkToolResult("flywheel_bead_approval_gate", state.phase, [
            gateResultText("flywheel_bead_approval_gate", outcome),
            formatQualityLine(metrics),
            "On Start → re-call with step=launch (do not approve start yet).",
        ].join("\n"), {
            ...outcome,
            step,
            quality: { score: metrics.quality.score, summary: metrics.quality },
        });
    }
    // step === "launch" — score + pick launch / low-quality / hotspot gate
    const weakSummary = metrics.quality.weakBeads.length > 0
        ? `Weakest: ${metrics.quality.weakBeads.slice(0, 3).join(" | ")}`
        : "";
    const gate = metrics.offerCoordinatorSerial
        ? buildBeadHotspotGate(metrics.hotspotSummary)
        : metrics.quality.score < 0.75
            ? buildBeadLowQualityGate({
                qualityScore: metrics.quality.score,
                weakSummary,
            })
            : buildBeadLaunchGate({
                qualityScore: metrics.quality.score,
                beadCount: metrics.beadCount,
                convergencePct: metrics.convergenceScore != null
                    ? metrics.convergenceScore * 100
                    : undefined,
            });
    const outcome = toCompactGatePayload(gate);
    return makeOkToolResult("flywheel_bead_approval_gate", state.phase, [
        gateResultText("flywheel_bead_approval_gate", outcome),
        formatQualityLine(metrics),
        metrics.offerCoordinatorSerial ? metrics.hotspotSummary : "",
    ]
        .filter(Boolean)
        .join("\n"), {
        ...outcome,
        step: "launch",
        launchGateKind: gate.kind,
        quality: {
            score: metrics.quality.score,
            summary: metrics.quality,
            belowThreshold: metrics.quality.score < 0.75,
        },
        convergence: {
            score: metrics.convergenceScore,
            round: state.polishRound,
        },
        matrix: metrics.matrix,
    });
}
export async function runWrapUpGate(ctx, args) {
    const { cwd, state, saveState } = ctx;
    if (state.wrapUpConfirmed && !args.force) {
        const gate = buildWrapUpGate({
            uncommittedCount: 0,
            uncommittedPreview: [],
        });
        return makeOkToolResult("flywheel_wrap_up_gate", state.phase, "Wrap-up already confirmed. flywheel_get_skill(agent-flywheel:start_wrapup) only if needed; pass force=true to re-prompt.", { ...toCompactGatePayload(gate), wrapUpConfirmed: true });
    }
    const uncommitted = await gitPorcelain(cwd);
    const beadCommitCount = await gitBeadCommitCount(cwd);
    const gate = buildWrapUpGate({
        uncommittedCount: uncommitted.length,
        uncommittedPreview: uncommitted,
        beadCommitCount,
    });
    if (args.confirmWrapUp !== undefined) {
        // E7: wrap-up confirm is user steering
        await recordGateSteering(ctx, {
            source: "wrap_up",
            actionId: wrapUpConfirmActionId(args.confirmWrapUp),
        });
        state.wrapUpConfirmed = true;
        state.phase = state.phase === "complete" ? "complete" : "iterating";
        saveState(state);
        return makeOkToolResult("flywheel_wrap_up_gate", state.phase, [
            `Wrap-up path confirmed: ${args.confirmWrapUp}.`,
            "Map actions via flywheel_get_skill(agent-flywheel:start_wrapup) if needed.",
            "Sub-gates: AskQuestion only — no commit prompts in prose.",
        ].join("\n"), { ...toCompactGatePayload(gate), wrapUpConfirmed: true });
    }
    const outcome = toCompactGatePayload(gate);
    return makeOkToolResult("flywheel_wrap_up_gate", state.phase, gateResultText("flywheel_wrap_up_gate", outcome), outcome);
}
//# sourceMappingURL=user-gate.js.map