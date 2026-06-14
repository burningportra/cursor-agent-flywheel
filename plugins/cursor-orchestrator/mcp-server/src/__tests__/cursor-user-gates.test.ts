import { describe, it, expect } from 'vitest';
import type { Bead, FlywheelState } from '../types.js';
import { ACTION_KEYS, createInitialState } from '../types.js';
import {
  buildAskQuestionFromGate,
  buildBatchReviewSynthesizedGate,
  buildImplSupervisionGate,
  buildBeadCoverageGate,
  buildBeadDedupGate,
  buildBeadHotspotGate,
  buildBeadLaunchGate,
  buildBeadLowQualityGate,
  buildBeadReviewGate,
  buildWaveReviewGate,
  buildWrapUpGate,
  buildWrapUpVerdictGate,
  gateActionsFromOptions,
  isRiskyBead,
  isStructuralBead,
  toCompactGatePayload,
  type FlywheelUserGate,
} from '../cursor-user-gates.js';

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

const actionKeySet = new Set<string>(ACTION_KEYS);

function expectAllOptionsHaveValidActions(gate: FlywheelUserGate, label: string) {
  for (const o of gate.options) {
    expect(actionKeySet.has(o.action), `${label} option ${o.id}`).toBe(true);
  }
}

describe('cursor-user-gates', () => {
  const state = createInitialState() as FlywheelState;

  it('buildWaveReviewGate includes duel option for risky beads', () => {
    const b = bead('tb-1', 'Auth migration', 'security authentication');
    expect(isRiskyBead(b, state)).toBe(true);
    const gate = buildWaveReviewGate([b], state);
    expect(gate.kind).toBe('wave_review');
    expect(gate.options.some((o) => o.label.includes('Duel'))).toBe(true);
    expect(gate.rationale).toContain('Risky');
  });

  it('fresh-eyes option mentions thermo-nuclear structural review', () => {
    const gate = buildWaveReviewGate([bead('tb-1', 'Add feature')], state);
    const fresh = gate.options.find((o) => o.action === 'fresh-eyes');
    expect(fresh?.detail).toMatch(/thermo-nuclear structural quality/i);
    expect(gate.options).toHaveLength(3);
  });

  it('structural bead adds rationale for thermo rubric in fresh-eyes', () => {
    const structural = bead('tb-ref', 'Decompose handler module', 'architecture simplify internal layers');
    expect(isStructuralBead(structural)).toBe(true);
    expect(isRiskyBead(structural, state)).toBe(false);
    const gate = buildWaveReviewGate([structural], state);
    expect(gate.rationale).toMatch(/Structural signals|thermo-nuclear rubric/i);
  });

  it('toCompactGatePayload drops duplicate option blobs', () => {
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

  it('every buildXGate option.action is a member of ACTION_KEYS', () => {
    expectAllOptionsHaveValidActions(
      buildWaveReviewGate([bead('tb-1', 'Task one')], state),
      'wave_review single',
    );
    expectAllOptionsHaveValidActions(
      buildWaveReviewGate(
        [bead('tb-1', 'Auth migration', 'security authentication'), bead('tb-2', 'Task two')],
        state,
      ),
      'wave_review multi risky',
    );
    expectAllOptionsHaveValidActions(
      buildWrapUpGate({ uncommittedCount: 0, uncommittedPreview: [] }),
      'wrap_up',
    );
    expectAllOptionsHaveValidActions(buildBatchReviewSynthesizedGate(2), 'batch synthesized');
    for (const verdict of [
      { status: 'satisfied', explanation: 'ok' },
      { status: 'failed', explanation: 'fail' },
      { status: 'max_iterations_reached', explanation: 'cap' },
      { status: 'needs_revision', explanation: 'revise' },
    ] as const) {
      expectAllOptionsHaveValidActions(
        buildWrapUpVerdictGate(verdict),
        `wrap_up_verdict ${verdict.status}`,
      );
    }
    expectAllOptionsHaveValidActions(buildBeadReviewGate(4), 'bead_review');
    expectAllOptionsHaveValidActions(
      buildBeadLaunchGate({ qualityScore: 0.82, beadCount: 4 }),
      'bead_launch',
    );
    expectAllOptionsHaveValidActions(
      buildBeadLowQualityGate({ qualityScore: 0.55, weakSummary: 'weak' }),
      'bead_low_quality',
    );
    expectAllOptionsHaveValidActions(
      buildBeadHotspotGate('tb-1 ↔ tb-2 overlap'),
      'bead_hotspot',
    );
    expectAllOptionsHaveValidActions(
      buildBeadCoverageGate({ covered: 3, total: 4, missingSections: ['§2'] }),
      'bead_coverage',
    );
    expectAllOptionsHaveValidActions(buildBeadDedupGate(2), 'bead_dedup');
    expectAllOptionsHaveValidActions(
      buildImplSupervisionGate({
        headSha: 'abc',
        commitsSinceBaseline: 2,
        commitBatchThreshold: 8,
        readyCount: 0,
        inProgressCount: 1,
        closedCount: 0,
        nextTickInSeconds: 240,
        mode: 'monitor',
      }),
      'impl_supervision',
    );
  });

  it('gateActionsFromOptions snapshot for multi-bead wave review with risky bead', () => {
    const gate = buildWaveReviewGate(
      [
        bead('tb-1', 'Auth migration', 'security authentication'),
        bead('tb-2', 'Task two'),
        bead('tb-3', 'Task three'),
      ],
      state,
    );
    expect(gateActionsFromOptions(gate)).toMatchInlineSnapshot(`
      {
        "1": "looks-good-all",
        "2": "self-review",
        "3": "fresh-eyes",
        "4": "duel-review",
      }
    `);
  });
});
