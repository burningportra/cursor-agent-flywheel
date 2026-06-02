import { describe, expect, it, vi, beforeEach } from 'vitest';
import { promises as fsPromises } from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

vi.mock('../commit-batch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../commit-batch.js')>();
  return {
    ...actual,
    synthesizeBeadsFromFindings: vi.fn(),
    rollbackSynthesizedBeads: vi.fn(async () => ({ deleted: [], closed: [], failed: [] })),
    clearPendingBatchReview: actual.clearPendingBatchReview,
  };
});

vi.mock('../memory.js', () => ({
  appendMemory: vi.fn(() => true),
}));

import { collectReviewVerdict } from '../review-verdict-collect.js';
import { synthesizeBeadsFromFindings } from '../commit-batch.js';
import { makeState } from './helpers/mocks.js';
import type { FlywheelState, ToolContext } from '../types.js';

function makeCtx(stateOverrides: Partial<FlywheelState> = {}) {
  const state = makeState({ phase: 'reviewing', ...stateOverrides });
  const saved: FlywheelState[] = [];
  const ctx = {
    cwd: '/fake/cwd',
    state,
    saveState: async (s: FlywheelState) => {
      saved.push(structuredClone(s));
    },
    clearState: () => {},
    exec: vi.fn(),
  } as unknown as ToolContext;
  return { ctx, state, saved };
}

const SHA_RANGE = 'abc..def';
const baseOpts = {
  verdictPath: '/fake/cwd/.pi-flywheel/reviews/verdict.json',
  provenanceKey: SHA_RANGE,
  expectedShaRange: SHA_RANGE,
  kind: 'batch_review_verdict' as const,
  memoryTag: 'batch-review',
  passMessage: 'PASS',
  needsAttentionMessage: 'NEEDS ATTENTION',
  blockingMessagePrefix: 'BLOCKING',
  labels: ['auto-review-finding'],
};

describe('collectReviewVerdict', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
    vi.mocked(synthesizeBeadsFromFindings).mockReset();
  });

  it('pass verdict returns proceed/advance next step', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
      JSON.stringify({ status: 'pass', findings: [], sha_range: SHA_RANGE }),
    );
    const { ctx } = makeCtx();

    const result = await collectReviewVerdict(ctx, baseOpts);

    const data = (result.structuredContent as { data: { nextStep: { kind: string } } }).data;
    expect(data.nextStep.kind).toBe('advance_wave');
    expect(vi.mocked(synthesizeBeadsFromFindings)).not.toHaveBeenCalled();
  });

  it('hit_me pass verdict returns proceed_looks_good', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
      JSON.stringify({ status: 'pass', findings: [], sha_range: SHA_RANGE }),
    );
    const { ctx } = makeCtx();

    const result = await collectReviewVerdict(ctx, {
      ...baseOpts,
      kind: 'hit_me_review_verdict',
    });

    const data = (result.structuredContent as { data: { nextStep: { kind: string } } }).data;
    expect(data.nextStep.kind).toBe('proceed_looks_good');
  });

  it('blocking verdict synthesizes beads with labels', async () => {
    const findings = [
      {
        severity: 'critical' as const,
        summary: 'SQL injection',
        suggested_bead_title: 'Sanitize query input',
        affected_files: ['src/db.ts'],
        evidence_excerpt: 'query += userInput',
      },
    ];
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
      JSON.stringify({ status: 'blocking', findings, sha_range: SHA_RANGE }),
    );
    vi.mocked(synthesizeBeadsFromFindings).mockResolvedValueOnce(['tb-new-1']);
    const { ctx } = makeCtx();

    const result = await collectReviewVerdict(ctx, baseOpts);

    const data = (result.structuredContent as {
      data: { nextStep: { kind: string; beadIds: string[] } };
    }).data;
    expect(data.nextStep.kind).toBe('synthesized_beads_pending');
    expect(data.nextStep.beadIds).toEqual(['tb-new-1']);
    expect(vi.mocked(synthesizeBeadsFromFindings)).toHaveBeenCalledWith(
      '/fake/cwd',
      expect.any(Object),
      findings,
      SHA_RANGE,
      ['auto-review-finding'],
    );
  });

  it('malformed JSON falls back to needs_attention', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValueOnce('{ not valid json');
    const { ctx } = makeCtx();

    const result = await collectReviewVerdict(ctx, baseOpts);

    const data = (result.structuredContent as {
      data: { malformed?: boolean; nextStep: { kind: string } };
    }).data;
    expect(data.malformed).toBe(true);
    expect(data.nextStep.kind).toBe('needs_attention');
  });
});
