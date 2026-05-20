/**
 * Cursor implement-swarm model wiring — per-complexity Task subagent models.
 *
 * Defaults mirror deep-plan tiers mapped to bead complexity; override via
 * `flywheel.config.yaml` `implement:` or `FW_IMPL_MODEL_*` env vars.
 */

import { adaptPromptForClaude } from "./adapters/claude-prompt.js";
import type { BeadDispatchContext } from "./adapters/codex-prompt.js";
import { CURSOR_AGENT_MAIL_PROGRAM } from "./cursor-adapters.js";
import { classifyBeadComplexity, type BeadComplexity } from "./model-routing.js";
import type { Bead } from "./types.js";
import { loadFlywheelConfigWithWarnings } from "./flywheel-config.js";

export interface CursorImplModels {
  simple: string;
  medium: string;
  complex: string;
}

/** Default Cursor model slugs for implement waves (by bead complexity). */
export const DEFAULT_CURSOR_IMPL_MODELS: CursorImplModels = {
  simple: "composer-2.5",
  medium: "composer-2.5",
  complex: "opus-4.6",
};

const ENV_BY_COMPLEXITY: Record<keyof CursorImplModels, string> = {
  simple: "FW_IMPL_MODEL_SIMPLE",
  medium: "FW_IMPL_MODEL_MEDIUM",
  complex: "FW_IMPL_MODEL_COMPLEX",
};

export type ImplModelsConfirmInput =
  | "defaults"
  | "recommended"
  | { uniform: string }
  | CursorImplModels;

export interface ImplModelsRecommendation {
  models: CursorImplModels;
  /** Plain-language explanation for the coordinator to show the user. */
  rationale: string;
  preview: {
    simple: number;
    medium: number;
    complex: number;
    total: number;
  };
}

export interface ImplModelsGate {
  kind: "confirm_impl_models";
  /** Config / env baseline (flywheel.config.yaml implement:). */
  defaults: CursorImplModels;
  /** Agent recommendation from ready-bead complexity (may differ from defaults). */
  recommended: CursorImplModels;
  rationale: string;
  preview: ImplModelsRecommendation["preview"];
  configPath: string;
  /** Numbered options for the coordinator to present (Cursor has no AskUserQuestion). */
  options: Array<{ id: string; label: string; detail?: string }>;
  instructions: string;
}

/** Use NTM / cc-cod-gem lane prompts only when explicitly requested. */
export function useNtmImplBackend(): boolean {
  return process.env.FW_IMPL_BACKEND === "ntm";
}

function envOverride(key: keyof CursorImplModels): string | undefined {
  const v = process.env[ENV_BY_COMPLEXITY[key]]?.trim();
  return v || undefined;
}

function configOverride(cwd: string): Partial<CursorImplModels> | undefined {
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  const impl = config.implement;
  if (!impl) return undefined;
  const out: Partial<CursorImplModels> = {};
  if (impl.simple) out.simple = impl.simple;
  if (impl.medium) out.medium = impl.medium;
  if (impl.complex) out.complex = impl.complex;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Resolve implement models: defaults → flywheel.config.yaml → env. */
export function getCursorImplModels(cwd: string): CursorImplModels {
  const fromConfig = configOverride(cwd) ?? {};
  return {
    simple:
      envOverride("simple") ??
      fromConfig.simple ??
      DEFAULT_CURSOR_IMPL_MODELS.simple,
    medium:
      envOverride("medium") ??
      fromConfig.medium ??
      DEFAULT_CURSOR_IMPL_MODELS.medium,
    complex:
      envOverride("complex") ??
      fromConfig.complex ??
      DEFAULT_CURSOR_IMPL_MODELS.complex,
  };
}

export function modelForComplexity(
  models: CursorImplModels,
  complexity: BeadComplexity,
): string {
  return models[complexity];
}

/**
 * Recommend implement models from ready-bead complexity (deterministic, no LLM).
 * Coordinator should explain `rationale` to the user before they pick an option.
 */
export function recommendImplModels(
  cwd: string,
  beads: Bead[] = [],
): ImplModelsRecommendation {
  const baseline = getCursorImplModels(cwd);
  const preview = { simple: 0, medium: 0, complex: 0, total: 0 };

  for (const bead of beads) {
    const { complexity } = classifyBeadComplexity(bead);
    preview[complexity]++;
    preview.total++;
  }

  if (preview.total === 0) {
    return {
      models: { ...baseline },
      rationale:
        "No ready beads were sampled — using your flywheel.config.yaml implement: defaults. Re-run after beads exist for a queue-aware recommendation.",
      preview,
    };
  }

  const reasons: string[] = [
    `Ready queue (${preview.total} beads): ${preview.simple} simple, ${preview.medium} medium, ${preview.complex} complex.`,
  ];

  const complexShare = preview.complex / preview.total;
  const hardShare = (preview.complex + preview.medium) / preview.total;

  if (preview.simple === preview.total) {
    const fast = baseline.simple;
    return {
      models: { simple: fast, medium: fast, complex: fast },
      rationale: [
        ...reasons,
        `All beads look lightweight (docs/config/style) — recommend \`${fast}\` for every implement Task to save cost.`,
      ].join(" "),
      preview,
    };
  }

  if (
    complexShare >= 0.25 ||
    preview.complex >= 2 ||
    (hardShare >= 0.6 && preview.complex >= 1)
  ) {
    const models: CursorImplModels = {
      simple: baseline.simple,
      medium:
        baseline.medium !== baseline.simple ? baseline.medium : "gpt-5.5-xhigh",
      complex: baseline.complex,
    };
    return {
      models,
      rationale: [
        ...reasons,
        `Substantial complex work — recommend \`${models.complex}\` for complex beads, \`${models.medium}\` for medium (integration/reasoning), \`${models.simple}\` for simple.`,
      ].join(" "),
      preview,
    };
  }

  return {
    models: { ...baseline },
    rationale: [
      ...reasons,
      `Balanced mix — recommend config defaults: \`${baseline.simple}\` (simple), \`${baseline.medium}\` (medium), \`${baseline.complex}\` (complex).`,
    ].join(" "),
    preview,
  };
}

export function resolveImplModelsConfirm(
  cwd: string,
  input: ImplModelsConfirmInput,
  beads: Bead[] = [],
): CursorImplModels {
  if (input === "defaults") {
    return getCursorImplModels(cwd);
  }
  if (input === "recommended") {
    return recommendImplModels(cwd, beads).models;
  }
  if (typeof input === "object" && "uniform" in input) {
    const u = input.uniform.trim();
    return { simple: u, medium: u, complex: u };
  }
  return {
    simple: input.simple.trim(),
    medium: input.medium.trim(),
    complex: input.complex.trim(),
  };
}

export function formatCursorImplModelTable(models: CursorImplModels): string {
  return [
    "| Bead complexity | Cursor Task `model` |",
    "|-----------------|---------------------|",
    `| simple | \`${models.simple}\` |`,
    `| medium | \`${models.medium}\` |`,
    `| complex | \`${models.complex}\` |`,
  ].join("\n");
}

export function buildImplModelsGate(cwd: string, beads: Bead[] = []): ImplModelsGate {
  const defaults = getCursorImplModels(cwd);
  const { models: recommended, rationale, preview } = recommendImplModels(
    cwd,
    beads,
  );
  const { source } = loadFlywheelConfigWithWarnings(cwd);
  const recDetail = `simple=${recommended.simple}, medium=${recommended.medium}, complex=${recommended.complex}`;
  return {
    kind: "confirm_impl_models",
    defaults,
    recommended,
    rationale,
    preview,
    configPath: source,
    options: [
      {
        id: "1",
        label: "Accept agent recommendation",
        detail: recDetail,
      },
      {
        id: "2",
        label: "One model for every bead",
        detail: 'Reply with the model slug, e.g. "composer-2.5"',
      },
      {
        id: "3",
        label: "Custom per complexity",
        detail:
          'Reply: simple=<slug> medium=<slug> complex=<slug> (e.g. simple=composer-2.5 medium=gpt-5.5-xhigh complex=opus-4.6)',
      },
      {
        id: "4",
        label: "Use flywheel.config.yaml defaults only (ignore recommendation)",
        detail: `simple=${defaults.simple}, medium=${defaults.medium}, complex=${defaults.complex}`,
      },
    ],
    instructions: [
      "Explain implModelsGate.rationale to the user in plain language, then show formatCursorImplModelTable(recommended).",
      "Present numbered options and wait for their reply.",
      "Then call flywheel_confirm_impl_models or flywheel_advance_wave with:",
      '  - confirmImplModels: "recommended" for option 1',
      '  - confirmImplModels: { uniform: "<slug>" } for option 2',
      "  - confirmImplModels: { simple, medium, complex } for option 3",
      '  - confirmImplModels: "defaults" for option 4',
      "Models must be Cursor model slugs available in Settings → Models.",
    ].join("\n"),
  };
}

export function buildCursorImplSpawnInstructions(
  models: CursorImplModels,
): string {
  return [
    "## Cursor implement swarm (MANDATORY)",
    "",
    "Spawn each bead with the Cursor **Task** tool in parallel (stagger ~30s). **Each Task MUST set `model` from the table below** — do not run all impl agents on the parent session model.",
    "",
    formatCursorImplModelTable(models),
    "",
    "Per bead: `Task({ model: <from complexity>, subagent_type: \"generalPurpose\", run_in_background: true, description: \"Impl <beadId>\", prompt: <prompt from nextWave> })`",
    "",
    `Agent Mail: \`macro_start_session\` with \`program: "${CURSOR_AGENT_MAIL_PROGRAM}"\`.`,
    "Do not use NTM or external Codex/Gemini CLIs unless the user explicitly opts in (`FW_IMPL_BACKEND=ntm`).",
  ].join("\n");
}

/** Cursor implement prompt — Claude template with program=model fixes for Task spawns. */
export function adaptPromptForCursor(
  bead: BeadDispatchContext,
  taskModel: string,
): { prompt: string; model: string } {
  const adapted = adaptPromptForClaude(bead);
  let prompt = adapted.prompt
    .replace(/program='claude-code'/g, `program='${CURSOR_AGENT_MAIL_PROGRAM}'`)
    .replace(/model='claude'/g, `model='${taskModel}'`);

  const preamble = [
    "## Coordinator spawn contract",
    `You are started by a Cursor Task with \`model: "${taskModel}"\` (bead complexity: ${bead.complexity}).`,
    `Coordinator spawn: Task({ model: "${taskModel}", subagent_type: "generalPurpose", run_in_background: true, description: "Impl ${bead.beadId}", prompt: <this message> })`,
    "",
  ].join("\n");

  return { prompt: preamble + prompt, model: taskModel };
}
