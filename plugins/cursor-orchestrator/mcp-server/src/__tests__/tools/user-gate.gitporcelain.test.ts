import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { FlywheelState } from '../../types.js';
import { makeState } from '../helpers/mocks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const renameFixture = readFileSync(
  join(__dirname, '../fixtures/git-status-rename.txt'),
  'utf8',
);

type GitExecHandler = (
  cmd: string,
  args: readonly string[],
) => string | Error;

let gitExecHandler: GitExecHandler = () =>
  new Error('execFile mock: not configured for this test');

const execFileMock = vi.fn(
  (
    _cmd: string,
    _args: readonly string[],
    _opts: unknown,
    _callback: (err: Error | null, stdout?: string, stderr?: string) => void,
  ) => ({ pid: 1, kill: vi.fn() }),
);

(execFileMock as unknown as { [k: symbol]: unknown })[promisify.custom] = (
  cmd: string,
  args: readonly string[],
  opts?: unknown,
): Promise<{ stdout: string; stderr: string }> => {
  execFileMock(cmd, args, opts, () => undefined);
  const result = gitExecHandler(cmd, args);
  if (result instanceof Error) return Promise.reject(result);
  return Promise.resolve({ stdout: result, stderr: '' });
};

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

const { parseGitPorcelainZ, runWrapUpGate } = await import(
  '../../tools/user-gate.js'
);

function makeCtx(state: FlywheelState) {
  return {
    exec: vi.fn(),
    cwd: '/fake/project',
    state,
    saveState: (_s: FlywheelState) => {},
    clearState: () => {},
  };
}

describe('parseGitPorcelainZ', () => {
  it('returns empty array for clean tree', () => {
    expect(parseGitPorcelainZ('')).toEqual([]);
  });

  it('parses a single modified path', () => {
    expect(parseGitPorcelainZ(' M src/foo.ts\0')).toEqual(['src/foo.ts']);
  });

  it('parses rename as separate old and new paths', () => {
    expect(parseGitPorcelainZ('R  old.txt\0new.txt\0')).toEqual([
      'old.txt',
      'new.txt',
    ]);
  });

  it('parses paths with embedded spaces', () => {
    expect(parseGitPorcelainZ(' M path with spaces.md\0')).toEqual([
      'path with spaces.md',
    ]);
  });

  it('parses paths with embedded newlines', () => {
    expect(parseGitPorcelainZ(' M dir/file\nname\0')).toEqual([
      'dir/file\nname',
    ]);
  });

  it('parses fixture with rename and spaced path', () => {
    expect(parseGitPorcelainZ(renameFixture)).toEqual([
      'old-name.txt',
      'new-name.txt',
      'README with spaces.md',
    ]);
  });

  it('parses multiple entries in one buffer', () => {
    expect(parseGitPorcelainZ(' M a.txt\0?? b.txt\0')).toEqual([
      'a.txt',
      'b.txt',
    ]);
  });
});

describe('gitPorcelain via runWrapUpGate', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    gitExecHandler = (cmd, args) => {
      if (
        cmd === 'git' &&
        args[0] === 'status' &&
        args.includes('--porcelain=v1') &&
        args.includes('-z')
      ) {
        return 'R  old.txt\0new.txt\0';
      }
      if (cmd === 'git' && args[0] === 'log') {
        return '';
      }
      return new Error(`unexpected execFile: ${cmd} ${args.join(' ')}`);
    };
  });

  it('uses porcelain v1 -z and surfaces rename paths in wrap-up preview', async () => {
    const ctx = makeCtx(makeState({ phase: 'iterating' }));
    const result = await runWrapUpGate(ctx, { cwd: '/fake/project' });
    const data = (result.structuredContent as { data: Record<string, unknown> })
      .data;
    const rationale = (data.gateMeta as { rationale: string }).rationale;
    expect(execFileMock).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain=v1', '-z'],
      expect.objectContaining({ cwd: '/fake/project' }),
      expect.any(Function),
    );
    expect(rationale).toContain('old.txt');
    expect(rationale).toContain('new.txt');
    expect(rationale).toContain('2 uncommitted path(s)');
  });

  it('returns empty preview when git fails', async () => {
    gitExecHandler = () => new Error('git missing');
    const ctx = makeCtx(makeState({ phase: 'iterating' }));
    const result = await runWrapUpGate(ctx, { cwd: '/fake/project' });
    const data = (result.structuredContent as { data: Record<string, unknown> })
      .data;
    const rationale = (data.gateMeta as { rationale: string }).rationale;
    expect(rationale).toContain(
      'Working tree is clean aside from any intentional WIP.',
    );
  });
});
