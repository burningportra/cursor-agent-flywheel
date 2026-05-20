/**
 * `flywheel_impl_tick` — Cursor-native implementation supervision loop.
 */
import { z } from 'zod';
import { runImplTickCore } from '../cursor-impl-tick.js';
import { FlywheelError, makeFlywheelErrorResult, errMsg } from '../errors.js';
import { makeNextToolStep, makeToolResult } from './shared.js';
export const ImplTickInputSchema = z.object({
    cwd: z.string().min(1),
    closedBeadIds: z
        .array(z.string().min(1))
        .optional()
        .describe('Beads closed since the previous tick — triggers flywheel_advance_wave'),
    coordinatorAgent: z.string().min(1).optional(),
});
export async function runImplTick(ctx, rawArgs) {
    const parsed = ImplTickInputSchema.safeParse(rawArgs);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
            .join('; ');
        return makeFlywheelErrorResult('flywheel_impl_tick', ctx.state.phase, {
            code: 'invalid_input',
            message: `flywheel_impl_tick: ${issues}`,
            hint: 'Pass { cwd, closedBeadIds?, coordinatorAgent? }.',
        });
    }
    try {
        const { text, structured } = await runImplTickCore(ctx, parsed.data);
        const kind = structured.data.kind;
        const nextType = kind === 'batch_review_dispatch' || kind === 'dispatch_impl_tasks' || kind === 'advance_wave'
            ? 'spawn_agents'
            : kind === 'batch_review_verdict' || kind === 'wave_complete'
                ? 'present_choices'
                : 'none';
        return makeToolResult(text, {
            ...structured,
            nextStep: makeNextToolStep(nextType, kind === 'monitor' || kind === 'batch_review_in_progress'
                ? `Re-call flywheel_impl_tick in ~${structured.data.nextTickInSeconds}s.`
                : `Branch on data.kind (${kind}); see coordinatorPlaybook.`),
        });
    }
    catch (err) {
        if (err instanceof FlywheelError) {
            return makeFlywheelErrorResult('flywheel_impl_tick', ctx.state.phase, {
                code: err.code,
                message: err.message,
                retryable: err.retryable,
                hint: err.hint,
                cause: err.cause,
            });
        }
        return makeFlywheelErrorResult('flywheel_impl_tick', ctx.state.phase, {
            code: 'internal_error',
            message: 'flywheel_impl_tick threw',
            cause: errMsg(err),
        });
    }
}
//# sourceMappingURL=impl-tick.js.map