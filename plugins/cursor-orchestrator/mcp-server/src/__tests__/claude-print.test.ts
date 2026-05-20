import { describe, it, expect } from 'vitest';
import { makeExec } from '../exec.js';
import { claudePrintArgs, execClaudePrint } from '../claude-print.js';

describe('claude-print', () => {
  it('claudePrintArgs omits @file prompt form', () => {
    expect(claudePrintArgs()).toEqual(['--print', '--tools', 'read']);
    expect(claudePrintArgs({ model: 'opus' })).toEqual([
      '--print',
      '--tools',
      'read',
      '--model',
      'opus',
    ]);
    expect(claudePrintArgs().some((a) => a.startsWith('@'))).toBe(false);
  });

  it('execClaudePrint passes prompt via stdin', async () => {
    const exec = makeExec();
    let seenInput: string | undefined;
    const mockExec = async (
      cmd: string,
      args: string[],
      opts?: { input?: string },
    ) => {
      expect(cmd).toBe('claude');
      expect(args).toEqual(['--print', '--tools', 'read']);
      seenInput = opts?.input;
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    await execClaudePrint(mockExec, { cwd: process.cwd(), prompt: 'rubric task body' });
    expect(seenInput).toBe('rubric task body');

    // real echo via stdin path still works in makeExec
    const echo = await exec('cat', [], { input: 'hello-stdin', timeout: 5000 });
    expect(echo.stdout.trim()).toBe('hello-stdin');
  });
});
