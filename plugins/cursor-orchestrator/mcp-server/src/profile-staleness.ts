/**
 * Profile intent staleness — sha256 watch registry independent of git-HEAD cache.
 *
 * Detects drift when plan/rubric/config files change on the same commit so
 * coordinators can refresh `repoProfile` without waiting for a new git HEAD.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, posix } from 'node:path';
import { createLogger } from './logger.js';
import type { FlywheelConfigProfile } from './flywheel-config.js';
import type { FlywheelState, ProfileWatchEntry } from './types.js';
import { assertSafeRelativePath } from './utils/path-safety.js';

const log = createLogger('profile-staleness');

const MAX_WATCH_FILES = 100;

export interface ProfileStalenessResult {
  stale: boolean;
  reason?: string;
}

/** Compute sha256 hex digest of file contents; null when missing or unreadable. */
export function hashFile(absPath: string): string | null {
  try {
    const real = realpathSync(absPath);
    const buf = readFileSync(real);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Normalize a repo-relative watch path (POSIX slashes, no `..`).
 * Returns null when the path is unsafe or cannot be expressed relative to cwd.
 */
export function normalizeWatchPath(pathInput: string, cwd: string): string | null {
  if (!pathInput || typeof pathInput !== 'string') return null;
  const safe = assertSafeRelativePath(pathInput, {
    root: cwd,
    allowAbsoluteInsideRoot: true,
  });
  if (!safe.ok) return null;
  return safe.value.split(/[/\\]/).join(posix.sep);
}

/** Default intent files to watch for profile drift. */
export function resolveDefaultWatchPaths(state: FlywheelState, cwd: string): string[] {
  const candidates: string[] = [];
  if (state.planDocument) candidates.push(state.planDocument);
  if (state.outcomeRubricPath) candidates.push(state.outcomeRubricPath);
  candidates.push('AGENTS.md', 'README.md', 'flywheel.config.yaml');

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const norm = normalizeWatchPath(raw, cwd);
    if (!norm || seen.has(norm)) continue;
    const abs = join(cwd, norm);
    if (!existsSync(abs)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= MAX_WATCH_FILES) break;
  }
  return out;
}

function hashWatchEntry(cwd: string, relPath: string): ProfileWatchEntry | null {
  const norm = normalizeWatchPath(relPath, cwd);
  if (!norm) return null;
  const hash = hashFile(join(cwd, norm));
  if (hash === null) return null;
  return { path: norm, sha256: hash };
}

/**
 * Register baseline hashes for intent files.
 * `merge: true` (default) updates/adds paths; `merge: false` replaces the registry.
 */
export function registerProfileWatch(
  state: FlywheelState,
  cwd: string,
  paths: string[],
  opts?: { merge?: boolean },
): FlywheelState {
  const merge = opts?.merge !== false;
  const fileMap = new Map<string, ProfileWatchEntry>();

  if (merge && state.profileWatch?.files) {
    for (const entry of state.profileWatch.files) {
      fileMap.set(entry.path, entry);
    }
  }

  for (const raw of paths) {
    if (fileMap.size >= MAX_WATCH_FILES) {
      log.warn('profile watch file cap reached', { cap: MAX_WATCH_FILES });
      break;
    }
    const entry = hashWatchEntry(cwd, raw);
    if (entry) {
      fileMap.set(entry.path, entry);
    }
  }

  const files = [...fileMap.values()].slice(0, MAX_WATCH_FILES);
  if (files.length === 0) {
    return { ...state, profileWatch: undefined };
  }

  return {
    ...state,
    profileWatch: {
      registeredAt: new Date().toISOString(),
      files,
    },
  };
}

/**
 * Compare on-disk hashes to the registered watch registry.
 * When `profileWatch` is absent or watching is disabled, returns not stale.
 */
export function checkProfileStaleness(
  cwd: string,
  state: FlywheelState,
  config?: FlywheelConfigProfile,
  opts?: { respectDebounce?: boolean },
): ProfileStalenessResult {
  const watchEnabled = config?.watchIntentFiles !== false;
  if (!watchEnabled) return { stale: false };

  const files = state.profileWatch?.files;
  if (!files?.length) return { stale: false };

  if (opts?.respectDebounce && config?.debounceSeconds && state.lastProfileRefreshAt) {
    const debounceMs = config.debounceSeconds * 1000;
    const elapsed = Date.now() - Date.parse(state.lastProfileRefreshAt);
    if (!Number.isNaN(elapsed) && elapsed >= 0 && elapsed < debounceMs) {
      return state.profileStale
        ? { stale: true, reason: state.profileStaleReason }
        : { stale: false };
    }
  }

  for (const entry of files) {
    const hash = hashFile(join(cwd, entry.path));
    if (hash === null) {
      return { stale: true, reason: `missing: ${entry.path}` };
    }
    if (hash !== entry.sha256) {
      return { stale: true, reason: `drift: ${entry.path}` };
    }
  }

  return { stale: false };
}

/** Apply staleness check results onto flywheel state (mutates flags only). */
export function applyProfileStalenessToState(
  state: FlywheelState,
  result: ProfileStalenessResult,
): FlywheelState {
  if (result.stale) {
    return {
      ...state,
      profileStale: true,
      profileStaleReason: result.reason,
    };
  }
  if (state.profileWatch) {
    return {
      ...state,
      profileStale: false,
      profileStaleReason: undefined,
    };
  }
  return state;
}

/** Clear stale flags after a forced profile refresh. */
export function clearProfileStaleFlags(state: FlywheelState): FlywheelState {
  return {
    ...state,
    profileStale: false,
    profileStaleReason: undefined,
    lastProfileRefreshAt: new Date().toISOString(),
  };
}
