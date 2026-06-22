import type { FlywheelState } from '../../types.js';
export interface ExecCall {
    cmd: string;
    args: string[];
    result: {
        code: number;
        stdout: string;
        stderr: string;
    };
}
/** Default git HEAD for hit-me / batch-review sha range resolution. */
export declare function gitHeadCall(sha?: string): ExecCall;
/**
 * Creates a mock ExecFn that returns pre-programmed responses.
 * Unmatched commands return { code: 1, stdout: '', stderr: 'not mocked' },
 * except `git rev-parse HEAD` which defaults to a fake HEAD (hit-me paths).
 */
export declare function createMockExec(calls?: ExecCall[]): (cmd: string, args: string[], _opts?: unknown) => Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
/** Agent Mail liveness probe used by Cursor swarm coordination gate. */
export declare function wrapExecWithAgentMail<T extends (cmd: string, args: string[], opts?: unknown) => Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>>(exec: T): T;
export declare function makeState(overrides?: Partial<FlywheelState>): FlywheelState;
//# sourceMappingURL=mocks.d.ts.map