import { describe, it, expect } from 'vitest';
import { runDuel } from '../../tools/duel.js';
import { makeState } from '../helpers/mocks.js';
describe('flywheel_duel', () => {
    it('returns duelModelsGate when models not confirmed', async () => {
        const ctx = {
            exec: async () => ({ code: 1, stdout: '', stderr: '' }),
            cwd: '/fake/project',
            state: makeState({ phase: 'discovering' }),
            saveState: () => { },
            clearState: () => { },
        };
        const result = await runDuel(ctx, { cwd: '/fake/project', mode: 'ideas' });
        const data = result.structuredContent.data;
        expect(data.duelModelsGate).toBeDefined();
        expect(data.duelModelsGate.kind).toBe('confirm_duel_models');
    });
    it('returns cursorDuel spawn payload after confirm', async () => {
        const state = makeState({ phase: 'planning', selectedGoal: 'Ship feature X' });
        const ctx = {
            exec: async () => ({ code: 1, stdout: '', stderr: '' }),
            cwd: '/fake/project',
            state,
            saveState: (s) => {
                Object.assign(state, s);
            },
            clearState: () => { },
        };
        const result = await runDuel(ctx, {
            cwd: '/fake/project',
            mode: 'architecture',
            confirmDuelModels: 'recommended',
        });
        const data = result.structuredContent.data;
        expect(data.cursorDuel).toBeDefined();
        expect(data.cursorDuel.kind).toBe('cursor_duel_spawn');
        expect(state.duelModelsConfirmed).toBe(true);
    });
});
//# sourceMappingURL=duel.test.js.map