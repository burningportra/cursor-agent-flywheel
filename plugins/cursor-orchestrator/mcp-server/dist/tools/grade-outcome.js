/**
 * `flywheel_grade_outcome` MCP tool wrapper (T8 / claude-orchestrator-not).
 *
 * Calls `gradeOutcome()` from `outcome-grading.ts` and packages the result
 * into the `version: 1` MCP envelope with discriminator `kind`:
 *
 *   - `grader_verdict`             — verdict computed and persisted
 *   - `grader_deferred`            — Cursor port: spawn Task, then re-call with graderStdout
 *   - `grading_skipped`            — operator skipped at plan-approve gate
 *   - `grading_capped`             — verdict status was coerced to
 *                                    `max_iterations_reached` server-side
 *   - `grading_persistence_failed` — verdict in-memory; disk write failed
 *
 * Timeout / unavailable / verdict-parse failures route through
 * `makeFlywheelErrorResult` with the matching FlywheelErrorCode.
 */
import { z } from 'zod';
import { FlywheelError, makeFlywheelErrorResult, errMsg } from '../errors.js';
import { gradeOutcome, isGradeSkipped, isGraderDeferred, } from '../outcome-grading.js';
import { buildAskQuestionFromGate, buildWrapUpVerdictGate, } from '../cursor-user-gates.js';
import { makeNextToolStep, makeToolResult } from './shared.js';
export const GradeOutcomeInputSchema = z.object({
    cwd: z.string().min(1),
    planSlug: z.string().min(1).optional(),
    force: z.boolean().optional(),
    graderStdout: z
        .string()
        .optional()
        .describe('Cursor port: decorrelated grader Task stdout (JSON). Call again with same cwd after Task completes.'),
});
function classifyVerdictKind(verdict) {
    if (verdict.persistence === 'failed')
        return 'grading_persistence_failed';
    if (verdict.status === 'max_iterations_reached')
        return 'grading_capped';
    return 'grader_verdict';
}
function summariseVerdict(verdict) {
    const unmet = verdict.perCriterion.filter((c) => c.status === 'unmet').length;
    const partial = verdict.perCriterion.filter((c) => c.status === 'partial').length;
    const modelNote = verdict.modelUsed === 'cursor'
        ? 'cursor Task'
        : verdict.modelUsed === 'claude'
            ? 'claude (legacy CLI)'
            : 'codex (legacy CLI)';
    return `Outcome grade: ${verdict.status} @ iter ${verdict.iteration} (${unmet} unmet, ${partial} partial). Grader: ${modelNote} in ${verdict.durationMs}ms.`;
}
export async function runGradeOutcome(ctx, rawArgs) {
    const parsedInput = GradeOutcomeInputSchema.safeParse(rawArgs);
    if (!parsedInput.success) {
        const issues = parsedInput.error.issues
            .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join('; ');
        return makeFlywheelErrorResult('flywheel_grade_outcome', ctx.state.phase, {
            code: 'invalid_input',
            message: `flywheel_grade_outcome: ${issues}`,
            hint: 'Pass { cwd, planSlug?, force?, graderStdout? } per the tool inputSchema.',
        });
    }
    const args = parsedInput.data;
    const callArgs = {
        cwd: args.cwd,
        planSlug: args.planSlug,
        force: args.force,
        graderStdout: args.graderStdout,
    };
    try {
        const result = await gradeOutcome(ctx, callArgs);
        if (isGradeSkipped(result)) {
            const structured = {
                tool: 'flywheel_grade_outcome',
                version: 1,
                status: 'ok',
                data: { kind: 'grading_skipped', reason: result.reason },
                nextStep: makeNextToolStep('none', 'Outcome grading skipped for this cycle by operator choice; continue Step 9.5 normally.'),
            };
            return makeToolResult('Outcome grading skipped for this cycle by operator choice at plan approval.', structured);
        }
        if (isGraderDeferred(result)) {
            const structured = {
                tool: 'flywheel_grade_outcome',
                version: 1,
                status: 'ok',
                data: {
                    kind: 'grader_deferred',
                    model: result.model,
                    iteration: result.iteration,
                    cap: result.cap,
                    verdictRel: result.verdictRel,
                    graderTask: {
                        model: result.model,
                        subagent_type: 'generalPurpose',
                        description: 'Outcome grader (decorrelated)',
                        prompt: result.prompt,
                    },
                    coordinatorPlaybook: result.coordinatorPlaybook,
                    instructions: result.instructions,
                },
                nextStep: makeNextToolStep('present_choices', `Spawn Task(model: "${result.model}") with data.graderTask.prompt, then flywheel_grade_outcome({ cwd, graderStdout }).`),
            };
            return makeToolResult(`Outcome grader deferred to Cursor Task (model ${result.model}, iter ${result.iteration}/${result.cap}). Spawn Task, then re-call with graderStdout.`, structured);
        }
        const verdict = result;
        const kind = classifyVerdictKind(verdict);
        const summary = summariseVerdict(verdict);
        const gate = buildWrapUpVerdictGate({
            status: verdict.status,
            explanation: verdict.explanation,
        });
        const askQuestion = buildAskQuestionFromGate(gate);
        const structured = {
            tool: 'flywheel_grade_outcome',
            version: 1,
            status: 'ok',
            data: { kind, verdict, askQuestion },
            nextStep: makeNextToolStep('present_choices', kind === 'grading_capped'
                ? 'Present data.askQuestion — Accept anyway / Abort (no Iterate).'
                : verdict.status === 'satisfied'
                    ? 'Present data.askQuestion — continue to flywheel_wrap_up_gate.'
                    : 'Present data.askQuestion — Iterate / Accept anyway / Abort per Step 9.5.'),
        };
        return makeToolResult(summary, structured);
    }
    catch (err) {
        if (err instanceof FlywheelError) {
            return makeFlywheelErrorResult('flywheel_grade_outcome', ctx.state.phase, {
                code: err.code,
                message: err.message,
                retryable: err.retryable,
                hint: err.hint,
                cause: err.cause,
                details: err.details,
            });
        }
        return makeFlywheelErrorResult('flywheel_grade_outcome', ctx.state.phase, {
            code: 'internal_error',
            message: 'flywheel_grade_outcome threw',
            cause: errMsg(err),
        });
    }
}
//# sourceMappingURL=grade-outcome.js.map