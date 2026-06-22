/**
 * orphan_vitest_workers remediation — reap stray Vitest/npm-test processes.
 */
import { createLogger } from '../../logger.js';
import { terminateMany } from '../../platform.js';
import { classifyVitestOrphans, parseVitestProcesses, } from '../../checks/orphan-vitest-workers.js';
const PS_TIMEOUT_MS = 10_000;
const log = createLogger('remediation.orphan_vitest_workers');
export async function remediateOrphanVitestWorkers(opts) {
    const commands = opts.pids.map((pid) => `kill -TERM ${pid}`);
    if (opts.mode !== 'execute') {
        return { commands, executed: false };
    }
    const outcomes = await terminateMany(opts.pids, opts.killOptions);
    const results = outcomes.map((o) => {
        if (!o.terminated) {
            return { pid: o.pid, status: 'error', error: o.error ?? 'process still alive' };
        }
        return { pid: o.pid, status: o.escalated ? 'killed' : 'terminated' };
    });
    return { commands, executed: true, results };
}
async function listOrphanVitestPids(ctx) {
    const ps = await ctx.exec('ps', ['-eo', 'pid,ppid,etime,command'], {
        cwd: ctx.cwd,
        timeout: PS_TIMEOUT_MS,
        signal: ctx.signal,
    });
    if (ps.code !== 0) {
        log.warn('ps -eo pid,ppid,etime,command non-zero exit', { exitCode: ps.code });
        return [];
    }
    const processes = parseVitestProcesses(ps.stdout);
    if (processes.length === 0)
        return [];
    const alivePids = new Set(processes.map((p) => p.pid));
    return classifyVitestOrphans(processes, { alivePids }).map((p) => p.pid);
}
export const orphanVitestWorkersHandler = {
    description: 'Terminate stray vitest/npm-test processes (SIGTERM → grace → SIGKILL).',
    mutating: true,
    reversible: false,
    async buildPlan(ctx) {
        const pids = await listOrphanVitestPids(ctx);
        if (pids.length === 0) {
            return {
                description: 'No stray vitest worker processes detected.',
                steps: [],
                mutating: false,
                reversible: false,
            };
        }
        return {
            description: `Terminate ${pids.length} stray vitest worker process${pids.length === 1 ? '' : 'es'} (SIGTERM, 1s grace, SIGKILL if alive).`,
            steps: pids.map((pid) => `kill -TERM ${pid}`),
            mutating: true,
            reversible: false,
        };
    },
    async execute(ctx) {
        const pids = await listOrphanVitestPids(ctx);
        if (pids.length === 0)
            return { stepsRun: 0 };
        const outcomes = await terminateMany(pids);
        const stdoutParts = [];
        const stderrParts = [];
        let stepsRun = 0;
        for (const outcome of outcomes) {
            stepsRun += 1;
            if (outcome.terminated) {
                const tag = outcome.escalated ? 'SIGKILL' : 'SIGTERM';
                stdoutParts.push(`pid ${outcome.pid} ${tag} ok`);
            }
            else {
                stderrParts.push(`pid ${outcome.pid}: ${outcome.error ?? 'still alive after escalation'}`);
                log.warn('vitest worker survived escalation', { pid: outcome.pid, error: outcome.error });
            }
        }
        return {
            stepsRun,
            stdout: stdoutParts.join('\n') || undefined,
            stderr: stderrParts.join('\n') || undefined,
        };
    },
    async verifyProbe(ctx) {
        const remaining = await listOrphanVitestPids(ctx);
        if (remaining.length > 0) {
            log.warn('vitest workers remain after remediation', { pids: remaining });
            return false;
        }
        return true;
    },
};
//# sourceMappingURL=orphan_vitest_workers.js.map