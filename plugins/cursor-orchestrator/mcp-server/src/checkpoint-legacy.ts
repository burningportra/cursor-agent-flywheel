/**
 * One-release compat: read checkpoints from legacy `.pi-orchestrator/` (Cursor port v2.x).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
export const LEGACY_CHECKPOINT_DIR = ".pi-orchestrator";
const CHECKPOINT_DIR = ".pi-flywheel";
const CHECKPOINT_FILE = "checkpoint.json";

export function legacyCheckpointPath(cwd: string): string {
  return join(cwd, LEGACY_CHECKPOINT_DIR, CHECKPOINT_FILE);
}

/** If only legacy checkpoint exists, copy it into `.pi-flywheel/` (non-destructive on legacy file). */
export function migrateLegacyCheckpointIfNeeded(cwd: string): boolean {
  const target = join(cwd, CHECKPOINT_DIR, CHECKPOINT_FILE);
  if (existsSync(target)) return false;
  const legacy = legacyCheckpointPath(cwd);
  if (!existsSync(legacy)) return false;
  try {
    mkdirSync(join(cwd, CHECKPOINT_DIR), { recursive: true });
    copyFileSync(legacy, target);
    return true;
  } catch {
    return false;
  }
}

export function readLegacyCheckpointRaw(cwd: string): string | null {
  const legacy = legacyCheckpointPath(cwd);
  if (!existsSync(legacy)) return null;
  try {
    return readFileSync(legacy, "utf8");
  } catch {
    return null;
  }
}
