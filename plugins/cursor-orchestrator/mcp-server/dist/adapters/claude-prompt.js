/**
 * Claude prompt adapter.
 *
 * Claude is the baseline — its prompt mirrors the existing Step 7
 * template in `skills/start/_implement.md` so behavior is unchanged for
 * Claude panes when model diversity is enabled. Kept as its own file so
 * the three providers expose a symmetric interface.
 */
function buildReservationStep(bead, mode) {
    const seedPaths = bead.relevantFiles.length > 0
        ? [
            'Reserve these paths first (exclusive=true):',
            ...bead.relevantFiles.map((f) => `  - ${f}`),
            'Also reserve any additional paths before you edit them.',
        ]
        : ['Reserve every file you plan to edit before touching it (exclusive=true).'];
    if (mode === 'single-branch') {
        return [
            '0b. file_reservation_paths (exclusive=true) — MANDATORY before any edit.',
            ...seedPaths,
            'Reservation conflict protocol (server may return BOTH granted and conflicts — treat any conflicts[] as failure):',
            '  1. Call file_reservation_paths with exclusive=true for your paths.',
            '  2. If conflicts[] is non-empty: wait 30s, retry up to 3×.',
            '  3. If still blocked: send_message to coordinator subject "[blocked] <bead-id> reservation conflict" and STOP — do not edit.',
            '  4. Never proceed when conflicts[] is populated even if granted[] is also populated.',
        ];
    }
    return [
        '0b. file_reservation_paths for every file you plan to edit. Retry 3x with 30s backoff.',
        ...seedPaths,
    ];
}
function buildGitWorkflowStep(bead, mode) {
    if (mode !== 'single-branch') {
        return [`- Commit referencing ${bead.beadId}.`];
    }
    return [
        'Single-branch git workflow (shared checkout — all parallel agents use the same branch):',
        '- Before editing: `git pull --rebase`',
        `- Commit only your bead changes: \`git add <your-files> && git commit -m "${bead.beadId}: <summary>"\``,
        '- Push immediately: `git push`',
        '- If pull, rebase, or push reports conflicts or non-fast-forward: STOP. Do not force-push or merge.',
        '- Report conflicts via send_message to coordinator so the flywheel can decide next steps.',
    ];
}
export function adaptPromptForClaude(bead, options) {
    const mode = options?.mode ?? 'worktree';
    const program = options?.program ?? 'claude-code';
    const model = options?.model ?? 'claude';
    const thinkingDirective = bead.complexity === 'complex'
        ? 'Think carefully and step-by-step before writing code; this bead is harder than it looks.'
        : "Respond quickly; don't overthink — this bead is well-scoped.";
    const completionLength = bead.complexity === 'simple'
        ? '≤5 bullets'
        : bead.complexity === 'medium'
            ? '≤10 bullets'
            : '≤20 bullets';
    const relevantFilesBlock = bead.relevantFiles.length > 0
        ? bead.relevantFiles.map((f) => `- ${f}`).join('\n')
        : '- (coordinator did not pre-resolve files — discover as needed; reserve before edit)';
    const priorArtBlock = bead.priorArtBeads.length > 0
        ? bead.priorArtBeads.map((b) => `- ${b}`).join('\n')
        : '- (none)';
    const acceptanceBlock = bead.acceptance.map((a) => `- ${a}`).join('\n');
    const reservationLines = buildReservationStep(bead, mode);
    const gitWorkflowLines = buildGitWorkflowStep(bead, mode);
    const syncBeforeWork = mode === 'single-branch'
        ? ['0f. `git pull --rebase` in the repo root before reading or editing files.']
        : [];
    const prompt = [
        '## STEP 0 — AGENT MAIL BOOTSTRAP (MANDATORY — DO THIS BEFORE ANYTHING ELSE)',
        'Do NOT read any files or run any commands until all sub-steps below are complete.',
        '',
        '0a. macro_start_session(',
        `      human_key='${bead.projectKey}',`,
        `      program='${program}',`,
        `      model='${model}',`,
        `      task_description='Implementing bead ${bead.beadId}: ${bead.title}',`,
        `      preferred_name='${bead.agentName}')`,
        ...reservationLines,
        `0c. send_message to '${bead.coordinatorName}' subject '[impl] ${bead.beadId} started'.`,
        '0d. Re-read AGENTS.md end-to-end.',
        '0e. Agent Mail runtime safety: use the Agent Mail MCP/HTTP tools only. Do NOT run `am doctor repair`, `am doctor archive-normalize`, or delete `.mailbox.activity.lock`; if Agent Mail looks busy/unhealthy, report it to the coordinator and ask them to run `flywheel_remediate({ checkName: "agent_mail_liveness", mode: "execute", autoConfirm: true })`.',
        ...syncBeforeWork,
        '',
        '## STEP 1 — IMPLEMENT',
        thinkingDirective,
        '',
        `Title: ${bead.title}`,
        'Description:',
        bead.description,
        `Complexity: ${bead.complexity}`,
        'Acceptance criteria:',
        acceptanceBlock,
        '',
        'Likely-relevant files:',
        relevantFilesBlock,
        '',
        'Prior art:',
        priorArtBlock,
        '',
        '## STEP 2 — VALIDATE (MANDATORY GATES — all must pass before STEP 3)',
        '- `npx tsc --noEmit` and `npm run build`.',
        '- `ubs <changed-files>` if installed.',
        '',
        '## STEP 3 — COMMIT & CLOSE',
        ...gitWorkflowLines,
        `- \`br update ${bead.beadId} --status closed\`; verify via \`br show ${bead.beadId} --json\`.`,
        '',
        '## STEP 4 — RELEASE + REPORT',
        '- release_file_reservations.',
        `- send_message to '${bead.coordinatorName}' subject '[impl] ${bead.beadId} done' (target ${completionLength}).`,
    ].join('\n');
    return {
        provider: 'claude',
        prompt,
        trailingNewlines: 1,
    };
}
//# sourceMappingURL=claude-prompt.js.map