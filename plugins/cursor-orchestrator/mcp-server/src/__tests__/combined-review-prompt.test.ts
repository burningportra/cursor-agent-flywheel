import { describe, expect, it } from 'vitest';

import {
  AUTO_REVIEW_FINDING_LABEL,
  buildCombinedReviewPrompt,
  buildThermoNuclearPersonaTask,
  reviewVerdictRel,
  THERMO_PREAMBLE,
  THERMO_SUBAGENT_TYPE,
} from '../combined-review-prompt.js';

describe('combined-review-prompt', () => {
  it('buildCombinedReviewPrompt merges fresh-eyes, thermo rubric, and JSON contract', () => {
    const prompt = buildCombinedReviewPrompt({
      round: 1,
      memoryContext: '\n\n## Prior Session Learnings\nnone\n',
      allArtifacts: ['src/foo.ts', 'src/bar.ts'],
      callbackHint: '\n\nWrite verdict to `.pi-flywheel/batch-reviews/abc..def.json`.',
      shaRange: 'abc123..def456',
      beadId: 'tb-1',
    });

    expect(prompt).toContain('Combined Fresh-Eyes + Thermo-Nuclear Review');
    expect(prompt).toContain('/thermo-nuclear-code-quality-review');
    expect(prompt).toContain('Fresh-eyes lens (correctness)');
    expect(prompt).toContain(THERMO_PREAMBLE.trim().slice(0, 40));
    expect(prompt).toContain('STRUCTURED FINDINGS REQUIRED');
    expect(prompt).toContain('"status": "pass" | "needs_attention" | "blocking"');
    expect(prompt).toContain('abc123..def456');
    expect(prompt).toContain('src/foo.ts');
    expect(prompt).toContain('**Bead context:** tb-1');
  });

  it('exports thermo subagent type and auto-review label constants', () => {
    expect(THERMO_SUBAGENT_TYPE).toBe('thermo-nuclear-code-quality-review');
    expect(AUTO_REVIEW_FINDING_LABEL).toBe('auto-review-finding');
  });

  it('reviewVerdictRel uses neutral per-bead path', () => {
    expect(reviewVerdictRel('bead-x', 2)).toBe('.pi-flywheel/review-verdicts/bead-x-r2.json');
  });

  it('buildThermoNuclearPersonaTask references skill and verdict path', () => {
    const task = buildThermoNuclearPersonaTask({
      modeNote: '',
      postCloseNote: '',
      beadId: 'tb-9',
      round: 0,
      fileList: 'src/a.ts',
      cwd: '/repo',
      shaRange: '0000000..deadbeef',
      verdictRel: '.pi-flywheel/review-verdicts/tb-9-r0.json',
    });

    expect(task).toContain('/thermo-nuclear-code-quality-review');
    expect(task).toContain('.pi-flywheel/review-verdicts/tb-9-r0.json');
    expect(task).toContain('0000000..deadbeef');
    expect(task).toContain('docs/reviews/tb-9-thermo-');
  });
});
