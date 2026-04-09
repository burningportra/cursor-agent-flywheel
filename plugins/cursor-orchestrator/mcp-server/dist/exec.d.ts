export type ExecFn = (cmd: string, args: string[], opts?: {
    timeout?: number;
    cwd?: string;
}) => Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
export declare function makeExec(defaultCwd?: string): ExecFn;
//# sourceMappingURL=exec.d.ts.map