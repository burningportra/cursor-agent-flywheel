/**
 * Claude Code `claude --print` integration.
 *
 * CC 2.1.145+ rejects `@taskfile` as the sole prompt — input must be stdin
 * or an explicit prompt argument. We always pipe the prompt on stdin.
 */

import type { ExecFn } from './exec.js';

export function claudePrintArgs(opts?: { tools?: string; model?: string }): string[] {
  const args = ['--print', '--tools', opts?.tools ?? 'read'];
  if (opts?.model) {
    args.push('--model', opts.model);
  }
  return args;
}

export async function execClaudePrint(
  exec: ExecFn,
  opts: {
    cwd: string;
    prompt: string;
    tools?: string;
    model?: string;
    timeout?: number;
    signal?: AbortSignal;
  },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return exec('claude', claudePrintArgs({ tools: opts.tools, model: opts.model }), {
    cwd: opts.cwd,
    timeout: opts.timeout,
    signal: opts.signal,
    input: opts.prompt,
  });
}
