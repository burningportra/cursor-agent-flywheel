import { describe, it, expect, vi } from 'vitest';
import { orphanVitestWorkersHandler, remediateOrphanVitestWorkers, } from '../tools/remediations/orphan_vitest_workers.js';
import { REMEDIATION_REGISTRY } from '../tools/remediate.js';
import * as platform from '../platform.js';
describe('remediateOrphanVitestWorkers', () => {
    it('dry_run lists kill commands without executing', async () => {
        const out = await remediateOrphanVitestWorkers({
            pids: [11, 22],
            mode: 'dry-run',
        });
        expect(out.executed).toBe(false);
        expect(out.commands).toEqual(['kill -TERM 11', 'kill -TERM 22']);
    });
    it('execute calls terminateMany', async () => {
        const spy = vi.spyOn(platform, 'terminateMany').mockResolvedValue([
            { pid: 11, signalled: true, terminated: true, escalated: false },
        ]);
        const out = await remediateOrphanVitestWorkers({
            pids: [11],
            mode: 'execute',
        });
        expect(spy).toHaveBeenCalledWith([11], undefined);
        expect(out.executed).toBe(true);
        spy.mockRestore();
    });
});
describe('orphanVitestWorkersHandler registry', () => {
    it('is registered under orphan_vitest_workers', () => {
        expect(REMEDIATION_REGISTRY.orphan_vitest_workers).toBe(orphanVitestWorkersHandler);
    });
});
//# sourceMappingURL=orphan-vitest-workers-remediation.test.js.map