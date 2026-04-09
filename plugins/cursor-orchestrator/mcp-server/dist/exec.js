import { spawn } from 'node:child_process';
export function makeExec(defaultCwd) {
    return (cmd, args, opts = {}) => new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd: opts.cwd ?? defaultCwd,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '', stderr = '';
        child.stdout?.on('data', (d) => { stdout += d.toString(); });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        let timer;
        if (opts.timeout) {
            timer = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Timed out after ${opts.timeout}ms: ${cmd} ${args.join(' ')}`));
            }, opts.timeout);
        }
        child.on('close', (code) => { if (timer)
            clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
        child.on('error', (err) => { if (timer)
            clearTimeout(timer); reject(err); });
    });
}
//# sourceMappingURL=exec.js.map