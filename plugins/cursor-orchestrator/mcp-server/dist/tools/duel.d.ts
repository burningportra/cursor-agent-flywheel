import type { DuelArgs, McpToolResult, ToolContext } from '../types.js';
import { buildCursorDuelRun, buildDuelModelsGate } from '../cursor-duel.js';
export interface DuelToolOutcome {
    confirmed: boolean;
    duelModelsGate?: ReturnType<typeof buildDuelModelsGate>;
    duelModels?: {
        wizard_a: string;
        wizard_b: string;
        wizard_c: string;
        synthesis: string;
    };
    cursorDuel?: ReturnType<typeof buildCursorDuelRun>;
    ntmFallback?: {
        duelCommand: string;
        reason: string;
    };
}
export declare function runDuel(ctx: ToolContext, args: DuelArgs): Promise<McpToolResult>;
//# sourceMappingURL=duel.d.ts.map