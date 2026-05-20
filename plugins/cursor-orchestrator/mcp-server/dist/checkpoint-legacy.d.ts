export declare const LEGACY_CHECKPOINT_DIR = ".pi-orchestrator";
export declare function legacyCheckpointPath(cwd: string): string;
/** If only legacy checkpoint exists, copy it into `.pi-flywheel/` (non-destructive on legacy file). */
export declare function migrateLegacyCheckpointIfNeeded(cwd: string): boolean;
export declare function readLegacyCheckpointRaw(cwd: string): string | null;
//# sourceMappingURL=checkpoint-legacy.d.ts.map