/**
 * Pure helpers for blocking long-lived / background test runners in shell hooks.
 * Exported for unit tests (node --test hooks/test-command-guard.test.js).
 */

const SCOPED_TEST_HINT =
  'Use one-shot tests only: cd plugins/cursor-orchestrator/mcp-server && npm test -- <changed-test-files>';

/** @param {string} command */
function allowsTestWatchEscape(command) {
  return (
    /\bFLYWHEEL_ALLOW_TEST_WATCH=1\b/.test(command) ||
    process.env.FLYWHEEL_ALLOW_TEST_WATCH === '1'
  );
}

/** @param {string} command */
function isVitestWatchCommand(command) {
  if (/\bvitest\s+run\b/i.test(command)) return false;
  if (/\bnpx\s+vitest\s+run\b/i.test(command)) return false;
  if (/\bpnpm\s+(exec\s+)?vitest\s+run\b/i.test(command)) return false;
  if (/\byarn\s+(run\s+)?vitest\s+run\b/i.test(command)) return false;
  if (/\b(vitest|npx\s+vitest|pnpm\s+(exec\s+)?vitest|yarn\s+(run\s+)?vitest)\b/i.test(command)) {
    return true;
  }
  return false;
}

/** @param {string} command */
function isTestWatchScript(command) {
  return /\b(npm|pnpm|yarn)\s+(run\s+)?test:watch\b/i.test(command);
}

/** @param {string} command */
function isBackgroundTestCommand(command) {
  if (/\bnohup\b/i.test(command) && /\b(test|vitest|npm\s+test)\b/i.test(command)) {
    return true;
  }
  if (/\b(test|vitest|npm\s+test)\b/i.test(command) && /\s&\s*$/.test(command.trim())) {
    return true;
  }
  if (/\b(test|vitest|npm\s+test)\b/i.test(command) && /\s&\s*(\||;|$)/.test(command)) {
    return true;
  }
  return false;
}

/**
 * @param {string} command
 * @returns {{ blocked: boolean, reason?: string }}
 */
function classifyBlockedTestCommand(command) {
  if (!command || !command.trim()) return { blocked: false };
  if (allowsTestWatchEscape(command)) return { blocked: false };

  if (isVitestWatchCommand(command)) {
    return {
      blocked: true,
      reason: 'vitest watch / interactive mode (use `vitest run` or `npm test` instead)',
    };
  }
  if (isTestWatchScript(command)) {
    return {
      blocked: true,
      reason: 'test:watch script (long-lived; use `npm test` one-shot instead)',
    };
  }
  if (isBackgroundTestCommand(command)) {
    return {
      blocked: true,
      reason: 'background test command (`&` / nohup)',
    };
  }
  return { blocked: false };
}

/** @param {string} reason */
function formatTestGuardError(reason) {
  return [
    `BLOCKED by agent-flywheel test guard: ${reason}.`,
    '',
    SCOPED_TEST_HINT,
    '',
    'Never run tests with watch mode, `test:watch`, or shell background (`&` / nohup).',
    'Coordinator: acquire exclusive build slot `npm-test` before a full-suite `npm test`.',
    'If a human intentionally wants watch mode, prefix the command with FLYWHEEL_ALLOW_TEST_WATCH=1.',
  ].join('\n');
}

module.exports = {
  SCOPED_TEST_HINT,
  allowsTestWatchEscape,
  isVitestWatchCommand,
  isTestWatchScript,
  isBackgroundTestCommand,
  classifyBlockedTestCommand,
  formatTestGuardError,
};
