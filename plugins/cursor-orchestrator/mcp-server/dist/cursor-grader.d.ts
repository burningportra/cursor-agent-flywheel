/**
 * Cursor-native outcome grader — coordinator spawns a Task, then submits stdout.
 */
/** When true, flywheel_grade_outcome returns a Task spec instead of codex/claude CLI. */
export declare function useCursorGraderBackend(): boolean;
export declare function resolveCursorGraderModel(cwd: string): string;
export declare function buildCursorGraderCoordinatorPlaybook(model: string): string;
//# sourceMappingURL=cursor-grader.d.ts.map