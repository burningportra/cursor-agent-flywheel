/**
 * Cursor swarm coordination mode — single-branch + Agent Mail (hard prerequisite).
 */
import type { ExecFn } from './exec.js';
import type { Bead } from './types.js';
import type { FlywheelState } from './types.js';
export declare const AGENT_MAIL_SWARM_HINT = "Parallel Cursor swarm requires Agent Mail. Start with `am serve-http` or run `flywheel_remediate({ checkName: \"agent_mail_liveness\", mode: \"execute\", autoConfirm: true })`.";
export type CursorCoordinationModeResult = {
    ok: true;
    mode: 'single-branch';
} | {
    ok: false;
    blocked: true;
    reason: string;
    warning?: string;
};
/** Lightweight liveness probe — same endpoint as flywheel_observe. */
export declare function probeAgentMailReachable(exec: ExecFn, cwd?: string, signal?: AbortSignal): Promise<{
    reachable: boolean;
    warning?: string;
}>;
/**
 * Resolve Cursor implement coordination mode. Parallel swarm is blocked when
 * Agent Mail is unreachable — all agents share one branch with file reservations.
 */
export declare function resolveCursorCoordinationMode(exec: ExecFn, cwd: string, state: FlywheelState, options?: {
    signal?: AbortSignal;
}): Promise<CursorCoordinationModeResult>;
/** Advisory hotspot lines for a wave about to dispatch (contention ≥ 2). */
export declare function formatWaveHotspotWarnings(beads: Bead[]): string[];
//# sourceMappingURL=coordination-mode.d.ts.map