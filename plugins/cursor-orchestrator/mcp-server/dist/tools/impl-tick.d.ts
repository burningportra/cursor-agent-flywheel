/**
 * `flywheel_impl_tick` — Cursor-native implementation supervision loop.
 */
import { z } from 'zod';
import type { McpToolResult, ToolContext } from '../types.js';
export declare const ImplTickInputSchema: z.ZodObject<{
    cwd: z.ZodString;
    closedBeadIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    coordinatorAgent: z.ZodOptional<z.ZodString>;
    commitBatchThreshold: z.ZodOptional<z.ZodNumber>;
    forceBatchReview: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type ImplTickInput = z.infer<typeof ImplTickInputSchema>;
export declare function runImplTick(ctx: ToolContext, rawArgs: unknown): Promise<McpToolResult>;
//# sourceMappingURL=impl-tick.d.ts.map