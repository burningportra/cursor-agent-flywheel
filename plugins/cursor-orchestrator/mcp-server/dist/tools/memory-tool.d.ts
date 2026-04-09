import type { ToolContext, McpToolResult } from '../types.js';
interface MemoryArgs {
    cwd: string;
    query?: string;
    operation?: 'search' | 'store';
    content?: string;
}
/**
 * orch_memory — Search and interact with CASS memory (cm CLI).
 *
 * operation="search" (default) — search CASS memory for relevant entries
 * operation="store"            — store a new memory entry
 */
export declare function runMemory(ctx: ToolContext, args: MemoryArgs): Promise<McpToolResult>;
export {};
//# sourceMappingURL=memory-tool.d.ts.map