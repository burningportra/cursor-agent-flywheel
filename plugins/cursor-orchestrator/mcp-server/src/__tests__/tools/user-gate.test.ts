import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CHECKPOINT_DIR,
  CHECKPOINT_FILE,
  computeStateHash,
} from '../../checkpoint.js';
import type { Bead, CheckpointEnvelope, FlywheelState, ToolContext } from '../../types.js';
import { runBeadApprovalGate, runWaveReviewGate, runWrapUpGate } from '../../tools/user-gate.js';
import { createMockExec, makeState } from '../helpers/mocks.js';
import { invalidateBeadCache } from '../../beads.js';

const BR_LIST_ARGS = [
  'list',
  '--json',
  '--all',
  '--fields',
  'id,title,description,status,priority,issue_type,labels,estimate,parent,created_at,updated_at,closed_at',
  '--deferred',
];

function makeBead(id: string, status: Bead['status'] = 'open'): Bead {
  return {
    id,
    title: 'Test',
    description: 'docs readme',
    status,
    priority: 2,
    type: 'task',
    labels: [],
  };
}

function makeEnvelope(
  state: FlywheelState,
  overrides: Partial<CheckpointEnvelope> = {},
): CheckpointEnvelope {
  const envelope: CheckpointEnvelope = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    flywheelVersion: '3.20.0',
    gitHead: '16ede83abc123def4567890123456789012345678',
    state,
    stateHash: '',
    ...overrides,
  };
  envelope.stateHash = computeStateHash(envelope.state);
  return envelope;
}

function writeCheckpoint(cwd: string, envelope: CheckpointEnvelope): void {
  const dir = join(cwd, CHECKPOINT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, CHECKPOINT_FILE), JSON.stringify(envelope, null, 2));
}

describe('flywheel user gate tools', () => {
  let recoveryTempDir: string | undefined;

  beforeEach(() => {
    invalidateBeadCache();
  });

  afterEach(() => {
    if (recoveryTempDir) {
      rmSync(recoveryTempDir, { recursive: true, force: true });
      recoveryTempDir = undefined;
    }
  });

  it('flywheel_wave_review_gate returns userGate', async () => {
    const bead = makeBead('tb-9');
    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: [
              'list',
              '--json',
              '--all',
              '--fields',
              'id,title,description,status,priority,issue_type,labels,estimate,parent,created_at,updated_at,closed_at',
              '--deferred',
            ],
            result: {
              code: 0,
              stdout: JSON.stringify({ issues: [bead] }),
              stderr: '',
            },
          },
        ]),
        cwd: '/fake/project',
        state: makeState({ phase: 'implementing' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: ['tb-9'],
    });
    const data = (result.structuredContent as any).data;
    expect(data.gateMeta.kind).toBe('wave_review');
    expect(data.actions['1']).toBe('looks-good-all');
    expect(data.askQuestion.questions[0].options.length).toBeGreaterThanOrEqual(3);
    expect(result.content[0]?.text).not.toContain('coordinatorAction');
  });

  it('flywheel_bead_approval_gate step=review returns bead_review menu', async () => {
    const bead = makeBead('tb-1');
    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: ['list', '--json'],
            result: {
              code: 0,
              stdout: JSON.stringify({ issues: [bead] }),
              stderr: '',
            },
          },
        ]),
        cwd: '/fake/project',
        state: makeState({ phase: 'creating_beads', selectedGoal: 'g' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runBeadApprovalGate(ctx, {
      cwd: '/fake/project',
      step: 'review',
    });
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;
    expect(data.gateMeta).toMatchObject({ kind: 'bead_review' });
    expect(data.askQuestion).toBeDefined();
    expect((data.askQuestion as { questions: { options: unknown[] }[] }).questions[0].options).toHaveLength(3);
  });

  it('flywheel_bead_approval_gate step=launch returns quality and launch gate', async () => {
    const bead = makeBead('tb-2');
    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: ['list', '--json'],
            result: {
              code: 0,
              stdout: JSON.stringify({ issues: [bead] }),
              stderr: '',
            },
          },
        ]),
        cwd: '/fake/project',
        state: makeState({
          phase: 'awaiting_bead_approval',
          selectedGoal: 'g',
          polishChanges: [2, 1, 0],
          polishOutputSizes: [100, 110, 120],
        }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runBeadApprovalGate(ctx, {
      cwd: '/fake/project',
      step: 'launch',
    });
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;
    expect(data.quality).toBeDefined();
    expect(['bead_launch', 'bead_low_quality', 'bead_hotspot']).toContain(
      (data.gateMeta as { kind: string }).kind,
    );
  });

  it('flywheel_wrap_up_gate returns wrap-up menu', async () => {
    const { ctx } = {
      ctx: {
        exec: createMockExec([]),
        cwd: process.cwd(),
        state: makeState({ phase: 'iterating' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runWrapUpGate(ctx, { cwd: process.cwd() });
    const data = (result.structuredContent as any).data;
    expect(data.gateMeta.kind).toBe('wrap_up');
    expect(data.actions['1']).toBe('wrap-up-full');
    expect(data.askQuestion.questions[0].options[0].id).toBe('1');
  });

  it('E7: flywheel_wrap_up_gate confirmWrapUp bumps coordinatorEpoch', async () => {
    const saved: FlywheelState[] = [];
    const { ctx } = {
      ctx: {
        exec: createMockExec([]),
        cwd: process.cwd(),
        state: makeState({ phase: 'iterating', coordinatorEpoch: 0 }),
        saveState: (s: FlywheelState) => {
          saved.push(structuredClone(s));
        },
        clearState: () => {},
      },
    };

    await runWrapUpGate(ctx, { cwd: process.cwd(), confirmWrapUp: 'full' });

    expect(ctx.state.coordinatorEpoch).toBe(1);
    expect(saved.some((s) => s.coordinatorEpoch === 1)).toBe(true);
    expect(ctx.state.steeringEvents).toHaveLength(1);
    expect(ctx.state.steeringEvents![0]).toMatchObject({
      source: 'wrap_up',
      actionId: 'wrap-up-full',
    });
  });

  it('E8: flywheel_wave_review_gate confirmAction bumps coordinatorEpoch', async () => {
    const bead = makeBead('tb-9');
    bead.status = 'in_progress';
    const saved: FlywheelState[] = [];
    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: BR_LIST_ARGS,
            result: { code: 0, stdout: JSON.stringify({ issues: [bead] }), stderr: '' },
          },
          {
            cmd: 'br',
            args: ['update', 'tb-9', '--status', 'closed'],
            result: { code: 0, stdout: '', stderr: '' },
          },
          {
            cmd: 'br',
            args: ['ready', '--json'],
            result: { code: 0, stdout: '[]', stderr: '' },
          },
        ]),
        cwd: '/fake/project',
        state: makeState({
          phase: 'implementing',
          coordinatorEpoch: 4,
          beadResults: {},
        }),
        saveState: (s: FlywheelState) => {
          saved.push(structuredClone(s));
        },
        clearState: () => {},
      },
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: ['tb-9'],
      confirmAction: 'looks-good-all',
    });
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;

    expect(data.kind).toBe('wave_review_confirmed');
    expect(data.coordinatorEpoch).toBe(5);
    expect(data.closedBeadIds).toEqual(['tb-9']);
    expect(ctx.state.coordinatorEpoch).toBe(5);
    expect(ctx.state.beadResults!['tb-9']).toMatchObject({
      beadId: 'tb-9',
      status: 'success',
    });
    expect(saved.some((s) => s.beadResults?.['tb-9']?.status === 'success')).toBe(true);
    expect(ctx.state.steeringEvents).toHaveLength(1);
    expect(ctx.state.steeringEvents![0]).toMatchObject({
      source: 'wave_review',
      actionId: 'looks-good-all',
      beadIds: ['tb-9'],
    });
    expect(result.content[0]?.text).toContain('closed 1 bead');
  });

  it('E8: confirmAction looks-good-all closes every bead in the wave', async () => {
    const beadA = makeBead('tb-a');
    beadA.status = 'in_progress';
    const beadB = makeBead('tb-b');
    beadB.status = 'in_progress';
    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: BR_LIST_ARGS,
            result: {
              code: 0,
              stdout: JSON.stringify({ issues: [beadA, beadB] }),
              stderr: '',
            },
          },
          {
            cmd: 'br',
            args: ['update', 'tb-a', '--status', 'closed'],
            result: { code: 0, stdout: '', stderr: '' },
          },
          {
            cmd: 'br',
            args: ['update', 'tb-b', '--status', 'closed'],
            result: { code: 0, stdout: '', stderr: '' },
          },
          {
            cmd: 'br',
            args: ['ready', '--json'],
            result: { code: 0, stdout: '[]', stderr: '' },
          },
        ]),
        cwd: '/fake/project',
        state: makeState({ phase: 'implementing', beadResults: {} }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: ['tb-a', 'tb-b'],
      confirmAction: 'looks-good-all',
    });

    expect(ctx.state.beadResults!['tb-a']?.status).toBe('success');
    expect(ctx.state.beadResults!['tb-b']?.status).toBe('success');
  });

  it('confirmAction fresh-eyes dispatches hit-me review for single-bead wave', async () => {
    const bead = makeBead('tb-9');
    bead.status = 'in_progress';
    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: ['show', 'tb-9', '--json'],
            result: { code: 0, stdout: JSON.stringify(bead), stderr: '' },
          },
        ]),
        cwd: '/fake/project',
        state: makeState({ phase: 'implementing' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: ['tb-9'],
      confirmAction: 'fresh-eyes',
    });
    const data = (result.structuredContent as any).data;
    expect(data.confirmAction).toBe('fresh-eyes');
    expect(data.reviewBeadId).toBe('tb-9');
    expect(data.reviewOutcome?.kind).toBe('review_tasks');
    expect(data.reviewOutcome?.agentTasks?.length).toBe(5);
  });

  it('empty beadIds returns suggestedBeadIds from trusted checkpoint', async () => {
    recoveryTempDir = mkdtempSync(join(tmpdir(), 'user-gate-recover-trusted-'));
    const beadId = 'cursor-agent-flywheel-3fz';
    const state = makeState({
      phase: 'implementing',
      beadResults: {
        [beadId]: { beadId, status: 'success', summary: 'done' },
      },
    });
    writeCheckpoint(
      recoveryTempDir,
      makeEnvelope(state, {
        gitHead: '16ede83abc123def4567890123456789012345678',
      }),
    );

    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: BR_LIST_ARGS,
            result: {
              code: 0,
              stdout: JSON.stringify({ issues: [makeBead(beadId, 'closed')] }),
              stderr: '',
            },
          },
          {
            cmd: 'git',
            args: ['rev-parse', 'HEAD'],
            result: {
              code: 0,
              stdout: '16ede83abc123def4567890123456789012345678\n',
              stderr: '',
            },
          },
        ]),
        cwd: recoveryTempDir,
        state: makeState({ phase: 'implementing' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: recoveryTempDir,
      beadIds: [],
    });
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;

    expect(result.isError).toBeFalsy();
    expect(data.kind).toBe('recover_gate_context');
    expect(data.suggestedBeadIds).toEqual([beadId]);
    expect(data.recoverySource).toBe('checkpoint');
    expect(data.recoveryConfidence).toBe('trusted');
    expect(data.requiresConfirmation).toBe(false);
    expect(result.content[0]?.text).toContain('recover_gate_context');
  });

  it('empty beadIds with stale checkpoint sets requiresConfirmation', async () => {
    recoveryTempDir = mkdtempSync(join(tmpdir(), 'user-gate-recover-stale-'));
    const beadId = 'tb-stale-wave';
    const staleWrittenAt = new Date(
      Date.now() - 25 * 60 * 60 * 1000,
    ).toISOString();
    const state = makeState({
      phase: 'implementing',
      beadResults: {
        [beadId]: { beadId, status: 'success', summary: 'done' },
      },
    });
    writeCheckpoint(
      recoveryTempDir,
      makeEnvelope(state, {
        writtenAt: staleWrittenAt,
        gitHead: '16ede83abc123def4567890123456789012345678',
      }),
    );

    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: BR_LIST_ARGS,
            result: {
              code: 0,
              stdout: JSON.stringify({ issues: [makeBead(beadId, 'closed')] }),
              stderr: '',
            },
          },
          {
            cmd: 'git',
            args: ['rev-parse', 'HEAD'],
            result: {
              code: 0,
              stdout: '16ede83abc123def4567890123456789012345678\n',
              stderr: '',
            },
          },
        ]),
        cwd: recoveryTempDir,
        state: makeState({ phase: 'implementing' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: recoveryTempDir,
      beadIds: [],
    });
    const data = (result.structuredContent as { data: Record<string, unknown> }).data;

    expect(result.isError).toBeFalsy();
    expect(data.kind).toBe('recover_gate_context');
    expect(data.suggestedBeadIds).toEqual([beadId]);
    expect(data.recoveryConfidence).toBe('stale');
    expect(data.requiresConfirmation).toBe(true);
    expect(result.content[0]?.text).toContain('Stale or inferred candidates');
  });

  it('empty beadIds manual_required returns invalid_input with recovery metadata', async () => {
    recoveryTempDir = mkdtempSync(join(tmpdir(), 'user-gate-recover-manual-'));
    const { ctx } = {
      ctx: {
        exec: createMockExec([
          {
            cmd: 'br',
            args: BR_LIST_ARGS,
            result: { code: 1, stdout: '', stderr: 'br down' },
          },
          {
            cmd: 'git',
            args: ['rev-parse', 'HEAD'],
            result: { code: 1, stdout: '', stderr: 'not a repo' },
          },
        ]),
        cwd: recoveryTempDir,
        state: makeState({ phase: 'implementing' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: recoveryTempDir,
      beadIds: [],
    });
    const err = (result.structuredContent as {
      data: { error: { code: string; details?: Record<string, unknown> } };
    }).data.error;

    expect(result.isError).toBe(true);
    expect(err.code).toBe('invalid_input');
    expect(err.details?.suggestedBeadIds).toEqual([]);
    expect((err.details?.recovery as { source?: string })?.source).toBe(
      'manual_required',
    );
  });

  it('explicit beadIds does not run recovery git or checkpoint probes', async () => {
    const bead = makeBead('tb-9');
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === 'br' && args[0] === 'list') {
        return {
          code: 0,
          stdout: JSON.stringify({ issues: [bead] }),
          stderr: '',
        };
      }
      return { code: 1, stdout: '', stderr: 'should not be called' };
    });
    const { ctx } = {
      ctx: {
        exec: exec as ToolContext['exec'],
        cwd: '/fake/project',
        state: makeState({ phase: 'implementing' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: ['tb-9'],
    });

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0]?.[0]).toBe('br');
    expect(exec.mock.calls.some((c) => c[0] === 'git')).toBe(false);
  });

  it('confirmAction self-review returns playbook for target bead', async () => {
    const { ctx } = {
      ctx: {
        exec: createMockExec([]),
        cwd: '/fake/project',
        state: makeState({ phase: 'implementing' }),
        saveState: (_s: FlywheelState) => {},
        clearState: () => {},
      },
    };

    const result = await runWaveReviewGate(ctx, {
      cwd: '/fake/project',
      beadIds: ['tb-9'],
      confirmAction: 'self-review',
    });
    const data = (result.structuredContent as any).data;
    expect(data.selfReviewPlaybook).toContain('tb-9');
  });
});
