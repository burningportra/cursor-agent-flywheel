import { describe, it, expect } from 'vitest';
import {
  BUILD_SLOT_NAME,
  DEFAULT_VERIFY_POLICY,
  formatFullSuiteTestCommand,
  formatScopedTestCommand,
  formatSwarmVerifyBlock,
  verifyPolicyFromConfig,
} from '../verify-policy.js';

describe('verifyPolicyFromConfig', () => {
  it('returns defaults when verify section is absent', () => {
    expect(verifyPolicyFromConfig(undefined)).toEqual(DEFAULT_VERIFY_POLICY);
  });

  it('merges flywheel.config verify keys', () => {
    expect(
      verifyPolicyFromConfig({
        test_cwd: 'custom/path',
        build_slot: 'test-slot',
        max_workers: 4,
        allow_full_suite_when_alone: false,
      }),
    ).toEqual({
      testCwd: 'custom/path',
      buildSlot: 'test-slot',
      maxWorkers: 4,
      allowFullSuiteWhenAlone: false,
    });
  });
});

describe('formatScopedTestCommand', () => {
  it('includes file paths when provided', () => {
    expect(formatScopedTestCommand(['src/a.test.ts', 'src/b.test.ts'])).toBe(
      `cd ${DEFAULT_VERIFY_POLICY.testCwd} && npm test -- src/a.test.ts src/b.test.ts`,
    );
  });

  it('uses placeholder when no files', () => {
    expect(formatScopedTestCommand([])).toContain('<paths-for-touched-test-files>');
  });
});

describe('formatFullSuiteTestCommand', () => {
  it('runs npm test in test cwd', () => {
    expect(formatFullSuiteTestCommand()).toBe(
      `cd ${DEFAULT_VERIFY_POLICY.testCwd} && npm test`,
    );
  });
});

describe('formatSwarmVerifyBlock', () => {
  it('mentions build slot and forbidden patterns', () => {
    const block = formatSwarmVerifyBlock();
    expect(block).toContain(BUILD_SLOT_NAME);
    expect(block).toContain('test:watch');
    expect(block).toContain('vitest');
  });
});
