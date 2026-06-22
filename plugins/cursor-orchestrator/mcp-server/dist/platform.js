/**
 * Cross-platform process-control wrappers shared by remediation handlers
 * (T6.1 / T6.2 from the v3.16.0 noob-onboarding plan).
 *
 * The Node `process.kill(pid, signal)` API exists on every supported
 * platform, but Windows ignores POSIX signals and instead routes signal 0
 * + Ctrl-C/Ctrl-Break via a separate path. To keep the remediation handlers
 * simple, callers funnel through these helpers and get a uniform
 * `{ alive, terminated, error }` shape on every OS.
 */
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
const DEFAULT_SIGKILL_GRACE_MS = 1_000;
function defaultKill(pid, signal) {
    try {
        process.kill(pid, signal);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Probe whether a pid is alive without altering it. `process.kill(pid, 0)`
 * throws ESRCH when the process is gone; we treat any throw as "not
 * alive" to stay defensive across platforms.
 */
export function isAlive(pid, killFn = defaultKill) {
    return killFn(pid, 0);
}
/**
 * Terminate a single pid using the SIGTERM → wait → SIGKILL escalation
 * required by the T6.2 spec. Always resolves; never throws.
 */
export async function terminate(pid, opts = {}) {
    const killFn = opts.killFn ?? defaultKill;
    const sleepFn = opts.sleepFn ?? ((ms) => sleep(ms));
    const graceMs = opts.graceMs ?? DEFAULT_SIGKILL_GRACE_MS;
    const outcome = {
        pid,
        signalled: false,
        terminated: false,
        escalated: false,
    };
    // Step 1 — SIGTERM
    const termOk = killFn(pid, 'SIGTERM');
    outcome.signalled = termOk;
    if (!termOk) {
        // ESRCH on the very first signal means the process was already gone.
        outcome.terminated = !isAlive(pid, killFn);
        if (!outcome.terminated) {
            outcome.error = `SIGTERM rejected for pid ${pid}`;
        }
        return outcome;
    }
    // Step 2 — sleep, then re-probe
    await sleepFn(graceMs);
    if (!isAlive(pid, killFn)) {
        outcome.terminated = true;
        return outcome;
    }
    // Step 3 — escalate to SIGKILL
    outcome.escalated = true;
    const killOk = killFn(pid, 'SIGKILL');
    if (!killOk) {
        outcome.error = `SIGKILL rejected for pid ${pid}`;
        outcome.terminated = !isAlive(pid, killFn);
        return outcome;
    }
    // Give the kernel a moment to reap; honour the same grace as the SIGTERM
    // step so test fakes don't need a second tick value.
    await sleepFn(graceMs);
    outcome.terminated = !isAlive(pid, killFn);
    return outcome;
}
export async function terminateMany(pids, opts = {}) {
    const out = [];
    for (const pid of pids) {
        out.push(await terminate(pid, opts));
    }
    return out;
}
function defaultListChildPids(parentPid) {
    if (process.platform === 'win32')
        return [];
    try {
        const r = spawnSync('pgrep', ['-P', String(parentPid)], { encoding: 'utf8' });
        if (r.status !== 0 || !r.stdout)
            return [];
        return r.stdout
            .split('\n')
            .map((line) => Number(line.trim()))
            .filter((n) => Number.isFinite(n) && n > 0);
    }
    catch {
        return [];
    }
}
/** Collect root pid and all descendant pids (breadth-first). */
export function collectProcessTreePids(rootPid, listChildPids = defaultListChildPids) {
    const out = [];
    const seen = new Set();
    const queue = [rootPid];
    while (queue.length > 0) {
        const pid = queue.shift();
        if (seen.has(pid))
            continue;
        seen.add(pid);
        out.push(pid);
        for (const child of listChildPids(pid)) {
            if (!seen.has(child))
                queue.push(child);
        }
    }
    return out;
}
/**
 * Terminate a process and its descendants. Children are killed before the
 * root so fork pools cannot outlive the parent.
 */
export async function terminateProcessTree(rootPid, opts = {}) {
    const listChildPids = opts.listChildPids ?? defaultListChildPids;
    const pids = collectProcessTreePids(rootPid, listChildPids);
    const ordered = [...pids].reverse();
    return terminateMany(ordered, opts);
}
/**
 * Best-effort kill of a detached process group (Unix). Falls back to
 * terminateProcessTree when group kill is unavailable.
 */
export async function terminateProcessGroupOrTree(rootPid, opts = {}) {
    const killFn = opts.killFn ?? defaultKill;
    if (process.platform !== 'win32') {
        const groupOk = killFn(-rootPid, 'SIGTERM');
        if (groupOk) {
            const sleepFn = opts.sleepFn ?? ((ms) => sleep(ms));
            const graceMs = opts.graceMs ?? DEFAULT_SIGKILL_GRACE_MS;
            await sleepFn(graceMs);
            if (!isAlive(rootPid, killFn)) {
                return [
                    {
                        pid: rootPid,
                        signalled: true,
                        terminated: true,
                        escalated: false,
                    },
                ];
            }
            killFn(-rootPid, 'SIGKILL');
            await sleepFn(graceMs);
            if (!isAlive(rootPid, killFn)) {
                return [
                    {
                        pid: rootPid,
                        signalled: true,
                        terminated: true,
                        escalated: true,
                    },
                ];
            }
        }
    }
    return terminateProcessTree(rootPid, opts);
}
//# sourceMappingURL=platform.js.map