/**
 * recover-gates P1 — CompactGatePayloadSchema round-trip for every shipping gate kind.
 */
import { describe, it, expect } from 'vitest';
import { CompactGatePayloadSchema, FLYWHEEL_USER_GATE_KINDS, createInitialState, } from '../types.js';
import { buildBatchReviewSynthesizedGate, buildBeadCoverageGate, buildBeadDedupGate, buildBeadHotspotGate, buildBeadLaunchGate, buildBeadLowQualityGate, buildBeadReviewGate, buildWaveReviewGate, buildWrapUpAlreadyConfirmedPayload, buildWrapUpGate, buildWrapUpVerdictGate, toCompactGatePayload, } from '../cursor-user-gates.js';
import { buildStartMenu } from '../cursor-start-menu.js';
function bead(id, title, description = '') {
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
function expectRoundTrip(gate, label) {
    const compact = toCompactGatePayload(gate);
    const parsed = CompactGatePayloadSchema.safeParse(compact);
    expect(parsed.success, label ?? gate.kind).toBe(true);
}
function reviewModeGateFromStartMenu() {
    const menu = buildStartMenu({ variant: 'fresh-start' });
    return {
        kind: 'review_mode',
        title: 'Start menu',
        rationale: menu.primaryEntryPointsMarkdown,
        options: menu.options.map((o) => ({
            id: o.id,
            label: o.label,
            detail: o.description,
            action: o.action,
            coordinatorAction: o.route,
        })),
        instructions: 'AskQuestion(structuredContent.data.askQuestion); route via routeHints.',
    };
}
describe('CompactGatePayloadSchema round-trip', () => {
    const state = createInitialState();
    it('covers every shipping gate kind', () => {
        const covered = new Set();
        expectRoundTrip(buildWaveReviewGate([bead('tb-1', 'Task one')], state), 'wave_review single');
        covered.add('wave_review');
        expectRoundTrip(buildWaveReviewGate([
            bead('tb-1', 'Auth migration', 'security authentication'),
            bead('tb-2', 'Task two'),
        ], state), 'wave_review multi risky');
        expectRoundTrip(buildWrapUpGate({
            uncommittedCount: 2,
            uncommittedPreview: ['README.md'],
            beadCommitCount: 3,
        }), 'wrap_up');
        covered.add('wrap_up');
        for (const verdict of [
            { status: 'satisfied', explanation: 'All criteria met.' },
            { status: 'failed', explanation: 'Critical gap.' },
            { status: 'max_iterations_reached', explanation: 'Cap hit.' },
            { status: 'needs_revision', explanation: 'Partial pass.' },
        ]) {
            expectRoundTrip(buildWrapUpVerdictGate(verdict), `wrap_up_verdict ${verdict.status}`);
        }
        expectRoundTrip(buildBatchReviewSynthesizedGate(2), 'wrap_up_verdict batch synthesized');
        covered.add('wrap_up_verdict');
        const alreadyConfirmed = buildWrapUpAlreadyConfirmedPayload({ confirmedAction: 'full' });
        const alreadyParsed = CompactGatePayloadSchema.safeParse(alreadyConfirmed);
        expect(alreadyParsed.success, 'wrap_up_already_confirmed').toBe(true);
        expect(alreadyConfirmed.askQuestion).toBeNull();
        covered.add('wrap_up_already_confirmed');
        expectRoundTrip(reviewModeGateFromStartMenu(), 'review_mode fresh-start');
        covered.add('review_mode');
        expectRoundTrip(buildBeadReviewGate(4), 'bead_review');
        covered.add('bead_review');
        expectRoundTrip(buildBeadLaunchGate({ qualityScore: 0.82, beadCount: 4, convergencePct: 91 }), 'bead_launch');
        covered.add('bead_launch');
        expectRoundTrip(buildBeadLowQualityGate({ qualityScore: 0.55, weakSummary: '3 beads below bar.' }), 'bead_low_quality');
        covered.add('bead_low_quality');
        expectRoundTrip(buildBeadHotspotGate('tb-1 ↔ tb-2 both touch mcp-server/src/server.ts'), 'bead_hotspot');
        covered.add('bead_hotspot');
        expectRoundTrip(buildBeadCoverageGate({
            covered: 2,
            total: 4,
            missingSections: ['Testing', 'Rollout'],
        }), 'bead_coverage');
        covered.add('bead_coverage');
        expectRoundTrip(buildBeadDedupGate(0), 'bead_dedup none');
        expectRoundTrip(buildBeadDedupGate(3), 'bead_dedup pairs');
        covered.add('bead_dedup');
        expect([...covered].sort()).toEqual([...FLYWHEEL_USER_GATE_KINDS].sort());
    });
});
//# sourceMappingURL=cursor-user-gates.compact-payload.test.js.map