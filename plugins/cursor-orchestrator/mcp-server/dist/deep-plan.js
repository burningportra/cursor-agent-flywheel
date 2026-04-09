import { join } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
/**
 * Run deep planning agents via the claude CLI in print mode.
 * Each agent gets its own task file and runs in parallel.
 */
export async function runDeepPlanAgents(exec, cwd, agents, signal) {
    // Write each agent's task to a temp file and spawn claude in print mode
    const outputDir = join(tmpdir(), `claude-deep-plan-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const promises = agents.map(async (agent) => {
        const startTime = Date.now();
        const taskFile = join(outputDir, `${agent.name}-task.md`);
        const outputFile = join(outputDir, `${agent.name}-output.md`);
        writeFileSync(taskFile, agent.task, "utf8");
        try {
            const args = [
                "--print", // non-interactive, output to stdout
                "--tools", "read,bash,grep,find,ls", // read-only tools
            ];
            if (agent.model) {
                args.push("--model", agent.model);
            }
            args.push(`@${taskFile}`);
            const result = await exec("claude", args, {
                timeout: 180000, // 3 min timeout per planner
                cwd,
            });
            const plan = result.stdout.trim();
            writeFileSync(outputFile, plan, "utf8");
            return {
                name: agent.name,
                model: agent.model ?? "default",
                plan,
                exitCode: result.code,
                elapsed: Math.floor((Date.now() - startTime) / 1000),
            };
        }
        catch (err) {
            return {
                name: agent.name,
                model: agent.model ?? "default",
                plan: "",
                exitCode: 1,
                elapsed: Math.floor((Date.now() - startTime) / 1000),
                error: err instanceof Error ? err.message : String(err),
            };
        }
    });
    // Run all in parallel
    return Promise.all(promises);
}
//# sourceMappingURL=deep-plan.js.map