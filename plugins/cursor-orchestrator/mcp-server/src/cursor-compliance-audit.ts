/**
 * Cursor-native compliance audit — defer to Task instead of claude CLI spawn.
 */

import { loadFlywheelConfigWithWarnings } from './flywheel-config.js';

const DEFAULT_COMPLIANCE_MODEL = 'opus-4.6';

/** When true, flywheel_compliance_audit returns a Task spec instead of spawning claude. */
export function useCursorComplianceBackend(): boolean {
  const b = process.env.FW_COMPLIANCE_BACKEND?.trim().toLowerCase();
  if (b === 'claude' || b === 'claude-cli') return false;
  return true;
}

export function resolveCursorComplianceModel(cwd: string): string {
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  const fromConfig = (config as { compliance?: { model?: string } }).compliance?.model?.trim();
  if (fromConfig) return fromConfig;
  const fromEnv = process.env.FW_COMPLIANCE_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_COMPLIANCE_MODEL;
}

export function buildComplianceAuditSkillPrompt(args: {
  beadIds: string[];
  threshold: number;
  parallelism: number;
}): string {
  return [
    '/beads-compliance-and-completion-verification',
    '--mode',
    'flywheel-gate',
    '--beads',
    args.beadIds.join(','),
    '--threshold',
    String(args.threshold),
    '--parallelism',
    String(args.parallelism),
  ].join(' ');
}

export function buildComplianceCoordinatorPlaybook(model: string): string {
  return [
    '## Cursor compliance audit (beads-compliance-and-completion-verification)',
    '',
    '1. Call `flywheel_compliance_audit({ cwd, beadIds })` **without** `afterTask` first.',
    '2. If `kind === "compliance_audit_deferred"`, spawn **one** Task:',
    '   ```',
    '   Task({',
    `     model: "${model}",`,
    '     subagent_type: "generalPurpose",',
    '     description: "Beads compliance audit",',
    '     prompt: <data.complianceTask.prompt>',
    '   })',
    '   ```',
    '3. When the Task finishes (pass dir written under beads_compliance_audit/passes/), re-call:',
    '   `flywheel_compliance_audit({ cwd, beadIds, afterTask: true })`',
    '',
    'Do not run `claude -p` for compliance audit in the Cursor port.',
  ].join('\n');
}

/** Parse FW_COMPLIANCE_OVERRIDE / skipEnv — full skip or per-bead list. */
export function parseComplianceOverride(raw: string): { skipAll: boolean; beadIds: Set<string> } {
  const trimmed = raw.trim();
  if (!trimmed) return { skipAll: false, beadIds: new Set() };
  if (trimmed === '1' || trimmed.toLowerCase() === 'true') {
    return { skipAll: true, beadIds: new Set() };
  }
  const ids = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  return { skipAll: false, beadIds: new Set(ids) };
}
