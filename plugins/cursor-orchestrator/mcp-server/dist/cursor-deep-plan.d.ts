/**
 * Cursor deep-plan model wiring — per-perspective Task subagent models.
 *
 * Defaults match common Cursor model slugs; override via flywheel.config.yaml
 * `deep_plan:` or FW_DEEP_PLAN_MODEL_* env vars.
 */
export type DeepPlanPerspective = "correctness" | "ergonomics" | "robustness";
export interface CursorDeepPlanModels {
    correctness: string;
    ergonomics: string;
    robustness: string;
    synthesis: string;
}
/** Default Cursor model slugs for the planning trinity + synthesis. */
export declare const DEFAULT_CURSOR_DEEP_PLAN_MODELS: CursorDeepPlanModels;
export interface DeepPlanSpawnAgent {
    name: string;
    perspective: DeepPlanPerspective;
    /** Cursor Task `model` argument — must differ per planner for triangulation. */
    model: string;
    tier: "A" | "B" | "C";
    task: string;
    spawnWith: "cursor-task";
}
/** Use Claude Code / NTM deep-plan path only when explicitly requested. */
export declare function useClaudeDeepPlanBackend(): boolean;
/** Resolve deep-plan models: defaults → flywheel.config.yaml → env. */
export declare function getCursorDeepPlanModels(cwd: string): CursorDeepPlanModels;
export declare function formatCursorDeepPlanModelTable(models: CursorDeepPlanModels): string;
export declare function buildCursorDeepPlanInstructions(planAgents: DeepPlanSpawnAgent[], synthesisModel: string, planSlug: string): string;
export declare function buildCursorDeepPlanAgents(basePrompt: string, models: CursorDeepPlanModels): DeepPlanSpawnAgent[];
//# sourceMappingURL=cursor-deep-plan.d.ts.map