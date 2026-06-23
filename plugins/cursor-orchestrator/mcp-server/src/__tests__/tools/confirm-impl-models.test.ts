import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runConfirmImplModels } from '../../tools/confirm-impl-models.js';
import type { FlywheelState, ToolContext } from '../../types.js';
import { wrapExecWithAgentMail } from '../helpers/mocks.js';

function baseState(overrides: Partial<FlywheelState> = {}): FlywheelState {
  return {
    phase: 'implementing',
    constraints: [],
    retryCount: 0,
    maxRetries: 3,
    maxReviewPasses: 2,
    iterationRound: 0,
    currentGateIndex: 0,
    polishRound: 0,
    polishChanges: [],
    polishConverged: false,
    ...overrides,
  };
}

function makeCtx(cwd: string, state: FlywheelState): ToolContext {
  const baseExec = vi.fn(async () => ({ code: 0, stdout: '[]', stderr: '' }));
  return {
    cwd,
    exec: wrapExecWithAgentMail(baseExec),
    signal: undefined as never,
    state,
    saveState: vi.fn(async (s) => {
      Object.assign(state, s);
    }),
    clearState: vi.fn(),
  } as unknown as ToolContext;
}

describe('flywheel_confirm_impl_models commitBatchThreshold', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'confirm-impl-'));
    await fs.promises.writeFile(
      path.join(dir, 'flywheel.config.yaml'),
      'impl_tick:\n  commit_batch_threshold: 5\n  auto_batch_review: true\n  auto_loop: true\n',
    );
  });

  afterEach(async () => {
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('gate response includes resolved commitBatchThreshold from config', async () => {
    const state = baseState();
    const ctx = makeCtx(dir, state);
    const result = await runConfirmImplModels(ctx, { cwd: dir });
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;
    expect(data.commitBatchThreshold).toBe(5);
    expect(result.content[0]?.text).toContain('every 5 commits');
    expect(result.content[0]?.text).toContain('automatic');
    expect(result.content[0]?.text).toContain('/loop');
  });

  it('confirm persists explicit commitBatchThreshold', async () => {
    const state = baseState();
    const ctx = makeCtx(dir, state);
    const result = await runConfirmImplModels(ctx, {
      cwd: dir,
      confirmImplModels: 'defaults',
      commitBatchThreshold: 8,
    });
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;
    expect(state.commitBatchThreshold).toBe(8);
    expect(data.commitBatchThreshold).toBe(8);
    expect(data.confirmed).toBe(true);
    expect(result.content[0]?.text).toContain('threshold persisted: 8');
    expect(result.content[0]?.text).toContain('/loop');
  });

  it('confirm auto-persists config default when commitBatchThreshold omitted', async () => {
    const state = baseState();
    const ctx = makeCtx(dir, state);
    await runConfirmImplModels(ctx, {
      cwd: dir,
      confirmImplModels: 'defaults',
    });
    expect(state.commitBatchThreshold).toBe(5);
  });
});
