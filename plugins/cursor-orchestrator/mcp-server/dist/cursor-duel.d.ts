/**
 * Cursor-native dueling idea wizards — per-wizard Task models.
 *
 * Replaces NTM + external CLIs (claude/codex/gemini) unless FW_DUEL_BACKEND=ntm.
 * Override models via flywheel.config.yaml `duel:` or FW_DUEL_MODEL_* env vars.
 */
export type DuelMode = "ideas" | "architecture" | "security" | "reliability" | "ux" | "performance";
export interface CursorDuelModels {
    wizard_a: string;
    wizard_b: string;
    wizard_c: string;
    synthesis: string;
}
export declare const DEFAULT_CURSOR_DUEL_MODELS: CursorDuelModels;
export type DuelModelsConfirmInput = "recommended" | "defaults" | {
    wizard_a: string;
    wizard_b: string;
    wizard_c?: string;
};
export interface DuelWizardAgent {
    slot: "wizard_a" | "wizard_b" | "wizard_c";
    name: string;
    model: string;
    spawnWith: "cursor-task";
    studyTask: string;
    ideateTask: string;
}
export interface DuelModelsGate {
    kind: "confirm_duel_models";
    defaults: CursorDuelModels;
    recommended: CursorDuelModels;
    rationale: string;
    configPath: string;
    options: Array<{
        id: string;
        label: string;
        detail: string;
    }>;
    instructions: string;
}
export interface CursorDuelRunPayload {
    kind: "cursor_duel_spawn";
    mode: DuelMode;
    spawnBackend: "cursor-task";
    focus: string;
    outputPath: string;
    top: number;
    duelModels: CursorDuelModels;
    wizards: DuelWizardAgent[];
    synthesisAgent: {
        name: string;
        model: string;
        spawnWith: "cursor-task";
        task: string;
    };
    instructions: string;
    coordinatorPlaybook: string;
}
/** NTM + external CLIs only when explicitly requested. */
export declare function useNtmDuelBackend(): boolean;
export declare function getCursorDuelModels(cwd: string): CursorDuelModels;
export declare function formatCursorDuelModelTable(models: CursorDuelModels): string;
export declare function recommendDuelModels(cwd: string): {
    models: CursorDuelModels;
    rationale: string;
};
export declare function resolveDuelModelsConfirm(cwd: string, input: DuelModelsConfirmInput): CursorDuelModels;
export declare function buildDuelModelsGate(cwd: string): DuelModelsGate;
export declare function buildCursorDuelCoordinatorPlaybook(wizards: DuelWizardAgent[], outputPath: string, mode: DuelMode): string;
export declare function buildCursorDuelRun(opts: {
    cwd: string;
    mode: DuelMode;
    focus: string;
    outputPath: string;
    top: number;
    models: CursorDuelModels;
    profileSummary?: string;
}): CursorDuelRunPayload;
export declare function defaultTopForMode(mode: DuelMode): number;
export declare function defaultOutputPath(cwd: string, mode: DuelMode, slug: string): string;
//# sourceMappingURL=cursor-duel.d.ts.map