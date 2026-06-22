const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyBlockedTestCommand,
  isVitestWatchCommand,
  isTestWatchScript,
  isBackgroundTestCommand,
} = require('./test-command-guard.js');

describe('isVitestWatchCommand', () => {
  it('blocks bare vitest', () => {
    assert.equal(isVitestWatchCommand('vitest'), true);
    assert.equal(isVitestWatchCommand('npx vitest'), true);
  });
  it('allows vitest run', () => {
    assert.equal(isVitestWatchCommand('vitest run'), false);
    assert.equal(isVitestWatchCommand('npx vitest run --passWithNoTests'), false);
    assert.equal(isVitestWatchCommand('cd mcp-server && npm test'), false);
  });
});

describe('isTestWatchScript', () => {
  it('blocks test:watch scripts', () => {
    assert.equal(isTestWatchScript('npm run test:watch'), true);
    assert.equal(isTestWatchScript('pnpm test:watch'), true);
  });
});

describe('isBackgroundTestCommand', () => {
  it('blocks trailing ampersand on test commands', () => {
    assert.equal(isBackgroundTestCommand('npm test &'), true);
    assert.equal(isBackgroundTestCommand('vitest run &'), true);
  });
  it('blocks nohup test', () => {
    assert.equal(isBackgroundTestCommand('nohup npm test'), true);
  });
});

describe('classifyBlockedTestCommand', () => {
  it('allows scoped npm test', () => {
    assert.deepEqual(
      classifyBlockedTestCommand(
        'cd plugins/cursor-orchestrator/mcp-server && npm test -- src/foo.test.ts',
      ),
      { blocked: false },
    );
  });
  it('allows escape hatch', () => {
    assert.deepEqual(
      classifyBlockedTestCommand('FLYWHEEL_ALLOW_TEST_WATCH=1 vitest'),
      { blocked: false },
    );
  });
  it('blocks watch vitest', () => {
    const r = classifyBlockedTestCommand('vitest');
    assert.equal(r.blocked, true);
    assert.match(r.reason, /watch/i);
  });
});
