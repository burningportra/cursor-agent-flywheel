import { describe, it, expect } from 'vitest';

import {
  appendGateResolution,
  deriveGateResolutionKey,
  findReplay,
  GATE_RESOLUTIONS_CAP,
} from '../gate-resolutions.js';
import { makeState } from './helpers/mocks.js';
import type { GateResolution } from '../types.js';

function makeEntry(key: string, index: number): GateResolution {
  return {
    key,
    kind: 'wave_review',
    actionId: `action-${index}`,
    coordinatorEpoch: index,
    resolvedAt: new Date(Date.UTC(2026, 4, 26, index)).toISOString(),
  };
}

describe('deriveGateResolutionKey', () => {
  it('is stable under bead-id reorder', () => {
    const base = {
      kind: 'wave_review' as const,
      actionId: 'looks-good-all',
      reviewBeadId: '',
      planDocument: '',
      selectedGoal: '',
    };
    const keyA = deriveGateResolutionKey({ ...base, beadIds: ['b', 'a', 'c'] });
    const keyB = deriveGateResolutionKey({ ...base, beadIds: ['a', 'b', 'c'] });
    expect(keyA).toBe(keyB);
  });

  it('differs when reviewBeadId changes', () => {
    const base = {
      kind: 'wave_review' as const,
      actionId: 'fresh-eyes',
      beadIds: ['tb-1', 'tb-2'],
      planDocument: '',
      selectedGoal: '',
    };
    const keyA = deriveGateResolutionKey({ ...base, reviewBeadId: 'tb-1' });
    const keyB = deriveGateResolutionKey({ ...base, reviewBeadId: 'tb-2' });
    expect(keyA).not.toBe(keyB);
  });

  it('includes planDocument and selectedGoal in the hash', () => {
    const base = {
      kind: 'wrap_up' as const,
      actionId: 'wrap-up-full',
    };
    const keyA = deriveGateResolutionKey({
      ...base,
      planDocument: 'docs/plan-a.md',
      selectedGoal: 'goal-a',
    });
    const keyB = deriveGateResolutionKey({
      ...base,
      planDocument: 'docs/plan-b.md',
      selectedGoal: 'goal-b',
    });
    expect(keyA).not.toBe(keyB);
  });
});

describe('appendGateResolution / findReplay', () => {
  it('finds a stored replay by key', () => {
    const state = makeState();
    const key = deriveGateResolutionKey({
      kind: 'wave_review',
      actionId: 'looks-good-all',
      beadIds: ['tb-1'],
    });
    const entry = appendGateResolution(state, {
      key,
      kind: 'wave_review',
      actionId: 'looks-good-all',
      beadIds: ['tb-1'],
      coordinatorEpoch: 3,
      resolvedAt: '2026-05-26T00:00:00.000Z',
    });

    expect(findReplay(state, key)).toEqual(entry);
    expect(state.gateResolutions).toHaveLength(1);
  });

  it('FIFO-trims to GATE_RESOLUTIONS_CAP entries', () => {
    const state = makeState();
    for (let i = 0; i < GATE_RESOLUTIONS_CAP + 5; i++) {
      appendGateResolution(state, makeEntry(`key-${i}`, i));
    }
    expect(state.gateResolutions).toHaveLength(GATE_RESOLUTIONS_CAP);
    expect(state.gateResolutions![0]!.key).toBe('key-5');
    expect(state.gateResolutions!.at(-1)!.key).toBe(`key-${GATE_RESOLUTIONS_CAP + 4}`);
    expect(findReplay(state, 'key-0')).toBeNull();
    expect(findReplay(state, 'key-5')).not.toBeNull();
  });
});
