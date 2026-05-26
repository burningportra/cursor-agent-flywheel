import { describe, it, expect, beforeEach } from 'vitest';
import { runWaveReviewGate, runWrapUpGate } from '../../tools/user-gate.js';
import { deriveGateResolutionKey } from '../../gate-resolutions.js';
import { createMockExec, makeState } from '../helpers/mocks.js';
import { invalidateBeadCache } from '../../beads.js';
function makeBead(id) {
    return {
        id,
        title: 'Test',
        description: 'docs readme',
        status: 'in_progress',
        priority: 2,
        type: 'task',
        labels: [],
    };
}
const BR_LIST_ARGS = [
    'list',
    '--json',
    '--fields',
    'id,title,description,status,priority,issue_type,labels,estimate,parent,created_at,updated_at,closed_at',
    '--deferred',
];
function looksGoodExecCalls(ids) {
    const beads = ids.map((id) => makeBead(id));
    const calls = [
        {
            cmd: 'br',
            args: BR_LIST_ARGS,
            result: { code: 0, stdout: JSON.stringify({ issues: beads }), stderr: '' },
        },
    ];
    for (const id of ids) {
        calls.push({
            cmd: 'br',
            args: ['update', id, '--status', 'closed'],
            result: { code: 0, stdout: '', stderr: '' },
        });
    }
    calls.push({
        cmd: 'br',
        args: ['ready', '--json'],
        result: { code: 0, stdout: '[]', stderr: '' },
    });
    return calls;
}
function freshEyesExecCalls(beadId) {
    const bead = makeBead(beadId);
    return [
        {
            cmd: 'br',
            args: ['show', beadId, '--json'],
            result: { code: 0, stdout: JSON.stringify(bead), stderr: '' },
        },
    ];
}
function makeCtx(initialEpoch, execCalls) {
    const state = makeState({
        phase: 'implementing',
        coordinatorEpoch: initialEpoch,
        beadResults: {},
    });
    let saved;
    return {
        ctx: {
            exec: createMockExec(execCalls),
            cwd: '/fake/project',
            state,
            saveState: (s) => {
                saved = s;
            },
            clearState: () => { },
        },
        initialEpoch,
        get saved() {
            return saved ?? state;
        },
    };
}
function dataOf(result) {
    return result.structuredContent.data;
}
beforeEach(() => {
    invalidateBeadCache();
});
describe('runWaveReviewGate idempotence', () => {
    it('looks-good-all: second confirm is replay without bump or second ledger entry', async () => {
        const ids = ['tb-1', 'tb-2'];
        const calls = [...looksGoodExecCalls(ids), ...looksGoodExecCalls(ids)];
        const { ctx, initialEpoch } = makeCtx(2, calls);
        const first = await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ids,
            confirmAction: 'looks-good-all',
        });
        expect(first.isError).toBeFalsy();
        expect(dataOf(first).idempotentReplay).toBeUndefined();
        expect(ctx.state.coordinatorEpoch).toBe(initialEpoch + 1);
        expect(ctx.state.gateResolutions).toHaveLength(1);
        const epochAfterFirst = ctx.state.coordinatorEpoch;
        const steeringAfterFirst = (ctx.state.steeringEvents ?? []).length;
        const ledgerAfterFirst = ctx.state.gateResolutions.length;
        const second = await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ids,
            confirmAction: 'looks-good-all',
        });
        expect(second.isError).toBeFalsy();
        const secondData = dataOf(second);
        expect(secondData.idempotentReplay).toBe(true);
        expect(secondData.dispatchKey).toBe(ctx.state.gateResolutions[0].key);
        expect(ctx.state.coordinatorEpoch).toBe(epochAfterFirst);
        expect(ctx.state.steeringEvents ?? []).toHaveLength(steeringAfterFirst);
        expect(ctx.state.gateResolutions).toHaveLength(ledgerAfterFirst);
    });
    it('looks-good-all: bead id order produces the same resolution key', async () => {
        const { ctx } = makeCtx(1, looksGoodExecCalls(['a', 'b', 'c']));
        await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ['b', 'a', 'c'],
            confirmAction: 'looks-good-all',
        });
        const keyFromFirstOrder = ctx.state.gateResolutions[0].key;
        const keyFromSorted = deriveGateResolutionKey({
            kind: 'wave_review',
            actionId: 'looks-good-all',
            beadIds: ['a', 'b', 'c'],
        });
        expect(keyFromFirstOrder).toBe(keyFromSorted);
    });
    it('fresh-eyes: duplicate confirm replays with same dispatchKey', async () => {
        const beadId = 'tb-1';
        const calls = [...freshEyesExecCalls(beadId), ...freshEyesExecCalls(beadId)];
        const { ctx, initialEpoch } = makeCtx(4, calls);
        const first = await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: [beadId],
            confirmAction: 'fresh-eyes',
        });
        expect(first.isError).toBeFalsy();
        const dispatchKey = dataOf(first).dispatchKey;
        expect(dispatchKey).toBeTruthy();
        const epochAfterFirst = ctx.state.coordinatorEpoch;
        const steeringAfterFirst = (ctx.state.steeringEvents ?? []).length;
        const second = await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: [beadId],
            confirmAction: 'fresh-eyes',
        });
        const secondData = dataOf(second);
        expect(secondData.idempotentReplay).toBe(true);
        expect(secondData.dispatchKey).toBe(dispatchKey);
        expect(ctx.state.coordinatorEpoch).toBe(epochAfterFirst);
        expect(ctx.state.steeringEvents ?? []).toHaveLength(steeringAfterFirst);
        expect(ctx.state.gateResolutions).toHaveLength(1);
    });
    it('fresh-eyes: different reviewBeadId on multi-bead wave records distinct resolutions', async () => {
        const ids = ['tb-1', 'tb-2'];
        const calls = [
            ...freshEyesExecCalls('tb-1'),
            ...freshEyesExecCalls('tb-2'),
        ];
        const { ctx, initialEpoch } = makeCtx(1, calls);
        await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ids,
            confirmAction: 'fresh-eyes',
            reviewBeadId: 'tb-1',
        });
        expect(ctx.state.coordinatorEpoch).toBe(initialEpoch + 2);
        expect(ctx.state.gateResolutions).toHaveLength(1);
        await runWaveReviewGate(ctx, {
            cwd: '/fake/project',
            beadIds: ids,
            confirmAction: 'fresh-eyes',
            reviewBeadId: 'tb-2',
        });
        expect(ctx.state.coordinatorEpoch).toBe(initialEpoch + 4);
        expect(ctx.state.gateResolutions).toHaveLength(2);
        expect(ctx.state.gateResolutions[0].reviewBeadId).toBe('tb-1');
        expect(ctx.state.gateResolutions[1].reviewBeadId).toBe('tb-2');
    });
});
describe('runWrapUpGate idempotence', () => {
    it('confirmWrapUp full twice: second is replay without bump', async () => {
        const { ctx, initialEpoch } = makeCtx(5, []);
        const first = await runWrapUpGate(ctx, { cwd: '/fake/project', confirmWrapUp: 'full' });
        expect(first.isError).toBeFalsy();
        expect(ctx.state.wrapUpConfirmed).toBe(true);
        expect(ctx.state.gateResolutions).toHaveLength(1);
        expect(ctx.state.coordinatorEpoch).toBe(initialEpoch + 1);
        const epochAfterFirst = ctx.state.coordinatorEpoch;
        const steeringAfterFirst = (ctx.state.steeringEvents ?? []).length;
        const ledgerAfterFirst = ctx.state.gateResolutions.length;
        const second = await runWrapUpGate(ctx, { cwd: '/fake/project', confirmWrapUp: 'full' });
        const secondData = second.structuredContent.data;
        expect(secondData.idempotentReplay).toBe(true);
        expect(secondData.dispatchKey).toBe(ctx.state.gateResolutions[0].key);
        expect(ctx.state.coordinatorEpoch).toBe(epochAfterFirst);
        expect(ctx.state.steeringEvents ?? []).toHaveLength(steeringAfterFirst);
        expect(ctx.state.gateResolutions).toHaveLength(ledgerAfterFirst);
    });
});
//# sourceMappingURL=user-gate.idempotence.test.js.map