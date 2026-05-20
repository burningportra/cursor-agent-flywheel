import type { ConfirmImplModelsArgs, McpToolResult, ToolContext } from '../types.js';
import { readyBeads } from '../beads.js';
import {
  buildCursorImplSpawnInstructions,
  buildImplModelsGate,
  formatCursorImplModelTable,
  resolveImplModelsConfirm,
} from '../cursor-implement-swarm.js';
import { makeOkToolResult, makeToolError } from './shared.js';

export interface ConfirmImplModelsOutcome {
  implModels?: { simple: string; medium: string; complex: string };
  implModelsGate?: ReturnType<typeof buildImplModelsGate>;
  spawnInstructions?: string;
  confirmed: boolean;
}

export async function runConfirmImplModels(
  ctx: ToolContext,
  args: ConfirmImplModelsArgs,
): Promise<McpToolResult> {
  const { cwd, state, saveState, exec } = ctx;

  let readyForRecommend = [] as Awaited<ReturnType<typeof readyBeads>>;
  try {
    readyForRecommend = await readyBeads(exec, cwd);
  } catch {
    /* recommendation falls back to config-only when br unavailable */
  }

  if (args.confirmImplModels === undefined) {
    const gate = buildImplModelsGate(cwd, readyForRecommend);
    const outcome: ConfirmImplModelsOutcome = {
      implModelsGate: gate,
      confirmed: Boolean(state.implModelsConfirmed),
      ...(state.implModelsConfirmed && state.implModels
        ? {
            implModels: state.implModels,
            spawnInstructions: buildCursorImplSpawnInstructions(state.implModels),
          }
        : {}),
    };
    const lines = [
      state.implModelsConfirmed
        ? 'Implement models already confirmed for this run.'
        : 'Recommend implement models, explain why, then let the user choose.',
      '',
      `**Recommendation:** ${gate.rationale}`,
      '',
      formatCursorImplModelTable(gate.recommended),
      '',
      'Present implModelsGate.options as numbered choices; wait for the user reply.',
      'Then call flywheel_confirm_impl_models with confirmImplModels set ("recommended" if they accept option 1).',
    ];
    return makeOkToolResult('flywheel_confirm_impl_models', state.phase, lines.join('\n'), outcome);
  }

  let resolved;
  try {
    resolved = resolveImplModelsConfirm(
      cwd,
      args.confirmImplModels,
      readyForRecommend,
    );
  } catch (err: unknown) {
    return makeToolError(
      'flywheel_confirm_impl_models',
      state.phase,
      'invalid_input',
      err instanceof Error ? err.message : String(err),
    );
  }

  if (!resolved.simple || !resolved.medium || !resolved.complex) {
    return makeToolError(
      'flywheel_confirm_impl_models',
      state.phase,
      'invalid_input',
      'Each of simple, medium, and complex must be a non-empty model slug.',
    );
  }

  state.implModels = resolved;
  state.implModelsConfirmed = true;
  saveState(state);

  const outcome: ConfirmImplModelsOutcome = {
    implModels: resolved,
    spawnInstructions: buildCursorImplSpawnInstructions(resolved),
    confirmed: true,
  };

  return makeOkToolResult(
    'flywheel_confirm_impl_models',
    state.phase,
    [
      'Implement models confirmed.',
      '',
      formatCursorImplModelTable(resolved),
      '',
      'Spawn parallel Cursor Task agents using spawnInstructions; each Task must set `model` per bead complexity.',
    ].join('\n'),
    outcome,
  );
}
