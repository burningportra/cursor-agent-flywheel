import { createInitialState } from '../../types.js';
/** Default git HEAD for hit-me / batch-review sha range resolution. */
export function gitHeadCall(sha = 'abc123def456') {
    return {
        cmd: 'git',
        args: ['rev-parse', 'HEAD'],
        result: { code: 0, stdout: `${sha}\n`, stderr: '' },
    };
}
/**
 * Creates a mock ExecFn that returns pre-programmed responses.
 * Unmatched commands return { code: 1, stdout: '', stderr: 'not mocked' },
 * except `git rev-parse HEAD` which defaults to a fake HEAD (hit-me paths).
 */
export function createMockExec(calls = []) {
    const headFallback = gitHeadCall();
    return async (cmd, args, _opts) => {
        const match = calls.find(c => c.cmd === cmd && c.args.length === args.length && c.args.every((a, i) => args[i] === a));
        if (match)
            return match.result;
        if (cmd === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
            return headFallback.result;
        }
        return { code: 1, stdout: '', stderr: 'not mocked' };
    };
}
export function makeState(overrides = {}) {
    return { ...createInitialState(), ...overrides };
}
//# sourceMappingURL=mocks.js.map