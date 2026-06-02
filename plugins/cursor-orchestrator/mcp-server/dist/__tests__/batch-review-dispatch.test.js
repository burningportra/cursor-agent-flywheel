import { describe, expect, it, vi } from 'vitest';
import { prepareBatchReviewDispatch } from '../batch-review-dispatch.js';
import { THERMO_SUBAGENT_TYPE } from '../combined-review-prompt.js';
import { createMockExec, makeState } from './helpers/mocks.js';
function makeCtx(cwd, stateOverrides = {}) {
    const state = makeState(stateOverrides);
    return {
        cwd,
        exec: createMockExec([
            {
                cmd: 'git',
                args: ['diff', '--name-only', 'abc..def'],
                result: { code: 0, stdout: 'src/changed.ts\n', stderr: '' },
            },
        ]),
        signal: undefined,
        state,
        saveState: vi.fn(async (s) => Object.assign(state, s)),
    };
}
describe('prepareBatchReviewDispatch', () => {
    it('returns combined fresh-eyes + thermo prompt and changed files', async () => {
        const ctx = makeCtx('/fake/cwd');
        const dispatch = await prepareBatchReviewDispatch(ctx, 'abc..def', 'def');
        expect(dispatch.shaRange).toBe('abc..def');
        expect(dispatch.changedFiles).toEqual(['src/changed.ts']);
        expect(dispatch.prompt).toContain('Combined Fresh-Eyes + Thermo-Nuclear Review');
        expect(dispatch.prompt).toContain('/thermo-nuclear-code-quality-review');
        expect(dispatch.prompt).toContain('STRUCTURED FINDINGS REQUIRED');
        expect(dispatch.verdictRel).toBe('.pi-flywheel/batch-reviews/abc..def.json');
    });
});
describe('thermo subagent constant', () => {
    it('THERMO_SUBAGENT_TYPE is thermo-nuclear-code-quality-review', () => {
        expect(THERMO_SUBAGENT_TYPE).toBe('thermo-nuclear-code-quality-review');
    });
});
//# sourceMappingURL=batch-review-dispatch.test.js.map