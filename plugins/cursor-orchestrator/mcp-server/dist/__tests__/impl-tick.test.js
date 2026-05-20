import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveImplTickConfig } from '../cursor-impl-tick.js';
import { markBatchReviewDispatched } from '../commit-batch.js';
import { runImplTick } from '../tools/impl-tick.js';
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
    const saved = [];
    return {
        cwd,
        exec: vi.fn(async () => ({ code: 0, stdout: 'abc123def456\n', stderr: '' })),
        signal: undefined,
        state,
        saveState: vi.fn(async (s) => {
            saved.push(s);
            Object.assign(state, s);
        }),
    };
}
describe('resolveImplTickConfig', () => {
    it('defaults to 240s interval and opus-4.6 review model', () => {
        const cfg = resolveImplTickConfig('/tmp');
        expect(cfg.intervalSeconds).toBe(240);
        expect(cfg.reviewModel).toBe('opus-4.6');
        expect(cfg.maxParallelImpl).toBe(3);
    });
});
describe('markBatchReviewDispatched', () => {
    it('sets baseline and pending range', () => {
        const after = markBatchReviewDispatched(baseState(), 'deadbeef', 'aaa..deadbeef');
        expect(after.lastBatchReviewSha).toBe('deadbeef');
        expect(after.pendingBatchReviewRange).toBe('aaa..deadbeef');
        expect(after.commitBatchCounter).toBe(0);
    });
});
describe('flywheel_impl_tick', () => {
    let dir;
    beforeEach(async () => {
        dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'impl-tick-'));
        await fs.promises.mkdir(path.join(dir, '.pi-flywheel'), { recursive: true });
        await fs.promises.mkdir(path.join(dir, '.git'), { recursive: true });
        await fs.promises.writeFile(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        await fs.promises.mkdir(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
        await fs.promises.writeFile(path.join(dir, '.git', 'refs', 'heads', 'main'), 'abc123\n');
    });
    afterEach(async () => {
        await fs.promises.rm(dir, { recursive: true, force: true });
    });
    it('returns monitor when threshold off and no closed beads', async () => {
        const ctx = makeCtx(dir, baseState({
            commitBatchThreshold: 0,
            implModelsConfirmed: true,
            implModels: { simple: 'composer-2.5', medium: 'composer-2.5', complex: 'opus-4.6' },
        }));
        const result = await runImplTick(ctx, { cwd: dir });
        expect(result.isError).toBeFalsy();
        const sc = result.structuredContent;
        expect(sc.data.kind).toBe('monitor');
        expect(sc.data.nextTickInSeconds).toBe(240);
    });
});
//# sourceMappingURL=impl-tick.test.js.map