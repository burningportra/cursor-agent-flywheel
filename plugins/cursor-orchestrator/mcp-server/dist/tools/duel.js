import { buildCursorDuelRun, buildDuelModelsGate, defaultOutputPath, defaultTopForMode, formatCursorDuelModelTable, recommendDuelModels, resolveDuelModelsConfirm, useNtmDuelBackend, } from '../cursor-duel.js';
import { slugifyGoal } from './shared.js';
import { makeOkToolResult, makeToolError } from './shared.js';
const VALID_MODES = [
    'ideas',
    'architecture',
    'security',
    'reliability',
    'ux',
    'performance',
];
export async function runDuel(ctx, args) {
    const { cwd, state, saveState } = ctx;
    const mode = args.mode && VALID_MODES.includes(args.mode)
        ? args.mode
        : 'ideas';
    const focus = args.focus?.trim() ||
        state.selectedGoal?.trim() ||
        'Improve this codebase — discover high-impact directions.';
    const slug = slugifyGoal(focus);
    const outputPath = args.output?.trim() || defaultOutputPath(cwd, mode, slug);
    const top = args.top ?? defaultTopForMode(mode);
    if (useNtmDuelBackend()) {
        const duelCommand = `/dueling-idea-wizards --mode=${mode} --top=${top} --rounds=1 --focus="${focus.replace(/"/g, '\\"')}" --output=${outputPath}`;
        return makeOkToolResult('flywheel_duel', state.phase, [
            'FW_DUEL_BACKEND=ntm — use NTM + external CLIs per skills/flywheel-duel (legacy path).',
            '',
            `Invoke: \`${duelCommand}\``,
        ].join('\n'), {
            confirmed: false,
            ntmFallback: {
                duelCommand,
                reason: 'FW_DUEL_BACKEND=ntm',
            },
        });
    }
    const profile = state.repoProfile;
    const profileSummary = profile
        ? `${profile.name} | ${profile.languages.join(', ')}`
        : undefined;
    if (args.confirmDuelModels === undefined &&
        !state.duelModelsConfirmed &&
        !args.skipDuelModelsGate) {
        const gate = buildDuelModelsGate(cwd);
        const outcome = {
            duelModelsGate: gate,
            confirmed: false,
            ...(state.duelModelsConfirmed && state.duelModels
                ? { duelModels: state.duelModels, confirmed: true }
                : {}),
        };
        const lines = [
            'Cursor-native duel: recommend models, explain why, then let the user choose.',
            '',
            `**Recommendation:** ${gate.rationale}`,
            '',
            formatCursorDuelModelTable(gate.recommended),
            '',
            'Present duelModelsGate.options as numbered choices; wait for the user reply.',
            'Then call flywheel_duel with confirmDuelModels ("recommended" if they accept option 1).',
        ];
        return makeOkToolResult('flywheel_duel', state.phase, lines.join('\n'), outcome);
    }
    let models;
    try {
        if (args.confirmDuelModels !== undefined) {
            models = resolveDuelModelsConfirm(cwd, args.confirmDuelModels);
        }
        else if (state.duelModels) {
            models = state.duelModels;
        }
        else {
            models = recommendDuelModels(cwd).models;
        }
    }
    catch (err) {
        return makeToolError('flywheel_duel', state.phase, 'invalid_input', err instanceof Error ? err.message : String(err));
    }
    if (!models.wizard_a?.trim() || !models.wizard_b?.trim()) {
        return makeToolError('flywheel_duel', state.phase, 'invalid_input', 'wizard_a and wizard_b must be non-empty Cursor model slugs.');
    }
    if (args.confirmDuelModels !== undefined) {
        state.duelModels = models;
        state.duelModelsConfirmed = true;
        saveState(state);
    }
    const cursorDuel = buildCursorDuelRun({
        cwd,
        mode,
        focus,
        outputPath,
        top,
        models,
        profileSummary,
    });
    const outcome = {
        confirmed: Boolean(state.duelModelsConfirmed || args.confirmDuelModels),
        duelModels: models,
        cursorDuel,
    };
    const text = [
        '## Cursor-native dueling idea wizards',
        '',
        `**Mode:** ${mode} | **Focus:** ${focus} | **Output:** \`${outputPath}\``,
        '',
        cursorDuel.instructions,
        '',
        '---',
        '',
        cursorDuel.coordinatorPlaybook,
    ].join('\n');
    return makeOkToolResult('flywheel_duel', state.phase, text, outcome);
}
//# sourceMappingURL=duel.js.map