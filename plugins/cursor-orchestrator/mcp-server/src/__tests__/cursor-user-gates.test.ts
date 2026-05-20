import { describe, it, expect } from 'vitest';
import type { Bead, FlywheelState } from '../types.js';
import {
  buildAskQuestionFromGate,
  buildBeadLaunchGate,
  buildBeadReviewGate,
  buildWaveReviewGate,
  buildWrapUpGate,
  gateActionsFromOptions,
  isRiskyBead,
  toCompactGatePayload,
} from '../cursor-user-gates.js';
import { createInitialState } from '../types.js';

function bead(id: string, title: string, description = ''): Bead {
  return {
    id,
    title,
    description,
    status: 'closed',
    priority: 2,
    type: 'task',
    labels: [],
  };
}

describe('cursor-user-gates', () => {
  it('buildWaveReviewGate includes duel option for risky beads', () => {
    const state = createInitialState() as FlywheelState;
    const b = bead('tb-1', 'Auth migration', 'security authentication');
    expect(isRiskyBead(b, state)).toBe(true);
    const gate = buildWaveReviewGate([b], state);
    expect(gate.kind).toBe('wave_review');
    expect(gate.options.some((o) => o.label.includes('Duel'))).toBe(true);
    expect(gate.rationale).toContain('Risky');
  });

  it('toCompactGatePayload drops duplicate option blobs', () => {
    const state = createInitialState() as FlywheelState;
    const beads = ['tb-1', 'tb-2', 'tb-3', 'tb-4'].map((id) =>
      bead(id, `Task ${id}`, 'implement feature'),
    );
    const gate = buildWaveReviewGate(beads, state);
    const full = JSON.stringify({ userGate: gate, askQuestion: buildAskQuestionFromGate(gate) });
    const compact = JSON.stringify(toCompactGatePayload(gate));
    expect(compact.length).toBeLessThan(full.length * 0.55);
    expect(gateActionsFromOptions(gate)['1']).toBe('looks-good-all');
  });

  it('buildAskQuestionFromGate maps options for AskQuestion UI', () => {
    const gate = buildWrapUpGate({
      uncommittedCount: 0,
      uncommittedPreview: [],
    });
    const aq = buildAskQuestionFromGate(gate);
    expect(aq.title).toBe(gate.title);
    expect(aq.questions[0].options.length).toBe(3);
    expect(aq.questions[0].options[0].id).toBe('1');
  });

  it('buildWrapUpGate offers three wrap-up paths', () => {
    const gate = buildWrapUpGate({
      uncommittedCount: 2,
      uncommittedPreview: ['README.md', 'flywheel.config.yaml'],
    });
    expect(gate.options).toHaveLength(3);
    expect(gate.options[0].label).toContain('Full wrap-up');
  });

  it('buildBeadReviewGate maps start to launch gate action', () => {
    const gate = buildBeadReviewGate(4);
    expect(gate.kind).toBe('bead_review');
    expect(gateActionsFromOptions(gate)['1']).toBe('bead-score-and-launch-gate');
    const launch = buildBeadLaunchGate({ qualityScore: 0.82, beadCount: 4 });
    expect(gateActionsFromOptions(launch)['1']).toBe('bead-launch');
  });
});
