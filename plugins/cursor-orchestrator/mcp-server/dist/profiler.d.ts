import type { ExecFn } from "./exec.js";
import type { RepoProfile } from "./types.js";
/**
 * Collect raw repo signals using exec for shell commands.
 * Returns a RepoProfile with everything except LLM-generated fields.
 */
export declare function profileRepo(exec: ExecFn, cwd: string, signal?: AbortSignal): Promise<RepoProfile>;
/**
 * Format best-practices guides for injection into planning prompts.
 * Truncates to avoid overwhelming context windows.
 */
export declare function formatBestPracticesGuides(guides: Array<{
    name: string;
    content: string;
}>): string;
export declare function createEmptyRepoProfile(cwd: string): RepoProfile;
//# sourceMappingURL=profiler.d.ts.map