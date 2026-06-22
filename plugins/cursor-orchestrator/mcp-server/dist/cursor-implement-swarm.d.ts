/**
 * Cursor implement-swarm model wiring — per-complexity Task subagent models.
 *
 * Defaults mirror deep-plan tiers mapped to bead complexity; override via
 * `flywheel.config.yaml` `implement:` or `FW_IMPL_MODEL_*` env vars.
 */
import { type ClaudePromptMode } from "./adapters/claude-prompt.js";
import type { BeadDispatchContext } from "./adapters/codex-prompt.js";
import { type BeadComplexity } from "./model-routing.js";
import type { Bead } from "./types.js";
export interface CursorImplModels {
    simple: string;
    medium: string;
    complex: string;
}
/** Default Cursor model slugs for implement waves (by bead complexity). */
export declare const DEFAULT_CURSOR_IMPL_MODELS: CursorImplModels;
/** When config leaves medium === simple, bump medium for meaningful tier separation. */
export declare const DEFAULT_MEDIUM_WHEN_COLLAPSED = "gpt-5.5-xhigh";
export declare function differentiatedImplModels(models: CursorImplModels): CursorImplModels;
export interface BeadComplexityPreview {
    beadId: string;
    title: string;
    complexity: BeadComplexity;
    reason: string;
    score: number;
    fileCount: number;
    acceptanceCount: number;
    recommendedModel: string;
}
export type ImplModelsConfirmInput = "defaults" | "recommended" | {
    uniform: string;
} | CursorImplModels;
export interface ImplModelsRecommendation {
    models: CursorImplModels;
    /** Plain-language explanation for the coordinator to show the user. */
    rationale: string;
    preview: {
        simple: number;
        medium: number;
        complex: number;
        total: number;
    };
    /** Per-bead complexity breakdown for the ready queue (sorted complex → simple). */
    beadClassifications: BeadComplexityPreview[];
}
export interface ImplModelsGate {
    kind: "confirm_impl_models";
    /** Config / env baseline (flywheel.config.yaml implement:). */
    defaults: CursorImplModels;
    /** Agent recommendation from ready-bead complexity (may differ from defaults). */
    recommended: CursorImplModels;
    rationale: string;
    preview: ImplModelsRecommendation["preview"];
    configPath: string;
    /** Numbered options for the coordinator to present (Cursor has no AskUserQuestion). */
    options: Array<{
        id: string;
        label: string;
        detail?: string;
    }>;
    instructions: string;
    /** Per-bead routing preview for the coordinator to sanity-check before confirm. */
    beadClassifications?: BeadComplexityPreview[];
}
/** Use NTM / cc-cod-gem lane prompts only when explicitly requested. */
export declare function useNtmImplBackend(): boolean;
/** Resolve implement models: defaults → flywheel.config.yaml → env → tier differentiation. */
export declare function getCursorImplModels(cwd: string): CursorImplModels;
export declare function classifyBeadsForSwarm(beads: Bead[], models: CursorImplModels): BeadComplexityPreview[];
export declare function formatBeadClassificationTable(rows: BeadComplexityPreview[], maxRows?: number): string;
export declare function modelForComplexity(models: CursorImplModels, complexity: BeadComplexity): string;
/**
 * Recommend implement models from ready-bead complexity (deterministic, no LLM).
 * Coordinator should explain `rationale` to the user before they pick an option.
 */
export declare function recommendImplModels(cwd: string, beads?: Bead[]): ImplModelsRecommendation;
export declare function resolveImplModelsConfirm(cwd: string, input: ImplModelsConfirmInput, beads?: Bead[]): CursorImplModels;
export declare function formatCursorImplModelTable(models: CursorImplModels): string;
export declare function buildImplModelsGate(cwd: string, beads?: Bead[]): ImplModelsGate;
export declare function buildBeadDispatchContext(bead: Bead, complexity: BeadComplexity, agentName: string, coordinatorName: string, projectKey: string): BeadDispatchContext;
export declare function buildCursorImplSpawnInstructions(models: CursorImplModels, cwd?: string, options?: {
    executionMode?: ClaudePromptMode;
    hotspotWarnings?: string[];
}): string;
/** Cursor implement prompt — Claude template with program=model fixes for Task spawns. */
export declare function adaptPromptForCursor(bead: BeadDispatchContext, taskModel: string, executionMode?: ClaudePromptMode): {
    prompt: string;
    model: string;
};
//# sourceMappingURL=cursor-implement-swarm.d.ts.map