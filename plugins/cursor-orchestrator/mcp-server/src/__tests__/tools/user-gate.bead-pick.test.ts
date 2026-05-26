import { describe, it, expect, beforeEach } from 'vitest';
import type { Bead, FlywheelState } from '../../types.js';
import { runWaveReviewGate } from '../../tools/user-gate.js';
import { createMockExec, makeState } from '../helpers/mocks.js';
import { invalidateBeadCache } from '../../beads.js';

function makeBead(id: string, title = `Title ${id}`): Bead {
  return {
    id,
    title,
    description: 'docs readme',
    status: 'closed',
    priority: 2,
    type: 'task',
    labels: [],
  };
}

const BR_LIST_ARGS = [
  'list',
  '--json',
  '--all',
  '--fields',
  'id,title,description,status,priority,issue_type,labels,estimate,parent,created_at,updated_at,closed_at',
  '--deferred',
];

const WAVE_BEAD_IDS = ['tb-1', 'tb-2', 'tb-3'] as const;

function makeCtx(initialEpoch: number) {
  const beads = WAVE_BEAD_IDS.map((id) => makeBead(id));
  const state = makeState({
    phase: 'implementing',
    coordinatorEpoch: initialEpoch,
    beadResults: {},
  });
  return {
    ctx: {
      exec: createMockExec([
        {
          cmd: 'br',
          args: BR_LIST_ARGS,
          result: { code: 0, stdout: JSON.stringify({ issues: beads }), stderr: '' },
        },
        {
          cmd: 'br',
          args: ['show', 'tb-2', '--json'],
          result: { code: 0, stdout: JSON.stringify(makeBead('tb-2')), stderr: '' },
        },
      ]),
      cwd: '/fake/project',
      state,
      saveState: (_s: FlywheelState) => {},
      clearState: () => {},
    },
    initialEpoch,
  };
}

describe.each(['fresh-eyes', 'self-review'] as const)(
  'wave_review_bead_pick_required (%s)',
  (confirmAction) => {
  beforeEach(() => {
    invalidateBeadCache();
  });

  it('multi-bead without reviewBeadId returns bead pick gate and no epoch bump', async () => {
    const { ctx, initialEpoch } = makeCtx(4);
    const result = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: [...WAVE_BEAD_IDS],
      confirmAction,
    });

    expect(result.isError).toBeFalsy();
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;
    expect(data.kind).toBe('wave_review_bead_pick_required');
    expect(data.confirmAction).toBe(confirmAction);
    expect(data.coordinatorEpoch).toBe(initialEpoch);
    expect(ctx.state.coordinatorEpoch).toBe(initialEpoch);
    expect(ctx.state.steeringEvents ?? []).toHaveLength(0);
    expect(ctx.state.gateResolutions ?? []).toHaveLength(0);

    const nextAskQuestion = data.nextAskQuestion as {
      questions: Array<{ options: Array<{ id: string }> }>;
    };
    expect(nextAskQuestion.questions).toHaveLength(1);
    expect(nextAskQuestion.questions[0]!.options.map((o) => o.id)).toEqual([
      'tb-1',
      'tb-2',
      'tb-3',
    ]);
  });

  it('follow-up confirm with reviewBeadId succeeds and bumps once', async () => {
    const { ctx, initialEpoch } = makeCtx(2);
    const beadIds = [...WAVE_BEAD_IDS];

    const pick = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds,
      confirmAction,
    });
    expect((pick.structuredContent as { data: { kind: string } }).data.kind).toBe(
      'wave_review_bead_pick_required',
    );

    const confirm = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds,
      confirmAction,
      reviewBeadId: 'tb-2',
    });

    expect(confirm.isError).toBeFalsy();
    const data = (confirm.structuredContent as { data: Record<string, unknown> }).data;
    expect(data.kind).toBe('wave_review_confirmed');
    expect(data.reviewBeadId).toBe('tb-2');
    expect(data.coordinatorEpoch).toBe(initialEpoch + 1);
    expect(ctx.state.gateResolutions?.[0]?.reviewBeadId).toBe('tb-2');
  });
  },
);

describe('wave_review_bead_pick_required edge cases', () => {
  beforeEach(() => {
    invalidateBeadCache();
  });

  it('single-bead wave skips bead pick and confirms directly', async () => {
    const bead = makeBead('tb-9');
    bead.status = 'in_progress';
    const state = makeState({ phase: 'implementing', coordinatorEpoch: 1 });
    const ctx = {
      exec: createMockExec([
        {
          cmd: 'br',
          args: ['show', 'tb-9', '--json'],
          result: { code: 0, stdout: JSON.stringify(bead), stderr: '' },
        },
      ]),
      cwd: '/fake/project',
      state,
      saveState: (_s: FlywheelState) => {},
      clearState: () => {},
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: ['tb-9'],
      confirmAction: 'fresh-eyes',
    });

    const data = (result.structuredContent as { data: Record<string, unknown> }).data;
    expect(data.kind).toBe('wave_review_confirmed');
    expect(data.reviewBeadId).toBe('tb-9');
    expect(data.coordinatorEpoch).toBe(2);
  });
});
