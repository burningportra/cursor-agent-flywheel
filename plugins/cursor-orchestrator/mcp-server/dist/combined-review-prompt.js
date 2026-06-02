/**
 * Combined fresh-eyes + thermo-nuclear review prompts for Cursor Task dispatch.
 */
import * as path from 'node:path';
export const THERMO_SUBAGENT_TYPE = 'thermo-nuclear-code-quality-review';
export const AUTO_REVIEW_FINDING_LABEL = 'auto-review-finding';
/** Condensed thermo-nuclear standards — prepended to every hit-me persona task. */
export const THERMO_PREAMBLE = `## Thermo-nuclear structural standards (all reviewers)

Apply these in addition to your persona lens:

- Search for **code-judo** moves: restructure so branches, helpers, or layers disappear while behavior stays the same.
- **Do not** let a diff push a file from under 1k lines to over 1k without strong justification — prefer decomposition.
- Flag **spaghetti growth**: ad-hoc conditionals, scattered special cases, feature logic in shared paths.
- Prefer direct, boring code over magic wrappers, thin pass-through helpers, and cast-heavy boundaries.
- Reuse canonical helpers; push logic to the right layer.
- Do not approve merely because behavior works — structural regressions are blockers.

`;
function buildStructuredFindingsBlock(shaRange) {
    return `\n\n## STRUCTURED FINDINGS REQUIRED

When you finish your combined review pass, write a JSON file (see callback hint) OR append at the end of your response fenced in \`\`\`json ... \`\`\`:

\`\`\`json
{
  "status": "pass" | "needs_attention" | "blocking",
  "findings": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "summary": "<one-line description>",
      "suggested_bead_title": "<verb-phrase title for the auto-synthesized bead>",
      "affected_files": ["<relative path>", "..."],
      "evidence_excerpt": "<2-10 lines of code or git log excerpt>"
    }
  ],
  "sha_range": "${shaRange}"
}
\`\`\`

- \`status = "pass"\` when the diff is clean on both correctness and structural quality.
- \`status = "needs_attention"\` when findings exist but none warrant an auto-bead.
- \`status = "blocking"\` when at least one finding is severe enough to auto-synthesize a bead.
- \`findings = []\` is mandatory for \`status = "pass"\`.
- Use \`blocking\` for structural regressions (1k-line sprawl, spaghetti branches, wrong-layer logic) **or** high/critical correctness issues.`;
}
/**
 * Cursor Task prompt for commit-batch and single-agent combined review.
 * Covers fresh-eyes correctness + full thermo-nuclear maintainability bar.
 */
export function buildCombinedReviewPrompt(opts) {
    const { round, memoryContext, allArtifacts, callbackHint, regressionHint = '', shaRange, beadId, } = opts;
    const filesBlock = allArtifacts.map((a) => `- ${a}`).join('\n');
    const beadLine = beadId ? `\n**Bead context:** ${beadId}\n` : '';
    return `## Combined Fresh-Eyes + Thermo-Nuclear Review — Round ${round}${memoryContext}${beadLine}

You are a **Cursor Task** reviewer (not NTM). Perform a deep audit of the changed code in sha range \`${shaRange}\`.

**Attach and follow:** \`/thermo-nuclear-code-quality-review\`

### Fresh-eyes lens (correctness)

For each changed file:

1. **Is it correct?** Does the implementation match intent?
2. **Edge cases?** Empty inputs, errors, concurrency, boundaries.
3. **Pattern search** — if you find a bug, look for the same pattern elsewhere.
4. **Security** — injection, authz, secrets, unsafe defaults.

### Thermo-nuclear lens (structure)

${THERMO_PREAMBLE}

**Changed files:**

${filesBlock || '(run git diff to enumerate)'}
${buildStructuredFindingsBlock(shaRange)}
${callbackHint}${regressionHint}

Use ultrathink. Do not rubber-stamp working code that leaves the codebase messier.`;
}
export function reviewVerdictRel(beadId, round) {
    return path.join('.pi-flywheel', 'review-verdicts', `${beadId}-r${round}.json`);
}
export function reviewVerdictPath(cwd, beadId, round) {
    return path.join(cwd, reviewVerdictRel(beadId, round));
}
/** Task body for the thermo-nuclear persona in the hit-me 5-agent swarm. */
export function buildThermoNuclearPersonaTask(opts) {
    const date = new Date().toISOString().slice(0, 10);
    return `${opts.modeNote}${opts.postCloseNote}**Primary structural reviewer (thermo-nuclear).**

**Attach and follow:** \`/thermo-nuclear-code-quality-review\`

**Bead:** ${opts.beadId}
**Files:** ${opts.fileList}
**cwd:** ${opts.cwd}
**sha_range for verdict JSON:** \`${opts.shaRange}\`

Your job: deep maintainability audit — code judo, 1k-line boundary, spaghetti, abstraction quality, layer boundaries.

1. Write human findings to \`docs/reviews/${opts.beadId}-thermo-${date}.md\`
2. Write the **canonical structured verdict** to \`${opts.verdictRel}\` (create parent dirs). This file drives auto-bead synthesis — use exact \`sha_range\` above.
3. Send **only the verdict file path** via Agent Mail to the coordinator — do not paste large bodies inline.

${buildStructuredFindingsBlock(opts.shaRange)}`;
}
//# sourceMappingURL=combined-review-prompt.js.map