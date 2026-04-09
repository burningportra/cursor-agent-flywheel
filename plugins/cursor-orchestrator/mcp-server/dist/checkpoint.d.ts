/**
 * Checkpoint persistence for crash recovery.
 *
 * Writes orchestrator state to `<cwd>/.pi-orchestrator/checkpoint.json`
 * using atomic write-rename semantics. All I/O is non-throwing —
 * failures degrade gracefully to current session-log-only behavior.
 */
import type { CheckpointEnvelope, OrchestratorState } from "./types.js";
export declare const CHECKPOINT_DIR = ".pi-orchestrator";
export declare const CHECKPOINT_FILE = "checkpoint.json";
export declare const CHECKPOINT_TMP = "checkpoint.json.tmp";
export declare const CHECKPOINT_CORRUPT = "checkpoint.json.corrupt";
/** Compute SHA-256 hash of JSON.stringify(state). */
export declare function computeStateHash(state: OrchestratorState): string;
export type ValidationResult = {
    valid: true;
} | {
    valid: false;
    reason: string;
};
/**
 * Validate a parsed checkpoint envelope against all integrity rules.
 * Pure function — no I/O.
 */
export declare function validateCheckpoint(envelope: unknown): ValidationResult;
/**
 * Atomically write a checkpoint to disk.
 * Uses write-to-tmp + rename for crash safety.
 * Returns true if write succeeded, false otherwise.
 * Never throws.
 */
export declare function writeCheckpoint(cwd: string, state: OrchestratorState, orchestratorVersion: string): boolean;
export interface ReadCheckpointResult {
    envelope: CheckpointEnvelope;
    warnings: string[];
}
/**
 * Read and validate a checkpoint from disk.
 * Returns the validated envelope with warnings, or null if:
 * - File doesn't exist
 * - File is corrupt (moved to .corrupt)
 * - Schema version is unknown
 * - Hash mismatch
 * Never throws.
 */
export declare function readCheckpoint(cwd: string): ReadCheckpointResult | null;
/**
 * Delete the checkpoint file. Idempotent — no error if file doesn't exist.
 * Never throws.
 */
export declare function clearCheckpoint(cwd: string): void;
/** Remove orphaned .tmp files left from crashes during write. */
export declare function cleanupOrphanedTmp(cwd: string): void;
//# sourceMappingURL=checkpoint.d.ts.map