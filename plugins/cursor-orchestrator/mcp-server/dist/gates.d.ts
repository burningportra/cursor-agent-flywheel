import type { ExecFn } from "./exec.js";
import type { OrchestratorState } from "./types.js";
export declare function runGuidedGates(exec: ExecFn, cwd: string, st: OrchestratorState, extraInfo: string, saveState: () => void): Promise<{
    content: {
        type: "text";
        text: string;
    }[];
    details: any;
}>;
//# sourceMappingURL=gates.d.ts.map