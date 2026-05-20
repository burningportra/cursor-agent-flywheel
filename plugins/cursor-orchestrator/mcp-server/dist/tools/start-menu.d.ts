/**
 * flywheel_start_menu — Step 0d AskQuestion payload from code (cursor-native).
 */
import { type StartMenuVariant } from "../cursor-start-menu.js";
import type { ToolContext, McpToolResult } from "../types.js";
export declare function runStartMenu(_ctx: ToolContext, args: {
    cwd: string;
    variant?: StartMenuVariant;
    recentPlanPaths?: string[];
    isFirstRun?: boolean;
    goal?: string;
    phase?: string;
    openBeadCount?: number;
}): Promise<McpToolResult>;
//# sourceMappingURL=start-menu.d.ts.map