import { describe, it, expect, vi } from 'vitest';
import { AGENT_MAIL_SWARM_HINT, formatWaveHotspotWarnings, probeAgentMailReachable, resolveCursorCoordinationMode, } from '../coordination-mode.js';
function mockExec(stdout, code = 0) {
    return vi.fn().mockResolvedValue({ code, stdout, stderr: '' });
}
describe('probeAgentMailReachable', () => {
    it('returns reachable when liveness returns 200', async () => {
        const exec = mockExec('200');
        const result = await probeAgentMailReachable(exec, '/tmp/proj');
        expect(result.reachable).toBe(true);
    });
    it('returns unreachable when liveness returns non-200', async () => {
        const exec = mockExec('503');
        const result = await probeAgentMailReachable(exec, '/tmp/proj');
        expect(result.reachable).toBe(false);
        expect(result.warning).toContain('503');
    });
});
describe('resolveCursorCoordinationMode', () => {
    it('blocks when Agent Mail is down', async () => {
        const exec = mockExec('000', 7);
        const state = {};
        const result = await resolveCursorCoordinationMode(exec, '/tmp/proj', state);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.blocked).toBe(true);
            expect(result.reason).toContain('Agent Mail');
        }
        expect(state.coordinationMode).toBeUndefined();
    });
    it('returns single-branch and persists state when Agent Mail is up', async () => {
        const exec = mockExec('200');
        const state = {};
        const result = await resolveCursorCoordinationMode(exec, '/tmp/proj', state);
        expect(result).toEqual({ ok: true, mode: 'single-branch' });
        expect(state.coordinationMode).toBe('single-branch');
    });
});
describe('formatWaveHotspotWarnings', () => {
    it('returns empty for a single bead', () => {
        const beads = [
            {
                id: 'b-1',
                title: 'One',
                description: '- src/foo.ts',
                status: 'open',
                priority: 2,
                type: 'task',
                labels: [],
            },
        ];
        expect(formatWaveHotspotWarnings(beads)).toEqual([]);
    });
    it('warns when two beads share a file path', () => {
        const beads = [
            {
                id: 'b-1',
                title: 'A',
                description: '### Files:\n- src/shared.ts',
                status: 'open',
                priority: 2,
                type: 'task',
                labels: [],
            },
            {
                id: 'b-2',
                title: 'B',
                description: '### Files:\n- src/shared.ts',
                status: 'open',
                priority: 2,
                type: 'task',
                labels: [],
            },
        ];
        const warnings = formatWaveHotspotWarnings(beads);
        expect(warnings.some((w) => w.includes('src/shared.ts'))).toBe(true);
        expect(warnings.some((w) => w.includes('b-1'))).toBe(true);
    });
});
describe('AGENT_MAIL_SWARM_HINT', () => {
    it('mentions remediate', () => {
        expect(AGENT_MAIL_SWARM_HINT).toContain('agent_mail_liveness');
    });
});
//# sourceMappingURL=coordination-mode.test.js.map