/**
 * Minimal loader for `flywheel.config.yaml` at the repo root.
 *
 * Only the fields B-AC2 introduces are read here. We intentionally do NOT add a
 * YAML dependency — the file is expected to be hand-edited and small, and a
 * deliberately tiny parser keeps the install footprint flat (Phase 12 §12.5
 * "no optional deps" trap-avoidance bullet).
 *
 * Schema (v1):
 *
 *   convergence:
 *     gate_advance_wave: true   # default true
 *
 *   deep_plan:                # Cursor deep-plan Task model slugs (optional)
 *     correctness: opus-4.6
 *     ergonomics: composer-2.5
 *     robustness: gpt-5.5-xhigh
 *     synthesis: opus-4.6
 *
 *   implement:                # Cursor implement-wave Task models (optional)
 *     simple: composer-2.5
 *     medium: composer-2.5
 *     complex: opus-4.6
 *
 *   duel:                     # Cursor dueling-wizards Task models (optional)
 *     wizard_a: opus-4.6
 *     wizard_b: gpt-5.5-xhigh
 *     wizard_c: composer-2.5
 *     synthesis: opus-4.6
 *
 * R-008 (agent-ergonomics audit pass 4) — strict-key validation with
 * Levenshtein-1 typo suggestions. Currently warn-only (collect warnings
 * on the result; callers decide how to surface them). The deprecation
 * path is: v3.x warns, v4.0 fails. This is the warn-only stage.
 */
export interface FlywheelConfigConvergence {
    gate_advance_wave: boolean;
}
/** Per-perspective Cursor model slugs for deep-plan Task spawns. */
export interface FlywheelConfigDeepPlan {
    correctness?: string;
    ergonomics?: string;
    robustness?: string;
    synthesis?: string;
}
/** Per-complexity Cursor model slugs for implement-wave Task spawns. */
export interface FlywheelConfigImplement {
    simple?: string;
    medium?: string;
    complex?: string;
}
/** Per-wizard Cursor model slugs for dueling-idea-wizards Task spawns. */
export interface FlywheelConfigDuel {
    wizard_a?: string;
    wizard_b?: string;
    wizard_c?: string;
    synthesis?: string;
}
export interface FlywheelConfigGrader {
    model?: string;
}
export interface FlywheelConfigImplTick {
    interval_seconds?: number;
    review_model?: string;
    max_parallel_impl?: number;
    /** Commits since last batch-review baseline before fresh-eyes auto-trigger (0 = off). */
    commit_batch_threshold?: number;
}
export interface FlywheelConfigCoordinator {
    /** When false, skip server-side stale tick drop (default true). */
    epochGuards?: boolean;
    /** When false, omit template nextActionHint payloads (default true). */
    nextActionHints?: boolean;
}
export type FlywheelConfigProfileStaleAction = 'nudge' | 'auto_refresh';
export interface FlywheelConfigProfile {
    watchIntentFiles?: boolean;
    staleAction?: FlywheelConfigProfileStaleAction;
    debounceSeconds?: number;
}
export interface FlywheelConfig {
    convergence: FlywheelConfigConvergence;
    deep_plan?: FlywheelConfigDeepPlan;
    implement?: FlywheelConfigImplement;
    duel?: FlywheelConfigDuel;
    grader?: FlywheelConfigGrader;
    impl_tick?: FlywheelConfigImplTick;
    coordinator?: FlywheelConfigCoordinator;
    profile?: FlywheelConfigProfile;
}
/**
 * R-008 — single warning surfaced from the loader. Each reports a
 * structural problem in the YAML that did not block the load (the
 * fields we recognized still loaded with their defaults).
 */
export interface FlywheelConfigWarning {
    kind: 'unknown_key' | 'wrong_type' | 'unparseable_yaml';
    /** dotted path to the offending key, e.g. "convergence.gate_advance_wav" */
    path: string;
    message: string;
    /** present for unknown_key when a Levenshtein-1 match exists */
    suggestion?: string;
}
export interface FlywheelConfigResult {
    config: FlywheelConfig;
    warnings: FlywheelConfigWarning[];
    /** absolute path that was attempted (whether or not it existed) */
    source: string;
}
export declare const DEFAULT_CONFIG: FlywheelConfig;
/**
 * R-008 — return the closest known key within Levenshtein distance 1, or
 * undefined if nothing is close enough. Used to suggest "did you mean".
 */
export declare function suggestKey(unknown: string, known: readonly string[]): string | undefined;
/**
 * R-008 — full loader returning config + warnings + source. The
 * `loadFlywheelConfig` thin wrapper preserves the existing single-value
 * return type for callers that don't care about warnings.
 */
export declare function loadFlywheelConfigWithWarnings(cwd: string): FlywheelConfigResult;
export declare function loadFlywheelConfig(cwd: string): FlywheelConfig;
/** True when coordinator.epochGuards is absent or explicitly true (default on). */
export declare function areEpochGuardsEnabled(cwd: string): boolean;
/** True when coordinator.nextActionHints is absent or explicitly true (default on). */
export declare function areNextActionHintsEnabled(cwd: string): boolean;
//# sourceMappingURL=flywheel-config.d.ts.map