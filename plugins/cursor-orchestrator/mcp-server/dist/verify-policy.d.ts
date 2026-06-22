/**
 * Canonical verify/test policy for implement swarms (Vitest leak prevention).
 *
 * Single source of truth for scoped vs full-suite commands, build-slot
 * coordination, and prompt blocks wired into adapter prompts.
 */
import type { FlywheelConfigVerify } from './flywheel-config.js';
export declare const BUILD_SLOT_NAME = "npm-test";
export declare const DEFAULT_TEST_CWD = "plugins/cursor-orchestrator/mcp-server";
export declare const VERIFY_ONE_SHOT = "vitest run --passWithNoTests";
export interface VerifyPolicy {
    testCwd: string;
    buildSlot: string;
    maxWorkers: number;
    allowFullSuiteWhenAlone: boolean;
}
export declare const DEFAULT_VERIFY_POLICY: VerifyPolicy;
export declare function verifyPolicyFromConfig(verify?: FlywheelConfigVerify): VerifyPolicy;
/** Shell command for scoped one-shot tests (impl agents during parallel waves). */
export declare function formatScopedTestCommand(files: readonly string[], policy?: VerifyPolicy): string;
/** Shell command for coordinator full-suite verify (one per wave). */
export declare function formatFullSuiteTestCommand(policy?: VerifyPolicy): string;
export declare function formatVerifyForbiddenSummary(policy?: VerifyPolicy): string;
/** Lines appended to impl-agent STEP 2 validate sections. */
export declare function formatImplAgentVerifyLines(relevantFiles?: readonly string[], policy?: VerifyPolicy): string[];
/** Block for Cursor implement spawn instructions / swarm skill. */
export declare function formatSwarmVerifyBlock(policy?: VerifyPolicy): string;
//# sourceMappingURL=verify-policy.d.ts.map