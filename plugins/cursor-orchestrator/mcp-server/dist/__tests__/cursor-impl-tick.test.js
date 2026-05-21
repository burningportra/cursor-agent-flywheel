import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { bumpCoordinatorEpoch } from '../coordinator-epoch.js';
import { finalizeTickPayload, runImplTickCore } from '../cursor-impl-tick.js';
function baseState(overrides = {}) {
    return {
        phase: 'implementing',
        constraints: [],
        retryCount: 0,
        maxRetries: 3,
        maxReviewPasses: 2,
        iterationRound: 0,
        currentGateIndex: 0,
        polishRound: 0,
        polishChanges: [],
        polishConverged: false,
        ...overrides,
    };
}
function makeCtx(cwd, state) {
    return {
        cwd,
        exec: vi.fn(async () => ({ code: 0, stdout: 'abc123def456\n', stderr: '' })),
        signal: undefined,
        state,
        saveState: vi.fn(async (s) => {
            Object.assign(state, s);
        }),
    };
}
describe('finalizeTickPayload', () => {
    const tickAt = '2026-05-21T00:00:00.000Z';
    const basePayload = {
        kind: 'advance_wave',
        tickAt,
        nextTickInSeconds: 240,
        snapshot: {
            headSha: 'abc123',
            commitsSinceBaseline: 0,
            commitBatchThreshold: 0,
            readyCount: 1,
            inProgressCount: 0,
            closedCount: 0,
            profileStale: false,
        },
        coordinatorPlaybook: 'playbook',
        implTasks: [
            {
                beadId: 'bead-1',
                model: 'composer-2.5',
                subagent_type: 'generalPurpose',
                description: 'Impl bead-1',
                prompt: 'work',
            },
        ],
    };
    it('attaches epoch when unchanged', () => {
        const state = baseState({ coordinatorEpoch: 2 });
        const out = finalizeTickPayload(2, state, basePayload, true);
        expect(out.epoch).toBe(2);
        expect(out.kind).toBe('advance_wave');
        expect(out.implTasks).toHaveLength(1);
    });
    it('returns stale with no implTasks when epoch bumped mid-tick and guards enabled', () => {
        const state = baseState({ coordinatorEpoch: 3 });
        const out = finalizeTickPayload(2, state, basePayload, true);
        expect(out.kind).toBe('stale');
        expect(out.epoch).toBe(2);
        expect(out.implTasks).toBeUndefined();
        expect(out.batchReviewTask).toBeUndefined();
    });
    it('returns stale with no batchReviewTask when epoch bumped mid-tick', () => {
        const state = baseState({ coordinatorEpoch: 1 });
        const out = finalizeTickPayload(0, state, {
            ...basePayload,
            kind: 'batch_review_dispatch',
            implTasks: undefined,
            batchReviewTask: {
                model: 'opus-4.6',
                subagent_type: 'generalPurpose',
                description: 'review',
                prompt: 'review prompt',
                shaRange: 'aaa..bbb',
                verdictRel: '.pi-flywheel/reviews/verdict.json',
            },
        }, true);
        expect(out.kind).toBe('stale');
        expect(out.batchReviewTask).toBeUndefined();
    });
    it('preserves spawn specs when epochGuards disabled', () => {
        const state = baseState({ coordinatorEpoch: 5 });
        const out = finalizeTickPayload(2, state, basePayload, false);
        expect(out.kind).toBe('advance_wave');
        expect(out.implTasks).toHaveLength(1);
        expect(out.epoch).toBe(2);
    });
    it('monitor tick always keeps kind when no spawn specs', () => {
        const state = baseState({ coordinatorEpoch: 9 });
        const out = finalizeTickPayload(1, state, {
            kind: 'monitor',
            tickAt,
            nextTickInSeconds: 240,
            snapshot: basePayload.snapshot,
            coordinatorPlaybook: 'playbook',
        }, true);
        expect(out.kind).toBe('monitor');
        expect(out.epoch).toBe(1);
    });
});
describe('runImplTickCore epoch guards', () => {
    let dir;
    beforeEach(async () => {
        dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cursor-impl-tick-'));
        await fs.promises.mkdir(path.join(dir, '.pi-flywheel'), { recursive: true });
        await fs.promises.mkdir(path.join(dir, '.git'), { recursive: true });
        await fs.promises.writeFile(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        await fs.promises.mkdir(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
        await fs.promises.writeFile(path.join(dir, '.git', 'refs', 'heads', 'main'), 'abc123\n');
    });
    afterEach(async () => {
        vi.restoreAllMocks();
        vi.unmock('../tools/advance-wave.js');
        await fs.promises.rm(dir, { recursive: true, force: true });
    });
    it('includes data.epoch on monitor tick', async () => {
        const ctx = makeCtx(dir, baseState({
            coordinatorEpoch: 4,
            commitBatchThreshold: 0,
            implModelsConfirmed: true,
        }));
        const { structured } = await runImplTickCore(ctx, { cwd: dir });
        expect(structured.data.epoch).toBe(4);
        expect(structured.data.kind).toBe('monitor');
    });
    it('simulated mid-tick bump yields kind stale and no implTasks when guards enabled', async () => {
        const { runAdvanceWave } = await import('../tools/advance-wave.js');
        vi.spyOn(await import('../tools/advance-wave.js'), 'runAdvanceWave').mockImplementation(async (ctx) => {
            Object.assign(ctx.state, bumpCoordinatorEpoch(ctx.state));
            return {
                content: [{ type: 'text', text: 'Next wave ready.' }],
                structuredContent: {
                    data: {
                        nextWave: {
                            prompts: [
                                {
                                    beadId: 'bead-x',
                                    model: 'composer-2.5',
                                    prompt: 'Implement bead-x',
                                },
                            ],
                        },
                    },
                },
            };
        });
        const ctx = makeCtx(dir, baseState({
            coordinatorEpoch: 1,
            implModelsConfirmed: true,
            implModels: { simple: 'composer-2.5', medium: 'composer-2.5', complex: 'opus-4.6' },
            commitBatchThreshold: 0,
        }));
        const { structured, text } = await runImplTickCore(ctx, {
            cwd: dir,
            closedBeadIds: ['bead-done'],
        });
        expect(structured.data.kind).toBe('stale');
        expect(structured.data.epoch).toBe(1);
        expect(structured.data.implTasks).toBeUndefined();
        expect(text).toContain('epoch mismatch');
    });
    it('E1: bumps coordinatorEpoch before advance_wave when closedBeadIds set', async () => {
        vi.spyOn(await import('../tools/advance-wave.js'), 'runAdvanceWave').mockResolvedValue({
            content: [{ type: 'text', text: 'wave ok' }],
            structuredContent: { data: { waveComplete: true } },
        });
        const ctx = makeCtx(dir, baseState({
            coordinatorEpoch: 1,
            implModelsConfirmed: true,
            commitBatchThreshold: 0,
        }));
        await runImplTickCore(ctx, { cwd: dir, closedBeadIds: ['bead-done'] });
        expect(ctx.state.coordinatorEpoch).toBe(2);
    });
    it('does not drop implTasks when coordinator.epochGuards is false', async () => {
        await fs.promises.writeFile(path.join(dir, 'flywheel.config.yaml'), 'coordinator:\n  epochGuards: false\n');
        vi.spyOn(await import('../tools/advance-wave.js'), 'runAdvanceWave').mockImplementation(async (ctx) => {
            Object.assign(ctx.state, bumpCoordinatorEpoch(ctx.state));
            return {
                content: [{ type: 'text', text: 'Next wave ready.' }],
                structuredContent: {
                    data: {
                        nextWave: {
                            prompts: [
                                {
                                    beadId: 'bead-y',
                                    model: 'composer-2.5',
                                    prompt: 'Implement bead-y',
                                },
                            ],
                        },
                    },
                },
            };
        });
        const ctx = makeCtx(dir, baseState({
            coordinatorEpoch: 0,
            implModelsConfirmed: true,
            commitBatchThreshold: 0,
        }));
        const { structured } = await runImplTickCore(ctx, {
            cwd: dir,
            closedBeadIds: ['bead-done'],
        });
        expect(structured.data.kind).toBe('advance_wave');
        expect(structured.data.implTasks?.length).toBe(1);
    });
});
//# sourceMappingURL=cursor-impl-tick.test.js.map