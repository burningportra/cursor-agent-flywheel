/**
 * Cursor-native implementation coordinator tick — commit-batch fresh-eyes,
 * wave advance, and ready-bead dispatch hints in one MCP call.
 */

import { promises as fs } from 'node:fs';

import {
  batchReviewVerdictPath,
  buildShaRange,
  prepareBatchReviewDispatch,
  resolveHeadSha,
} from './batch-review-dispatch.js';
import { readyBeads, readBeads } from './beads.js';
import {
  clearPendingBatchReview,
  countCommitsSinceLastBatchReview,
  ensureBatchReviewBaseline,
  markBatchReviewDispatched,
  resolveCommitBatchThreshold,
  shouldTriggerBatchReview,
} from './commit-batch.js';
import {
  adaptPromptForCursor,
  buildCursorImplSpawnInstructions,
  getCursorImplModels,
  modelForComplexity,
} from './cursor-implement-swarm.js';
import {
  buildBatchReviewSynthesizedGate,
  buildImplSupervisionGate,
  buildWaveReviewGate,
  toCompactGatePayload,
  type ImplSupervisionSnapshot,
} from './cursor-user-gates.js';
import { classifyBeadComplexity } from './model-routing.js';
import { getCoordinatorEpoch, persistCoordinatorEpochBump } from './coordinator-epoch.js';
import { THERMO_SUBAGENT_TYPE } from './combined-review-prompt.js';
import { areEpochGuardsEnabled, areNextActionHintsEnabled, loadFlywheelConfigWithWarnings, resolveThermoNuclearModel } from './flywheel-config.js';
import { buildNextActionHint } from './next-action-hint.js';
import { probeProfileStale } from './profile-staleness.js';
import { scheduleProfileAutoRefresh } from './tools/profile.js';
import type { AdvanceWaveOutcome, AdvanceWavePrompt } from './tools/advance-wave.js';
import { runAdvanceWave } from './tools/advance-wave.js';
import { runReview } from './tools/review.js';
import type {
  Bead,
  CompactGatePayload,
  McpToolResult,
  ToolContext,
} from './types.js';
import type { CoordinatorNextActionHint, FlywheelState } from './types.js';

const DEFAULT_TICK_INTERVAL_SEC = 240;
const DEFAULT_REVIEW_MODEL = 'opus-4.6';
const DEFAULT_MAX_PARALLEL = 3;
const STUCK_BEAD_MS = 30 * 60 * 1000;

export interface ImplTickConfig {
  intervalSeconds: number;
  reviewModel: string;
  maxParallelImpl: number;
}

export interface ImplTickArgs {
  cwd: string;
  /** Beads closed since the previous tick — triggers verify + advance_wave when non-empty. */
  closedBeadIds?: string[];
  /** Agent Mail name for inbox probe (optional). */
  coordinatorAgent?: string;
  /** Override / persist commit-batch threshold for this session (0 = disable). */
  commitBatchThreshold?: number;
  /** Trigger commit-batch fresh-eyes review even when below threshold (requires commits since baseline > 0). */
  forceBatchReview?: boolean;
}

export type ImplTickKind =
  | 'monitor'
  | 'batch_review_in_progress'
  | 'batch_review_dispatch'
  | 'batch_review_collect_verdict'
  | 'batch_review_verdict'
  | 'advance_wave'
  | 'dispatch_impl_tasks'
  | 'wave_complete'
  | 'stale';

export interface ImplTickStructured {
  tool: 'flywheel_impl_tick';
  version: 1;
  status: 'ok';
  data: {
    kind: ImplTickKind;
    /** Coordinator generation epoch captured at tick start. */
    epoch: number;
    tickAt: string;
    nextTickInSeconds: number;
    snapshot: {
      headSha: string;
      commitsSinceBaseline: number;
      commitBatchThreshold: number;
      pendingBatchReviewRange?: string;
      readyCount: number;
      inProgressCount: number;
      closedCount: number;
      profileStale: boolean;
    };
    coordinatorPlaybook: string;
    batchReviewTask?: {
      model: string;
      subagent_type: string;
      description: string;
      prompt: string;
      shaRange: string;
      verdictRel: string;
    };
    implTasks?: Array<{
      beadId: string;
      model: string;
      subagent_type: string;
      description: string;
      prompt: string;
    }>;
    advanceWave?: AdvanceWaveOutcome;
    reviewEnvelope?: unknown;
    askQuestion?: CompactGatePayload['askQuestion'];
    gateMeta?: CompactGatePayload['gateMeta'];
    actions?: CompactGatePayload['actions'];
    waveReviewBeadIds?: string[];
    /** Advisory one-line coordinator nudge (template v1). */
    nextActionHint?: CoordinatorNextActionHint;
  };
}

export function resolveImplTickConfig(cwd: string): ImplTickConfig {
  const fromEnvSec = Number(process.env.FW_IMPL_TICK_INTERVAL_SECONDS);
  const fromEnvModel = process.env.FW_IMPL_TICK_REVIEW_MODEL?.trim();
  const fromEnvParallel = Number(process.env.FW_IMPL_TICK_MAX_PARALLEL);

  const { config } = loadFlywheelConfigWithWarnings(cwd);
  const node = config.impl_tick;

  const intervalSeconds =
    Number.isFinite(fromEnvSec) && fromEnvSec >= 60
      ? Math.floor(fromEnvSec)
      : typeof node?.interval_seconds === 'number' && node.interval_seconds >= 60
        ? Math.floor(node.interval_seconds)
        : DEFAULT_TICK_INTERVAL_SEC;

  const reviewModel =
    fromEnvModel ||
    (typeof node?.review_model === 'string' && node.review_model.trim()
      ? node.review_model.trim()
      : DEFAULT_REVIEW_MODEL);

  const maxParallelImpl =
    Number.isFinite(fromEnvParallel) && fromEnvParallel >= 1
      ? Math.min(8, Math.floor(fromEnvParallel))
      : typeof node?.max_parallel_impl === 'number' && node.max_parallel_impl >= 1
        ? Math.min(8, Math.floor(node.max_parallel_impl))
        : DEFAULT_MAX_PARALLEL;

  return { intervalSeconds, reviewModel, maxParallelImpl };
}

export function buildImplTickCoordinatorPlaybook(cfg: ImplTickConfig): string {
  return [
    '## Cursor impl supervision loop (flywheel_impl_tick)',
    '',
    `1. After dispatching a wave, end the turn with: "Re-call \`flywheel_impl_tick({ cwd })\` in ~${cfg.intervalSeconds}s (~${Math.round(cfg.intervalSeconds / 60)} min)."`,
    '2. Each tick: pass `closedBeadIds` for beads that finished since the last tick.',
    '2b. **Epoch check (before any Task spawn):** Read `data.epoch` from the tick response. Confirm it matches checkpoint `coordinatorEpoch` (`flywheel_observe` or same-session state). If `kind: stale` or epochs differ, discard `implTasks` / `batchReviewTask` and re-call `flywheel_impl_tick` — do not spawn.',
    '3. **Scan:** Prefer one line from `data.nextActionHint.text` in chat when present. Hints are **advisory** — follow `data.kind`, gate MCP tools, and `nextStep` for control flow; never skip mandatory gates because a hint exists. When both hint and structured fields exist, verify `nextActionHint.generationEpoch === data.epoch` before acting on the hint.',
    '4. Branch on `data.kind`:',
    '   - `batch_review_dispatch` → epoch check → spawn **one** combined fresh-eyes + thermo-nuclear Task with `data.batchReviewTask` (`subagent_type: thermo-nuclear-code-quality-review`), then tick again (verdict file).',
    '   - `batch_review_in_progress` → wait; do not start another review.',
    '   - `batch_review_collect_verdict` → verdict on disk; tick again (auto-reads via review).',
    '   - `batch_review_verdict` → present `data.askQuestion`; merge synthesized beads into the wave.',
    '   - `advance_wave` → epoch check → spawn `data.implTasks` (stagger ~30s).',
    '   - `dispatch_impl_tasks` → epoch check → first wave or idle capacity; spawn tasks.',
    '   - `wave_complete` → read `nextActionHint` if present → `flywheel_wave_review_gate` → **AskQuestion** → `flywheel_review`.',
    '   - `stale` → epoch mismatch or user steered mid-tick; re-call `flywheel_impl_tick` immediately (do not spawn).',
    '   - `monitor` | `batch_review_in_progress` | `batch_review_dispatch` → **AskQuestion** with `data.askQuestion` (impl supervision menu); map via `data.actions`.',
    '   - `wave_complete` → **AskQuestion** is inlined wave review gate (`data.gateMeta.kind === wave_review`); confirm via `flywheel_wave_review_gate`.',
    '',
    '**Hard rule:** While impl agents run, every tick ends with AskQuestion — never free-text "waiting" or ad-hoc commit prompts.',
    'Arm `/loop` dynamic wake when the user picks impl-supervision-loop.',
    '',
    'Do not echo full `coordinatorPlaybook`, `implTasks[].prompt`, or gate JSON into chat.',
    'Do not use codex/claude CLI for batch review in the Cursor port.',
  ].join('\n');
}

type ImplTickData = ImplTickStructured['data'];
type ImplTickDataInput = Omit<ImplTickData, 'epoch'>;

/**
 * Apply epoch guard before returning task-bearing tick payloads.
 * When epoch drifted mid-tick and guards are enabled, drop spawn specs.
 */
export function finalizeTickPayload(
  epochAtTickStart: number,
  state: FlywheelState,
  payload: ImplTickDataInput,
  epochGuards: boolean,
): ImplTickData {
  const hasSpawnSpecs =
    (payload.implTasks?.length ?? 0) > 0 || payload.batchReviewTask !== undefined;
  const current = getCoordinatorEpoch(state);
  if (epochGuards && current !== epochAtTickStart && hasSpawnSpecs) {
    return {
      kind: 'stale',
      epoch: epochAtTickStart,
      tickAt: payload.tickAt,
      nextTickInSeconds: payload.nextTickInSeconds,
      snapshot: payload.snapshot,
      coordinatorPlaybook: payload.coordinatorPlaybook,
    };
  }
  return { ...payload, epoch: epochAtTickStart };
}

function maybeAttachNextActionHint(
  cwd: string,
  kind: ImplTickKind,
  generationEpoch: number,
  state: FlywheelState,
  opts: { beadIds?: string[]; beadCount?: number },
): CoordinatorNextActionHint | undefined {
  if (!areNextActionHintsEnabled(cwd)) return undefined;
  if (
    kind !== 'wave_complete' &&
    kind !== 'advance_wave' &&
    kind !== 'dispatch_impl_tasks'
  ) {
    return undefined;
  }
  return buildNextActionHint(kind, generationEpoch, { ...opts, state });
}

function buildTickResult(
  epochAtTickStart: number,
  state: FlywheelState,
  epochGuards: boolean,
  text: string,
  payload: ImplTickDataInput,
): { text: string; structured: ImplTickStructured } {
  const data = finalizeTickPayload(epochAtTickStart, state, payload, epochGuards);
  const outText =
    data.kind === 'stale'
      ? [
          'User action invalidated this tick (epoch mismatch); re-call flywheel_impl_tick.',
          `Started at epoch ${epochAtTickStart}, current epoch ${getCoordinatorEpoch(state)}.`,
        ].join('\n')
      : text;
  return {
    text: outText,
    structured: {
      tool: 'flywheel_impl_tick',
      version: 1,
      status: 'ok',
      data,
    },
  };
}

function beadCounts(beads: Awaited<ReturnType<typeof readBeads>>): {
  readyCount: number;
  inProgressCount: number;
  closedCount: number;
} {
  let readyCount = 0;
  let inProgressCount = 0;
  let closedCount = 0;
  for (const b of beads) {
    const s = (b.status ?? '').toLowerCase();
    if (s === 'closed') closedCount++;
    else if (s === 'in_progress') inProgressCount++;
    else if (s === 'open' || s === 'ready') readyCount++;
  }
  return { readyCount, inProgressCount, closedCount };
}

type GateAttachment = Pick<CompactGatePayload, 'askQuestion' | 'actions' | 'gateMeta'>;

function attachGateFields(
  snapshot: ImplSupervisionSnapshot,
): GateAttachment {
  const compact = toCompactGatePayload(buildImplSupervisionGate(snapshot));
  return {
    askQuestion: compact.askQuestion,
    actions: compact.actions,
    gateMeta: compact.gateMeta,
  };
}

function supervisionSnapshot(
  baseSnapshot: ImplTickStructured['data']['snapshot'],
  cfg: ImplTickConfig,
  mode: ImplSupervisionSnapshot['mode'],
  stuckBeadIds?: string[],
): ImplSupervisionSnapshot {
  return {
    headSha: baseSnapshot.headSha,
    commitsSinceBaseline: baseSnapshot.commitsSinceBaseline,
    commitBatchThreshold: baseSnapshot.commitBatchThreshold,
    readyCount: baseSnapshot.readyCount,
    inProgressCount: baseSnapshot.inProgressCount,
    closedCount: baseSnapshot.closedCount,
    pendingBatchReviewRange: baseSnapshot.pendingBatchReviewRange,
    nextTickInSeconds: cfg.intervalSeconds,
    stuckBeadIds,
    mode,
  };
}

function beadsForWaveReview(all: Bead[], ids: string[]): Bead[] {
  const byId = new Map(all.map((b) => [b.id, b]));
  return ids.map(
    (id) =>
      byId.get(id) ?? {
        id,
        title: id,
        description: '',
        status: 'closed',
        priority: 2,
        type: 'task',
        labels: [],
      },
  );
}

function buildImplTasksFromPrompts(
  prompts: AdvanceWavePrompt[],
  maxParallel: number,
): ImplTickStructured['data']['implTasks'] {
  return prompts.slice(0, maxParallel).map((p) => ({
    beadId: p.beadId,
    model: p.model ?? 'composer-2.5',
    subagent_type: 'generalPurpose',
    description: `Impl ${p.beadId}`,
    prompt: p.prompt,
  }));
}

async function verdictFileExists(cwd: string, shaRange: string): Promise<boolean> {
  try {
    await fs.access(batchReviewVerdictPath(cwd, shaRange));
    return true;
  } catch {
    return false;
  }
}

export async function runImplTickCore(
  ctx: ToolContext,
  args: ImplTickArgs,
): Promise<{ text: string; structured: ImplTickStructured }> {
  const { cwd, state, saveState } = ctx;
  const epochAtTickStart = getCoordinatorEpoch(state);
  const epochGuards = areEpochGuardsEnabled(cwd);
  const cfg = resolveImplTickConfig(cwd);
  const thermoReviewModel = resolveThermoNuclearModel(cwd);
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  scheduleProfileAutoRefresh(ctx, config.profile);
  const tickAt = new Date().toISOString();
  state.lastImplTickAt = tickAt;
  await saveState(state);

  const headSha = await resolveHeadSha(cwd, ctx.exec);

  if (
    typeof args.commitBatchThreshold === 'number'
    && Number.isInteger(args.commitBatchThreshold)
    && args.commitBatchThreshold >= 0
  ) {
    state.commitBatchThreshold = args.commitBatchThreshold;
  } else if (state.commitBatchThreshold === undefined) {
    const resolved = resolveCommitBatchThreshold(cwd, state);
    if (resolved > 0) {
      state.commitBatchThreshold = resolved;
    }
  }

  const threshold = resolveCommitBatchThreshold(cwd, state);

  if (threshold > 0) {
    const withBaseline = ensureBatchReviewBaseline(state, headSha);
    if (withBaseline !== state) {
      Object.assign(state, withBaseline);
      await saveState(state);
    }
  }

  let commitsSinceBaseline = 0;
  if (threshold > 0) {
    commitsSinceBaseline = await countCommitsSinceLastBatchReview(
      cwd,
      state.lastBatchReviewSha,
    );
  }

  let beads: Awaited<ReturnType<typeof readBeads>> = [];
  try {
    beads = await readBeads(ctx.exec, cwd);
  } catch {
    beads = [];
  }
  const counts = beadCounts(beads);

  const profileStale = probeProfileStale(cwd, state, config.profile).stale;

  const baseSnapshot = {
    headSha,
    commitsSinceBaseline,
    commitBatchThreshold: threshold,
    pendingBatchReviewRange: state.pendingBatchReviewRange,
    ...counts,
    profileStale,
  };

  const playbook = buildImplTickCoordinatorPlaybook(cfg);

  // ── In-flight batch review ──
  const pendingRange = state.pendingBatchReviewRange;
  if (pendingRange) {
    if (await verdictFileExists(cwd, pendingRange)) {
      const reviewResult = await runReview(ctx, {
        cwd,
        beadId: 'batch-review',
        action: 'batch_review',
        shaRange: pendingRange,
      });
      const sc = reviewResult.structuredContent as { data?: { kind?: string; verdict?: { status?: string }; nextStep?: { kind?: string; beadIds?: string[] } } } | undefined;
      const kind = sc?.data?.kind;
      let gateFields: GateAttachment | undefined;
      if (kind === 'batch_review_verdict' && sc?.data?.nextStep?.kind === 'synthesized_beads_pending') {
        const beadIds = sc.data.nextStep.beadIds ?? [];
        gateFields = toCompactGatePayload(buildBatchReviewSynthesizedGate(beadIds.length));
      }
      const nextState = clearPendingBatchReview(state);
      await saveState(nextState);
      const supervision = attachGateFields(
        supervisionSnapshot(
          { ...baseSnapshot, pendingBatchReviewRange: undefined },
          cfg,
          'monitor',
        ),
      );
      return buildTickResult(
        epochAtTickStart,
        state,
        epochGuards,
        reviewResult.content[0]?.text ?? 'Batch review verdict collected.',
        {
          kind: 'batch_review_verdict',
          tickAt,
          nextTickInSeconds: cfg.intervalSeconds,
          snapshot: { ...baseSnapshot, pendingBatchReviewRange: undefined },
          coordinatorPlaybook: playbook,
          reviewEnvelope: sc,
          askQuestion: gateFields?.askQuestion ?? supervision.askQuestion,
          gateMeta: gateFields?.gateMeta ?? supervision.gateMeta,
          actions: gateFields?.actions ?? supervision.actions,
        },
      );
    }

    const inProgressGate = attachGateFields(
      supervisionSnapshot(baseSnapshot, cfg, 'batch_review_in_progress'),
    );
    return buildTickResult(
      epochAtTickStart,
      state,
      epochGuards,
      [
        `Batch review in progress for ${pendingRange}.`,
        `Waiting for verdict at ${batchReviewVerdictPath(cwd, pendingRange).replace(cwd + '/', '')}.`,
        `Next tick in ~${cfg.intervalSeconds}s.`,
      ].join('\n'),
      {
        kind: 'batch_review_in_progress',
        tickAt,
        nextTickInSeconds: cfg.intervalSeconds,
        snapshot: baseSnapshot,
        coordinatorPlaybook: playbook,
        ...inProgressGate,
      },
    );
  }

  const batchReviewForced =
    args.forceBatchReview === true
    && threshold > 0
    && commitsSinceBaseline > 0;

  // ── New batch review (commit threshold) ──
  if (shouldTriggerBatchReview(threshold, commitsSinceBaseline) || batchReviewForced) {
    const shaRange = buildShaRange(state.lastBatchReviewSha, headSha);
    const dispatch = await prepareBatchReviewDispatch(ctx, shaRange, headSha);
    const nextState = markBatchReviewDispatched(state, headSha, shaRange);
    await saveState(nextState);

    const dispatchGate = attachGateFields(
      supervisionSnapshot(
        { ...baseSnapshot, pendingBatchReviewRange: shaRange },
        cfg,
        'batch_review_dispatch',
      ),
    );
    const dispatchReason = batchReviewForced
      ? `Batch review forced (${commitsSinceBaseline} commit(s) since baseline).`
      : `Commit-batch threshold crossed (${commitsSinceBaseline} ≥ ${threshold}).`;
    return buildTickResult(
      epochAtTickStart,
      state,
      epochGuards,
      [
        dispatchReason,
        `Dispatch combined fresh-eyes + thermo-nuclear Task over ${shaRange}, then call flywheel_impl_tick again.`,
      ].join('\n'),
      {
        kind: 'batch_review_dispatch',
        tickAt,
        nextTickInSeconds: cfg.intervalSeconds,
        snapshot: {
          ...baseSnapshot,
          pendingBatchReviewRange: shaRange,
        },
        coordinatorPlaybook: playbook,
        batchReviewTask: {
          model: thermoReviewModel,
          subagent_type: THERMO_SUBAGENT_TYPE,
          description: `Combined review ${shaRange}`,
          prompt: dispatch.prompt,
          shaRange,
          verdictRel: dispatch.verdictRel,
        },
        ...dispatchGate,
      },
    );
  }

  // ── Wave advance when beads closed ──
  const closed = args.closedBeadIds?.filter(Boolean) ?? [];
  if (closed.length > 0) {
    // E1: closed wave on impl_tick — bump before advance_wave (E2 may bump again)
    await persistCoordinatorEpochBump(ctx);
    const waveResult = await runAdvanceWave(ctx, {
      cwd,
      closedBeadIds: closed,
      skipImplModelsGate: state.implModelsConfirmed === true,
    });
    const sc = waveResult.structuredContent as { data?: AdvanceWaveOutcome } | undefined;
    const outcome = sc?.data;

    if (outcome?.nextStep?.kind === 'batch_review_due') {
      const reviewSha = outcome.nextStep.reviewSha;
      const shaRange = buildShaRange(outcome.nextStep.lastBaselineSha, reviewSha);
      const dispatch = await prepareBatchReviewDispatch(ctx, shaRange, reviewSha);
      const nextState = markBatchReviewDispatched(state, reviewSha, shaRange);
      await saveState(nextState);
      const verifyDispatchGate = attachGateFields(
        supervisionSnapshot(
          { ...baseSnapshot, pendingBatchReviewRange: shaRange },
          cfg,
          'batch_review_dispatch',
        ),
      );
      return buildTickResult(
        epochAtTickStart,
        state,
        epochGuards,
        waveResult.content[0]?.text ?? 'Batch review due after wave verify.',
        {
          kind: 'batch_review_dispatch',
          tickAt,
          nextTickInSeconds: cfg.intervalSeconds,
          snapshot: { ...baseSnapshot, pendingBatchReviewRange: shaRange },
          coordinatorPlaybook: playbook,
          advanceWave: outcome,
          batchReviewTask: {
            model: thermoReviewModel,
            subagent_type: THERMO_SUBAGENT_TYPE,
            description: `Combined review ${shaRange}`,
            prompt: dispatch.prompt,
            shaRange,
            verdictRel: dispatch.verdictRel,
          },
          ...verifyDispatchGate,
        },
      );
    }

    if (outcome?.waveComplete && outcome.nextStep?.kind === 'wave_review_gate') {
      const waveBeadIds = outcome.nextStep.beadIds;
      const waveBeads = beadsForWaveReview(beads, waveBeadIds);
      const waveGate = toCompactGatePayload(buildWaveReviewGate(waveBeads, state));
      return buildTickResult(
        epochAtTickStart,
        state,
        epochGuards,
        waveResult.content[0]?.text ?? 'Queue drained — wave review gate.',
        {
          kind: 'wave_complete',
          tickAt,
          nextTickInSeconds: cfg.intervalSeconds,
          snapshot: baseSnapshot,
          coordinatorPlaybook: playbook,
          advanceWave: outcome,
          waveReviewBeadIds: waveBeadIds,
          askQuestion: waveGate.askQuestion,
          gateMeta: waveGate.gateMeta,
          actions: waveGate.actions,
          nextActionHint: maybeAttachNextActionHint(cwd, 'wave_complete', epochAtTickStart, state, {
            beadIds: waveBeadIds,
          }),
        },
      );
    }

    if (outcome?.nextWave?.prompts?.length) {
      const models =
        outcome.nextWave.implModels ?? getCursorImplModels(cwd);
      const implTasks = buildImplTasksFromPrompts(
        outcome.nextWave.prompts,
        cfg.maxParallelImpl,
      );
      return buildTickResult(
        epochAtTickStart,
        state,
        epochGuards,
        [
          waveResult.content[0]?.text ?? 'Next wave ready.',
          buildCursorImplSpawnInstructions(models),
        ].join('\n\n'),
        {
          kind: 'advance_wave',
          tickAt,
          nextTickInSeconds: cfg.intervalSeconds,
          snapshot: baseSnapshot,
          coordinatorPlaybook: playbook,
          advanceWave: outcome,
          implTasks,
          nextActionHint: maybeAttachNextActionHint(cwd, 'advance_wave', epochAtTickStart, state, {
            beadIds: outcome.nextWave.beadIds,
            beadCount:
              outcome.nextWave.beadIds?.length ?? outcome.nextWave.prompts.length,
          }),
        },
      );
    }

    return buildTickResult(
      epochAtTickStart,
      state,
      epochGuards,
      waveResult.content[0]?.text ?? 'Advance wave completed.',
      {
        kind: 'advance_wave',
        tickAt,
        nextTickInSeconds: cfg.intervalSeconds,
        snapshot: baseSnapshot,
        coordinatorPlaybook: playbook,
        advanceWave: outcome,
      },
    );
  }

  // ── Dispatch ready beads when idle capacity ──
  if (counts.inProgressCount === 0 && counts.readyCount > 0 && state.implModelsConfirmed) {
    let ready: Awaited<ReturnType<typeof readyBeads>> = [];
    try {
      ready = await readyBeads(ctx.exec, cwd);
    } catch {
      ready = [];
    }
    const models = state.implModels ?? getCursorImplModels(cwd);
    const implTasks = ready.slice(0, cfg.maxParallelImpl).map((bead) => {
      const complexity = classifyBeadComplexity(bead).complexity;
      const model = modelForComplexity(models, complexity);
      const { prompt } = adaptPromptForCursor(
        {
          beadId: bead.id,
          title: bead.title,
          description: bead.description,
          acceptance: ['Complete the bead as described.'],
          complexity,
          relevantFiles: [],
          priorArtBeads: [],
          agentName: bead.id,
          coordinatorName: 'Coordinator',
          projectKey: cwd,
        },
        model,
      );
      return {
        beadId: bead.id,
        model,
        subagent_type: 'generalPurpose',
        description: `Impl ${bead.id}`,
        prompt,
      };
    });

    if (implTasks.length > 0) {
      return buildTickResult(
        epochAtTickStart,
        state,
        epochGuards,
        [
          `${implTasks.length} ready bead(s); no in_progress — dispatch impl Tasks.`,
          buildCursorImplSpawnInstructions(models),
        ].join('\n\n'),
        {
          kind: 'dispatch_impl_tasks',
          tickAt,
          nextTickInSeconds: cfg.intervalSeconds,
          snapshot: baseSnapshot,
          coordinatorPlaybook: playbook,
          implTasks,
          nextActionHint: maybeAttachNextActionHint(
            cwd,
            'dispatch_impl_tasks',
            epochAtTickStart,
            state,
            {
              beadIds: implTasks.map((t) => t.beadId),
              beadCount: implTasks.length,
            },
          ),
        },
      );
    }
  }

  // ── Monitor ──
  const stuck = beads.filter((b) => {
    if ((b.status ?? '').toLowerCase() !== 'in_progress') return false;
    const ts = Date.parse(b.updated_at ?? '');
    return Number.isFinite(ts) && Date.now() - ts > STUCK_BEAD_MS;
  });

  const lines = [
    `Impl tick @ ${tickAt.slice(11, 19)} — monitor.`,
    `HEAD ${headSha.slice(0, 7)}; commits since baseline: ${commitsSinceBaseline}/${threshold || 'off'}.`,
    `Beads: ${counts.readyCount} ready, ${counts.inProgressCount} in_progress, ${counts.closedCount} closed.`,
  ];
  if (threshold === 0) {
    lines.push(
      'Batch fresh-eyes review is OFF — set impl_tick.commit_batch_threshold in flywheel.config.yaml, FW_COMMIT_BATCH_THRESHOLD, or pass commitBatchThreshold on flywheel_impl_tick.',
    );
  } else if (commitsSinceBaseline >= Math.max(1, threshold - 1)) {
    lines.push(
      `Batch review fires at ${threshold} commits — ${threshold - commitsSinceBaseline} until next fresh-eyes dispatch (or sooner if threshold already crossed on next tick).`,
    );
  }
  if (stuck.length > 0) {
    lines.push(`Stuck (>30m): ${stuck.map((b) => b.id).join(', ')}`);
  }
  lines.push(`Next tick in ~${cfg.intervalSeconds}s.`);

  const monitorGate = attachGateFields(
    supervisionSnapshot(
      baseSnapshot,
      cfg,
      'monitor',
      stuck.length > 0 ? stuck.map((b) => b.id) : undefined,
    ),
  );

  return buildTickResult(
    epochAtTickStart,
    state,
    epochGuards,
    lines.join('\n'),
    {
      kind: 'monitor',
      tickAt,
      nextTickInSeconds: cfg.intervalSeconds,
      snapshot: baseSnapshot,
      coordinatorPlaybook: playbook,
      ...monitorGate,
    },
  );
}
