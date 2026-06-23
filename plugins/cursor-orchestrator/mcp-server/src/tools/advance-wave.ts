import type { McpToolResult, ToolContext, AdvanceWaveArgs, Bead, CoordinatorNextActionHint } from '../types.js';
import type { VerifyBeadsOutcome } from './verify-beads.js';
import { runVerifyBeads } from './verify-beads.js';
import { readyBeads } from '../beads.js';
import { recommendComposition } from '../swarm.js';
import { classifyBeadComplexity, type BeadComplexity } from '../model-routing.js';
import { allocateAgentNames } from '../adapters/agent-names.js';
import { adaptPromptForClaude } from '../adapters/claude-prompt.js';
import { adaptPromptForCodex } from '../adapters/codex-prompt.js';
import { adaptPromptForGemini } from '../adapters/gemini-prompt.js';
import type { BeadDispatchContext, AdaptedPrompt } from '../adapters/codex-prompt.js';
import { makeOkToolResult, makeToolError } from './shared.js';
import { classifyExecError } from '../errors.js';
import { persistCoordinatorEpochBump, getCoordinatorEpoch } from '../coordinator-epoch.js';
import { createLogger } from '../logger.js';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readCheckpoint } from '../checkpoint.js';
import {
  readConvergenceFromDisk,
  planSlugFromIdentifier,
} from './convergence-tool.js';
import { loadFlywheelConfig } from '../flywheel-config.js';
import { countCommitsSinceLastBatchReview, resolveCommitBatchThreshold, shouldTriggerBatchReview } from '../commit-batch.js';
import {
  adaptPromptForCursor,
  buildBeadDispatchContext,
  buildCursorImplSpawnInstructions,
  buildImplModelsGate,
  formatCursorImplModelTable,
  recommendImplModels,
  modelForComplexity,
  resolveImplModelsConfirm,
  useNtmImplBackend,
  type ImplModelsGate,
} from '../cursor-implement-swarm.js';
import {
  AGENT_MAIL_SWARM_HINT,
  formatWaveHotspotWarnings,
  resolveCursorCoordinationMode,
} from '../coordination-mode.js';
import { areNextActionHintsEnabled, areAutoBatchReviewEnabled, isFinalBatchReviewOnDrain } from '../flywheel-config.js';
import { buildQueueDrainedHint, buildWaveCompleteHint } from '../next-action-hint.js';

const log = createLogger('advance-wave');
const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 5_000;

const LANES = ['cc', 'cod', 'gem'] as const;
type Lane = typeof LANES[number];

const LANE_ADAPTERS: Record<Lane, (ctx: BeadDispatchContext) => AdaptedPrompt> = {
  cc: adaptPromptForClaude,
  cod: adaptPromptForCodex,
  gem: adaptPromptForGemini,
};

export type AdvanceWavePrompt = {
  beadId: string;
  lane: Lane;
  prompt: string;
  /** Bead complexity used for model routing (Cursor backend). */
  complexity?: BeadComplexity;
  /** Cursor Task `model` when spawnBackend is cursor-task. */
  model?: string;
  spawnWith?: 'cursor-task';
};

export interface AdvanceWaveOutcome {
  verification: VerifyBeadsOutcome;
  nextWave: {
    beadIds: string[];
    prompts: AdvanceWavePrompt[];
    complexity: Record<string, BeadComplexity>;
    /** How the coordinator should fan out implement agents. */
    spawnBackend?: 'cursor-task' | 'ntm-lanes';
    /** Confirmed models for this run (Cursor backend). */
    implModels?: { simple: string; medium: string; complex: string };
    /** Spawn instructions for the coordinator (Cursor backend). */
    spawnInstructions?: string;
    /** Cursor swarm coordination mode (single-branch + Agent Mail). */
    executionMode?: 'single-branch';
  } | null;
  /**
   * One-time gate: operator must confirm implement models before the first
   * next-wave dispatch. Re-call with `confirmImplModels` after the user replies.
   */
  implModelsGate?: ImplModelsGate;
  waveComplete: boolean;
  /**
   * Stage 1 attestation rollout flag. `true` when one or more closed beads
   * have missing or invalid completion attestation AND the
   * `FW_ATTESTATION_REQUIRED` env var is NOT set. Surfaces the warning to
   * the caller without blocking advance.
   *
   * When `FW_ATTESTATION_REQUIRED=1`, missing/invalid evidence becomes a
   * hard error (`attestation_missing` / `attestation_invalid`) instead.
   */
  needsEvidence: boolean;
  /**
   * Convergence-driven auto-approve recommendation (B-AC2 §12.4).
   *
   * `armed: true` when the active plan's convergence score ≥ 0.90 AND the
   * `flywheel.config.yaml > convergence.gate_advance_wave` kill-switch is on.
   * Per README §Design Philosophy #3 the *decision* is still the operator's
   * — this only surfaces a "Recommended" label for the next-wave question.
   * Never silent advancement.
   */
  convergence?: {
    armed: boolean;
    score: number | null;
    status: string | null;
    reason:
      | 'auto_approve_recommended'
      | 'below_threshold'
      | 'no_state'
      | 'kill_switch_off'
      | 'no_active_plan';
  };
  /**
   * v3.17.0 fresh-eyes auto-trigger (plan
   * `docs/plans/2026-05-13-fresh-eyes-auto-trigger.md`). When set, the
   * coordinator MUST dispatch a fresh-eyes review over `lastBaselineSha..
   * reviewSha` before advancing to the next wave. `nextWave` is `null` in
   * this case and `waveComplete` is `false` — the wave isn't done until
   * the review verdict lands.
   */
  nextStep?:
    | {
        kind: 'batch_review_due';
        /** HEAD sha captured at gate time (dispatch baseline — risk #3). */
        reviewSha: string;
        /** Prior baseline; undefined on the very first batch review of the session. */
        lastBaselineSha?: string;
      }
    | {
        kind: 'wave_review_gate';
        /** Beads that just closed in the wave being advanced. */
        beadIds: string[];
      }
    | {
        kind: 'wrap_up_gate';
      };
  /** Advisory one-line coordinator nudge when queue drains (template v1). */
  nextActionHint?: CoordinatorNextActionHint;
}

function isAttestationRequired(): boolean {
  // Treat any non-empty value besides "0"/"false" as enabled. Empty / unset
  // means warn-only (Stage 1 default — duel-agreed: PI2 reveal-phase
  // concession that hard-blocking on day-one breaks in-flight workflows).
  const v = process.env.FW_ATTESTATION_REQUIRED?.trim().toLowerCase();
  return v != null && v !== '' && v !== '0' && v !== 'false';
}

/** Score threshold for the auto-approve recommendation. */
const AUTO_APPROVE_SCORE = 0.9;

/**
 * Compute the convergence-recommendation block for an advance-wave outcome.
 * Best-effort + side-effect-free: any I/O failure degrades to a "no_state"
 * outcome rather than failing the whole call (matches the observe pattern).
 */
async function computeConvergenceRecommendation(
  cwd: string,
): Promise<NonNullable<AdvanceWaveOutcome['convergence']>> {
  let killSwitchOn = true;
  try {
    killSwitchOn = loadFlywheelConfig(cwd).convergence.gate_advance_wave;
  } catch {
    killSwitchOn = true;
  }
  if (!killSwitchOn) {
    return { armed: false, score: null, status: null, reason: 'kill_switch_off' };
  }
  let planDocument: string | undefined;
  try {
    const cp = readCheckpoint(cwd);
    planDocument = cp?.envelope.state.planDocument;
  } catch {
    /* no-op */
  }
  if (!planDocument) {
    return { armed: false, score: null, status: null, reason: 'no_active_plan' };
  }
  const slug = planSlugFromIdentifier(planDocument);
  let result;
  try {
    result = await readConvergenceFromDisk(cwd, slug);
  } catch {
    return { armed: false, score: null, status: null, reason: 'no_state' };
  }
  if (result.status !== 'ok') {
    return { armed: false, score: null, status: null, reason: 'no_state' };
  }
  const { state } = result.data;
  if (state.score >= AUTO_APPROVE_SCORE && state.status === 'converged') {
    return {
      armed: true,
      score: state.score,
      status: state.status,
      reason: 'auto_approve_recommended',
    };
  }
  return {
    armed: false,
    score: state.score,
    status: state.status,
    reason: 'below_threshold',
  };
}

function okResult(phase: string, text: string, data: AdvanceWaveOutcome): McpToolResult {
  return makeOkToolResult('flywheel_advance_wave', phase, text, data);
}

function beadToDispatchContext(
  bead: Bead,
  complexity: BeadComplexity,
  agentName: string,
  coordinatorName: string,
  projectKey: string,
): BeadDispatchContext {
  return buildBeadDispatchContext(
    bead,
    complexity,
    agentName,
    coordinatorName,
    projectKey,
  );
}

export async function runAdvanceWave(
  ctx: ToolContext,
  args: AdvanceWaveArgs,
): Promise<McpToolResult> {
  const { exec, cwd, state, saveState, signal } = ctx;

  if (!Array.isArray(args.closedBeadIds) || args.closedBeadIds.length === 0) {
    return makeToolError(
      'flywheel_advance_wave',
      state.phase,
      'invalid_input',
      'Error: closedBeadIds must be a non-empty array of bead IDs from the completed wave.',
      { hint: 'Pass closedBeadIds as a non-empty string array — the wave of beads to verify before advancing.' },
    );
  }

  // E2: user steering via advance_wave invalidates in-flight coordinator work
  await persistCoordinatorEpochBump(ctx);

  // Step 1: verify the completed wave
  const verifyResult = await runVerifyBeads(ctx, { cwd, beadIds: args.closedBeadIds });
  const verification = (verifyResult.structuredContent as any)?.data as VerifyBeadsOutcome | undefined;

  if (!verification || verifyResult.isError) {
    return verifyResult;
  }

  const convergenceRec = await computeConvergenceRecommendation(cwd);

  if (verification.unclosedNoCommit.length > 0) {
    const stragglerIds = verification.unclosedNoCommit.map((s) => s.id);
    const outcome: AdvanceWaveOutcome = {
      verification,
      nextWave: null,
      waveComplete: false,
      needsEvidence: false,
      convergence: convergenceRec,
    };
    const lines = [
      `Wave incomplete: ${verification.unclosedNoCommit.length} bead(s) still open without commits.`,
      ...stragglerIds.map((id) => `  - ${id}`),
      'Resolve these before advancing to the next wave.',
    ];
    return okResult(state.phase, lines.join('\n'), outcome);
  }

  // Step 1.5: attestation gate (Stage 1 — warn-only by default).
  // `FW_ATTESTATION_REQUIRED=1` flips to hard-block.
  const required = isAttestationRequired();
  if (verification.invalidEvidence.length > 0 && required) {
    const ids = verification.invalidEvidence.map((e) => e.beadId);
    const summary = verification.invalidEvidence
      .map((e) => `${e.beadId}: ${e.code}`)
      .join('; ');
    return makeToolError(
      'flywheel_advance_wave',
      state.phase,
      'attestation_invalid',
      `Cannot advance wave — ${verification.invalidEvidence.length} bead(s) have invalid completion attestation: ${summary}`,
      {
        hint: 'Re-read the offending CompletionReport JSON, fix the schema or invariant violation (e.g. status=closed without beadClosedVerified=true), and rewrite the file before re-invoking flywheel_advance_wave.',
        details: { beadIds: ids, invalidEvidence: verification.invalidEvidence },
      },
    );
  }
  if (verification.missingEvidence.length > 0 && required) {
    return makeToolError(
      'flywheel_advance_wave',
      state.phase,
      'attestation_missing',
      `Cannot advance wave — ${verification.missingEvidence.length} closed bead(s) missing completion attestation: ${verification.missingEvidence.join(', ')}`,
      {
        hint: 'Each closed bead must have a `.pi-flywheel/completion/<beadId>.json` file matching CompletionReportSchemaV1. Have the implementor write the report (see mcp-server/src/completion-report.ts) before re-invoking.',
        details: { beadIds: verification.missingEvidence },
      },
    );
  }
  const needsEvidence =
    !required &&
    (verification.missingEvidence.length > 0 || verification.invalidEvidence.length > 0);

  // Step 1.6: batch-review gate (v3.17.0 fresh-eyes auto-trigger).
  // Compute commits LIVE via git rev-list (not from a stored counter — that
  // field was deprecated after self-review surfaced gaps W5a/W5b: nothing
  // wrote to `state.commitBatchCounter`, so the gate could never fire). When
  // the live count has crossed `commitBatchThreshold`, preempt the next-wave
  // dispatch and surface a `batch_review_due` nextStep. The coordinator runs
  // the review over `lastBatchReviewSha..HEAD`, persists the verdict, and
  // only then re-invokes `flywheel_advance_wave` — by which time the baseline
  // has advanced and the gate naturally re-arms.
  const batchThreshold = resolveCommitBatchThreshold(cwd, state);
  let commitsSinceBaseline = 0;
  if (batchThreshold > 0) {
    try {
      commitsSinceBaseline = await countCommitsSinceLastBatchReview(
        cwd,
        state.lastBatchReviewSha,
      );
    } catch (err: unknown) {
      log.warn('batch-review gate: countCommitsSinceLastBatchReview failed; skipping gate', {
        err: err instanceof Error ? err.message : String(err),
      });
      commitsSinceBaseline = 0;
    }
  }
  if (shouldTriggerBatchReview(batchThreshold, commitsSinceBaseline)) {
    let reviewSha: string;
    try {
      const r = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd,
        timeout: GIT_TIMEOUT_MS,
      });
      reviewSha = r.stdout.trim();
    } catch (err: unknown) {
      log.warn('batch-review gate: git rev-parse HEAD failed; skipping gate', {
        err: err instanceof Error ? err.message : String(err),
      });
      reviewSha = '';
    }
    if (reviewSha) {
      const outcome: AdvanceWaveOutcome = {
        verification,
        nextWave: null,
        waveComplete: false,
        needsEvidence,
        convergence: convergenceRec,
        nextStep: {
          kind: 'batch_review_due',
          reviewSha,
          lastBaselineSha: state.lastBatchReviewSha,
        },
      };
      const threshold = batchThreshold;
      const rangeLabel = state.lastBatchReviewSha
        ? `${state.lastBatchReviewSha.slice(0, 7)}..${reviewSha.slice(0, 7)}`
        : `(initial)..${reviewSha.slice(0, 7)}`;
      const text = [
        `Wave verified (${verification.verified.length}/${args.closedBeadIds.length} closed).`,
        `Batch-review threshold crossed: ${commitsSinceBaseline} ≥ ${threshold} commits since last baseline.`,
        `Dispatch fresh-eyes review over ${rangeLabel} before the next wave.`,
      ].join('\n');
      return okResult(state.phase, text, outcome);
    }
  }

  // Step 2: get ready beads for the next wave
  let ready: Bead[];
  try {
    ready = await readyBeads(exec, cwd);
  } catch (err: unknown) {
    const classified = classifyExecError(err);
    log.error('readyBeads threw', { err: String(err), code: classified.code });
    return makeToolError(
      'flywheel_advance_wave',
      state.phase,
      classified.code,
      `Error reading next frontier: ${classified.cause}`,
      {
        retryable: classified.retryable,
        hint: 'Check that br CLI is installed and operational, then retry.',
      },
    );
  }

  if (ready.length === 0) {
    const generationEpoch = getCoordinatorEpoch(state);
    const autoBatch = areAutoBatchReviewEnabled(cwd);

    if (autoBatch) {
      if (batchThreshold > 0) {
        const needsBatchReview =
          shouldTriggerBatchReview(batchThreshold, commitsSinceBaseline) ||
          (isFinalBatchReviewOnDrain(cwd) && commitsSinceBaseline > 0);

        if (needsBatchReview) {
          let reviewSha = '';
          try {
            const r = await execFileAsync('git', ['rev-parse', 'HEAD'], {
              cwd,
              timeout: GIT_TIMEOUT_MS,
            });
            reviewSha = r.stdout.trim();
          } catch (err: unknown) {
            log.warn('batch-review drain: git rev-parse HEAD failed; skipping gate', {
              err: err instanceof Error ? err.message : String(err),
            });
          }
          if (reviewSha) {
            const rangeLabel = state.lastBatchReviewSha
              ? `${state.lastBatchReviewSha.slice(0, 7)}..${reviewSha.slice(0, 7)}`
              : `(initial)..${reviewSha.slice(0, 7)}`;
            const outcome: AdvanceWaveOutcome = {
              verification,
              nextWave: null,
              waveComplete: false,
              needsEvidence,
              convergence: convergenceRec,
              nextStep: {
                kind: 'batch_review_due',
                reviewSha,
                lastBaselineSha: state.lastBatchReviewSha,
              },
            };
            const text = [
              `Wave verified (${verification.verified.length}/${args.closedBeadIds.length} closed). Queue drained.`,
              commitsSinceBaseline >= batchThreshold
                ? `Batch-review threshold crossed: ${commitsSinceBaseline} ≥ ${batchThreshold} commits since last baseline.`
                : `Final batch review (${commitsSinceBaseline} commit(s) since baseline).`,
              `Dispatch fresh-eyes review over ${rangeLabel}, then flywheel_wrap_up_gate.`,
            ].join('\n');
            return okResult(state.phase, text, outcome);
          }
        }
      }

      const outcome: AdvanceWaveOutcome = {
        verification,
        nextWave: null,
        waveComplete: true,
        needsEvidence,
        convergence: convergenceRec,
        nextStep: { kind: 'wrap_up_gate' },
        ...(areNextActionHintsEnabled(cwd)
          ? {
              nextActionHint: buildQueueDrainedHint(
                generationEpoch,
                commitsSinceBaseline,
                batchThreshold,
              ),
            }
          : {}),
      };
      return okResult(
        state.phase,
        [
          `Wave verified (${verification.verified.length}/${args.closedBeadIds.length} closed). Queue drained — no pending commits for batch review.`,
          '',
          '**NEXT (MANDATORY):** `flywheel_wrap_up_gate({ cwd })` — present wrap-up menu.',
        ].join('\n'),
        outcome,
      );
    }

    const outcome: AdvanceWaveOutcome = {
      verification,
      nextWave: null,
      waveComplete: true,
      needsEvidence,
      convergence: convergenceRec,
      nextStep: {
        kind: 'wave_review_gate',
        beadIds: args.closedBeadIds,
      },
      ...(areNextActionHintsEnabled(cwd)
        ? {
            nextActionHint: buildWaveCompleteHint(
              generationEpoch,
              args.closedBeadIds,
              { autoBatchReview: false },
            ),
          }
        : {}),
    };
    const closedList = args.closedBeadIds.join(', ');
    return okResult(
      state.phase,
      [
        `Wave verified (${verification.verified.length}/${args.closedBeadIds.length} closed). Queue drained — no more beads to dispatch.`,
        '',
        '**NEXT (MANDATORY):** `flywheel_wave_review_gate({ cwd, beadIds: [...] })` — present Step 8 review menu for this wave.',
        `Bead IDs from this advance call: ${closedList}`,
        'After review, when the queue is empty: `flywheel_wrap_up_gate({ cwd })` — not ad-hoc "want to commit?" prompts.',
      ].join('\n'),
      outcome,
    );
  }

  const cursorBackend = !useNtmImplBackend();

  // Step 3: determine wave size from composition tier (needed before model gate copy)
  const composition = recommendComposition(ready.length);
  const maxWave = args.maxNextWave ?? composition.total;
  const waveCandidates = ready.slice(0, maxWave);

  if (args.confirmImplModels !== undefined) {
    const resolved = resolveImplModelsConfirm(
      cwd,
      args.confirmImplModels,
      ready,
    );
    state.implModels = resolved;
    state.implModelsConfirmed = true;
    saveState(state);
  }

  if (
    cursorBackend &&
    !state.implModelsConfirmed &&
    !args.skipImplModelsGate &&
    args.confirmImplModels === undefined
  ) {
    const gate = buildImplModelsGate(cwd, ready);
    const outcome: AdvanceWaveOutcome = {
      verification,
      nextWave: null,
      waveComplete: false,
      needsEvidence,
      convergence: convergenceRec,
      implModelsGate: gate,
    };
    const text = [
      `Wave verified (${verification.verified.length}/${args.closedBeadIds.length} closed).`,
      'Before dispatching the next wave, recommend implement models and let the user choose.',
      '',
      `**Recommendation:** ${gate.rationale}`,
      '',
      formatCursorImplModelTable(gate.recommended),
      '',
      '(Config baseline for reference:)',
      formatCursorImplModelTable(gate.defaults),
      '',
      'Explain the recommendation, present implModelsGate.options as numbered choices, wait for the user, then re-call flywheel_advance_wave with confirmImplModels (use "recommended" if they accept option 1).',
    ].join('\n');
    return okResult(state.phase, text, outcome);
  }

  const implModels =
    state.implModels ??
    (cursorBackend ? recommendImplModels(cwd, ready).models : undefined);

  if (cursorBackend) {
    const coord = await resolveCursorCoordinationMode(exec, cwd, state, { signal });
    if (!coord.ok) {
      return makeToolError(
        'flywheel_advance_wave',
        state.phase,
        'agent_mail_unreachable',
        coord.reason,
        {
          hint: AGENT_MAIL_SWARM_HINT,
          details: { warning: coord.warning },
          retryable: true,
        },
      );
    }
    saveState(state);
  }

  const hotspotWarnings = cursorBackend
    ? formatWaveHotspotWarnings(waveCandidates)
    : [];

  // Step 4: classify complexity + allocate names
  const complexityMap: Record<string, BeadComplexity> = {};
  for (const bead of waveCandidates) {
    complexityMap[bead.id] = classifyBeadComplexity(bead).complexity;
  }

  const projectKey = cwd;
  const coordinatorName = 'Coordinator';
  const agentNames = allocateAgentNames(waveCandidates.length, projectKey);

  // Step 5: render prompts (Cursor Task per complexity, or legacy cc/cod/gem lanes)
  const prompts: AdvanceWavePrompt[] = [];
  for (let i = 0; i < waveCandidates.length; i++) {
    const bead = waveCandidates[i];
    const complexity = complexityMap[bead.id];
    const lane = LANES[i % LANES.length];
    const dispatchCtx = beadToDispatchContext(
      bead,
      complexity,
      agentNames[i],
      coordinatorName,
      projectKey,
    );
    if (cursorBackend && implModels) {
      const taskModel = modelForComplexity(implModels, complexity);
      const adapted = adaptPromptForCursor(dispatchCtx, taskModel, 'single-branch');
      prompts.push({
        beadId: bead.id,
        lane,
        prompt: adapted.prompt,
        complexity,
        model: taskModel,
        spawnWith: 'cursor-task',
      });
    } else {
      const adapted = LANE_ADAPTERS[lane](dispatchCtx);
      prompts.push({ beadId: bead.id, lane, prompt: adapted.prompt, complexity });
    }
  }

  const outcome: AdvanceWaveOutcome = {
    verification,
    nextWave: {
      beadIds: waveCandidates.map((b) => b.id),
      prompts,
      complexity: complexityMap,
      ...(cursorBackend && implModels
        ? {
            spawnBackend: 'cursor-task' as const,
            implModels,
            executionMode: 'single-branch' as const,
            spawnInstructions: buildCursorImplSpawnInstructions(implModels, cwd, {
              executionMode: 'single-branch',
              hotspotWarnings,
            }),
          }
        : { spawnBackend: 'ntm-lanes' as const }),
    },
    waveComplete: true,
    needsEvidence,
    convergence: convergenceRec,
  };

  const lines = [
    `Wave verified (${verification.verified.length}/${args.closedBeadIds.length} closed).`,
  ];
  if (needsEvidence) {
    if (verification.missingEvidence.length > 0) {
      lines.push(`⚠️  ${verification.missingEvidence.length} bead(s) advanced without completion attestation (Stage 1 warn-only — set FW_ATTESTATION_REQUIRED=1 to block).`);
    }
    if (verification.invalidEvidence.length > 0) {
      lines.push(`⚠️  ${verification.invalidEvidence.length} bead(s) advanced with invalid completion attestation (Stage 1 warn-only — set FW_ATTESTATION_REQUIRED=1 to block).`);
    }
  }
  if (convergenceRec.armed && convergenceRec.score !== null) {
    lines.push(
      `Convergence: score=${convergenceRec.score.toFixed(2)} (${convergenceRec.status}) — auto-approve recommended for the next-wave AskUserQuestion (operator still picks; never silent).`,
    );
  } else if (convergenceRec.reason === 'kill_switch_off') {
    lines.push(
      'Convergence gating disabled (flywheel.config.yaml > convergence.gate_advance_wave=false).',
    );
  } else if (convergenceRec.score !== null) {
    lines.push(
      `Convergence: score=${convergenceRec.score.toFixed(2)} (${convergenceRec.status}) — below auto-approve threshold; operator picks normally.`,
    );
  }
  if (cursorBackend && implModels) {
    lines.push(
      `Next wave: ${waveCandidates.length} bead(s) — Cursor Task spawn on shared branch (models: simple=${implModels.simple}, medium=${implModels.medium}, complex=${implModels.complex}).`,
    );
    if (hotspotWarnings.length > 0) {
      lines.push('', '**Hotspot warnings (shared files in this wave):**', ...hotspotWarnings);
    }
    lines.push(
      ...waveCandidates.map((b, i) => {
        const cls = classifyBeadComplexity(b);
        return `  - ${b.id} → model ${prompts[i].model} (${complexityMap[b.id]}; ${cls.reason})`;
      }),
    );
  } else {
    lines.push(`Next wave: ${waveCandidates.length} bead(s) dispatched across ${LANES.length} NTM lanes.`);
    lines.push(
      ...waveCandidates.map(
        (b, i) => `  - ${b.id} → ${LANES[i % LANES.length]} (${complexityMap[b.id]})`,
      ),
    );
  }

  return okResult(state.phase, lines.join('\n'), outcome);
}
