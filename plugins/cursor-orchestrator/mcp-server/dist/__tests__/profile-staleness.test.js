import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyProfileStalenessToState, checkProfileStaleness, clearProfileStaleFlags, hashFile, normalizeWatchPath, profileStaleNextAction, registerProfileWatch, shouldScheduleProfileAutoRefresh, } from '../profile-staleness.js';
import { createInitialState } from '../types.js';
let testDir;
afterEach(() => {
    if (testDir)
        rmSync(testDir, { recursive: true, force: true });
});
function makePlanFixture(content = '# Plan v1') {
    testDir = mkdtempSync(join(tmpdir(), 'profile-staleness-'));
    const planRel = 'docs/plans/test-plan.md';
    mkdirSync(join(testDir, 'docs/plans'), { recursive: true });
    writeFileSync(join(testDir, planRel), content, 'utf8');
    return { cwd: testDir, planRel };
}
describe('profile-staleness', () => {
    it('registerProfileWatch records sha256 per file', () => {
        const { cwd, planRel } = makePlanFixture();
        const abs = join(cwd, planRel);
        const expected = hashFile(abs);
        const state = registerProfileWatch(createInitialState(), cwd, [planRel], { merge: false });
        expect(state.profileWatch?.files).toHaveLength(1);
        expect(state.profileWatch?.files[0]).toEqual({
            path: planRel,
            sha256: expected,
        });
    });
    it('detects drift when plan content changes', () => {
        const { cwd, planRel } = makePlanFixture('# original');
        let state = registerProfileWatch({ ...createInitialState(), planDocument: planRel }, cwd, [planRel], { merge: false });
        expect(checkProfileStaleness(cwd, state).stale).toBe(false);
        writeFileSync(join(cwd, planRel), '# edited without commit', 'utf8');
        const result = checkProfileStaleness(cwd, state);
        expect(result.stale).toBe(true);
        expect(result.reason).toBe(`drift: ${planRel}`);
        state = applyProfileStalenessToState(state, result);
        expect(state.profileStale).toBe(true);
        expect(state.profileStaleReason).toBe(`drift: ${planRel}`);
    });
    it('returns not stale when hashes match', () => {
        const { cwd, planRel } = makePlanFixture('stable content');
        const state = registerProfileWatch(createInitialState(), cwd, [planRel], { merge: false });
        expect(checkProfileStaleness(cwd, state)).toEqual({ stale: false });
    });
    it('returns stale with reason when file deleted', () => {
        const { cwd, planRel } = makePlanFixture();
        const state = registerProfileWatch(createInitialState(), cwd, [planRel], { merge: false });
        rmSync(join(cwd, planRel));
        const result = checkProfileStaleness(cwd, state);
        expect(result.stale).toBe(true);
        expect(result.reason).toBe(`missing: ${planRel}`);
    });
    it('normalizeWatchPath rejects .. traversal', () => {
        testDir = mkdtempSync(join(tmpdir(), 'profile-staleness-'));
        expect(normalizeWatchPath('../etc/passwd', testDir)).toBeNull();
        expect(normalizeWatchPath('../../outside.md', testDir)).toBeNull();
    });
    it('clearProfileStaleFlags clears stale markers and stamps refresh time', () => {
        const cleared = clearProfileStaleFlags({
            ...createInitialState(),
            profileStale: true,
            profileStaleReason: 'drift: docs/plans/x.md',
        });
        expect(cleared.profileStale).toBe(false);
        expect(cleared.profileStaleReason).toBeUndefined();
        expect(cleared.lastProfileRefreshAt).toMatch(/^\d{4}-/);
    });
    it('respectDebounce returns cached stale flag within debounce window', () => {
        const { cwd, planRel } = makePlanFixture('# original');
        const state = {
            ...registerProfileWatch(createInitialState(), cwd, [planRel], { merge: false }),
            profileStale: true,
            profileStaleReason: 'drift: docs/plans/test-plan.md',
            lastProfileRefreshAt: new Date().toISOString(),
        };
        writeFileSync(join(cwd, planRel), '# changed again', 'utf8');
        const debounced = checkProfileStaleness(cwd, state, { debounceSeconds: 300 }, { respectDebounce: true });
        expect(debounced.stale).toBe(true);
        expect(debounced.reason).toBe('drift: docs/plans/test-plan.md');
    });
    it('profileStaleNextAction differs for auto_refresh vs nudge', () => {
        expect(profileStaleNextAction({ staleAction: 'nudge' })).toContain('flywheel_profile');
        expect(profileStaleNextAction({ staleAction: 'auto_refresh' })).toContain('auto_refresh');
    });
    it('shouldScheduleProfileAutoRefresh respects debounce', () => {
        const state = {
            ...createInitialState(),
            profileStale: true,
            lastProfileRefreshAt: new Date().toISOString(),
        };
        expect(shouldScheduleProfileAutoRefresh(state, { staleAction: 'auto_refresh', debounceSeconds: 300 })).toBe(false);
    });
});
//# sourceMappingURL=profile-staleness.test.js.map