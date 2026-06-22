import { spawn } from 'node:child_process';
import { terminateProcessGroupOrTree } from './platform.js';

export type ExecOptions = {
  timeout?: number;
  cwd?: string;
  signal?: AbortSignal;
  /** When set, written to subprocess stdin (required for `claude --print` on CC 2.1.145+). */
  input?: string;
};

export type ExecFn = (
  cmd: string, args: string[], opts?: ExecOptions
) => Promise<{ code: number; stdout: string; stderr: string }>;

export function makeExec(defaultCwd?: string): ExecFn {
  return (cmd, args, opts = {}) => new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const useStdin = opts.input !== undefined;
    const detached = process.platform !== 'win32';
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? defaultCwd,
      shell: false,
      detached,
      stdio: useStdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      signal: opts.signal,
    });
    if (useStdin && child.stdin) {
      child.stdin.write(opts.input!, 'utf8');
      child.stdin.end();
    }
    let stdout = '', stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let treeKillStarted = false;

    const killProcessTree = () => {
      if (treeKillStarted || !child.pid) return;
      treeKillStarted = true;
      void terminateProcessGroupOrTree(child.pid).catch(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          /* ignore */
        }
      });
    };

    if (opts.timeout) {
      timer = setTimeout(() => {
        killProcessTree();
        reject(new Error(`Timed out after ${opts.timeout}ms: ${cmd} ${args.join(' ')}`));
      }, opts.timeout);
    }
    const abortHandler = () => { killProcessTree(); };
    if (opts.signal) {
      opts.signal.addEventListener('abort', abortHandler, { once: true });
    }
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', abortHandler);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', abortHandler);
      reject(err);
    });
  });
}
