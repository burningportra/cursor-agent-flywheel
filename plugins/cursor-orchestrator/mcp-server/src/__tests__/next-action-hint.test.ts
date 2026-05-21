import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  HINT_MAX_CHARS,
  buildAdvanceWaveHint,
  buildDispatchImplTasksHint,
  buildNextActionHint,
  buildWaveCompleteHint,
} from '../next-action-hint.js';
import { areNextActionHintsEnabled } from '../flywheel-config.js';

describe('next-action-hint', () => {
  it('buildWaveCompleteHint includes bead count and gate tool', () => {
    const hint = buildWaveCompleteHint(3, ['a-1', 'a-2', 'a-3']);
    expect(hint.primaryTool).toBe('flywheel_wave_review_gate');
    expect(hint.generationEpoch).toBe(3);
    expect(hint.beadIds).toEqual(['a-1', 'a-2', 'a-3']);
    expect(hint.text).toContain('3 beads');
    expect(hint.text.length).toBeLessThanOrEqual(HINT_MAX_CHARS);
  });

  it('generationEpoch matches passed epoch', () => {
    const hint = buildAdvanceWaveHint(7, 2, ['b-1', 'b-2']);
    expect(hint.generationEpoch).toBe(7);
    expect(hint.primaryTool).toBe('flywheel_impl_tick');
  });

  it('omits beadIds when more than 50 beads', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `bead-${i}`);
    const hint = buildWaveCompleteHint(1, ids);
    expect(hint.beadIds).toBeUndefined();
    expect(hint.text).toContain('51 beads');
  });

  it('buildDispatchImplTasksHint truncates long text to cap', () => {
    const hint = buildDispatchImplTasksHint(
      0,
      999,
      Array.from({ length: 60 }, (_, i) => `very-long-bead-id-${i}`),
    );
    expect(hint.text.length).toBeLessThanOrEqual(HINT_MAX_CHARS);
  });

  it('buildNextActionHint returns undefined for advance_wave with zero count', () => {
    expect(buildNextActionHint('advance_wave', 2, { beadCount: 0 })).toBeUndefined();
  });

  it('returns undefined when nextActionHints config false', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hint-config-'));
    await fs.promises.writeFile(
      path.join(dir, 'flywheel.config.yaml'),
      'coordinator:\n  nextActionHints: false\n',
    );
    expect(areNextActionHintsEnabled(dir)).toBe(false);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it('defaults nextActionHints to enabled when config absent', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hint-config-'));
    expect(areNextActionHintsEnabled(dir)).toBe(true);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });
});
