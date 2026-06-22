/**
 * orphan_vitest_workers remediation — reap stray Vitest/npm-test processes.
 */
import type { RemediationHandler } from '../remediate.js';
import { type KillOptions } from '../../platform.js';
export interface RemediateOrphanVitestOptions {
    pids: number[];
    mode: 'dry-run' | 'execute' | 'skip';
    killOptions?: KillOptions;
}
export interface RemediateOrphanVitestResult {
    commands: string[];
    executed: boolean;
    results?: Array<{
        pid: number;
        status: 'terminated' | 'killed' | 'error';
        error?: string;
    }>;
}
export declare function remediateOrphanVitestWorkers(opts: RemediateOrphanVitestOptions): Promise<RemediateOrphanVitestResult>;
export declare const orphanVitestWorkersHandler: RemediationHandler;
//# sourceMappingURL=orphan_vitest_workers.d.ts.map