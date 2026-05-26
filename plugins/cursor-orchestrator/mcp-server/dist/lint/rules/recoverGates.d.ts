/**
 * RECOV001 / RECOV002 — recover-gates command contract guards.
 *
 * RECOV001: Ban prose commit/continue prompts in recovery command files.
 * RECOV002: Flag positive instructions to load start_ceremony / start_discover / start body.
 *
 * Applies only to recover-gates command paths. Anti-pattern tables, fallback blocks,
 * and explicit negations (Never / Do not load) are exempt.
 */
import type { Rule } from "../types.js";
/** Prose gate prompts that must use AskQuestion + MCP gates instead. */
export declare const RECOV001_PHRASES: ReadonlyArray<string | RegExp>;
export declare const recov001: Rule;
export declare const recov002: Rule;
export declare const recoverGatesRules: Rule[];
export default recoverGatesRules;
//# sourceMappingURL=recoverGates.d.ts.map