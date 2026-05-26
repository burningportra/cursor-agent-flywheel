/**
 * recover-gates P1 — Zod rejection matrix for wave/wrap-up gate args.
 * Covers schema.safeParse and validateToolArgs boundary behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  WaveReviewGateArgsSchema,
  WrapUpGateArgsSchema,
  validateToolArgs,
} from '../server.js';
import {
  WAVE_REVIEW_CONFIRM_ACTIONS,
  WRAP_UP_CONFIRM_ACTIONS,
} from '../types.js';

const CWD = '/tmp/flywheel-project';

describe('WaveReviewGateArgsSchema', () => {
  it('accepts minimal build-path args', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: ['bead-1'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts every closed confirmAction', () => {
    for (const confirmAction of WAVE_REVIEW_CONFIRM_ACTIONS) {
      const result = WaveReviewGateArgsSchema.safeParse({
        cwd: CWD,
        beadIds: ['bead-1'],
        confirmAction,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects wrong-case confirmAction', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: ['bead-1'],
      confirmAction: 'LOOKS-GOOD-ALL',
    });
    expect(result.success).toBe(false);
  });

  it('rejects null confirmAction (optional ≠ nullable)', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: ['bead-1'],
      confirmAction: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty confirmAction string', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: ['bead-1'],
      confirmAction: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown confirmAction', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: ['bead-1'],
      confirmAction: 'bogus',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty beadIds array for recovery resolution', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing beadIds', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra keys via .strict()', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: ['bead-1'],
      surprise: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty cwd', () => {
    const result = WaveReviewGateArgsSchema.safeParse({
      cwd: '',
      beadIds: ['bead-1'],
    });
    expect(result.success).toBe(false);
  });
});

describe('WrapUpGateArgsSchema', () => {
  it('accepts minimal build-path args', () => {
    const result = WrapUpGateArgsSchema.safeParse({ cwd: CWD });
    expect(result.success).toBe(true);
  });

  it('accepts every closed confirmWrapUp', () => {
    for (const confirmWrapUp of WRAP_UP_CONFIRM_ACTIONS) {
      const result = WrapUpGateArgsSchema.safeParse({ cwd: CWD, confirmWrapUp });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid confirmWrapUp enum', () => {
    const result = WrapUpGateArgsSchema.safeParse({
      cwd: CWD,
      confirmWrapUp: 'everything',
    });
    expect(result.success).toBe(false);
  });

  it('rejects null confirmWrapUp', () => {
    const result = WrapUpGateArgsSchema.safeParse({
      cwd: CWD,
      confirmWrapUp: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects numeric force', () => {
    const result = WrapUpGateArgsSchema.safeParse({
      cwd: CWD,
      force: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects extra keys via .strict()', () => {
    const result = WrapUpGateArgsSchema.safeParse({
      cwd: CWD,
      beadIds: ['bead-1'],
    });
    expect(result.success).toBe(false);
  });
});

describe('validateToolArgs gate boundary', () => {
  it('rejects invalid confirmAction before dispatch', () => {
    const err = validateToolArgs('flywheel_wave_review_gate', {
      cwd: CWD,
      beadIds: ['bead-1'],
      confirmAction: 'LOOKS-GOOD-ALL',
    });
    expect(err).not.toBeNull();
    expect(err?.field).toBe('confirmAction');
    expect(err?.reason).toBe('invalid_enum_value');
  });

  it('accepts empty beadIds for recovery resolution before dispatch', () => {
    const err = validateToolArgs('flywheel_wave_review_gate', {
      cwd: CWD,
      beadIds: [],
    });
    expect(err).toBeNull();
  });

  it('rejects unknown wrap-up confirm before dispatch', () => {
    const err = validateToolArgs('flywheel_wrap_up_gate', {
      cwd: CWD,
      confirmWrapUp: 'nope',
    });
    expect(err).not.toBeNull();
    expect(err?.field).toBe('confirmWrapUp');
    expect(err?.reason).toBe('invalid_enum_value');
  });

  it('accepts valid wave-review confirm path', () => {
    const err = validateToolArgs('flywheel_wave_review_gate', {
      cwd: CWD,
      beadIds: ['bead-1'],
      confirmAction: 'looks-good-all',
    });
    expect(err).toBeNull();
  });

  it('accepts valid wrap-up confirm path', () => {
    const err = validateToolArgs('flywheel_wrap_up_gate', {
      cwd: CWD,
      confirmWrapUp: 'full',
      force: true,
    });
    expect(err).toBeNull();
  });
});
