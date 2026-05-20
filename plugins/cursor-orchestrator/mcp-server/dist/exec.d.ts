export type ExecOptions = {
    timeout?: number;
    cwd?: string;
    signal?: AbortSignal;
    /** When set, written to subprocess stdin (required for `claude --print` on CC 2.1.145+). */
    input?: string;
};
export type ExecFn = (cmd: string, args: string[], opts?: ExecOptions) => Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
export declare function makeExec(defaultCwd?: string): ExecFn;
//# sourceMappingURL=exec.d.ts.map