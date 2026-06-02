import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ToolContext, McpToolResult, Bead, ReviewArgs, FlywheelPhase, ReviewMode } from '../types.js';
import type { FlywheelErrorCode } from '../errors.js';
import { errMsg, makeFlywheelErrorResult } from '../errors.js';
import { recordGateSteering } from '../steering-events.js';
import { createLogger } from '../logger.js';
import { makeOkToolResult } from './shared.js';
import {
  AUTO_REVIEW_FINDING_LABEL,
  buildThermoNuclearPersonaTask,
  reviewVerdictPath,
  reviewVerdictRel,
  THERMO_PREAMBLE,
  THERMO_SUBAGENT_TYPE,
} from '../combined-review-prompt.js';
import { buildShaRange, resolveHeadSha } from '../batch-review-dispatch.js';
import { markBatchReviewDispatched } from '../commit-batch.js';
import { prepareBatchReviewDispatch } from '../batch-review-dispatch.js';
import { resolveThermoNuclearModel } from '../flywheel-config.js';
import { collectReviewVerdict } from '../review-verdict-collect.js';
import { readMemory } from '../memory.js';
import { readBeads } from '../beads.js';
import { persistCoordinatorEpochBump } from '../coordinator-epoch.js';

const log = createLogger('review');

// ─── Review-mode matrix (bead agent-flywheel-plugin-f0j) ──────────────
//
// Mode routing is skill-level — we do NOT introduce new MCP tools. The
// reviewer personas are reused verbatim; `mode` only changes the agent
// prompt preamble and the post-synthesis action (apply-diffs-and-commit
// vs write-docs vs emit-exit-code vs ask-per-finding).

export const AUTOFIX_GATE_HINT =
  'Autofix refuses when the tree is dirty or the doctor is not green. Stash/commit local changes, run `flywheel_doctor`, then retry — or fall back to mode="interactive".';

export const HEADLESS_EXIT_HINT =
  'Headless mode returns error code "review_headless_findings" with details.findingCount when reviewers surface non-zero issues. CI wrappers should branch on structuredContent?.data?.error?.code and use details.exitCode (1 = findings, 2 = reviewer crash).';

function modePreamble(mode: ReviewMode, beadId: string): string {
  switch (mode) {
    case 'autofix':
      return `**Review mode: autofix.** After completing your review, APPLY your fixes directly via code-edit tools AND stage them for a single fixup commit per reviewer. When done, run \`git commit -m "fix(review/${beadId}): <reviewer-perspective>"\`. Do NOT ask the user per finding — your job is to ship the patch.\n\n`;
    case 'report-only':
      return `**Review mode: report-only.** Do NOT edit code. Write your full findings to \`docs/reviews/${beadId}-<perspective>-<YYYY-MM-DD>.md\` and exit. The coordinator aggregates reports — no interactive prompts.\n\n`;
    case 'headless':
      return `**Review mode: headless (CI).** Do NOT edit code and do NOT write markdown reports. Emit a compact machine-readable JSON summary on stdout: \`{ "beadId": "${beadId}", "perspective": "<your-perspective>", "findings": [{ "severity": "error|warn|info", "file": "...", "line": 0, "message": "..." }] }\`. The coordinator aggregates exit codes (0 = clean, 1 = findings, 2 = reviewer crash).\n\n`;
    case 'interactive':
    default:
      return '';
  }
}

/**
 * Decide whether autofix mode is safe right now. Runs two cheap checks:
 *   1. `git status --porcelain` — tree must be clean.
 *   2. `flywheel_doctor` recent report (if checkpoint has one) — must be green.
 * If either fails we fall back to interactive mode and surface a warning.
 */
async function autofixGateOk(ctx: ToolContext): Promise<{ ok: boolean; reason?: string }> {
  const { exec, cwd, signal } = ctx;
  try {
    const statusResult = await exec('git', ['status', '--porcelain'], { cwd, timeout: 5000, signal });
    if (statusResult.code !== 0) {
      return { ok: false, reason: `git status failed (exit ${statusResult.code})` };
    }
    if (statusResult.stdout.trim().length > 0) {
      return { ok: false, reason: 'working tree is dirty (uncommitted changes present)' };
    }
  } catch (err: unknown) {
    return { ok: false, reason: `git status threw: ${errMsg(err)}` };
  }
  // Doctor signal: if the session has a recent DoctorReport cached and any
  // check is "red", refuse. Absence of a cached report is tolerated — the
  // git-clean check alone is still a meaningful guard.
  const report = (ctx.state as { lastDoctorReport?: { checks?: Array<{ severity: string }> } }).lastDoctorReport;
  if (report?.checks?.some((c) => c.severity === 'red')) {
    return { ok: false, reason: 'flywheel_doctor reports at least one red check' };
  }
  return { ok: true };
}

function okResult(phase: string, text: string, data: Record<string, unknown>): McpToolResult {
  return makeOkToolResult('flywheel_review', phase, text, data);
}

function errorResult(
  phase: FlywheelPhase,
  code: FlywheelErrorCode,
  message: string,
  details?: Record<string, unknown>,
  hint?: string,
): McpToolResult {
  return makeFlywheelErrorResult('flywheel_review', phase, {
    code,
    message,
    ...(hint ? { hint } : {}),
    ...(details ? { details } : {}),
  });
}

function parseBrShowBead(raw: string): Bead | null {
  try {
    const parsed = JSON.parse(raw);
    if (looksLikeBead(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const candidateKeys = ['bead', 'issue', 'data', 'result'];
      for (const key of candidateKeys) {
        const candidate = (parsed as Record<string, unknown>)[key];
        if (looksLikeBead(candidate)) return candidate as Bead;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function looksLikeBead(value: unknown): value is Bead {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof (value as Record<string, unknown>).id === 'string'
      && typeof (value as Record<string, unknown>).title === 'string'
      && typeof (value as Record<string, unknown>).description === 'string'
      && typeof (value as Record<string, unknown>).status === 'string'
  );
}

/** Close one bead after review accept — br update, state sync, optional parent auto-close. */
async function finalizeBeadLooksGood(
  ctx: ToolContext,
  beadId: string,
  bead: Bead,
): Promise<{ ok: true } | { ok: false; stderr: string }> {
  const { exec, cwd, state, signal } = ctx;

  if (bead.status !== 'closed') {
    const updateResult = await exec('br', ['update', beadId, '--status', 'closed'], {
      cwd,
      timeout: 5000,
      signal,
    });
    if (updateResult.code !== 0) {
      log.warn('br update --status closed failed during review accept', {
        beadId,
        code: updateResult.code,
        stderr: updateResult.stderr,
      });
      return { ok: false, stderr: updateResult.stderr };
    }
  }

  if (!state.beadResults) state.beadResults = {};
  state.beadResults[beadId] = {
    beadId,
    status: 'success',
    summary: bead.status === 'closed' ? 'Auto-closed by impl agent' : 'Passed review',
  };

  if (!state.beadReviewPassCounts) state.beadReviewPassCounts = {};
  state.beadReviewPassCounts[beadId] = (state.beadReviewPassCounts[beadId] ?? 0) + 1;

  if (bead.parent) {
    const brListResult = await exec('br', ['list', '--json'], { cwd, timeout: 8000, signal });
    if (brListResult.code === 0) {
      try {
        const allBeads: Bead[] = JSON.parse(brListResult.stdout);
        const siblings = allBeads.filter((b) => b.parent === bead.parent);
        const allDone = siblings.every((b) => b.status === 'closed' || b.id === beadId);
        if (allDone && bead.parent) {
          await exec('br', ['update', bead.parent, '--status', 'closed'], {
            cwd,
            timeout: 5000,
            signal,
          });
          if (!state.beadResults) state.beadResults = {};
          state.beadResults[bead.parent] = {
            beadId: bead.parent,
            status: 'success',
            summary: 'All subtasks complete',
          };
        }
      } catch (err: unknown) {
        log.warn('Failed to parse sibling beads for parent auto-close', {
          code: 'parse_failure',
          tool: 'flywheel_review',
          phase: state.phase,
          cause: errMsg(err),
          parentId: bead.parent,
        });
      }
    }
  }

  return { ok: true };
}

/**
 * Accept every bead in a wave review gate (`looks-good-all`) — closes each bead
 * in br and advances once. Used by flywheel_wave_review_gate confirmAction so
 * coordinators are not required to re-call flywheel_review per bead.
 *
 * Two-phase: validate-all (readBeads) → single epoch bump → mutate-all (close).
 * Returns `partiallyClosed` on mid-loop close failure after the epoch bump.
 */
export async function acceptWaveBeadsAtReview(
  ctx: ToolContext,
  beadIds: string[],
): Promise<McpToolResult> {
  const { exec, cwd, state, saveState } = ctx;

  if (beadIds.length === 0) {
    return errorResult(
      state.phase,
      'invalid_input',
      'beadIds must be a non-empty array to accept wave review.',
    );
  }

  const allBeads = await readBeads(exec, cwd);
  const beadMap = new Map(allBeads.map((b) => [b.id, b]));
  const missing = beadIds.filter((id) => !beadMap.has(id));
  if (missing.length > 0) {
    return errorResult(
      state.phase,
      'not_found',
      `Bead(s) not found while accepting wave review: ${missing.join(', ')}.`,
      { missing, beadIds },
    );
  }

  await persistCoordinatorEpochBump({ state, saveState });

  let lastBeadId = beadIds[beadIds.length - 1]!;
  let lastTitle = lastBeadId;
  const partiallyClosed: string[] = [];

  for (const beadId of beadIds) {
    const bead = beadMap.get(beadId)!;
    const result = await finalizeBeadLooksGood(ctx, beadId, bead);
    if (!result.ok) {
      saveState(state);
      return errorResult(
        state.phase,
        'cli_failure',
        `Failed to close bead ${beadId} while accepting wave review.`,
        { beadId, partiallyClosed, stderr: result.stderr },
      );
    }
    partiallyClosed.push(beadId);
    lastBeadId = beadId;
    lastTitle = bead.title;
  }

  saveState(state);
  return nextBeadOrGates(ctx, lastBeadId, lastTitle, 'Passed');
}

/**
 * flywheel_review — Submit implementation work for review.
 *
 * action="hit-me"    — Return parallel review agent task specs for CC to spawn
 * action="looks-good"— Mark bead done, advance to next or enter gates
 * action="skip"      — Skip this bead (mark deferred), move to next
 */
export async function runReview(ctx: ToolContext, args: ReviewArgs): Promise<McpToolResult> {
  const { exec, cwd, state, saveState, signal } = ctx;

  // ── action: batch_review (T4 — fresh-eyes auto-trigger) ──────
  // Does NOT use a beadId (it reviews a sha-range of commits, not a single
  // bead), so this branch runs BEFORE the beadId guard below.
  if (args.action === 'batch_review') {
    return handleBatchReview(ctx, args);
  }

  if (!args.beadId) {
    return errorResult(
      'reviewing',
      'invalid_input',
      'Error: beadId is required.',
      undefined,
      'Pass beadId from `br list`, or use `__gates__` / `__regress_to_plan__` / `__regress_to_beads__` / `__regress_to_implement__` sentinels.',
    );
  }

  const beadId = args.beadId;

  // ── Resolve review mode + autofix gating (bead agent-flywheel-plugin-f0j) ─
  // `mode` is advisory on `looks-good`/`skip` (those paths don't spawn
  // reviewers) but drives the hit-me dispatch. Autofix is gated behind a
  // clean git tree + non-red doctor report; failing the gate downgrades to
  // interactive with a warning attached to the payload.
  const requestedMode: ReviewMode = args.mode ?? 'interactive';
  let effectiveMode: ReviewMode = requestedMode;
  let modeGateWarning: string | undefined;
  if (requestedMode === 'autofix' && args.action === 'hit-me') {
    const gate = await autofixGateOk(ctx);
    if (!gate.ok) {
      effectiveMode = 'interactive';
      modeGateWarning = `Autofix refused: ${gate.reason}. Falling back to interactive mode. ${AUTOFIX_GATE_HINT}`;
      log.warn('autofix gate refused — downgrading to interactive', {
        beadId,
        reason: gate.reason,
      });
    }
  }
  const parallelSafe = args.parallelSafe ?? false;

  // ── Special sentinels ─────────────────────────────────────────
  if (beadId === '__gates__') {
    return runGates(ctx, args.action);
  }
  if (beadId === '__regress_to_plan__') {
    return await regressToPhase(ctx, 'planning', 'plan revision');
  }
  if (beadId === '__regress_to_beads__') {
    return await regressToPhase(ctx, 'creating_beads', 'bead creation');
  }
  if (beadId === '__regress_to_implement__') {
    return await regressToPhase(ctx, 'implementing', 'implementation');
  }

  // ── Look up bead ──────────────────────────────────────────────
  const brShowResult = await exec('br', ['show', beadId, '--json'], { cwd, timeout: 8000, signal });
  if (brShowResult.code !== 0) {
    return errorResult(
      state.phase,
      'not_found',
      `Bead ${beadId} not found. Run \`br list\` to see available beads.\n\nError: ${brShowResult.stderr}`,
      { beadId, stderr: brShowResult.stderr },
      'Run `br list` to confirm the bead id, or `br init` if beads have not been initialized in this repo.',
    );
  }

  const bead = parseBrShowBead(brShowResult.stdout);
  if (!bead) {
    return errorResult(
      state.phase,
      'parse_failure',
      `Error parsing bead ${beadId} from br show output.`,
      { beadId },
      'Run `br show <id> --json` manually to inspect raw output; this usually indicates a br CLI version mismatch.',
    );
  }

  // ── Preflight: actual bead status (handles auto-close from impl agent) ─
  // If `br show` says the bead is already closed, the impl agent (or someone
  // else) ran `br update --status closed` without informing the agent-flywheel.
  // Reconcile state and route based on the requested action.
  //
  // Note: state.beadResults is only synced on the looks-good path. Setting
  // it for hit-me would trip the `alreadyCompleted` short-circuit below and
  // suppress the post-close audit the caller asked for.
  if (bead.status === 'closed') {
    if (args.action === 'looks-good') {
      if (!state.beadResults) state.beadResults = {};
      if (!state.beadResults[beadId]) {
        state.beadResults[beadId] = {
          beadId,
          status: 'success',
          summary: 'Auto-closed by impl agent',
        };
        saveState(state);
      }
      // E3: already-closed bead accepted at review gate
      await recordGateSteering(ctx, {
        source: 'wave_review',
        actionId: 'looks-good-all',
        beadIds: [beadId],
      });
      return nextBeadOrGates(ctx, beadId, bead.title, 'Already closed by impl agent');
    }
    if (args.action === 'skip') {
      return errorResult(
        state.phase,
        'already_closed',
        `Bead ${beadId} is already closed; skip is not applicable. Move to the next bead or call flywheel_review with action=looks-good to acknowledge.`,
        { beadId, status: 'closed' },
        'Call flywheel_review with action=looks-good to acknowledge the already-closed bead, then continue.',
      );
    }
    // hit-me on a closed bead falls through; payload is tagged postClose below.
  }

  const alreadyCompleted = state.beadResults?.[beadId]?.status === 'success';
  if (alreadyCompleted) {
    return okResult(
      state.phase,
      `Bead ${beadId} is already complete. Move to the next bead or call \`flywheel_review\` with beadId="__gates__" for guided review gates.`,
      {
        kind: 'review_gate',
        scope: 'already_complete',
        beadId,
      }
    );
  }

  // ── action: skip ──────────────────────────────────────────────
  if (args.action === 'skip') {
    await exec('br', ['update', beadId, '--status', 'deferred'], { cwd, timeout: 5000, signal });

    if (!state.beadResults) state.beadResults = {};
    state.beadResults[beadId] = {
      beadId,
      status: 'blocked',
      summary: 'Skipped by user',
    };
    // E5: defer at review gate
    await recordGateSteering(ctx, {
      source: 'wave_review',
      actionId: 'skip',
      beadIds: [beadId],
    });

    return nextBeadOrGates(ctx, beadId, bead.title, 'Skipped');
  }

  // ── action: looks-good ────────────────────────────────────────
  if (args.action === 'looks-good') {
    const closeResult = await finalizeBeadLooksGood(ctx, beadId, bead);
    if (!closeResult.ok) {
      return errorResult(
        state.phase,
        'cli_failure',
        `Failed to close bead ${beadId} during review accept.`,
        { beadId, stderr: closeResult.stderr },
      );
    }

    // E3: successful looks-good closes bead and advances
    await recordGateSteering(ctx, {
      source: 'wave_review',
      actionId: 'looks-good-all',
      beadIds: [beadId],
    });
    saveState(state);
    return nextBeadOrGates(ctx, beadId, bead.title, 'Passed');
  }

  // ── action: hit-me — return parallel review agent specs ───────
  if (args.action === 'hit-me') {
    const round = state.beadReviewPassCounts?.[beadId] ?? 0;
    const postClose = bead.status === 'closed';
    const postCloseNote = postClose
      ? `**Note:** this bead is already closed by the impl agent. This is a post-close audit — focus on what shipped, surface bugs in landed code, and propose follow-up fixes rather than blocking the close.\n\n`
      : '';
    const modeNote = modePreamble(effectiveMode, beadId);

    const headSha = await resolveHeadSha(cwd, ctx.exec);
    const shaRange = buildShaRange(state.lastBatchReviewSha, headSha);
    const verdictRel = reviewVerdictRel(beadId, round);
    const verdictPath = reviewVerdictPath(cwd, beadId, round);
    const provenanceKey = `${beadId}-r${round}`;

    // ── Collect phase: verdict file present after swarm completes ──
    try {
      await fs.access(verdictPath);
      return collectReviewVerdict(ctx, {
        verdictPath,
        provenanceKey,
        expectedShaRange: shaRange,
        kind: 'hit_me_review_verdict',
        memoryTag: 'hit-me-review',
        passMessage: `## Hit-me review: PASS — ${beadId} (round ${round})\n\nNo blocking findings. Coordinator: call \`flywheel_review({ action: "looks-good", beadId: "${beadId}" }\`.`,
        needsAttentionMessage: `## Hit-me review: NEEDS ATTENTION — ${beadId}\n\nFindings surfaced. Apply review mode matrix (Step 8.0) or re-run hit-me after fixes.`,
        blockingMessagePrefix: `## Hit-me review: BLOCKING — ${beadId}`,
        labels: [AUTO_REVIEW_FINDING_LABEL],
      });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        return errorResult(
          state.phase,
          'internal_error',
          `Failed to check review verdict file: ${errMsg(err)}`,
          { verdictPath },
        );
      }
      if (state.beadHitMeTriggered?.[beadId]) {
        return okResult(
          state.phase,
          `## Hit-me review in progress — ${beadId} (round ${round})\n\n` +
            `Waiting for thermo-nuclear verdict at \`${verdictRel}\`. Re-call \`flywheel_review({ action: "hit-me", beadId: "${beadId}" })\` after the swarm completes.`,
          {
            kind: 'hit_me_review_in_progress',
            beadId,
            round,
            reviewVerdictRel: verdictRel,
            reviewVerdictPath: verdictPath,
            shaRange,
          },
        );
      }
    }

    if (!state.beadHitMeTriggered) state.beadHitMeTriggered = {};
    if (!state.beadHitMeCompleted) state.beadHitMeCompleted = {};
    state.beadHitMeTriggered[beadId] = true;
    state.beadHitMeCompleted[beadId] = false;
    // E4: dispatching parallel reviewers after wave review gate
    await recordGateSteering(ctx, {
      source: 'wave_review',
      actionId: 'hit-me',
      beadIds: [beadId],
    });

    // Extract file list from bead description (heuristic: lines containing paths)
    const files = extractFilesFromBead(bead);
    const fileList = files.length > 0 ? files.join(', ') : '(check bead description for files)';

    const goal = state.selectedGoal ?? 'unknown goal';
    const prevResults = Object.values(state.beadResults ?? {});
    const prevSummary = prevResults.length > 0
      ? prevResults.slice(-3).map(r => `- ${r.beadId}: ${r.status}`).join('\n')
      : '(none yet)';

    const thermoModel = resolveThermoNuclearModel(cwd);
    const thermoTask = buildThermoNuclearPersonaTask({
      modeNote,
      postCloseNote,
      beadId,
      round,
      fileList,
      cwd,
      shaRange,
      verdictRel,
    });

    const agentTasks = [
      {
        name: `FreshEyes-${beadId}-r${round}`,
        perspective: 'fresh-eyes',
        subagent_type: 'generalPurpose',
        task: `${THERMO_PREAMBLE}${modeNote}${postCloseNote}Fresh-eyes code reviewer. You have NEVER seen this code before.

**Bead:** ${beadId} — ${bead.title}
**Files to review:** ${fileList}
**Description:** ${bead.description.slice(0, 500)}
**cwd:** ${cwd}

Find blunders, bugs, errors, oversights. Be harsh but constructive. Fix issues directly using code tools.

Report what you found and what you fixed.`,
      },
      {
        name: `Adversary-${beadId}-r${round}`,
        perspective: 'adversarial',
        subagent_type: 'generalPurpose',
        task: `${THERMO_PREAMBLE}${modeNote}${postCloseNote}Adversarial code reviewer. Your job is to break this implementation.

**Bead:** ${beadId} — ${bead.title}
**Files to review:** ${fileList}
**cwd:** ${cwd}

**Mandatory first step**: invoke \`/ubs-workflow\` on the changed files to run the Ultimate Bug Scanner comprehensive review. Its findings are your baseline before manual attack.

Then go further: trigger edge cases, find security holes, construct inputs that cause failures.
Fix any real vulnerabilities or bugs directly.

If your review surfaces a crash, hang, or memory issue in compiled code, invoke \`/gdb-for-debugging\` to reproduce it under a debugger and capture a stack trace in the report.

Report your attack attempts and findings.`,
      },
      {
        name: `Ergonomics-${beadId}-r${round}`,
        perspective: 'ergonomics',
        subagent_type: 'generalPurpose',
        task: `${THERMO_PREAMBLE}${modeNote}${postCloseNote}Ergonomics reviewer. Focus on usability and developer experience.

**Bead:** ${beadId} — ${bead.title}
**Files to review:** ${fileList}
**cwd:** ${cwd}

If you came in fresh with zero context, would you understand this code?
Check: naming, comments, API design, error messages, type annotations.
Fix anything confusing or unclear directly.

Report improvements made.`,
      },
      {
        name: `RealityCheck-${beadId}-r${round}`,
        perspective: 'reality-check',
        subagent_type: 'generalPurpose',
        task: `${THERMO_PREAMBLE}${modeNote}${postCloseNote}Reality checker. Verify the implementation actually achieves the goal.

**Goal:** ${goal}
**Bead:** ${beadId} — ${bead.title}
**Prior results:** ${prevSummary}
**Files:** ${fileList}
**cwd:** ${cwd}

Check: Does this actually solve the bead's stated goal? Are there gaps between intent and implementation?
Do NOT edit code — just report your findings.`,
      },
      {
        name: `ThermoNuclear-${beadId}-r${round}`,
        perspective: 'thermo-nuclear',
        subagent_type: THERMO_SUBAGENT_TYPE,
        model: thermoModel,
        task: thermoTask,
      },
    ];

    const baseInstructions = `Spawn these 5 review agents in parallel (combined fresh-eyes + thermo-nuclear). The **thermo-nuclear** agent (\`subagent_type: "${THERMO_SUBAGENT_TYPE}"\`, model: \`${thermoModel}\`) writes the canonical verdict JSON to \`${verdictRel}\`. After all complete, re-call \`flywheel_review({ action: "hit-me", beadId: "${beadId}" })\` to collect the verdict and auto-beadify blocking findings. Then \`looks-good\` or another \`hit-me\` round if needed.`;
    const modeInstructions: Record<ReviewMode, string> = {
      autofix: `Review mode=autofix: each reviewer applies and commits its fixes directly. After all 5 finish, re-call hit-me to collect the thermo verdict, then \`looks-good\` if pass — do NOT AskUserQuestion per finding.`,
      'report-only': `Review mode=report-only: reviewers write findings to docs/reviews/<perspective>-<date>.md and DO NOT edit code. Thermo agent still writes \`${verdictRel}\`. Re-call hit-me to collect; then looks-good or another hit-me if blockers remain.`,
      headless: `Review mode=headless (CI): reviewers emit JSON-on-stdout only. Thermo agent writes \`${verdictRel}\`. Re-call hit-me to collect; aggregate exit codes — do NOT AskUserQuestion.`,
      interactive: baseInstructions,
    };
    const instructions = postClose
      ? `Bead ${beadId} is already closed; this is a post-close audit. ${modeInstructions[effectiveMode]} For looks-good, the bead stays closed (idempotent).`
      : modeInstructions[effectiveMode];

    const payload = {
      kind: 'review_tasks',
      strategy: 'hit_me',
      beadId,
      round,
      postClose,
      mode: effectiveMode,
      requestedMode,
      parallelSafe,
      shaRange,
      reviewVerdictRel: verdictRel,
      reviewVerdictPath: verdictPath,
      thermoSubagentType: THERMO_SUBAGENT_TYPE,
      thermoModel,
      ...(modeGateWarning ? { modeGateWarning } : {}),
      agentTasks,
      files,
      instructions,
    };

    return okResult(
      state.phase,
      JSON.stringify({
        action: 'spawn-agents',
        beadId,
        round,
        postClose,
        mode: effectiveMode,
        requestedMode,
        parallelSafe,
        ...(modeGateWarning ? { modeGateWarning } : {}),
        agentTasks,
        instructions,
      }, null, 2),
      payload
    );
  }

  return errorResult(
    state.phase,
    'unsupported_action',
    `Unknown action: ${args.action}. Valid: hit-me, looks-good, skip, batch_review`,
    { beadId, action: args.action },
    'Pass action as one of: "hit-me" (spawn reviewers), "looks-good" (accept), "skip" (defer), "batch_review" (T4 fresh-eyes auto-trigger over a sha range).',
  );
}

// ── action="batch_review" handler (T4) ─────────────────────────
//
// Two-call lifecycle, keyed off the verdict file at
// `.pi-flywheel/batch-reviews/<shaRange>.json`:
//
//   1. Verdict file ABSENT  → emit a dispatch payload (the fresh-eyes prompt
//      built via `buildFreshEyesPrompt({ emitStructuredFindings: true })`
//      plus the verdict path). Coordinator routes the prompt to NTM
//      `--robot-send` (primary) or `Agent(subagent_type="general-purpose")`
//      (fallback). Reviewer writes its JSON verdict to the path.
//
//   2. Verdict file PRESENT → parse, validate via `BatchReviewVerdictSchema`,
//      branch on `status`:
//        • "pass"           → nextStep.kind="advance_wave"
//        • "needs_attention"→ nextStep.kind="needs_attention" with findings
//        • "blocking"       → call `synthesizeBeadsFromFindings`. On success
//                              nextStep.kind="synthesized_beads_pending" with
//                              bead IDs + finding-to-bead mapping. On synth
//                              failure, partial-rollback via
//                              `rollbackSynthesizedBeads` and fall back to
//                              needs_attention.
//
// Malformed verdict (invalid JSON or schema parse failure) → record a CASS
// note and fall back to needs_attention with the raw verdict text surfaced
// so a human still sees the reviewer output.
async function handleBatchReview(
  ctx: ToolContext,
  args: ReviewArgs,
): Promise<McpToolResult> {
  const { exec, cwd, state, saveState, signal } = ctx;

  const shaRange = args.shaRange ?? '';
  if (!/^[0-9a-f]+\.\.[0-9a-f]+$/i.test(shaRange)) {
    return errorResult(
      state.phase,
      'invalid_input',
      `Invalid or missing shaRange for action="batch_review": ${JSON.stringify(args.shaRange)}. Expected "<from-sha>..<to-sha>" (hex chars only).`,
      { shaRange: args.shaRange },
      'Pass shaRange as `<lastBatchReviewSha>..HEAD` (or any pair of commit SHAs). State.lastBatchReviewSha holds the prior baseline.',
    );
  }

  const verdictDir = path.join(cwd, '.pi-flywheel', 'batch-reviews');
  const verdictPath = path.join(verdictDir, `${shaRange}.json`);

  let rawVerdict: string | undefined;
  try {
    rawVerdict = await fs.readFile(verdictPath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      return errorResult(
        state.phase,
        'internal_error',
        `Failed to read batch-review verdict file: ${errMsg(err)}`,
        { verdictPath },
        'Check that .pi-flywheel/batch-reviews/ is readable and the reviewer subagent has write permission. If permission denied, run `chmod -R u+rw .pi-flywheel/`.',
      );
    }
    // ENOENT → verdict not yet present; fall through to dispatch.
  }

  // ── Phase 1: verdict absent → emit dispatch payload ───────────
  if (rawVerdict === undefined) {
    const toSha = shaRange.split('..')[1] ?? '';
    const dispatch = await prepareBatchReviewDispatch(ctx, shaRange, toSha);
    ctx.state = markBatchReviewDispatched(ctx.state, toSha, shaRange);
    await saveState(ctx.state);

    const text =
      `## Batch Review Dispatch — ${shaRange}\n\n` +
      `**Verdict file (reviewer writes here):** \`${dispatch.verdictPath}\`\n` +
      `**Changed files:** ${dispatch.changedFiles.length}\n\n` +
      `**Cursor coordinator:** spawn one **Task** with \`data.batchReviewTask\` from \`flywheel_impl_tick\`, ` +
      `or use the prompt below. Then \`flywheel_impl_tick\` or \`flywheel_review({ action: "batch_review", shaRange })\` to collect.\n\n` +
      `---\n\n${dispatch.prompt}`;

    return okResult(state.phase, text, {
      kind: 'batch_review_dispatch',
      shaRange,
      verdictPath: dispatch.verdictPath,
      changedFiles: dispatch.changedFiles,
      prompt: dispatch.prompt,
    });
  }

  // ── Phase 2: verdict present → collect + beadify ─────────────
  return collectReviewVerdict(ctx, {
    verdictPath,
    rawVerdict,
    provenanceKey: shaRange,
    expectedShaRange: shaRange,
    kind: 'batch_review_verdict',
    memoryTag: 'batch-review',
    passMessage: `## Batch Review: PASS — ${shaRange}\n\nNo findings. Coordinator: advance the wave normally.`,
    needsAttentionMessage:
      `## Batch Review: NEEDS ATTENTION — ${shaRange}\n\n` +
      `Findings surfaced. Coordinator: prompt the user (Continue / Synthesize beads / Pause / Regress).`,
    blockingMessagePrefix: `## Batch Review: BLOCKING — ${shaRange}`,
    clearBatchPending: true,
    labels: [AUTO_REVIEW_FINDING_LABEL],
  });
}

async function nextBeadOrGates(
  ctx: ToolContext,
  completedBeadId: string,
  completedTitle: string,
  status: string
): Promise<McpToolResult> {
  const { exec, cwd, state, saveState, signal } = ctx;

  // Get next ready beads
  const brReadyResult = await exec('br', ['ready', '--json'], { cwd, timeout: 8000, signal });
  let ready: Bead[] = [];

  if (brReadyResult.code === 0) {
    try {
      ready = JSON.parse(brReadyResult.stdout);
    } catch {
      return errorResult(
        state.phase,
        'parse_failure',
        'br ready produced malformed JSON — fall back to manual bead selection.',
        { command: 'br ready --json', stdout: brReadyResult.stdout.slice(0, 200) },
        'Run `br ready --json` manually to inspect the output; upgrade br CLI if the JSON shape drifted.',
      );
    }
  }

  // Filter out already-completed beads
  const completed = new Set(
    Object.entries(state.beadResults ?? {})
      .filter(([, r]) => r.status === 'success')
      .map(([id]) => id)
  );
  ready = ready.filter(b => !completed.has(b.id));

  if (ready.length === 0) {
    // All done — enter review gates
    state.phase = 'iterating';
    state.iterationRound = 0;
    state.currentGateIndex = 0;
    saveState(state);

    return okResult(
      'iterating',
      `**${status}: Bead ${completedBeadId} (${completedTitle}).**

All beads in the queue are done. If you have not run wave review yet, call \`flywheel_wave_review_gate\` for the wave's bead IDs first. Then \`flywheel_wrap_up_gate\` after review — not ad-hoc commit prompts.

**NEXT:** \`flywheel_review\` with beadId="__gates__" for guided review gates, OR \`flywheel_wrap_up_gate\` when review is finished.`,
      {
        kind: 'all_beads_complete',
        scope: 'bead_completion',
        completedBeadId,
        completedTitle,
        status,
        nextStep: { kind: 'wrap_up_gate' as const },
      }
    );
  }

  if (ready.length === 1) {
    const nextBead = ready[0];
    await exec('br', ['update', nextBead.id, '--status', 'in_progress'], { cwd, timeout: 5000, signal });
    state.currentBeadId = nextBead.id;
    state.retryCount = 0;
    state.phase = 'implementing';
    saveState(state);

    return okResult(
      'implementing',
      `**${status}: Bead ${completedBeadId}.** Moving to bead ${nextBead.id}.

**NEXT: Implement bead ${nextBead.id} (${nextBead.title}), then call \`flywheel_review\` when done.**

---

## Bead ${nextBead.id}: ${nextBead.title}

${nextBead.description}

After implementing, commit and call \`flywheel_review\` with beadId="${nextBead.id}".`,
      {
        kind: 'review_tasks',
        strategy: 'single_bead',
        completedBeadId,
        nextBeadIds: [nextBead.id],
        beads: [nextBead],
      }
    );
  }

  // Multiple ready — spawn parallel agents
  for (const bead of ready) {
    await exec('br', ['update', bead.id, '--status', 'in_progress'], { cwd, timeout: 5000, signal });
  }
  state.phase = 'implementing';
  saveState(state);

  const agentConfigs = ready.map(bead => ({
    name: `bead-${bead.id}`,
    cwd,
    task: `Implement bead ${bead.id}: ${bead.title}\n\n${bead.description}\n\nAfter implementing, commit and report your summary.`,
  }));

  return okResult(
    'implementing',
    `**${status}: Bead ${completedBeadId}.** ${ready.length} beads now ready.

**NEXT: Spawn ${ready.length} parallel agents, then call \`flywheel_review\` for each when done.**

\`\`\`json
${JSON.stringify({ agents: agentConfigs }, null, 2)}
\`\`\``,
    {
      kind: 'review_tasks',
      strategy: 'parallel_beads',
      completedBeadId,
      nextBeadIds: ready.map(bead => bead.id),
      beads: ready,
      agentConfigs,
    }
  );
}

async function runGates(ctx: ToolContext, action: 'hit-me' | 'looks-good' | 'skip'): Promise<McpToolResult> {
  const { state, saveState, cwd } = ctx;

  // Instructional review-gate prompts shown to reviewers (not executable code).
  const gateChecks = [
    `### Gate 1: Tests passing\nRun \`npm test\` or equivalent. Report results.`,
    `### Gate 2: No regressions\nCheck test changes are all intentional.`,
    `### Gate 3: Code quality\nIn the code under review, check for leftover TODO/FIXME markers, debug logging that should be removed, and dead code. Report findings.`,
    `### Gate 4: Documentation\nAre new features/APIs documented? Do AGENTS.md, README need updates?`,
    `### Gate 5: Integration sanity\nDo a quick end-to-end smoke test if possible. Does the feature work as described in the goal?`,
  ];

  // action="looks-good": gate passed — advance gate index and increment clean counter
  if (action === 'looks-good') {
    const gateIndex = (state.currentGateIndex ?? 0) % gateChecks.length;
    const nextGateIndex = (gateIndex + 1) % gateChecks.length;
    state.currentGateIndex = nextGateIndex;
    state.consecutiveCleanRounds = (state.consecutiveCleanRounds ?? 0) + 1;
    const consecutiveClean = state.consecutiveCleanRounds;

    if (consecutiveClean >= 2) {
      state.phase = 'iterating';
      saveState(state);
      return okResult(
        'iterating',
        `## Review gates complete (${consecutiveClean} clean rounds)

All beads closed and review gates passed. **Do not ask the user "want to commit?" in free text.**

**NEXT (MANDATORY):** \`flywheel_wrap_up_gate({ cwd })\` — present Step 9.5 numbered wrap-up options (full / commit only / skip), then follow \`skills/start/_wrapup.md\`.`,
        {
          kind: 'review_gates_complete',
          scope: 'gates',
          consecutiveCleanRounds: consecutiveClean,
          nextStep: { kind: 'wrap_up_gate' as const },
        }
      );
    }

    saveState(state);
    const nextGate = gateChecks[nextGateIndex];
    return okResult(
      state.phase,
      `Gate passed. Moving to next gate (${consecutiveClean}/2 clean rounds needed to finish).

## Next Review Gate

${nextGate}

After checking:
- If it **passes**: call \`flywheel_review\` with beadId="__gates__" and action="looks-good"
- If it **fails**: fix it, then call \`flywheel_review\` with beadId="__gates__" and action="hit-me"

**cwd:** ${cwd}`,
      {
        kind: 'review_gate',
        scope: 'gates',
        gateIndex: nextGateIndex,
        consecutiveCleanRounds: consecutiveClean,
        gatePrompt: nextGate,
      }
    );
  }

  // action="hit-me" or first entry: show current gate and reset clean streak
  state.iterationRound = (state.iterationRound ?? 0) + 1;
  const round = state.iterationRound;
  state.consecutiveCleanRounds = 0; // issue found — reset streak
  const gateIndex = (state.currentGateIndex ?? 0) % gateChecks.length;
  const currentGate = gateChecks[gateIndex];
  saveState(state);

  return okResult(
    state.phase,
    `## Review Gate (Round ${round})

${currentGate}

After completing this gate check:
- If it **passes**: call \`flywheel_review\` with beadId="__gates__" and action="looks-good" to advance
- If it **fails**: fix the issue and call \`flywheel_review\` with beadId="__gates__" and action="hit-me" to spawn fixers

**cwd:** ${cwd}`,
    {
      kind: 'review_gate',
      scope: 'gates',
      gateIndex,
      round,
      consecutiveCleanRounds: state.consecutiveCleanRounds,
      gatePrompt: currentGate,
    }
  );
}

async function regressToPhase(
  ctx: ToolContext,
  targetPhase: import('../types.js').FlywheelPhase,
  phaseName: string
): Promise<McpToolResult> {
  const { state, saveState } = ctx;
  // E6: phase regression is user steering
  const regressActionId =
    targetPhase === 'planning'
      ? 'regress-to-plan'
      : targetPhase === 'creating_beads'
        ? 'regress-to-beads'
        : 'regress-to-implement';
  await recordGateSteering(ctx, {
    source: 'wave_review',
    actionId: regressActionId,
  });
  state.phase = targetPhase;
  state.currentGateIndex = 0;
  state.iterationRound = 0;
  saveState(state);

  const instructions: Record<string, string> = {
    planning: `Revise the plan${state.planDocument ? ` at \`${state.planDocument}\`` : ''}, then call \`flywheel_approve_beads\` to re-enter the approval flow.`,
    creating_beads: `Create/revise beads using \`br create\` and \`br update\`, then call \`flywheel_approve_beads\` to return to the approval menu.`,
    implementing: `Use \`br ready\` to find the next unblocked bead and implement it, then call \`flywheel_review\` when done.`,
  };

  return {
    content: [{
      type: 'text',
      text: `Regressed to **${phaseName} phase**.\n\n${instructions[targetPhase] || 'Continue from the appropriate phase.'}`,
    }],
  };
}

function extractFilesFromBead(bead: Bead): string[] {
  if (!bead || typeof bead.description !== 'string' || bead.description.length === 0) {
    return [];
  }
  const files: string[] = [];
  // Heuristic: lines that look like file paths
  const lines = bead.description.split('\n');
  for (const line of lines) {
    const match = line.match(/[`\s]((?:src|lib|tests?|dist|app|packages?)\/[^\s`"']+\.[a-z]+)/);
    if (match) files.push(match[1]);
    // Also match bare paths like "- src/foo.ts"
    const bare = line.match(/^[-*]\s+([\w./]+\.[a-z]+)/);
    if (bare) files.push(bare[1]);
  }
  return [...new Set(files)].slice(0, 10);
}
