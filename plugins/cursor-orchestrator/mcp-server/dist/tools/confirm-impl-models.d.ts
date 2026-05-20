import type { ConfirmImplModelsArgs, McpToolResult, ToolContext } from '../types.js';
import { buildImplModelsGate } from '../cursor-implement-swarm.js';
export interface ConfirmImplModelsOutcome {
    implModels?: {
        simple: string;
        medium: string;
        complex: string;
    };
    implModelsGate?: ReturnType<typeof buildImplModelsGate>;
    spawnInstructions?: string;
    confirmed: boolean;
}
export declare function runConfirmImplModels(ctx: ToolContext, args: ConfirmImplModelsArgs): Promise<McpToolResult>;
//# sourceMappingURL=confirm-impl-models.d.ts.map