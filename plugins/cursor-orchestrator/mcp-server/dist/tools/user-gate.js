import { appendSteeringEvent, recordGateSteering, wrapUpConfirmActionId, } from "../steering-events.js";
import { getCoordinatorEpoch } from "../coordinator-epoch.js";
import { appendGateResolution, deriveGateResolutionKey, findReplay, } from "../gate-resolutions.js";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readBeads } from "../beads.js";
import { buildBeadCoverageGate, buildBeadDedupGate, buildBeadHotspotGate, buildBeadLaunchGate, buildBeadLowQualityGate, buildBeadReviewGate, buildWaveReviewGate, buildWaveReviewBeadPickGate, buildAskQuestionFromGate, buildWrapUpAlreadyConfirmedPayload, buildWrapUpGate, toCompactGatePayload, WRAP_UP_ALREADY_CONFIRMED_FORCE_HINT, isRiskyBead, } from "../cursor-user-gates.js";
import { computeBeadApprovalMetrics, formatQualityLine, loadOpenBeadsForGate, } from "../bead-approval-metrics.js";
import { makeOkToolResult, makeToolError } from "./shared.js";
import { acceptWaveBeadsAtReview, runReview } from "./review.js";
import { resolveRecoveryContext } from "../recover-gates.js";
import { createLogger } from "../logger.js";
const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 8_000;
const log = createLogger("recover-gates");
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
function isRenameOrCopyPorcelain(xy) {
    return (xy[0] === "R" ||
        xy[0] === "C" ||
        xy[1] === "R" ||
        xy[1] === "C");
}
/** Parse NUL-terminated `git status --porcelain=v1 -z` output into path entries. */
export function parseGitPorcelainZ(raw) {
    if (!raw)
        return [];
    const paths = [];
    const parts = raw.split("\0");
    let i = 0;
    while (i < parts.length) {
        const line = parts[i];
        i++;
        if (!line || line.length < 4)
            continue;
        const xy = line.slice(0, 2);
        const firstPath = line.slice(3);
        if (isRenameOrCopyPorcelain(xy)) {
            if (firstPath)
                paths.push(firstPath);
            const secondPath = parts[i];
            if (secondPath) {
                paths.push(secondPath);
                i++;
            }
        }
        else if (firstPath) {
            paths.push(firstPath);
        }
    }
    return paths;
}
async function gitPorcelain(cwd) {
    try {
        const r = await execFileAsync("git", ["status", "--porcelain=v1", "-z"], { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
        return parseGitPorcelainZ(r.stdout);
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
function resolveReviewBeadId(beadIds, reviewBeadId) {
    if (reviewBeadId) {
        if (!beadIds.includes(reviewBeadId)) {
            return {
                error: `reviewBeadId "${reviewBeadId}" is not in this wave (${beadIds.join(", ")}).`,
            };
        }
        return { beadId: reviewBeadId };
    }
    if (beadIds.length === 1) {
        return { beadId: beadIds[0] };
    }
    return {
        error: "Multi-bead wave: pass reviewBeadId when confirmAction is fresh-eyes or self-review.",
    };
}
function reviewDataFromResult(result) {
    const reviewData = result.structuredContent?.data;
    if (!reviewData)
        return undefined;
    const { kind, ...reviewRest } = reviewData;
    return { kind, ...reviewRest };
}
const REVIEW_REPLAY_NEXT_ACTION = "Review was already routed. Do not spawn duplicate reviewers unless user asks to retry.";
function waveReviewResolutionKey(state, args, reviewBeadId) {
    return deriveGateResolutionKey({
        kind: "wave_review",
        actionId: args.confirmAction,
        beadIds: args.beadIds,
        reviewBeadId,
        planDocument: state.planDocument,
        selectedGoal: state.selectedGoal,
    });
}
function recordWaveReviewResolution(state, args, reviewBeadId, key) {
    appendGateResolution(state, {
        key,
        kind: "wave_review",
        actionId: args.confirmAction,
        ...(args.beadIds.length ? { beadIds: [...args.beadIds] } : {}),
        ...(reviewBeadId ? { reviewBeadId } : {}),
        coordinatorEpoch: getCoordinatorEpoch(state),
        resolvedAt: new Date().toISOString(),
    });
}
function buildWaveReviewReplayResult(ctx, args, replay, dispatchKey, reviewBeadId) {
    const { state } = ctx;
    const { confirmAction, beadIds } = args;
    const baseData = {
        kind: "wave_review_confirmed",
        confirmAction,
        idempotentReplay: true,
        dispatchKey,
        coordinatorEpoch: replay.coordinatorEpoch,
        beadIds,
        ...(reviewBeadId ? { reviewBeadId } : {}),
    };
    switch (confirmAction) {
        case "looks-good-all":
            return makeOkToolResult("flywheel_wave_review_gate", state.phase, `Wave review already accepted (replay, epoch ${replay.coordinatorEpoch}).`, { ...baseData, closedBeadIds: beadIds });
        case "fresh-eyes":
            return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
                `Fresh-eyes review already dispatched for ${reviewBeadId} (replay, epoch ${replay.coordinatorEpoch}).`,
                REVIEW_REPLAY_NEXT_ACTION,
            ].join("\n"), { ...baseData, nextAction: REVIEW_REPLAY_NEXT_ACTION });
        case "self-review":
            return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
                `Self-review already routed for ${reviewBeadId} (replay, epoch ${replay.coordinatorEpoch}).`,
                REVIEW_REPLAY_NEXT_ACTION,
            ].join("\n"), { ...baseData, nextAction: REVIEW_REPLAY_NEXT_ACTION });
        case "duel-review":
            return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
                `Duel review already routed (replay, epoch ${replay.coordinatorEpoch}).`,
                REVIEW_REPLAY_NEXT_ACTION,
            ].join("\n"), { ...baseData, nextAction: REVIEW_REPLAY_NEXT_ACTION });
        default: {
            const _ = confirmAction;
            return makeToolError("flywheel_wave_review_gate", state.phase, "unsupported_action", `Unsupported wave review confirmAction: ${String(_)}`);
        }
    }
}
async function recordWaveReviewSteering(ctx, args) {
    return recordGateSteering(ctx, {
        source: "wave_review",
        actionId: args.confirmAction,
        beadIds: args.beadIds,
    });
}
async function handleLooksGoodAll(ctx, args, resolutionKey) {
    const { state } = ctx;
    const { confirmAction, beadIds } = args;
    const reviewResult = await acceptWaveBeadsAtReview(ctx, beadIds);
    if (reviewResult.isError) {
        return reviewResult;
    }
    appendSteeringEvent(ctx.state, {
        source: "wave_review",
        actionId: confirmAction,
        beadIds,
    });
    recordWaveReviewResolution(state, args, undefined, resolutionKey);
    await ctx.saveState(ctx.state);
    const epoch = getCoordinatorEpoch(ctx.state);
    const reviewRest = reviewDataFromResult(reviewResult);
    return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
        `Wave review accepted: closed ${beadIds.length} bead(s) (epoch ${epoch}).`,
        reviewResult.content[0]?.text ?? "",
    ]
        .filter(Boolean)
        .join("\n\n"), {
        kind: "wave_review_confirmed",
        confirmAction,
        coordinatorEpoch: epoch,
        beadIds,
        closedBeadIds: beadIds,
        reviewOutcome: reviewRest,
        dispatchKey: resolutionKey,
    });
}
async function handleFreshEyes(ctx, args, resolutionKey, reviewBeadId) {
    const { cwd, state } = ctx;
    const { confirmAction, beadIds } = args;
    const epoch = await recordWaveReviewSteering(ctx, args);
    const reviewResult = await runReview(ctx, {
        cwd,
        beadId: reviewBeadId,
        action: "hit-me",
    });
    if (reviewResult.isError) {
        return reviewResult;
    }
    recordWaveReviewResolution(state, args, reviewBeadId, resolutionKey);
    await ctx.saveState(state);
    return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
        `Fresh-eyes review dispatched for ${reviewBeadId} (epoch ${epoch}).`,
        "Spawn parallel review Tasks from reviewOutcome.agentTasks, then flywheel_review looks-good per bead.",
        reviewResult.content[0]?.text ?? "",
    ]
        .filter(Boolean)
        .join("\n\n"), {
        kind: "wave_review_confirmed",
        confirmAction,
        coordinatorEpoch: epoch,
        beadIds,
        reviewBeadId,
        reviewOutcome: reviewDataFromResult(reviewResult),
        dispatchKey: resolutionKey,
    });
}
async function handleSelfReview(ctx, args, resolutionKey, reviewBeadId) {
    const { state } = ctx;
    const { confirmAction, beadIds } = args;
    const epoch = await recordWaveReviewSteering(ctx, args);
    recordWaveReviewResolution(state, args, reviewBeadId, resolutionKey);
    await ctx.saveState(state);
    return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
        `Self-review routed for ${reviewBeadId} (epoch ${epoch}).`,
        "Delegate diff audit to the original implementor (Agent Mail / same Task identity).",
        'After the self-review report arrives, call flywheel_review({ action: "looks-good", beadId }).',
    ].join("\n"), {
        kind: "wave_review_confirmed",
        confirmAction,
        coordinatorEpoch: epoch,
        beadIds,
        reviewBeadId,
        dispatchKey: resolutionKey,
        selfReviewPlaybook: [
            `## Self-review — ${reviewBeadId}`,
            "",
            "1. Resolve the implementor identity (Agent Mail inbox / impl Task metadata).",
            `2. Ask them to re-read their diff for bead ${reviewBeadId} (bugs, missing tests, style).`,
            "3. Wait for the [review] self-review report before closing the bead.",
            `4. Then: flywheel_review({ cwd, beadId: "${reviewBeadId}", action: "looks-good" }).`,
            "",
            "Cursor port: if no live implementor, coordinator runs a focused diff review on that bead's files only.",
        ].join("\n"),
    });
}
function buildWaveReviewBeadPickResult(ctx, args, beads) {
    const { state } = ctx;
    const { confirmAction, beadIds } = args;
    const gate = buildWaveReviewBeadPickGate(beads, confirmAction);
    const epoch = getCoordinatorEpoch(state);
    return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
        "flywheel_wave_review_gate: wave_review_bead_pick_required",
        `confirmAction=${confirmAction} | beads=${beadIds.length}`,
        "AskQuestion(nextAskQuestion) → re-call confirm with reviewBeadId from selection.",
    ].join("\n"), {
        kind: "wave_review_bead_pick_required",
        confirmAction,
        beadIds,
        nextAskQuestion: buildAskQuestionFromGate(gate),
        coordinatorEpoch: epoch,
    });
}
async function handleDuelReview(ctx, args, resolutionKey) {
    const { cwd, state, exec } = ctx;
    const { confirmAction, beadIds } = args;
    let riskyIds = beadIds;
    try {
        const allBeads = await readBeads(exec, cwd);
        const byId = new Map(allBeads.map((b) => [b.id, b]));
        riskyIds = beadIds.filter((id) => {
            const bead = byId.get(id);
            return bead != null && isRiskyBead(bead, state);
        });
    }
    catch {
        // fall back to full wave list
    }
    const targets = riskyIds.length > 0 ? riskyIds : beadIds;
    const epoch = await recordWaveReviewSteering(ctx, args);
    recordWaveReviewResolution(state, args, undefined, resolutionKey);
    await ctx.saveState(state);
    return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
        `Duel review routed for ${targets.join(", ")} (epoch ${epoch}).`,
        "Invoke flywheel_duel or /dueling-idea-wizards per skills/start/_review.md §8.0a.",
    ].join("\n"), {
        kind: "wave_review_confirmed",
        confirmAction,
        coordinatorEpoch: epoch,
        beadIds,
        riskyBeadIds: targets,
        dispatchKey: resolutionKey,
        duelReviewPlaybook: [
            "## Duel review (risky beads)",
            "",
            `Targets: ${targets.join(", ")}`,
            "",
            '1. Call flywheel_duel({ cwd, focus: "adversarial review of closed bead implementation" })',
            "   OR load agent-flywheel:flywheel-duel and run security vs reliability wizards.",
            "2. Synthesize findings into follow-up beads or flywheel_review hit-me on the target bead.",
        ].join("\n"),
    });
}
async function confirmWaveReviewAction(ctx, args) {
    const { cwd, state, exec } = ctx;
    const { confirmAction, beadIds } = args;
    let reviewBeadId;
    if (confirmAction === "fresh-eyes" || confirmAction === "self-review") {
        const resolved = resolveReviewBeadId(beadIds, args.reviewBeadId);
        if ("error" in resolved) {
            if (args.reviewBeadId) {
                return makeToolError("flywheel_wave_review_gate", state.phase, "invalid_input", resolved.error);
            }
            let beads;
            try {
                const allBeads = await readBeads(exec, cwd);
                const picked = resolveBeadsFromIds(allBeads, beadIds);
                if (picked.missing.length > 0) {
                    return makeToolError("flywheel_wave_review_gate", state.phase, "invalid_input", `Unknown bead id(s): ${picked.missing.join(", ")}`);
                }
                beads = picked.beads;
            }
            catch {
                beads = beadIds.map((id) => ({
                    id,
                    title: id,
                    description: "",
                    status: "closed",
                    priority: 2,
                }));
            }
            return buildWaveReviewBeadPickResult(ctx, { ...args, confirmAction }, beads);
        }
        reviewBeadId = resolved.beadId;
    }
    const resolutionKey = waveReviewResolutionKey(state, args, reviewBeadId);
    const replay = findReplay(state, resolutionKey);
    if (replay) {
        log.info("duplicate confirm replayed", {
            kind: "wave_review",
            actionId: args.confirmAction,
            dispatchKey: resolutionKey,
            coordinatorEpoch: replay.coordinatorEpoch,
            beadCount: beadIds.length,
            ...(reviewBeadId ? { reviewBeadId } : {}),
        });
        return buildWaveReviewReplayResult(ctx, args, replay, resolutionKey, reviewBeadId);
    }
    switch (confirmAction) {
        case "looks-good-all":
            return handleLooksGoodAll(ctx, args, resolutionKey);
        case "fresh-eyes":
            return handleFreshEyes(ctx, args, resolutionKey, reviewBeadId);
        case "self-review":
            return handleSelfReview(ctx, args, resolutionKey, reviewBeadId);
        case "duel-review":
            return handleDuelReview(ctx, args, resolutionKey);
        default: {
            const _ = confirmAction;
            return makeToolError("flywheel_wave_review_gate", state.phase, "unsupported_action", `Unsupported wave review confirmAction: ${String(_)}`);
        }
    }
}
function waveReviewEmptyBeadIdsError(ctx) {
    return makeToolError("flywheel_wave_review_gate", ctx.state.phase, "invalid_input", "beadIds must be a non-empty array of beads that finished in this wave.");
}
export async function runWaveReviewGate(ctx, args) {
    const { cwd, state, exec } = ctx;
    if (args.confirmAction !== undefined) {
        if (!Array.isArray(args.beadIds) || args.beadIds.length === 0) {
            return waveReviewEmptyBeadIdsError(ctx);
        }
        return confirmWaveReviewAction(ctx, {
            ...args,
            confirmAction: args.confirmAction,
        });
    }
    if (!Array.isArray(args.beadIds) || args.beadIds.length === 0) {
        const recovery = await resolveRecoveryContext(ctx, {
            beadIds: args.beadIds,
        });
        if (recovery.source === "manual_required" && recovery.beadIds.length === 0) {
            return makeToolError("flywheel_wave_review_gate", state.phase, "invalid_input", recovery.nextAction?.prompt ??
                "beadIds must be a non-empty array of beads that finished in this wave.", {
                details: {
                    recovery,
                    suggestedBeadIds: [],
                },
            });
        }
        if (recovery.beadIds.length > 0) {
            const requiresConfirmation = recovery.requiresConfirmation ?? recovery.confidence !== "trusted";
            return makeOkToolResult("flywheel_wave_review_gate", state.phase, [
                "flywheel_wave_review_gate: recover_gate_context",
                `suggestedBeadIds=${recovery.beadIds.length}${recovery.truncated ? " (truncated)" : ""}`,
                requiresConfirmation
                    ? "Stale or inferred candidates — confirm before re-calling with explicit beadIds."
                    : "Re-call with explicit beadIds to open the wave review gate.",
            ].join("\n"), {
                kind: "recover_gate_context",
                suggestedBeadIds: recovery.beadIds,
                recovery,
                requiresConfirmation,
                recoverySource: recovery.source,
                recoveryConfidence: recovery.confidence,
            });
        }
        return waveReviewEmptyBeadIdsError(ctx);
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
    if (args.confirmWrapUp !== undefined) {
        const actionId = wrapUpConfirmActionId(args.confirmWrapUp);
        const resolutionKey = deriveGateResolutionKey({
            kind: "wrap_up",
            actionId,
            planDocument: state.planDocument,
            selectedGoal: state.selectedGoal,
        });
        const replay = findReplay(state, resolutionKey);
        if (replay) {
            log.info("duplicate confirm replayed", {
                kind: "wrap_up",
                actionId,
                dispatchKey: resolutionKey,
                coordinatorEpoch: replay.coordinatorEpoch,
            });
            return makeOkToolResult("flywheel_wrap_up_gate", state.phase, `Wrap-up path already confirmed: ${args.confirmWrapUp} (replay, epoch ${replay.coordinatorEpoch}).`, {
                kind: "wrap_up_confirmed",
                wrapUpConfirmed: true,
                confirmWrapUp: args.confirmWrapUp,
                idempotentReplay: true,
                dispatchKey: resolutionKey,
                coordinatorEpoch: replay.coordinatorEpoch,
            });
        }
        await recordGateSteering(ctx, {
            source: "wrap_up",
            actionId,
        });
        appendGateResolution(state, {
            key: resolutionKey,
            kind: "wrap_up",
            actionId,
            coordinatorEpoch: getCoordinatorEpoch(state),
            resolvedAt: new Date().toISOString(),
        });
        state.wrapUpConfirmed = true;
        state.wrapUpConfirmedAction = args.confirmWrapUp;
        state.phase = state.phase === "complete" ? "complete" : "iterating";
        saveState(state);
        const uncommitted = await gitPorcelain(cwd);
        const beadCommitCount = await gitBeadCommitCount(cwd);
        const gate = buildWrapUpGate({
            uncommittedCount: uncommitted.length,
            uncommittedPreview: uncommitted,
            beadCommitCount,
        });
        return makeOkToolResult("flywheel_wrap_up_gate", state.phase, [
            `Wrap-up path confirmed: ${args.confirmWrapUp}.`,
            "Map actions via flywheel_get_skill(agent-flywheel:start_wrapup) if needed.",
            "Sub-gates: AskQuestion only — no commit prompts in prose.",
        ].join("\n"), {
            ...toCompactGatePayload(gate),
            kind: "wrap_up_confirmed",
            wrapUpConfirmed: true,
            confirmWrapUp: args.confirmWrapUp,
            dispatchKey: resolutionKey,
            coordinatorEpoch: getCoordinatorEpoch(state),
        });
    }
    if (state.wrapUpConfirmed && !args.force) {
        log.info("wrap up already confirmed", {
            confirmedAction: state.wrapUpConfirmedAction,
            coordinatorEpoch: getCoordinatorEpoch(state),
        });
        const outcome = buildWrapUpAlreadyConfirmedPayload({
            confirmedAction: state.wrapUpConfirmedAction,
        });
        return makeOkToolResult("flywheel_wrap_up_gate", state.phase, [
            "Wrap-up already confirmed.",
            `flywheel_get_skill(${outcome.nextSkill}) only if needed.`,
            WRAP_UP_ALREADY_CONFIRMED_FORCE_HINT,
        ].join(" "), outcome);
    }
    const uncommitted = await gitPorcelain(cwd);
    const beadCommitCount = await gitBeadCommitCount(cwd);
    const gate = buildWrapUpGate({
        uncommittedCount: uncommitted.length,
        uncommittedPreview: uncommitted,
        beadCommitCount,
    });
    const outcome = toCompactGatePayload(gate);
    return makeOkToolResult("flywheel_wrap_up_gate", state.phase, gateResultText("flywheel_wrap_up_gate", outcome), outcome);
}
//# sourceMappingURL=user-gate.js.map