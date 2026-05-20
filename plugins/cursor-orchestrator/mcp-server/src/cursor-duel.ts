/**
 * Cursor-native dueling idea wizards — per-wizard Task models.
 *
 * Replaces NTM + external CLIs (claude/codex/gemini) unless FW_DUEL_BACKEND=ntm.
 * Override models via flywheel.config.yaml `duel:` or FW_DUEL_MODEL_* env vars.
 */

import { loadFlywheelConfigWithWarnings } from "./flywheel-config.js";

export type DuelMode =
  | "ideas"
  | "architecture"
  | "security"
  | "reliability"
  | "ux"
  | "performance";

export interface CursorDuelModels {
  wizard_a: string;
  wizard_b: string;
  wizard_c: string;
  synthesis: string;
}

export const DEFAULT_CURSOR_DUEL_MODELS: CursorDuelModels = {
  wizard_a: "opus-4.6",
  wizard_b: "gpt-5.5-xhigh",
  wizard_c: "composer-2.5",
  synthesis: "opus-4.6",
};

const ENV_BY_SLOT: Record<keyof CursorDuelModels, string> = {
  wizard_a: "FW_DUEL_MODEL_WIZARD_A",
  wizard_b: "FW_DUEL_MODEL_WIZARD_B",
  wizard_c: "FW_DUEL_MODEL_WIZARD_C",
  synthesis: "FW_DUEL_MODEL_SYNTHESIS",
};

export type DuelModelsConfirmInput =
  | "recommended"
  | "defaults"
  | { wizard_a: string; wizard_b: string; wizard_c?: string };

export interface DuelWizardAgent {
  slot: "wizard_a" | "wizard_b" | "wizard_c";
  name: string;
  model: string;
  spawnWith: "cursor-task";
  studyTask: string;
  ideateTask: string;
}

export interface DuelModelsGate {
  kind: "confirm_duel_models";
  defaults: CursorDuelModels;
  recommended: CursorDuelModels;
  rationale: string;
  configPath: string;
  options: Array<{ id: string; label: string; detail: string }>;
  instructions: string;
}

export interface CursorDuelRunPayload {
  kind: "cursor_duel_spawn";
  mode: DuelMode;
  spawnBackend: "cursor-task";
  focus: string;
  outputPath: string;
  top: number;
  duelModels: CursorDuelModels;
  wizards: DuelWizardAgent[];
  synthesisAgent: {
    name: string;
    model: string;
    spawnWith: "cursor-task";
    task: string;
  };
  instructions: string;
  coordinatorPlaybook: string;
}

/** NTM + external CLIs only when explicitly requested. */
export function useNtmDuelBackend(): boolean {
  return process.env.FW_DUEL_BACKEND === "ntm";
}

function envOverride(key: keyof CursorDuelModels): string | undefined {
  const v = process.env[ENV_BY_SLOT[key]]?.trim();
  return v || undefined;
}

function configOverride(cwd: string): Partial<CursorDuelModels> | undefined {
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  const d = config.duel;
  if (!d) return undefined;
  const out: Partial<CursorDuelModels> = {};
  if (d.wizard_a) out.wizard_a = d.wizard_a;
  if (d.wizard_b) out.wizard_b = d.wizard_b;
  if (d.wizard_c) out.wizard_c = d.wizard_c;
  if (d.synthesis) out.synthesis = d.synthesis;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function getCursorDuelModels(cwd: string): CursorDuelModels {
  const fromConfig = configOverride(cwd) ?? {};
  return {
    wizard_a:
      envOverride("wizard_a") ??
      fromConfig.wizard_a ??
      DEFAULT_CURSOR_DUEL_MODELS.wizard_a,
    wizard_b:
      envOverride("wizard_b") ??
      fromConfig.wizard_b ??
      DEFAULT_CURSOR_DUEL_MODELS.wizard_b,
    wizard_c:
      envOverride("wizard_c") ??
      fromConfig.wizard_c ??
      DEFAULT_CURSOR_DUEL_MODELS.wizard_c,
    synthesis:
      envOverride("synthesis") ??
      fromConfig.synthesis ??
      DEFAULT_CURSOR_DUEL_MODELS.synthesis,
  };
}

export function formatCursorDuelModelTable(models: CursorDuelModels): string {
  return [
    "| Role | Cursor Task `model` |",
    "|------|---------------------|",
    `| Wizard A | \`${models.wizard_a}\` |`,
    `| Wizard B | \`${models.wizard_b}\` |`,
    `| Wizard C | \`${models.wizard_c}\` |`,
    `| Synthesis | \`${models.synthesis}\` |`,
  ].join("\n");
}

export function recommendDuelModels(cwd: string): {
  models: CursorDuelModels;
  rationale: string;
} {
  const models = getCursorDuelModels(cwd);
  const distinct = new Set([models.wizard_a, models.wizard_b, models.wizard_c]);
  const rationale =
    distinct.size >= 3
      ? "Use three different Cursor models so generation and scoring stay decorrelated (config duel: defaults)."
      : distinct.size === 2
        ? "Two distinct wizards will duel; wizard_c matches another slot — only A+B Tasks will spawn."
        : "All three slots share one model — duel still runs but cross-model signal is weak; pick different slugs in option 3.";
  return { models, rationale };
}

export function resolveDuelModelsConfirm(
  cwd: string,
  input: DuelModelsConfirmInput,
): CursorDuelModels {
  if (input === "defaults" || input === "recommended") {
    return recommendDuelModels(cwd).models;
  }
  const synthesis = getCursorDuelModels(cwd).synthesis;
  return {
    wizard_a: input.wizard_a.trim(),
    wizard_b: input.wizard_b.trim(),
    wizard_c: (input.wizard_c?.trim() || getCursorDuelModels(cwd).wizard_c).trim(),
    synthesis,
  };
}

export function buildDuelModelsGate(cwd: string): DuelModelsGate {
  const defaults = getCursorDuelModels(cwd);
  const { models: recommended, rationale } = recommendDuelModels(cwd);
  const { source } = loadFlywheelConfigWithWarnings(cwd);
  return {
    kind: "confirm_duel_models",
    defaults,
    recommended,
    rationale,
    configPath: source,
    options: [
      {
        id: "1",
        label: "Accept recommendation",
        detail: `A=${recommended.wizard_a}, B=${recommended.wizard_b}, C=${recommended.wizard_c}`,
      },
      {
        id: "2",
        label: "Two-wizard duel (A + B only)",
        detail: `A=${recommended.wizard_a}, B=${recommended.wizard_b}`,
      },
      {
        id: "3",
        label: "Custom models",
        detail:
          'Reply: wizard_a=<slug> wizard_b=<slug> wizard_c=<slug> (optional third)',
      },
      {
        id: "4",
        label: "Use flywheel.config.yaml defaults only",
        detail: `A=${defaults.wizard_a}, B=${defaults.wizard_b}, C=${defaults.wizard_c}`,
      },
    ],
    instructions: [
      "Explain duelModelsGate.rationale, show formatCursorDuelModelTable(recommended), present numbered options, wait for reply.",
      'Then call flywheel_duel with confirmDuelModels: "recommended" (option 1), { wizard_a, wizard_b } for option 2 (omit wizard_c), custom object for option 3, or "defaults" for option 4.',
    ].join("\n"),
  };
}

function modeLabel(mode: DuelMode): string {
  switch (mode) {
    case "ideas":
      return "idea generation";
    case "architecture":
      return "architecture planning";
    case "security":
      return "security review";
    case "reliability":
      return "reliability review";
    case "ux":
      return "UX review";
    case "performance":
      return "performance review";
    default:
      return mode;
  }
}

function ideateDeliverable(mode: DuelMode, outputPath: string, wizardName: string): string {
  if (mode === "ideas") {
    return `Write your top ideas to \`docs/duels/WIZARD_${wizardName}.md\` (create docs/duels/ if needed).`;
  }
  if (mode === "architecture") {
    return `Write your independent plan draft to \`docs/duels/WIZARD_${wizardName}.md\` (create docs/duels/ if needed). The final synthesis will merge into \`${outputPath}\`.`;
  }
  return `Write findings to \`docs/duels/WIZARD_${wizardName}.md\`.`;
}

function buildWizardTasks(
  slot: "wizard_a" | "wizard_b" | "wizard_c",
  model: string,
  mode: DuelMode,
  focus: string,
  top: number,
  outputPath: string,
  profileSummary: string,
): DuelWizardAgent {
  const name = slot.replace("_", "-");
  const studyTask = `You are **${name}** in a Cursor-native dueling wizards run (${modeLabel(mode)}).

**Focus:** ${focus}
${profileSummary}

## Phase: STUDY (do this first)
1. Read README.md, AGENTS.md, and recent git history for this repo.
2. Write a short study note to \`docs/duels/STUDY_${name}.md\` (create docs/duels/ if needed).
3. Notify the coordinator via agent-mail: subject "[duel] ${name} study done", body = path only.

Do NOT read other wizards' files yet.`;

  const ideateTask = `You are **${name}** (model \`${model}\`) — ideation phase.

**Mode:** ${mode} | **Focus:** ${focus} | **Target count:** ~${top} top items after winnowing

## Phase: IDEATE
Work independently. ${ideateDeliverable(mode, outputPath, name)}

Include for each item: title, 2-3 sentence rationale, effort (S/M/L), risk (low/med/high).

Notify coordinator via agent-mail when done: subject "[duel] ${name} ideate done", body = file path only.`;

  return {
    slot,
    name,
    model,
    spawnWith: "cursor-task",
    studyTask,
    ideateTask,
  };
}

function activeWizards(models: CursorDuelModels): Array<{
  slot: "wizard_a" | "wizard_b" | "wizard_c";
  model: string;
}> {
  const out: Array<{ slot: "wizard_a" | "wizard_b" | "wizard_c"; model: string }> = [
    { slot: "wizard_a", model: models.wizard_a },
    { slot: "wizard_b", model: models.wizard_b },
  ];
  if (
    models.wizard_c &&
    models.wizard_c !== models.wizard_a &&
    models.wizard_c !== models.wizard_b
  ) {
    out.push({ slot: "wizard_c", model: models.wizard_c });
  }
  return out;
}

export function buildCursorDuelCoordinatorPlaybook(
  wizards: DuelWizardAgent[],
  outputPath: string,
  mode: DuelMode,
): string {
  const names = wizards.map((w) => w.name).join(", ");
  return [
    "## Coordinator playbook (cross-score + reveal + synthesis)",
    "",
    "After all wizards finish ideate:",
    "1. **Cross-score:** For each ordered pair (scorer → target), send the target's `WIZARD_*.md` to the scorer wizard via a follow-up Task or agent-mail. Scorer returns JSON lines: `{ \"target\": \"<name>\", \"itemIndex\": 1, \"score\": 0-1000, \"critique\": \"...\" }`.",
    "2. **Reveal:** Share score matrices with each wizard; collect concessions in `docs/duels/REVEAL_<name>.md`.",
    `3. **Synthesis:** Run the synthesis Task (see payload) to write the final report to \`${outputPath}\`.`,
    "4. **Chain:**",
    mode === "ideas"
      ? "   - Parse consensus/contested ideas → `flywheel_discover({ ideas: [...] })` with provenance.source=\"duel\"."
      : "   - Call `flywheel_plan({ mode: \"duel\", planFile: \"" +
        outputPath +
        "\" })` to register the plan.",
    "",
    `Active wizards: ${names}.`,
    "Never use NTM or external codex/gemini CLIs unless FW_DUEL_BACKEND=ntm.",
  ].join("\n");
}

export function buildCursorDuelRun(opts: {
  cwd: string;
  mode: DuelMode;
  focus: string;
  outputPath: string;
  top: number;
  models: CursorDuelModels;
  profileSummary?: string;
}): CursorDuelRunPayload {
  const { mode, focus, outputPath, top, models } = opts;
  const profileSummary = opts.profileSummary
    ? `\n**Repo:** ${opts.profileSummary}`
    : "";

  const wizards = activeWizards(models).map(({ slot, model }) =>
    buildWizardTasks(slot, model, mode, focus, top, outputPath, profileSummary),
  );

  const synthesisTask = `You are the duel synthesizer (Cursor Task).

Read all \`docs/duels/WIZARD_*.md\`, score matrices, and REVEAL_*.md files.
Write the final report to \`${outputPath}\` with sections:
- Consensus winners (with combined scores)
- Contested decisions (disagreement >300 pts)
- Dead ideas (footnote only)
- Adversarial review (strongest surviving critiques)

Mode: ${mode} | Focus: ${focus}`;

  const spawnLines = wizards.flatMap((w) => [
    `- **${w.name}** study: \`Task({ model: "${w.model}", subagent_type: "generalPurpose", run_in_background: true, description: "Duel ${w.name} study", prompt: <studyTask> })\``,
    `- **${w.name}** ideate: \`Task({ model: "${w.model}", ... prompt: <ideateTask> })\` (after study completes)`,
  ]);

  const instructions = [
    "## Cursor duel (MANDATORY)",
    "",
    "Dueling idea wizards via Cursor **Task** subagents — each wizard uses a **different** `model` slug.",
    "",
    formatCursorDuelModelTable(models),
    "",
    "### Spawn order",
    "1. Parallel **study** Tasks for all wizards.",
    "2. Parallel **ideate** Tasks (after study files exist).",
    "3. Coordinator runs cross-score + reveal (playbook below).",
    "4. **Synthesis** Task:",
    `   \`Task({ model: "${models.synthesis}", subagent_type: "generalPurpose", run_in_background: true, description: "Duel synthesis", prompt: <synthesisTask> })\``,
    "",
    ...spawnLines,
    "",
    "Each wizard: `macro_start_session` with `program: \"cursor\"` and its model slug.",
  ].join("\n");

  const coordinatorPlaybook = buildCursorDuelCoordinatorPlaybook(
    wizards,
    outputPath,
    mode,
  );

  return {
    kind: "cursor_duel_spawn",
    mode,
    spawnBackend: "cursor-task",
    focus,
    outputPath,
    top,
    duelModels: models,
    wizards,
    synthesisAgent: {
      name: "duel-synthesizer",
      model: models.synthesis,
      spawnWith: "cursor-task",
      task: synthesisTask,
    },
    instructions,
    coordinatorPlaybook,
  };
}

export function defaultTopForMode(mode: DuelMode): number {
  return mode === "ideas" ? 5 : 3;
}

export function defaultOutputPath(
  cwd: string,
  mode: DuelMode,
  slug: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  if (mode === "ideas") {
    return `docs/discovery/duel-${date}.md`;
  }
  if (mode === "architecture") {
    return `docs/plans/${date}-${slug}-duel.md`;
  }
  return `docs/duels/${date}-${mode}-${slug}.md`;
}
