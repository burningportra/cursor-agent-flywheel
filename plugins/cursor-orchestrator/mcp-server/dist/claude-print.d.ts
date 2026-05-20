/**
 * Claude Code `claude --print` integration.
 *
 * CC 2.1.145+ rejects `@taskfile` as the sole prompt — input must be stdin
 * or an explicit prompt argument. We always pipe the prompt on stdin.
 */
import type { ExecFn } from './exec.js';
export declare function claudePrintArgs(opts?: {
    tools?: string;
    model?: string;
}): string[];
export declare function execClaudePrint(exec: ExecFn, opts: {
    cwd: string;
    prompt: string;
    tools?: string;
    model?: string;
    timeout?: number;
    signal?: AbortSignal;
}): Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
//# sourceMappingURL=claude-print.d.ts.map