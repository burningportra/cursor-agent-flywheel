import { describe, it, expect } from 'vitest';
import type { Bead, FlywheelState, WaveReviewConfirmAction } from '../../types.js';
import { runWaveReviewGate } from '../../tools/user-gate.js';
import { createMockExec, makeState, type ExecCall } from '../helpers/mocks.js';

function makeBead(id: string): Bead {
  return {
    id,
    title: 'Test',
    description: 'docs readme',
    status: 'in_progress',
    priority: 2,
    type: 'task',
    labels: [],
  };
}

const BR_LIST_ARGS = [
  'list',
  '--json',
  '--fields',
  'id,title,description,status,priority,issue_type,labels,estimate,parent,created_at,updated_at,closed_at',
  '--deferred',
];

function beadIdsForCount(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `tb-${i + 1}`);
}

function execCallsForWave(n: number, action: string): ExecCall[] {
  const ids = beadIdsForCount(n);
  const calls: ExecCall[] = [];

  if (action === 'looks-good-all' && n > 0) {
    for (const id of ids) {
      const bead = makeBead(id);
      calls.push({
        cmd: 'br',
        args: ['show', id, '--json'],
        result: { code: 0, stdout: JSON.stringify(bead), stderr: '' },
      });
      calls.push({
        cmd: 'br',
        args: ['update', id, '--status', 'closed'],
        result: { code: 0, stdout: '', stderr: '' },
      });
    }
    calls.push({
      cmd: 'br',
      args: ['ready', '--json'],
      result: { code: 0, stdout: '[]', stderr: '' },
    });
    return calls;
  }

  if (action === 'fresh-eyes' && n === 1) {
    const bead = makeBead(ids[0]!);
    calls.push({
      cmd: 'br',
      args: ['show', ids[0]!, '--json'],
      result: { code: 0, stdout: JSON.stringify(bead), stderr: '' },
    });
    return calls;
  }

  if (action === 'duel-review' && n > 0) {
    const beads = ids.map((id) => makeBead(id));
    calls.push({
      cmd: 'br',
      args: BR_LIST_ARGS,
      result: { code: 0, stdout: JSON.stringify({ issues: beads }), stderr: '' },
    });
    return calls;
  }

  return calls;
}

function makeCtx(initialEpoch: number, execCalls: ExecCall[]) {
  const state = makeState({
    phase: 'implementing',
    coordinatorEpoch: initialEpoch,
    beadResults: {},
  });
  return {
    ctx: {
      exec: createMockExec(execCalls),
      cwd: '/fake/project',
      state,
      saveState: (_s: FlywheelState) => {},
      clearState: () => {},
    },
    initialEpoch,
  };
}

const ERROR_KINDS = new Set(['invalid_input', 'unsupported_action']);

describe.each([
  ['looks-good-all', 0, 'invalid_input'],
  ['looks-good-all', 1, 'wave_review_confirmed'],
  ['looks-good-all', 3, 'wave_review_confirmed'],
  ['fresh-eyes', 0, 'invalid_input'],
  ['fresh-eyes', 1, 'wave_review_confirmed'],
  ['fresh-eyes', 3, 'invalid_input'],
  ['self-review', 0, 'invalid_input'],
  ['self-review', 1, 'wave_review_confirmed'],
  ['self-review', 3, 'invalid_input'],
  ['duel-review', 0, 'invalid_input'],
  ['duel-review', 1, 'wave_review_confirmed'],
  ['duel-review', 3, 'wave_review_confirmed'],
  ['bogus', 1, 'unsupported_action'],
  ['LOOKS-GOOD-ALL', 1, 'unsupported_action'],
  ['', 1, 'unsupported_action'],
] as const)('runWaveReviewGate(%s, beads=%i)', (action, n, expectedKind) => {
  it(`returns ${expectedKind}`, async () => {
    const { ctx, initialEpoch } = makeCtx(2, execCallsForWave(n, action));
    const beadIds = beadIdsForCount(n);

    const result = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds,
      confirmAction: action as WaveReviewConfirmAction,
    });

    if (ERROR_KINDS.has(expectedKind)) {
      expect(result.isError).toBe(true);
      const err = (result.structuredContent as { data: { error: { code: string } } }).data.error;
      expect(err.code).toBe(expectedKind);
      expect(ctx.state.coordinatorEpoch).toBe(initialEpoch);
      expect(ctx.state.steeringEvents ?? []).toHaveLength(0);
      return;
    }

    expect(result.isError).toBeFalsy();
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;
    expect(data.kind).toBe(expectedKind);
    expect(data.confirmAction).toBe(action);
    expect(data.coordinatorEpoch).toBe(initialEpoch + 1);
  });
});
