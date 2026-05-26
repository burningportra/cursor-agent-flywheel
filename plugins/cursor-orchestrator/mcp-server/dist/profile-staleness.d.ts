/**
 * Profile intent staleness — sha256 watch registry independent of git-HEAD cache.
 *
 * Detects drift when plan/rubric/config files change on the same commit so
 * coordinators can refresh `repoProfile` without waiting for a new git HEAD.
 */
import type { FlywheelConfigProfile } from './flywheel-config.js';
import type { FlywheelState } from './types.js';
export interface ProfileStalenessResult {
    stale: boolean;
    reason?: string;
}
/** Compute sha256 hex digest of file contents; null when missing or unreadable. */
export declare function hashFile(absPath: string): string | null;
/**
 * Normalize a repo-relative watch path (POSIX slashes, no `..`).
 * Returns null when the path is unsafe or cannot be expressed relative to cwd.
 */
export declare function normalizeWatchPath(pathInput: string, cwd: string): string | null;
/** Default intent files to watch for profile drift. */
export declare function resolveDefaultWatchPaths(state: FlywheelState, cwd: string): string[];
/**
 * Register baseline hashes for intent files.
 * `merge: true` (default) updates/adds paths; `merge: false` replaces the registry.
 */
export declare function registerProfileWatch(state: FlywheelState, cwd: string, paths: string[], opts?: {
    merge?: boolean;
}): FlywheelState;
/**
 * Compare on-disk hashes to the registered watch registry.
 * When `profileWatch` is absent or watching is disabled, returns not stale.
 */
export declare function checkProfileStaleness(cwd: string, state: FlywheelState, config?: FlywheelConfigProfile, opts?: {
    respectDebounce?: boolean;
}): ProfileStalenessResult;
/**
 * Read-only staleness probe for observe / doctor / impl_tick.
 * Runs a live hash check first, then falls back to persisted checkpoint flags.
 */
export declare function probeProfileStale(cwd: string, state: FlywheelState | undefined, config?: FlywheelConfigProfile): ProfileStalenessResult;
/** Apply staleness check results onto flywheel state (mutates flags only). */
export declare function applyProfileStalenessToState(state: FlywheelState, result: ProfileStalenessResult): FlywheelState;
/** Clear stale flags after a forced profile refresh. */
export declare function clearProfileStaleFlags(state: FlywheelState): FlywheelState;
/** Hint text for observe / impl_tick when profile intent files drift. */
export declare function profileStaleNextAction(config?: FlywheelConfigProfile): string;
/** Whether a debounced background refresh should run (auto_refresh mode only). */
export declare function shouldScheduleProfileAutoRefresh(state: FlywheelState, config?: FlywheelConfigProfile): boolean;
//# sourceMappingURL=profile-staleness.d.ts.map