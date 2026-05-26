import { describe, it, expect } from 'vitest';
import { runBeadApprovalGate, runWaveReviewGate, runWrapUpGate } from '../../tools/user-gate.js';
import { createMockExec, makeState } from '../helpers/mocks.js';
function makeBead(id) {
    return {
        id,
        title: 'Test',
        description: 'docs readme',
        status: 'open',
        priority: 2,
        type: 'task',
        labels: [],
    };
}
describe('flywheel user gate tools', () => {
    it('flywheel_wave_review_gate returns userGate', async () => {
        const bead = makeBead('tb-9');
        const { ctx } = {
            ctx: {
                exec: createMockExec([
                    {
                        cmd: 'br',
                        args: [
                            'list',
                            '--json',
                            '--fields',
                            'id,title,description,status,priority,issue_type,labels,estimate,parent,created_at,updated_at,closed_at',
                            '--deferred',
                        ],
                        result: {
                            code: 0,
                            stdout: JSON.stringify({ issues: [bead] }),
                            stderr: '',
                        },
                    },
                ]),
                cwd: '/fake/project',
                state: makeState({ phase: 'implementing' }),
                saveState: (_s) => { },
                clearState: () => { },
            },
        };
        const result = await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ['tb-9'],
        });
        const data = result.structuredContent.data;
        expect(data.gateMeta.kind).toBe('wave_review');
        expect(data.actions['1']).toBe('looks-good-all');
        expect(data.askQuestion.questions[0].options.length).toBeGreaterThanOrEqual(3);
        expect(result.content[0]?.text).not.toContain('coordinatorAction');
    });
    it('flywheel_bead_approval_gate step=review returns bead_review menu', async () => {
        const bead = makeBead('tb-1');
        const { ctx } = {
            ctx: {
                exec: createMockExec([
                    {
                        cmd: 'br',
                        args: ['list', '--json'],
                        result: {
                            code: 0,
                            stdout: JSON.stringify({ issues: [bead] }),
                            stderr: '',
                        },
                    },
                ]),
                cwd: '/fake/project',
                state: makeState({ phase: 'creating_beads', selectedGoal: 'g' }),
                saveState: (_s) => { },
                clearState: () => { },
            },
        };
        const result = await runBeadApprovalGate(ctx, {
            cwd: '/fake/project',
            step: 'review',
        });
        const data = result.structuredContent.data;
        expect(data.gateMeta).toMatchObject({ kind: 'bead_review' });
        expect(data.askQuestion).toBeDefined();
        expect(data.askQuestion.questions[0].options).toHaveLength(3);
    });
    it('flywheel_bead_approval_gate step=launch returns quality and launch gate', async () => {
        const bead = makeBead('tb-2');
        const { ctx } = {
            ctx: {
                exec: createMockExec([
                    {
                        cmd: 'br',
                        args: ['list', '--json'],
                        result: {
                            code: 0,
                            stdout: JSON.stringify({ issues: [bead] }),
                            stderr: '',
                        },
                    },
                ]),
                cwd: '/fake/project',
                state: makeState({
                    phase: 'awaiting_bead_approval',
                    selectedGoal: 'g',
                    polishChanges: [2, 1, 0],
                    polishOutputSizes: [100, 110, 120],
                }),
                saveState: (_s) => { },
                clearState: () => { },
            },
        };
        const result = await runBeadApprovalGate(ctx, {
            cwd: '/fake/project',
            step: 'launch',
        });
        const data = result.structuredContent.data;
        expect(data.quality).toBeDefined();
        expect(['bead_launch', 'bead_low_quality', 'bead_hotspot']).toContain(data.gateMeta.kind);
    });
    it('flywheel_wrap_up_gate returns wrap-up menu', async () => {
        const { ctx } = {
            ctx: {
                exec: createMockExec([]),
                cwd: process.cwd(),
                state: makeState({ phase: 'iterating' }),
                saveState: (_s) => { },
                clearState: () => { },
            },
        };
        const result = await runWrapUpGate(ctx, { cwd: process.cwd() });
        const data = result.structuredContent.data;
        expect(data.gateMeta.kind).toBe('wrap_up');
        expect(data.actions['1']).toBe('wrap-up-full');
        expect(data.askQuestion.questions[0].options[0].id).toBe('1');
    });
    it('E7: flywheel_wrap_up_gate confirmWrapUp bumps coordinatorEpoch', async () => {
        const saved = [];
        const { ctx } = {
            ctx: {
                exec: createMockExec([]),
                cwd: process.cwd(),
                state: makeState({ phase: 'iterating', coordinatorEpoch: 0 }),
                saveState: (s) => {
                    saved.push(structuredClone(s));
                },
                clearState: () => { },
            },
        };
        await runWrapUpGate(ctx, { cwd: process.cwd(), confirmWrapUp: 'full' });
        expect(ctx.state.coordinatorEpoch).toBe(1);
        expect(saved.some((s) => s.coordinatorEpoch === 1)).toBe(true);
        expect(ctx.state.steeringEvents).toHaveLength(1);
        expect(ctx.state.steeringEvents[0]).toMatchObject({
            source: 'wrap_up',
            actionId: 'wrap-up-full',
        });
    });
    it('E8: flywheel_wave_review_gate confirmAction bumps coordinatorEpoch', async () => {
        const bead = makeBead('tb-9');
        bead.status = 'in_progress';
        const saved = [];
        const { ctx } = {
            ctx: {
                exec: createMockExec([
                    {
                        cmd: 'br',
                        args: ['show', 'tb-9', '--json'],
                        result: { code: 0, stdout: JSON.stringify(bead), stderr: '' },
                    },
                    {
                        cmd: 'br',
                        args: ['update', 'tb-9', '--status', 'closed'],
                        result: { code: 0, stdout: '', stderr: '' },
                    },
                    {
                        cmd: 'br',
                        args: ['ready', '--json'],
                        result: { code: 0, stdout: '[]', stderr: '' },
                    },
                ]),
                cwd: '/fake/project',
                state: makeState({
                    phase: 'implementing',
                    coordinatorEpoch: 4,
                    beadResults: {},
                }),
                saveState: (s) => {
                    saved.push(structuredClone(s));
                },
                clearState: () => { },
            },
        };
        const result = await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ['tb-9'],
            confirmAction: 'looks-good-all',
        });
        const data = result.structuredContent.data;
        expect(data.kind).toBe('wave_review_confirmed');
        expect(data.coordinatorEpoch).toBe(5);
        expect(data.closedBeadIds).toEqual(['tb-9']);
        expect(ctx.state.coordinatorEpoch).toBe(5);
        expect(ctx.state.beadResults['tb-9']).toMatchObject({
            beadId: 'tb-9',
            status: 'success',
        });
        expect(saved.some((s) => s.beadResults?.['tb-9']?.status === 'success')).toBe(true);
        expect(ctx.state.steeringEvents).toHaveLength(1);
        expect(ctx.state.steeringEvents[0]).toMatchObject({
            source: 'wave_review',
            actionId: 'looks-good-all',
            beadIds: ['tb-9'],
        });
        expect(result.content[0]?.text).toContain('closed 1 bead');
    });
    it('E8: confirmAction looks-good-all closes every bead in the wave', async () => {
        const beadA = makeBead('tb-a');
        beadA.status = 'in_progress';
        const beadB = makeBead('tb-b');
        beadB.status = 'in_progress';
        const { ctx } = {
            ctx: {
                exec: createMockExec([
                    { cmd: 'br', args: ['show', 'tb-a', '--json'], result: { code: 0, stdout: JSON.stringify(beadA), stderr: '' } },
                    { cmd: 'br', args: ['update', 'tb-a', '--status', 'closed'], result: { code: 0, stdout: '', stderr: '' } },
                    { cmd: 'br', args: ['show', 'tb-b', '--json'], result: { code: 0, stdout: JSON.stringify(beadB), stderr: '' } },
                    { cmd: 'br', args: ['update', 'tb-b', '--status', 'closed'], result: { code: 0, stdout: '', stderr: '' } },
                    { cmd: 'br', args: ['ready', '--json'], result: { code: 0, stdout: '[]', stderr: '' } },
                ]),
                cwd: '/fake/project',
                state: makeState({ phase: 'implementing', beadResults: {} }),
                saveState: (_s) => { },
                clearState: () => { },
            },
        };
        await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ['tb-a', 'tb-b'],
            confirmAction: 'looks-good-all',
        });
        expect(ctx.state.beadResults['tb-a']?.status).toBe('success');
        expect(ctx.state.beadResults['tb-b']?.status).toBe('success');
    });
});
//# sourceMappingURL=user-gate.test.js.map