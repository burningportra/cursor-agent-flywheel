/**
 * Combined fresh-eyes + thermo-nuclear review prompts for Cursor Task dispatch.
 */
export declare const THERMO_SUBAGENT_TYPE = "thermo-nuclear-code-quality-review";
export declare const AUTO_REVIEW_FINDING_LABEL = "auto-review-finding";
/** Condensed thermo-nuclear standards — prepended to every hit-me persona task. */
export declare const THERMO_PREAMBLE = "## Thermo-nuclear structural standards (all reviewers)\n\nApply these in addition to your persona lens:\n\n- Search for **code-judo** moves: restructure so branches, helpers, or layers disappear while behavior stays the same.\n- **Do not** let a diff push a file from under 1k lines to over 1k without strong justification \u2014 prefer decomposition.\n- Flag **spaghetti growth**: ad-hoc conditionals, scattered special cases, feature logic in shared paths.\n- Prefer direct, boring code over magic wrappers, thin pass-through helpers, and cast-heavy boundaries.\n- Reuse canonical helpers; push logic to the right layer.\n- Do not approve merely because behavior works \u2014 structural regressions are blockers.\n\n";
export interface CombinedReviewPromptOpts {
    round: number;
    memoryContext: string;
    allArtifacts: string[];
    callbackHint: string;
    regressionHint?: string;
    /** `<from-sha>..<to-sha>` echoed into structured findings JSON. */
    shaRange: string;
    beadId?: string;
}
/**
 * Cursor Task prompt for commit-batch and single-agent combined review.
 * Covers fresh-eyes correctness + full thermo-nuclear maintainability bar.
 */
export declare function buildCombinedReviewPrompt(opts: CombinedReviewPromptOpts): string;
export declare function reviewVerdictRel(beadId: string, round: number): string;
export declare function reviewVerdictPath(cwd: string, beadId: string, round: number): string;
/** Task body for the thermo-nuclear persona in the hit-me 5-agent swarm. */
export declare function buildThermoNuclearPersonaTask(opts: {
    modeNote: string;
    postCloseNote: string;
    beadId: string;
    round: number;
    fileList: string;
    cwd: string;
    shaRange: string;
    verdictRel: string;
}): string;
//# sourceMappingURL=combined-review-prompt.d.ts.map