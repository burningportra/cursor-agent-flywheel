import type { ExecFn } from "./exec.js";
export interface DeepPlanAgent {
    name: string;
    task: string;
    model?: string;
}
export interface DeepPlanResult {
    name: string;
    model: string;
    plan: string;
    exitCode: number;
    elapsed: number;
    error?: string;
}
/**
 * Run deep planning agents via the claude CLI in print mode.
 * Each agent gets its own task file and runs in parallel.
 */
export declare function runDeepPlanAgents(exec: ExecFn, cwd: string, agents: DeepPlanAgent[], signal?: AbortSignal): Promise<DeepPlanResult[]>;
//# sourceMappingURL=deep-plan.d.ts.map