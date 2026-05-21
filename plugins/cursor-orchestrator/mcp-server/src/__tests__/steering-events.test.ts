import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildNextActionHint } from '../next-action-hint.js';
import {
  STEERING_EVENTS_CAP,
  appendSteeringEvent,
  buildSteeringNormalizedKey,
  recordGateSteering,
  shouldSuppressNextActionHint,
} from '../steering-events.js';
import { loadState, saveState } from '../state.js';
import { createInitialState } from '../types.js';
import type { FlywheelState } from '../types.js';

let testDir: string;

afterEach(() => {
  if (testDir) rmSync(testDir, { recursive: true, force: true });
});

describe('buildSteeringNormalizedKey', () => {
  it('is stable regardless of bead id order', () => {
    const a = buildSteeringNormalizedKey('skip', ['b-2', 'b-1']);
    const b = buildSteeringNormalizedKey('skip', ['b-1', 'b-2']);
    expect(a).toBe(b);
  });

  it('differs when actionId or bead set changes', () => {
    const base = buildSteeringNormalizedKey('skip', ['b-1']);
    expect(buildSteeringNormalizedKey('defer', ['b-1'])).not.toBe(base);
    expect(buildSteeringNormalizedKey('skip', ['b-2'])).not.toBe(base);
  });
});

describe('appendSteeringEvent', () => {
  it('FIFO-caps steeringEvents at 20', () => {
    const state = createInitialState();
    for (let i = 0; i < STEERING_EVENTS_CAP + 5; i++) {
      appendSteeringEvent(state, {
        source: 'wave_review',
        actionId: 'skip',
        beadIds: [`bead-${i}`],
      });
    }
    expect(state.steeringEvents).toHaveLength(STEERING_EVENTS_CAP);
    expect(state.steeringEvents![0]!.beadIds).toEqual(['bead-5']);
    expect(state.steeringEvents!.at(-1)!.beadIds).toEqual([`bead-${STEERING_EVENTS_CAP + 4}`]);
  });
});

describe('shouldSuppressNextActionHint', () => {
  it('suppresses after three identical rejection keys', () => {
    const state = createInitialState();
    const beadIds = ['tb-1'];
    for (let i = 0; i < 3; i++) {
      appendSteeringEvent(state, {
        source: 'wave_review',
        actionId: 'skip',
        beadIds,
      });
    }
    expect(shouldSuppressNextActionHint(state, 'skip', beadIds)).toBe(true);
  });

  it('does not suppress with fewer than three matching events', () => {
    const state = createInitialState();
    const beadIds = ['tb-1'];
    appendSteeringEvent(state, {
      source: 'wave_review',
      actionId: 'skip',
      beadIds,
    });
    appendSteeringEvent(state, {
      source: 'wave_review',
      actionId: 'skip',
      beadIds,
    });
    expect(shouldSuppressNextActionHint(state, 'skip', beadIds)).toBe(false);
  });

  it('does not suppress accept paths', () => {
    const state = createInitialState();
    for (let i = 0; i < 3; i++) {
      appendSteeringEvent(state, {
        source: 'wave_review',
        actionId: 'looks-good-all',
        beadIds: ['tb-1'],
      });
    }
    expect(shouldSuppressNextActionHint(state, 'looks-good-all', ['tb-1'])).toBe(false);
  });
});

describe('buildNextActionHint suppression integration', () => {
  it('omits advance_wave hint when three skip events share normalizedKey', () => {
    const state = createInitialState();
    const beadIds = ['a-1', 'a-2'];
    for (let i = 0; i < 3; i++) {
      appendSteeringEvent(state, {
        source: 'wave_review',
        actionId: 'skip',
        beadIds,
      });
    }
    expect(
      buildNextActionHint('advance_wave', 1, { state, beadIds, beadCount: 2 }),
    ).toBeUndefined();
  });
});

describe('recordGateSteering checkpoint persistence', () => {
  it('persists steeringEvents through saveState and loadState', async () => {
    testDir = mkdtempSync(join(tmpdir(), 'steering-events-'));
    let state = createInitialState();
    state = { ...state, phase: 'implementing', coordinatorEpoch: 0 };
    const sink = {
      state,
      saveState: async (s: FlywheelState) => {
        await saveState(testDir, s);
        return true;
      },
    };

    await recordGateSteering(sink, {
      source: 'wave_review',
      actionId: 'skip',
      beadIds: ['tb-9'],
    });

    const restored = loadState(testDir);
    expect(restored.steeringEvents).toHaveLength(1);
    expect(restored.steeringEvents![0]).toMatchObject({
      source: 'wave_review',
      actionId: 'skip',
      beadIds: ['tb-9'],
    });
    expect(restored.steeringEvents![0]!.normalizedKey).toBe(
      buildSteeringNormalizedKey('skip', ['tb-9']),
    );
    expect(restored.coordinatorEpoch).toBe(1);
  });
});
