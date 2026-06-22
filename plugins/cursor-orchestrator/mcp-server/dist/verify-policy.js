/**
 * Canonical verify/test policy for implement swarms (Vitest leak prevention).
 *
 * Single source of truth for scoped vs full-suite commands, build-slot
 * coordination, and prompt blocks wired into adapter prompts.
 */
export const BUILD_SLOT_NAME = 'npm-test';
export const DEFAULT_TEST_CWD = 'plugins/cursor-orchestrator/mcp-server';
export const VERIFY_ONE_SHOT = 'vitest run --passWithNoTests';
export const DEFAULT_VERIFY_POLICY = {
    testCwd: DEFAULT_TEST_CWD,
    buildSlot: BUILD_SLOT_NAME,
    maxWorkers: 2,
    allowFullSuiteWhenAlone: true,
};
export function verifyPolicyFromConfig(verify) {
    if (!verify)
        return { ...DEFAULT_VERIFY_POLICY };
    return {
        testCwd: typeof verify.test_cwd === 'string' && verify.test_cwd.trim()
            ? verify.test_cwd.trim()
            : DEFAULT_VERIFY_POLICY.testCwd,
        buildSlot: typeof verify.build_slot === 'string' && verify.build_slot.trim()
            ? verify.build_slot.trim()
            : DEFAULT_VERIFY_POLICY.buildSlot,
        maxWorkers: typeof verify.max_workers === 'number' && verify.max_workers >= 1
            ? Math.floor(verify.max_workers)
            : DEFAULT_VERIFY_POLICY.maxWorkers,
        allowFullSuiteWhenAlone: typeof verify.allow_full_suite_when_alone === 'boolean'
            ? verify.allow_full_suite_when_alone
            : DEFAULT_VERIFY_POLICY.allowFullSuiteWhenAlone,
    };
}
/** Shell command for scoped one-shot tests (impl agents during parallel waves). */
export function formatScopedTestCommand(files, policy = DEFAULT_VERIFY_POLICY) {
    const paths = files.length > 0
        ? files.join(' ')
        : '<paths-for-touched-test-files>';
    return `cd ${policy.testCwd} && npm test -- ${paths}`;
}
/** Shell command for coordinator full-suite verify (one per wave). */
export function formatFullSuiteTestCommand(policy = DEFAULT_VERIFY_POLICY) {
    return `cd ${policy.testCwd} && npm test`;
}
export function formatVerifyForbiddenSummary(policy = DEFAULT_VERIFY_POLICY) {
    return [
        'FORBIDDEN during parallel implement waves:',
        '- bare `vitest` / `npx vitest` without `run` (watch mode)',
        '- `npm run test:watch` / `pnpm test:watch`',
        '- background test shells (`&`, `nohup`, ctx_execute `background: true`)',
        `- full-suite \`npm test\` without exclusive build slot \`${policy.buildSlot}\` (coordinator only)`,
    ].join('\n');
}
/** Lines appended to impl-agent STEP 2 validate sections. */
export function formatImplAgentVerifyLines(relevantFiles = [], policy = DEFAULT_VERIFY_POLICY) {
    const scoped = formatScopedTestCommand(relevantFiles, policy);
    return [
        `- Tests (scoped, one-shot only): \`${scoped}\`.`,
        '- Do NOT run full-suite `npm test`, watch mode, or background tests.',
        `- Full suite is coordinator-only: acquire exclusive build slot \`${policy.buildSlot}\` via Agent Mail before \`${formatFullSuiteTestCommand(policy)}\`, then release_build_slot.`,
        formatVerifyForbiddenSummary(policy),
    ];
}
/** Block for Cursor implement spawn instructions / swarm skill. */
export function formatSwarmVerifyBlock(policy = DEFAULT_VERIFY_POLICY) {
    return [
        '## Test verify policy (Vitest leak prevention)',
        '',
        `- Impl agents: \`${formatScopedTestCommand([], policy)}\` (paths for files you touched).`,
        `- Coordinator: one full \`${formatFullSuiteTestCommand(policy)}\` per wave after \`acquire_build_slot({ slot: "${policy.buildSlot}", exclusive: true })\`.`,
        '',
        formatVerifyForbiddenSummary(policy),
    ].join('\n');
}
//# sourceMappingURL=verify-policy.js.map