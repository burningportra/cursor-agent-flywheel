/**
 * Orphan Vitest worker check — surfaces long-lived or stray test processes
 * during parallel implement waves.
 */

import type { ExecFn } from '../exec.js';
import type { DoctorCheck } from '../types.js';
import { errMsg } from '../errors.js';

export const ORPHAN_VITEST_WORKERS_CHECK_NAME = 'orphan_vitest_workers' as const;

export interface VitestProcess {
  pid: number;
  ppid: number;
  ageSeconds: number;
  command: string;
}

const VITEST_CMD =
  /\b(vitest|npm\s+(run\s+)?test\b|pnpm\s+(run\s+)?test\b|yarn\s+(run\s+)?test\b)/i;

/** Parse `ps -eo pid,ppid,etime,command` lines into vitest-related processes. */
export function parseVitestProcesses(psOutput: string): VitestProcess[] {
  const out: VitestProcess[] = [];
  for (const line of psOutput.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(ppid)) continue;
    const etime = parts[2]!;
    const command = parts.slice(3).join(' ');
    if (!VITEST_CMD.test(command) && !/\bnode\b.*\bvitest\b/i.test(command)) {
      continue;
    }
    out.push({
      pid,
      ppid,
      ageSeconds: parseEtimeSeconds(etime),
      command,
    });
  }
  return out;
}

/** Convert ps etime ([[dd-]hh:]mm:ss) to approximate seconds. */
export function parseEtimeSeconds(etime: string): number {
  if (!etime) return 0;
  const dayMatch = /^(\d+)-(.+)$/.exec(etime);
  let rest = etime;
  let days = 0;
  if (dayMatch) {
    days = Number(dayMatch[1]);
    rest = dayMatch[2]!;
  }
  const segments = rest.split(':').map(Number);
  if (segments.some((n) => !Number.isFinite(n))) return 0;
  let h = 0;
  let m = 0;
  let s = 0;
  if (segments.length === 3) {
    [h, m, s] = segments;
  } else if (segments.length === 2) {
    [m, s] = segments;
  } else if (segments.length === 1) {
    [s] = segments;
  }
  return days * 86400 + h * 3600 + m * 60 + s;
}

export interface ClassifyVitestOrphansOptions {
  maxCount?: number;
  maxAgeSec?: number;
  alivePids?: Set<number>;
}

/**
 * Flag processes that look like orphans: too many, too old, or parent dead/init.
 */
export function classifyVitestOrphans(
  processes: VitestProcess[],
  opts: ClassifyVitestOrphansOptions = {},
): VitestProcess[] {
  const maxCount = opts.maxCount ?? defaultMaxCount();
  const maxAgeSec = opts.maxAgeSec ?? defaultMaxAgeSec();
  const alive = opts.alivePids ?? new Set(processes.map((p) => p.pid));

  const flagged = new Map<number, VitestProcess>();
  const add = (p: VitestProcess) => {
    flagged.set(p.pid, p);
  };

  if (processes.length > maxCount) {
    for (const p of processes) add(p);
  }

  for (const p of processes) {
    if (p.ageSeconds >= maxAgeSec) add(p);
    if (p.ppid === 1) add(p);
    else if (!alive.has(p.ppid)) add(p);
  }

  return [...flagged.values()];
}

function defaultMaxCount(): number {
  const raw = process.env.FW_VITEST_ORPHAN_COUNT;
  if (raw && /^\d+$/.test(raw)) return Math.max(1, Number(raw));
  return 3;
}

function defaultMaxAgeSec(): number {
  const raw = process.env.FW_VITEST_ORPHAN_AGE_SEC;
  if (raw && /^\d+$/.test(raw)) return Math.max(60, Number(raw));
  return 600;
}

const ORPHAN_HINT_PREFIX =
  'Reap with `flywheel_remediate({ checkName: "orphan_vitest_workers", mode: "execute", autoConfirm: true })` or kill PIDs manually.';

export async function checkOrphanVitestWorkers(
  exec: ExecFn,
  cwd: string,
  signal: AbortSignal,
  timeout: number,
  now: () => number,
): Promise<DoctorCheck> {
  const start = now();
  if (signal.aborted) {
    return {
      name: ORPHAN_VITEST_WORKERS_CHECK_NAME,
      severity: 'yellow',
      message: 'aborted before probe',
      durationMs: now() - start,
    };
  }

  let psOut = '';
  try {
    const ps = await exec('ps', ['-eo', 'pid,ppid,etime,command'], { timeout, cwd, signal });
    if (ps.code !== 0) {
      return {
        name: ORPHAN_VITEST_WORKERS_CHECK_NAME,
        severity: 'yellow',
        message: `ps -eo pid,ppid,etime,command failed (exit ${ps.code})`,
        hint: 'Verify ps is on PATH and the user can enumerate processes.',
        durationMs: now() - start,
      };
    }
    psOut = ps.stdout;
  } catch (err) {
    return {
      name: ORPHAN_VITEST_WORKERS_CHECK_NAME,
      severity: 'yellow',
      message: `ps probe failed: ${errMsg(err)}`,
      durationMs: now() - start,
    };
  }

  const processes = parseVitestProcesses(psOut);
  if (processes.length === 0) {
    return {
      name: ORPHAN_VITEST_WORKERS_CHECK_NAME,
      severity: 'green',
      message: 'no vitest/npm-test processes detected',
      durationMs: now() - start,
    };
  }

  const alivePids = new Set(processes.map((p) => p.pid));
  const orphans = classifyVitestOrphans(processes, { alivePids });
  if (orphans.length === 0) {
    return {
      name: ORPHAN_VITEST_WORKERS_CHECK_NAME,
      severity: 'green',
      message: `${processes.length} vitest-related process${processes.length === 1 ? '' : 'es'} running (within thresholds)`,
      durationMs: now() - start,
    };
  }

  const summary = orphans
    .map((o) => `pid ${o.pid} (ppid ${o.ppid}, age ${o.ageSeconds}s)`)
    .join(', ');
  const killCmd = `kill -TERM ${orphans.map((o) => o.pid).join(' ')}`;
  return {
    name: ORPHAN_VITEST_WORKERS_CHECK_NAME,
    severity: 'yellow',
    message: `${orphans.length} stray vitest worker${orphans.length === 1 ? '' : 's'} detected: ${summary}`,
    hint: `${ORPHAN_HINT_PREFIX} Suggested one-shot: \`${killCmd}\`.`,
    durationMs: now() - start,
  };
}
