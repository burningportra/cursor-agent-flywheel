/**
 * Self-Improvement Loop — Feedback & Prompt Tracking
 *
 * A. Post-orchestration feedback — structured survey saved after completion
 * B. Automatic CASS context injection — prepend relevant rules to prompts
 * C. Prompt effectiveness tracking — track which prompts produce real changes
 */
export interface OrchestrationFeedback {
    /** ISO timestamp. */
    timestamp: string;
    /** The orchestration goal. */
    goal: string;
    /** Total beads created. */
    beadCount: number;
    /** Beads completed successfully. */
    completedCount: number;
    /** Total iteration rounds (gates). */
    totalRounds: number;
    /** Plan quality score (if computed). */
    planQualityScore?: number;
    /** Foregone conclusion score (if computed). */
    foregoneScore?: number;
    /** Polish rounds before bead approval. */
    polishRounds: number;
    /** Whether convergence was reached. */
    converged: boolean;
    /** Phases that triggered regression. */
    regressions: string[];
    /** Space violations detected. */
    spaceViolationCount: number;
}
/**
 * Collect feedback from the current orchestration state.
 */
export declare function collectFeedback(state: import('./types.js').OrchestratorState): OrchestrationFeedback;
/**
 * Save feedback to the project-local feedback directory.
 */
export declare function saveFeedback(cwd: string, feedback: OrchestrationFeedback): string;
/**
 * Load all feedback files from the project.
 */
export declare function loadAllFeedback(cwd: string): OrchestrationFeedback[];
/**
 * Compute aggregate stats from all feedback.
 */
export interface FeedbackStats {
    totalOrchestrations: number;
    avgBeadCount: number;
    avgCompletionRate: number;
    avgPolishRounds: number;
    convergenceRate: number;
    avgPlanQuality: number | null;
    avgForegoneScore: number | null;
}
export declare function computeFeedbackStats(feedbacks: OrchestrationFeedback[]): FeedbackStats;
export declare function formatFeedbackStats(stats: FeedbackStats): string;
/** Prepend CASS context to a prompt if available. */
export declare function withCassContext(prompt: string, cwd: string, taskDescription?: string): string;
export interface PromptRecord {
    /** Prompt identifier (e.g., "beadRefinement", "blunderHunt"). */
    name: string;
    /** Number of times this prompt was used. */
    uses: number;
    /** Total changes produced across all uses. */
    changesProduced: number;
    /** Number of uses that produced at least 1 change. */
    effectiveUses: number;
}
/**
 * Track a prompt use and its outcome.
 */
export declare function trackPromptUse(name: string, changesProduced: number): void;
/**
 * Get all prompt tracking records for the current session.
 */
export declare function getPromptRecords(): PromptRecord[];
/**
 * Get the effectiveness rate for a specific prompt (0-1).
 */
export declare function getPromptEffectiveness(name: string): number | null;
/**
 * Format prompt effectiveness for display.
 */
export declare function formatPromptEffectiveness(): string;
/**
 * Reset tracking (for testing).
 */
export declare function resetPromptTracking(): void;
export interface ToolFeedback {
    toolName: string;
    sessionId?: string;
    timestamp: number;
    /** 1-5 rating */
    usability: number;
    /** 1-5 rating */
    ergonomics: number;
    /** What went well */
    strengths: string[];
    /** What was confusing or missing */
    weaknesses: string[];
    /** Specific suggestions */
    suggestions: string[];
}
/**
 * Prompt text for collecting structured tool feedback from an agent.
 * Paste this into the agent's context after it finishes using a tool.
 */
export declare function toolFeedbackPrompt(toolName: string): string;
export declare function parseToolFeedback(output: string, toolName: string): ToolFeedback | null;
/** Save tool feedback to .pi-orchestrator-feedback/tools/<toolName>.jsonl */
export declare function saveToolFeedback(cwd: string, feedback: ToolFeedback): void;
//# sourceMappingURL=feedback.d.ts.map