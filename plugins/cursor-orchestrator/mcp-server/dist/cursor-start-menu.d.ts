/**
 * Step 0d start menus — AskQuestion payloads + route hints for Cursor.
 */
import { type CursorAskQuestionPayload } from "./cursor-user-gates.js";
import type { ActionKey } from "./types.js";
export type StartMenuVariant = "previous-session-exists" | "open-beads-exist" | "fresh-start";
export interface StartMenuOption {
    id: string;
    label: string;
    description?: string;
    route: string;
    action: ActionKey;
    recommended?: boolean;
}
export interface StartMenuResult {
    variant: StartMenuVariant;
    askQuestion: CursorAskQuestionPayload;
    options: StartMenuOption[];
    routeHints: Record<string, string>;
    recentPlanPaths: string[];
    primaryEntryPointsMarkdown: string;
}
/** Shared Step 0d entry — routes to recover-gates wave review (combined fresh-eyes + thermo-nuclear). */
export declare const FRESH_EYES_REVIEW_OPTION: StartMenuOption;
/** Shared Step 0d entry — external repo research via /flywheel-research. */
export declare const RESEARCH_REPO_OPTION: StartMenuOption;
export declare function buildStartMenu(input: {
    variant: StartMenuVariant;
    recentPlanPaths?: string[];
    isFirstRun?: boolean;
    goal?: string;
    phase?: string;
    openBeadCount?: number;
}): StartMenuResult;
/** Infer menu variant from observe-shaped hints (caller passes structured fields). */
export declare function inferStartMenuVariant(input: {
    hasCheckpoint: boolean;
    checkpointPhase?: string;
    openBeadCount: number;
}): StartMenuVariant;
//# sourceMappingURL=cursor-start-menu.d.ts.map