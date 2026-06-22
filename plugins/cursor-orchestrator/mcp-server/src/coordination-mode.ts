/**
 * Cursor swarm coordination mode — single-branch + Agent Mail (hard prerequisite).
 */

import type { ExecFn } from './exec.js';
import type { Bead } from './types.js';
import type { FlywheelState } from './types.js';
import { computeHotspotMatrix } from './plan-simulation.js';
import { beadsToHotspotInput } from './tools/approve.js';

export const AGENT_MAIL_SWARM_HINT =
  'Parallel Cursor swarm requires Agent Mail. Start with `am serve-http` or run `flywheel_remediate({ checkName: "agent_mail_liveness", mode: "execute", autoConfirm: true })`.';

export type CursorCoordinationModeResult =
  | { ok: true; mode: 'single-branch' }
  | { ok: false; blocked: true; reason: string; warning?: string };

/** Lightweight liveness probe — same endpoint as flywheel_observe. */
export async function probeAgentMailReachable(
  exec: ExecFn,
  cwd?: string,
  signal?: AbortSignal,
): Promise<{ reachable: boolean; warning?: string }> {
  try {
    const result = await exec(
      'curl',
      [
        '-s',
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        '--max-time',
        '1',
        'http://127.0.0.1:8765/health/liveness',
      ],
      { timeout: 3000, cwd, signal },
    );
    if (result.code !== 0) {
      return { reachable: false, warning: `curl exited ${result.code}` };
    }
    const status = result.stdout.trim();
    if (status !== '200') {
      return { reachable: false, warning: `liveness HTTP ${status}` };
    }
    return { reachable: true };
  } catch (err: unknown) {
    return {
      reachable: false,
      warning: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve Cursor implement coordination mode. Parallel swarm is blocked when
 * Agent Mail is unreachable — all agents share one branch with file reservations.
 */
export async function resolveCursorCoordinationMode(
  exec: ExecFn,
  cwd: string,
  state: FlywheelState,
  options?: { signal?: AbortSignal },
): Promise<CursorCoordinationModeResult> {
  const probe = await probeAgentMailReachable(exec, cwd, options?.signal);
  if (!probe.reachable) {
    return {
      ok: false,
      blocked: true,
      reason:
        'Agent Mail is required for parallel Cursor swarm (single-branch coordination).',
      warning: probe.warning,
    };
  }
  state.coordinationMode = 'single-branch';
  return { ok: true, mode: 'single-branch' };
}

/** Advisory hotspot lines for a wave about to dispatch (contention ≥ 2). */
export function formatWaveHotspotWarnings(beads: Bead[]): string[] {
  if (beads.length < 2) return [];
  const matrix = computeHotspotMatrix(beadsToHotspotInput(beads));
  const hot = matrix.rows.filter((r) => r.contentionCount >= 2);
  if (hot.length === 0) return [];
  const lines = hot.slice(0, 5).map(
    (r) =>
      `Hotspot: \`${r.file}\` — beads ${r.beadIds.join(', ')} may contend; agents must acquire exclusive reservations before editing.`,
  );
  if (hot.length > 5) {
    lines.push(`…and ${hot.length - 5} more shared paths (see hotspot matrix at bead approval).`);
  }
  lines.push(
    'Coordinator: monitor Agent Mail inbox; nudge serially if reservation conflicts persist.',
  );
  return lines;
}
