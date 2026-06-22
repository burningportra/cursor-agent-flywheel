import { describe, it, expect } from 'vitest';
import {
  ORPHAN_VITEST_WORKERS_CHECK_NAME,
  checkOrphanVitestWorkers,
  classifyVitestOrphans,
  parseEtimeSeconds,
  parseVitestProcesses,
} from '../../checks/orphan-vitest-workers.js';
import type { ExecFn } from '../../exec.js';

describe('parseEtimeSeconds', () => {
  it('parses mm:ss', () => {
    expect(parseEtimeSeconds('05:30')).toBe(330);
  });
  it('parses hh:mm:ss', () => {
    expect(parseEtimeSeconds('01:02:03')).toBe(3723);
  });
  it('parses dd-hh:mm:ss', () => {
    expect(parseEtimeSeconds('1-00:00:10')).toBe(86410);
  });
});

describe('parseVitestProcesses', () => {
  it('extracts vitest and npm test lines', () => {
    const ps = [
      '  100  1 01:00:00 node /path/vitest run --passWithNoTests',
      '  101  50 00:00:05 npm test',
      '  102  1 00:00:02 /bin/zsh',
    ].join('\n');
    const out = parseVitestProcesses(ps);
    expect(out.map((p) => p.pid)).toEqual([100, 101]);
    expect(out[0]!.ageSeconds).toBe(3600);
  });
});

describe('classifyVitestOrphans', () => {
  it('flags high count, old age, and dead parent', () => {
    const processes = [
      { pid: 1, ppid: 999, ageSeconds: 10, command: 'vitest' },
      { pid: 2, ppid: 1, ageSeconds: 700, command: 'npm test' },
      { pid: 3, ppid: 50, ageSeconds: 5, command: 'vitest run' },
      { pid: 4, ppid: 50, ageSeconds: 5, command: 'vitest run' },
      { pid: 5, ppid: 50, ageSeconds: 5, command: 'vitest run' },
    ];
    const orphans = classifyVitestOrphans(processes, {
      maxCount: 3,
      maxAgeSec: 600,
      alivePids: new Set([1, 2, 3, 4, 5, 50]),
    });
    expect(orphans.map((o) => o.pid).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

function makeExec(stdout: string): ExecFn {
  return async (cmd, args) => {
    if (cmd === 'ps' && args[0] === '-eo') {
      return { code: 0, stdout, stderr: '' };
    }
    return { code: 1, stdout: '', stderr: 'unexpected' };
  };
}

describe('checkOrphanVitestWorkers', () => {
  const ac = new AbortController();
  const now = () => Date.now();

  it('green when no vitest processes', async () => {
    const out = await checkOrphanVitestWorkers(makeExec(''), '/tmp', ac.signal, 2000, now);
    expect(out.name).toBe(ORPHAN_VITEST_WORKERS_CHECK_NAME);
    expect(out.severity).toBe('green');
  });

  it('yellow when orphan vitest workers detected', async () => {
    const ps = '  900  1 00:15:00 node vitest\n';
    const out = await checkOrphanVitestWorkers(makeExec(ps), '/tmp', ac.signal, 2000, now);
    expect(out.severity).toBe('yellow');
    expect(out.message).toMatch(/pid 900/);
    expect(out.hint).toMatch(/orphan_vitest_workers/);
  });
});
