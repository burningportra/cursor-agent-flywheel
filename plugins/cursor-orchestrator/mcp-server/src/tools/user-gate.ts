import {
  appendSteeringEvent,
  recordGateSteering,
  wrapUpConfirmActionId,
} from "../steering-events.js";
import { getCoordinatorEpoch } from "../coordinator-epoch.js";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type {
  McpToolResult,
  ToolContext,
  WaveReviewConfirmAction,
  WaveReviewGateArgs,
  WrapUpGateArgs,
} from "../types.js";
import { readBeads } from "../beads.js";
import {
  buildBeadCoverageGate,
  buildBeadDedupGate,
  buildBeadHotspotGate,
  buildBeadLaunchGate,
  buildBeadLowQualityGate,
  buildBeadReviewGate,
  buildWaveReviewGate,
  buildWrapUpGate,
  toCompactGatePayload,
  isRiskyBead,
} from "../cursor-user-gates.js";
import {
  computeBeadApprovalMetrics,
  formatQualityLine,
  loadOpenBeadsForGate,
  type BeadApprovalStep,
} from "../bead-approval-metrics.js";
import { makeOkToolResult, makeToolError } from "./shared.js";
import type { BeadApprovalGateArgs } from "../types.js";
import { acceptWaveBeadsAtReview, runReview } from "./review.js";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 8_000;

export type WaveReviewGateOutcome = ReturnType<typeof toCompactGatePayload> & {
  confirmed?: boolean;
};

export type WrapUpGateOutcome = ReturnType<typeof toCompactGatePayload> & {
  wrapUpConfirmed?: boolean;
};

function gateResultText(
  tool:
    | "flywheel_wave_review_gate"
    | "flywheel_wrap_up_gate"
    | "flywheel_bead_approval_gate",
  compact: ReturnType<typeof toCompactGatePayload>,
): string {
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

async function gitPorcelain(cwd: string): Promise<string[]> {
  try {
    const r = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      { cwd, timeout: GIT_TIMEOUT_MS },
    );
    return r.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.slice(3).trim());
  } catch {
    return [];
  }
}

async function gitBeadCommitCount(cwd: string): Promise<number | undefined> {
  try {
    const r = await execFileAsync(
      "git",
      ["log", "--oneline", "-50"],
      { cwd, timeout: GIT_TIMEOUT_MS },
    );
    const lines = r.stdout.trim().split("\n").filter(Boolean);
    const beadish = lines.filter((l) =>
      /\b(bead|tb-|br-|fw-)/i.test(l),
    );
    return beadish.length > 0 ? beadish.length : lines.length;
  } catch {
    return undefined;
  }
}

function resolveBeadsFromIds(
  all: Awaited<ReturnType<typeof readBeads>>,
  beadIds: string[],
) {
  const byId = new Map(all.map((b) => [b.id, b]));
  const missing = beadIds.filter((id) => !byId.has(id));
  const beads = beadIds
    .map((id) => byId.get(id))
    .filter((b): b is NonNullable<typeof b> => b != null);
  return { beads, missing };
}

function resolveReviewBeadId(
  beadIds: string[],
  reviewBeadId?: string,
): { beadId: string } | { error: string } {
  if (reviewBeadId) {
    if (!beadIds.includes(reviewBeadId)) {
      return {
        error: `reviewBeadId "${reviewBeadId}" is not in this wave (${beadIds.join(", ")}).`,
      };
    }
    return { beadId: reviewBeadId };
  }
  if (beadIds.length === 1) {
    return { beadId: beadIds[0]! };
  }
  return {
    error:
      "Multi-bead wave: pass reviewBeadId when confirmAction is fresh-eyes or self-review.",
  };
}

function reviewDataFromResult(result: McpToolResult): Record<string, unknown> | undefined {
  const reviewData = (
    result.structuredContent as { data?: Record<string, unknown> } | undefined
  )?.data;
  if (!reviewData) return undefined;
  const { kind, ...reviewRest } = reviewData;
  return { kind, ...reviewRest };
}

type WaveReviewConfirmArgs = WaveReviewGateArgs & {
  confirmAction: WaveReviewConfirmAction;
};

async function recordWaveReviewSteering(
  ctx: ToolContext,
  args: WaveReviewConfirmArgs,
): Promise<number> {
  return recordGateSteering(ctx, {
    source: "wave_review",
    actionId: args.confirmAction,
    beadIds: args.beadIds,
  });
}

async function handleLooksGoodAll(
  ctx: ToolContext,
  args: WaveReviewConfirmArgs,
): Promise<McpToolResult> {
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
  await ctx.saveState(ctx.state);
  const epoch = getCoordinatorEpoch(ctx.state);
  const reviewRest = reviewDataFromResult(reviewResult);
  return makeOkToolResult(
    "flywheel_wave_review_gate",
    state.phase,
    [
      `Wave review accepted: closed ${beadIds.length} bead(s) (epoch ${epoch}).`,
      reviewResult.content[0]?.text ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      kind: "wave_review_confirmed",
      confirmAction,
      coordinatorEpoch: epoch,
      beadIds,
      closedBeadIds: beadIds,
      reviewOutcome: reviewRest,
    },
  );
}

async function handleFreshEyes(
  ctx: ToolContext,
  args: WaveReviewConfirmArgs,
): Promise<McpToolResult> {
  const { cwd, state } = ctx;
  const { confirmAction, beadIds } = args;
  const resolved = resolveReviewBeadId(beadIds, args.reviewBeadId);
  if ("error" in resolved) {
    return makeToolError(
      "flywheel_wave_review_gate",
      state.phase,
      "invalid_input",
      resolved.error,
    );
  }
  const epoch = await recordWaveReviewSteering(ctx, args);
  const reviewResult = await runReview(ctx, {
    cwd,
    beadId: resolved.beadId,
    action: "hit-me",
  });
  if (reviewResult.isError) {
    return reviewResult;
  }
  return makeOkToolResult(
    "flywheel_wave_review_gate",
    state.phase,
    [
      `Fresh-eyes review dispatched for ${resolved.beadId} (epoch ${epoch}).`,
      "Spawn parallel review Tasks from reviewOutcome.agentTasks, then flywheel_review looks-good per bead.",
      reviewResult.content[0]?.text ?? "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    {
      kind: "wave_review_confirmed",
      confirmAction,
      coordinatorEpoch: epoch,
      beadIds,
      reviewBeadId: resolved.beadId,
      reviewOutcome: reviewDataFromResult(reviewResult),
    },
  );
}

async function handleSelfReview(
  ctx: ToolContext,
  args: WaveReviewConfirmArgs,
): Promise<McpToolResult> {
  const { state } = ctx;
  const { confirmAction, beadIds } = args;
  const resolved = resolveReviewBeadId(beadIds, args.reviewBeadId);
  if ("error" in resolved) {
    return makeToolError(
      "flywheel_wave_review_gate",
      state.phase,
      "invalid_input",
      resolved.error,
    );
  }
  const epoch = await recordWaveReviewSteering(ctx, args);
  const beadId = resolved.beadId;
  return makeOkToolResult(
    "flywheel_wave_review_gate",
    state.phase,
    [
      `Self-review routed for ${beadId} (epoch ${epoch}).`,
      "Delegate diff audit to the original implementor (Agent Mail / same Task identity).",
      'After the self-review report arrives, call flywheel_review({ action: "looks-good", beadId }).',
    ].join("\n"),
    {
      kind: "wave_review_confirmed",
      confirmAction,
      coordinatorEpoch: epoch,
      beadIds,
      reviewBeadId: beadId,
      selfReviewPlaybook: [
        `## Self-review — ${beadId}`,
        "",
        "1. Resolve the implementor identity (Agent Mail inbox / impl Task metadata).",
        `2. Ask them to re-read their diff for bead ${beadId} (bugs, missing tests, style).`,
        "3. Wait for the [review] self-review report before closing the bead.",
        `4. Then: flywheel_review({ cwd, beadId: "${beadId}", action: "looks-good" }).`,
        "",
        "Cursor port: if no live implementor, coordinator runs a focused diff review on that bead's files only.",
      ].join("\n"),
    },
  );
}

async function handleDuelReview(
  ctx: ToolContext,
  args: WaveReviewConfirmArgs,
): Promise<McpToolResult> {
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
  } catch {
    // fall back to full wave list
  }
  const targets = riskyIds.length > 0 ? riskyIds : beadIds;
  const epoch = await recordWaveReviewSteering(ctx, args);
  return makeOkToolResult(
    "flywheel_wave_review_gate",
    state.phase,
    [
      `Duel review routed for ${targets.join(", ")} (epoch ${epoch}).`,
      "Invoke flywheel_duel or /dueling-idea-wizards per skills/start/_review.md §8.0a.",
    ].join("\n"),
    {
      kind: "wave_review_confirmed",
      confirmAction,
      coordinatorEpoch: epoch,
      beadIds,
      riskyBeadIds: targets,
      duelReviewPlaybook: [
        "## Duel review (risky beads)",
        "",
        `Targets: ${targets.join(", ")}`,
        "",
        '1. Call flywheel_duel({ cwd, focus: "adversarial review of closed bead implementation" })',
        "   OR load agent-flywheel:flywheel-duel and run security vs reliability wizards.",
        "2. Synthesize findings into follow-up beads or flywheel_review hit-me on the target bead.",
      ].join("\n"),
    },
  );
}

async function confirmWaveReviewAction(
  ctx: ToolContext,
  args: WaveReviewConfirmArgs,
): Promise<McpToolResult> {
  const { state } = ctx;
  const { confirmAction } = args;

  switch (confirmAction) {
    case "looks-good-all":
      return handleLooksGoodAll(ctx, args);
    case "fresh-eyes":
      return handleFreshEyes(ctx, args);
    case "self-review":
      return handleSelfReview(ctx, args);
    case "duel-review":
      return handleDuelReview(ctx, args);
    default: {
      const _: never = confirmAction;
      return makeToolError(
        "flywheel_wave_review_gate",
        state.phase,
        "unsupported_action",
        `Unsupported wave review confirmAction: ${String(_)}`,
      );
    }
  }
}

function waveReviewEmptyBeadIdsError(ctx: ToolContext): McpToolResult {
  return makeToolError(
    "flywheel_wave_review_gate",
    ctx.state.phase,
    "invalid_input",
    "beadIds must be a non-empty array of beads that finished in this wave.",
  );
}

export async function runWaveReviewGate(
  ctx: ToolContext,
  args: WaveReviewGateArgs,
): Promise<McpToolResult> {
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
    return waveReviewEmptyBeadIdsError(ctx);
  }

  let allBeads;
  try {
    allBeads = await readBeads(exec, cwd);
  } catch (err: unknown) {
    return makeToolError(
      "flywheel_wave_review_gate",
      state.phase,
      "cli_failure",
      `Could not read beads: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const { beads, missing } = resolveBeadsFromIds(allBeads, args.beadIds);
  if (missing.length > 0) {
    return makeToolError(
      "flywheel_wave_review_gate",
      state.phase,
      "invalid_input",
      `Unknown bead id(s): ${missing.join(", ")}`,
    );
  }

  const gate = buildWaveReviewGate(beads, state);
  const outcome: WaveReviewGateOutcome = toCompactGatePayload(gate);

  return makeOkToolResult(
    "flywheel_wave_review_gate",
    state.phase,
    gateResultText("flywheel_wave_review_gate", outcome),
    outcome,
  );
}

export async function runBeadApprovalGate(
  ctx: ToolContext,
  args: BeadApprovalGateArgs,
): Promise<McpToolResult> {
  const { state, saveState } = ctx;
  const step: BeadApprovalStep = args.step ?? "review";

  if (step === "coverage") {
    const covered = args.coveredSections ?? 0;
    const total = args.totalSections ?? 0;
    const gate = buildBeadCoverageGate({
      covered,
      total,
      missingSections: args.missingSections ?? [],
    });
    const outcome = toCompactGatePayload(gate);
    return makeOkToolResult(
      "flywheel_bead_approval_gate",
      state.phase,
      gateResultText("flywheel_bead_approval_gate", outcome),
      { ...outcome, step },
    );
  }

  if (step === "dedup") {
    const gate = buildBeadDedupGate(args.overlapPairs ?? 0);
    const outcome = toCompactGatePayload(gate);
    return makeOkToolResult(
      "flywheel_bead_approval_gate",
      state.phase,
      gateResultText("flywheel_bead_approval_gate", outcome),
      { ...outcome, step },
    );
  }

  const loaded = await loadOpenBeadsForGate(ctx);
  if (!loaded.ok) {
    return makeToolError(
      "flywheel_bead_approval_gate",
      state.phase,
      loaded.code,
      loaded.message,
    );
  }

  if (loaded.beads.length === 0) {
    return makeToolError(
      "flywheel_bead_approval_gate",
      state.phase,
      "missing_prerequisite",
      "No open beads found. Create beads with br create, then call flywheel_bead_approval_gate again.",
      { hint: "Run Step 5.5 br create / br dep add first." },
    );
  }

  state.activeBeadIds = loaded.beads.map((b) => b.id);
  if (
    state.phase !== "refining_beads" &&
    state.phase !== "implementing"
  ) {
    state.phase = "awaiting_bead_approval";
  }
  saveState(state);

  const metrics = computeBeadApprovalMetrics(state, loaded.beads);

  if (step === "review") {
    const gate = buildBeadReviewGate(metrics.beadCount);
    const outcome = toCompactGatePayload(gate);
    return makeOkToolResult(
      "flywheel_bead_approval_gate",
      state.phase,
      [
        gateResultText("flywheel_bead_approval_gate", outcome),
        formatQualityLine(metrics),
        "On Start → re-call with step=launch (do not approve start yet).",
      ].join("\n"),
      {
        ...outcome,
        step,
        quality: { score: metrics.quality.score, summary: metrics.quality },
      },
    );
  }

  // step === "launch" — score + pick launch / low-quality / hotspot gate
  const weakSummary =
    metrics.quality.weakBeads.length > 0
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
          convergencePct:
            metrics.convergenceScore != null
              ? metrics.convergenceScore * 100
              : undefined,
        });

  const outcome = toCompactGatePayload(gate);
  return makeOkToolResult(
    "flywheel_bead_approval_gate",
    state.phase,
    [
      gateResultText("flywheel_bead_approval_gate", outcome),
      formatQualityLine(metrics),
      metrics.offerCoordinatorSerial ? metrics.hotspotSummary : "",
    ]
      .filter(Boolean)
      .join("\n"),
    {
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
    },
  );
}

export async function runWrapUpGate(
  ctx: ToolContext,
  args: WrapUpGateArgs,
): Promise<McpToolResult> {
  const { cwd, state, saveState } = ctx;

  if (state.wrapUpConfirmed && !args.force) {
    const gate = buildWrapUpGate({
      uncommittedCount: 0,
      uncommittedPreview: [],
    });
    return makeOkToolResult(
      "flywheel_wrap_up_gate",
      state.phase,
      "Wrap-up already confirmed. flywheel_get_skill(agent-flywheel:start_wrapup) only if needed; pass force=true to re-prompt.",
      { ...toCompactGatePayload(gate), wrapUpConfirmed: true },
    );
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
    return makeOkToolResult(
      "flywheel_wrap_up_gate",
      state.phase,
      [
        `Wrap-up path confirmed: ${args.confirmWrapUp}.`,
        "Map actions via flywheel_get_skill(agent-flywheel:start_wrapup) if needed.",
        "Sub-gates: AskQuestion only — no commit prompts in prose.",
      ].join("\n"),
      { ...toCompactGatePayload(gate), wrapUpConfirmed: true },
    );
  }

  const outcome: WrapUpGateOutcome = toCompactGatePayload(gate);

  return makeOkToolResult(
    "flywheel_wrap_up_gate",
    state.phase,
    gateResultText("flywheel_wrap_up_gate", outcome),
    outcome,
  );
}
