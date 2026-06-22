/**
 * Orphan Vitest worker check — surfaces long-lived or stray test processes
 * during parallel implement waves.
 */
import type { ExecFn } from '../exec.js';
import type { DoctorCheck } from '../types.js';
export declare const ORPHAN_VITEST_WORKERS_CHECK_NAME: "orphan_vitest_workers";
export interface VitestProcess {
    pid: number;
    ppid: number;
    ageSeconds: number;
    command: string;
}
/** Parse `ps -eo pid,ppid,etime,command` lines into vitest-related processes. */
export declare function parseVitestProcesses(psOutput: string): VitestProcess[];
/** Convert ps etime ([[dd-]hh:]mm:ss) to approximate seconds. */
export declare function parseEtimeSeconds(etime: string): number;
export interface ClassifyVitestOrphansOptions {
    maxCount?: number;
    maxAgeSec?: number;
    alivePids?: Set<number>;
}
/**
 * Flag processes that look like orphans: too many, too old, or parent dead/init.
 */
export declare function classifyVitestOrphans(processes: VitestProcess[], opts?: ClassifyVitestOrphansOptions): VitestProcess[];
export declare function checkOrphanVitestWorkers(exec: ExecFn, cwd: string, signal: AbortSignal, timeout: number, now: () => number): Promise<DoctorCheck>;
//# sourceMappingURL=orphan-vitest-workers.d.ts.map