/**
 * Shared verdict parse + branch logic for batch_review and hit-me collect phases.
 */
import { promises as fs } from 'node:fs';
import { clearPendingBatchReview, rollbackSynthesizedBeads, synthesizeBeadsFromFindings, } from './commit-batch.js';
import { AUTO_REVIEW_FINDING_LABEL } from './combined-review-prompt.js';
import { errMsg } from './errors.js';
import { createLogger } from './logger.js';
import { appendMemory } from './memory.js';
import { BatchReviewVerdictSchema } from './types.js';
import { makeOkToolResult } from './tools/shared.js';
const log = createLogger('review-verdict-collect');
function okCollect(phase, text, data) {
    return makeOkToolResult('flywheel_review', phase, text, data);
}
function needsAttentionFallback(ctx, opts, rawVerdict, reason) {
    const { state } = ctx;
    log.warn(`${opts.memoryTag}: falling back to needs_attention`, {
        provenanceKey: opts.provenanceKey,
        reason,
    });
    const rawSnippet = rawVerdict.length > 2048 ? `${rawVerdict.slice(0, 2048)}\n…(truncated)` : rawVerdict;
    const fallback = {
        status: 'needs_attention',
        findings: [],
        sha_range: opts.expectedShaRange,
    };
    return okCollect(state.phase, `## Review: NEEDS ATTENTION (fallback) — ${opts.provenanceKey}\n\n` +
        `${reason}\n\n` +
        `Verdict file: \`${opts.verdictPath}\`\n\n` +
        `**Raw reviewer output (first 2 KiB):**\n\n\`\`\`\n${rawSnippet}\n\`\`\``, {
        kind: opts.kind,
        verdict: fallback,
        nextStep: { kind: 'needs_attention', findings: [] },
        malformed: true,
        reason,
        rawVerdictSnippet: rawSnippet,
    });
}
export async function collectReviewVerdict(ctx, opts) {
    const { cwd, state, saveState } = ctx;
    const labels = opts.labels ?? [AUTO_REVIEW_FINDING_LABEL];
    let rawVerdict;
    if (opts.rawVerdict !== undefined) {
        rawVerdict = opts.rawVerdict;
    }
    else {
        try {
            rawVerdict = await fs.readFile(opts.verdictPath, 'utf-8');
        }
        catch (err) {
            return okCollect(state.phase, `Verdict file not readable at \`${opts.verdictPath}\`: ${errMsg(err)}`, {
                kind: opts.kind,
                error: 'verdict_unreadable',
                verdictPath: opts.verdictPath,
            });
        }
    }
    let parsedJson;
    try {
        parsedJson = JSON.parse(rawVerdict);
    }
    catch (err) {
        try {
            appendMemory(cwd, `malformed review verdict (${opts.provenanceKey}): ${errMsg(err)}`, opts.memoryTag);
        }
        catch { /* best-effort */ }
        return needsAttentionFallback(ctx, opts, rawVerdict, `Verdict JSON parse failed: ${errMsg(err)}`);
    }
    const parseResult = BatchReviewVerdictSchema.safeParse(parsedJson);
    if (!parseResult.success) {
        const issues = parseResult.error.issues
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; ');
        try {
            appendMemory(cwd, `malformed review verdict schema (${opts.provenanceKey}): ${issues}`, opts.memoryTag);
        }
        catch { /* best-effort */ }
        return needsAttentionFallback(ctx, opts, rawVerdict, `Verdict schema validation failed: ${issues}`);
    }
    const verdict = parseResult.data;
    if (verdict.sha_range !== opts.expectedShaRange) {
        return needsAttentionFallback(ctx, opts, rawVerdict, `Verdict sha_range "${verdict.sha_range}" does not match expected "${opts.expectedShaRange}".`);
    }
    if (opts.clearBatchPending) {
        ctx.state = clearPendingBatchReview(ctx.state);
    }
    await saveState(ctx.state);
    if (verdict.status === 'pass') {
        const passNext = opts.kind === 'hit_me_review_verdict'
            ? { kind: 'proceed_looks_good' }
            : { kind: 'advance_wave' };
        return okCollect(state.phase, opts.passMessage, {
            kind: opts.kind,
            verdict,
            nextStep: passNext,
        });
    }
    if (verdict.status === 'needs_attention') {
        return okCollect(state.phase, opts.needsAttentionMessage, {
            kind: opts.kind,
            verdict,
            nextStep: { kind: 'needs_attention', findings: verdict.findings },
        });
    }
    let synthesisError;
    let synthesizedIds = [];
    try {
        synthesizedIds = await synthesizeBeadsFromFindings(cwd, state, verdict.findings, opts.provenanceKey, labels);
    }
    catch (err) {
        synthesisError = errMsg(err);
        const partialIds = state.batchReviewSynthesizedBeads?.[opts.provenanceKey] ?? [];
        if (partialIds.length > 0) {
            try {
                const rb = await rollbackSynthesizedBeads(cwd, partialIds);
                log.warn(`${opts.memoryTag}: partial-rollback after synthesize failure`, {
                    provenanceKey: opts.provenanceKey,
                    deleted: rb.deleted.length,
                    closed: rb.closed.length,
                    failed: rb.failed.length,
                });
            }
            catch (rbErr) {
                log.error(`${opts.memoryTag}: rollback also failed`, { err: errMsg(rbErr) });
            }
            if (state.batchReviewSynthesizedBeads) {
                delete state.batchReviewSynthesizedBeads[opts.provenanceKey];
            }
        }
        try {
            appendMemory(cwd, `review synthesize failure (${opts.provenanceKey}): ${synthesisError}`, opts.memoryTag);
        }
        catch { /* best-effort */ }
    }
    await saveState(state);
    if (synthesisError) {
        return okCollect(state.phase, `${opts.blockingMessagePrefix} (synthesis failed)\n\n` +
            `Verdict was blocking but bead synthesis failed: ${synthesisError}.`, {
            kind: opts.kind,
            verdict,
            nextStep: { kind: 'needs_attention', findings: verdict.findings },
            synthesisError,
        });
    }
    const mapping = synthesizedIds.map((beadId, i) => ({
        beadId,
        finding: verdict.findings[i],
    }));
    return okCollect(state.phase, `${opts.blockingMessagePrefix}\n\n` +
        `Synthesized ${synthesizedIds.length} bead(s). Created: ${synthesizedIds.join(', ')}`, {
        kind: opts.kind,
        verdict,
        nextStep: {
            kind: 'synthesized_beads_pending',
            beadIds: synthesizedIds,
            mapping,
        },
    });
}
//# sourceMappingURL=review-verdict-collect.js.map