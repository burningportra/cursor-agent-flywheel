import { readyBeads } from '../beads.js';
import { resolveCommitBatchThreshold } from '../commit-batch.js';
import { buildCursorImplSpawnInstructions, buildImplModelsGate, formatBeadClassificationTable, formatCursorImplModelTable, resolveImplModelsConfirm, useNtmImplBackend, } from '../cursor-implement-swarm.js';
import { AGENT_MAIL_SWARM_HINT, resolveCursorCoordinationMode, } from '../coordination-mode.js';
import { makeOkToolResult, makeToolError } from './shared.js';
import { areAutoBatchReviewEnabled, areAutoLoopEnabled } from '../flywheel-config.js';
function persistCommitBatchThreshold(cwd, state, explicit) {
    if (typeof explicit === 'number'
        && Number.isInteger(explicit)
        && explicit >= 0) {
        state.commitBatchThreshold = explicit;
        return explicit;
    }
    if (state.commitBatchThreshold !== undefined) {
        return state.commitBatchThreshold;
    }
    const resolved = resolveCommitBatchThreshold(cwd, state);
    if (resolved > 0) {
        state.commitBatchThreshold = resolved;
    }
    return resolved;
}
export async function runConfirmImplModels(ctx, args) {
    const { cwd, state, saveState, exec } = ctx;
    let readyForRecommend = [];
    try {
        readyForRecommend = await readyBeads(exec, cwd);
    }
    catch {
        /* recommendation falls back to config-only when br unavailable */
    }
    if (args.confirmImplModels === undefined) {
        const gate = buildImplModelsGate(cwd, readyForRecommend);
        const batchThreshold = resolveCommitBatchThreshold(cwd, state);
        const autoBatchReview = areAutoBatchReviewEnabled(cwd);
        const autoLoop = areAutoLoopEnabled(cwd);
        let agentMailReachable = true;
        if (!useNtmImplBackend()) {
            const probe = await resolveCursorCoordinationMode(exec, cwd, state);
            agentMailReachable = probe.ok;
            if (probe.ok) {
                saveState(state);
            }
        }
        const outcome = {
            implModelsGate: gate,
            confirmed: Boolean(state.implModelsConfirmed),
            commitBatchThreshold: batchThreshold,
            agentMailRequired: !useNtmImplBackend(),
            ...(state.implModelsConfirmed && state.implModels
                ? {
                    implModels: state.implModels,
                    executionMode: 'single-branch',
                    spawnInstructions: buildCursorImplSpawnInstructions(state.implModels, cwd, {
                        executionMode: 'single-branch',
                    }),
                }
                : {}),
        };
        const batchLine = autoBatchReview
            ? batchThreshold > 0
                ? `Commit-batch fresh-eyes: **automatic** every ${batchThreshold} commits (sha-range thermo Task; no wave review menu).`
                : 'Commit-batch fresh-eyes: OFF — set impl_tick.commit_batch_threshold in flywheel.config.yaml (recommended: 5).'
            : batchThreshold > 0
                ? `Commit-batch fresh-eyes: every ${batchThreshold} commits (from config/env/checkpoint). Pass commitBatchThreshold on confirm to override.`
                : 'Commit-batch fresh-eyes: OFF — pass commitBatchThreshold on confirm (e.g. 5) or set impl_tick.commit_batch_threshold in flywheel.config.yaml.';
        const loopLine = autoLoop
            ? 'After first impl dispatch, **mandatory `/loop`** dynamic wake will re-call `flywheel_impl_tick` (~4 min default).'
            : 'Optional: arm `/loop` via impl supervision menu after first dispatch.';
        const lines = [
            state.implModelsConfirmed
                ? 'Implement models already confirmed for this run.'
                : 'Recommend implement models, explain why, then let the user choose.',
            '',
            !useNtmImplBackend()
                ? '**Coordination:** single shared branch + Agent Mail file reservations (no worktrees). Agent Mail must be running before spawning parallel Tasks.'
                : '',
            !useNtmImplBackend() && !agentMailReachable
                ? `⚠️ Agent Mail is not reachable — parallel swarm will be blocked until it is up. ${AGENT_MAIL_SWARM_HINT}`
                : '',
            '',
            `**Recommendation:** ${gate.rationale}`,
            '',
            formatCursorImplModelTable(gate.recommended),
            ...(gate.beadClassifications && gate.beadClassifications.length > 0
                ? [
                    '',
                    '**Per-bead complexity (sanity-check before confirm):**',
                    formatBeadClassificationTable(gate.beadClassifications),
                ]
                : []),
            '',
            batchLine,
            loopLine,
            '',
            'Present implModelsGate.options as numbered choices; wait for the user reply.',
            autoBatchReview
                ? 'Then call flywheel_confirm_impl_models with confirmImplModels set ("recommended" if they accept option 1). Threshold is persisted from config automatically.'
                : 'Then call flywheel_confirm_impl_models with confirmImplModels set ("recommended" if they accept option 1) and commitBatchThreshold when the user picks a batch-review cadence.',
        ];
        return makeOkToolResult('flywheel_confirm_impl_models', state.phase, lines.join('\n'), outcome);
    }
    let resolved;
    try {
        resolved = resolveImplModelsConfirm(cwd, args.confirmImplModels, readyForRecommend);
    }
    catch (err) {
        return makeToolError('flywheel_confirm_impl_models', state.phase, 'invalid_input', err instanceof Error ? err.message : String(err));
    }
    if (!resolved.simple || !resolved.medium || !resolved.complex) {
        return makeToolError('flywheel_confirm_impl_models', state.phase, 'invalid_input', 'Each of simple, medium, and complex must be a non-empty model slug.');
    }
    if (!useNtmImplBackend()) {
        const coord = await resolveCursorCoordinationMode(exec, cwd, state);
        if (!coord.ok) {
            return makeToolError('flywheel_confirm_impl_models', state.phase, 'agent_mail_unreachable', coord.reason, {
                hint: AGENT_MAIL_SWARM_HINT,
                details: { warning: coord.warning },
                retryable: true,
            });
        }
    }
    state.implModels = resolved;
    state.implModelsConfirmed = true;
    const batchThreshold = persistCommitBatchThreshold(cwd, state, args.commitBatchThreshold);
    saveState(state);
    const outcome = {
        implModels: resolved,
        spawnInstructions: buildCursorImplSpawnInstructions(resolved, cwd, {
            executionMode: 'single-branch',
        }),
        confirmed: true,
        commitBatchThreshold: batchThreshold,
        executionMode: 'single-branch',
        agentMailRequired: !useNtmImplBackend(),
    };
    const batchConfirmLine = batchThreshold > 0
        ? `Commit-batch fresh-eyes threshold persisted: ${batchThreshold} commits per review (automatic dispatch).`
        : 'Commit-batch fresh-eyes: disabled (threshold 0).';
    const autoLoop = areAutoLoopEnabled(cwd);
    return makeOkToolResult('flywheel_confirm_impl_models', state.phase, [
        'Implement models confirmed.',
        '',
        formatCursorImplModelTable(resolved),
        '',
        batchConfirmLine,
        autoLoop
            ? 'Arm `/loop` dynamic wake after first impl dispatch (~impl_tick.interval_seconds).'
            : '',
        '',
        'Spawn parallel Cursor Task agents using spawnInstructions; each Task must set `model` per bead complexity.',
        'Re-call flywheel_impl_tick on ~interval_seconds cadence during implementation.',
    ]
        .filter(Boolean)
        .join('\n'), outcome);
}
//# sourceMappingURL=confirm-impl-models.js.map