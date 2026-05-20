/**
 * Cursor deep-plan model wiring — per-perspective Task subagent models.
 *
 * Defaults match common Cursor model slugs; override via flywheel.config.yaml
 * `deep_plan:` or FW_DEEP_PLAN_MODEL_* env vars.
 */

import { loadFlywheelConfigWithWarnings } from "./flywheel-config.js";

export type DeepPlanPerspective = "correctness" | "ergonomics" | "robustness";

export interface CursorDeepPlanModels {
  correctness: string;
  ergonomics: string;
  robustness: string;
  synthesis: string;
}

/** Default Cursor model slugs for the planning trinity + synthesis. */
export const DEFAULT_CURSOR_DEEP_PLAN_MODELS: CursorDeepPlanModels = {
  correctness: "opus-4.6",
  ergonomics: "composer-2.5",
  robustness: "gpt-5.5-xhigh",
  synthesis: "opus-4.6",
};

const ENV_BY_PERSPECTIVE: Record<keyof CursorDeepPlanModels, string> = {
  correctness: "FW_DEEP_PLAN_MODEL_CORRECTNESS",
  ergonomics: "FW_DEEP_PLAN_MODEL_ERGONOMICS",
  robustness: "FW_DEEP_PLAN_MODEL_ROBUSTNESS",
  synthesis: "FW_DEEP_PLAN_MODEL_SYNTHESIS",
};

export interface DeepPlanSpawnAgent {
  name: string;
  perspective: DeepPlanPerspective;
  /** Cursor Task `model` argument — must differ per planner for triangulation. */
  model: string;
  tier: "A" | "B" | "C";
  task: string;
  spawnWith: "cursor-task";
}

/** Use Claude Code / NTM deep-plan path only when explicitly requested. */
export function useClaudeDeepPlanBackend(): boolean {
  return process.env.FW_DEEP_PLAN_BACKEND === "claude";
}

function envOverride(key: keyof CursorDeepPlanModels): string | undefined {
  const v = process.env[ENV_BY_PERSPECTIVE[key]]?.trim();
  return v || undefined;
}

function configOverride(
  cwd: string,
): Partial<CursorDeepPlanModels> | undefined {
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  const dp = config.deep_plan;
  if (!dp) return undefined;
  const out: Partial<CursorDeepPlanModels> = {};
  if (dp.correctness) out.correctness = dp.correctness;
  if (dp.ergonomics) out.ergonomics = dp.ergonomics;
  if (dp.robustness) out.robustness = dp.robustness;
  if (dp.synthesis) out.synthesis = dp.synthesis;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Resolve deep-plan models: defaults → flywheel.config.yaml → env. */
export function getCursorDeepPlanModels(cwd: string): CursorDeepPlanModels {
  const fromConfig = configOverride(cwd) ?? {};
  return {
    correctness:
      envOverride("correctness") ??
      fromConfig.correctness ??
      DEFAULT_CURSOR_DEEP_PLAN_MODELS.correctness,
    ergonomics:
      envOverride("ergonomics") ??
      fromConfig.ergonomics ??
      DEFAULT_CURSOR_DEEP_PLAN_MODELS.ergonomics,
    robustness:
      envOverride("robustness") ??
      fromConfig.robustness ??
      DEFAULT_CURSOR_DEEP_PLAN_MODELS.robustness,
    synthesis:
      envOverride("synthesis") ??
      fromConfig.synthesis ??
      DEFAULT_CURSOR_DEEP_PLAN_MODELS.synthesis,
  };
}

export function formatCursorDeepPlanModelTable(models: CursorDeepPlanModels): string {
  return [
    "| Perspective | Planner | Cursor model | Tier |",
    "|-------------|---------|----------------|------|",
    `| correctness | correctness-planner | \`${models.correctness}\` | A |`,
    `| ergonomics | ergonomics-planner | \`${models.ergonomics}\` | B |`,
    `| robustness | robustness-planner | \`${models.robustness}\` | C |`,
    `| synthesis | plan-synthesizer | \`${models.synthesis}\` | A |`,
  ].join("\n");
}

export function buildCursorDeepPlanInstructions(
  planAgents: DeepPlanSpawnAgent[],
  synthesisModel: string,
  planSlug: string,
): string {
  const spawnLines = planAgents.map(
    (a) =>
      `- **${a.name}** (\`${a.perspective}\`): \`Task({ model: "${a.model}", subagent_type: "generalPurpose", run_in_background: true, description: "...", prompt: <task from planAgents> })\` — tier ${a.tier}`,
  );
  return [
    "## Cursor deep plan spawn (MANDATORY)",
    "",
    "Spawn planning agents with the Cursor **Task** tool in parallel. **Each Task MUST set `model` to the value below** — never spawn three planners on the parent session model.",
    "",
    formatCursorDeepPlanModelTable({
      correctness: planAgents.find((a) => a.perspective === "correctness")!.model,
      ergonomics: planAgents.find((a) => a.perspective === "ergonomics")!.model,
      robustness: planAgents.find((a) => a.perspective === "robustness")!.model,
      synthesis: synthesisModel,
    }),
    "",
    "### Planners (parallel)",
    ...spawnLines,
    "",
    "Each planner: `macro_start_session` with `program: \"cursor\"`, write `docs/plans/<date>-<perspective>.md`, notify coordinator via agent-mail with the file path only.",
    "",
    "### Synthesis (after all planners deliver)",
    `- **plan-synthesizer**: \`Task({ model: "${synthesisModel}", subagent_type: "generalPurpose", run_in_background: true, ... })\` using \`synthesisPrompt\` from this tool result.`,
    `- Write \`docs/plans/<date>-${planSlug}-synthesized.md\`, then \`flywheel_plan({ planFile: "docs/plans/<date>-${planSlug}-synthesized.md" })\` (not planContent).`,
    "",
    "Do not use NTM, Claude `Agent()`, or external Codex/Gemini CLIs unless the user explicitly opts in.",
  ].join("\n");
}

export function buildCursorDeepPlanAgents(
  basePrompt: string,
  models: CursorDeepPlanModels,
): DeepPlanSpawnAgent[] {
  return [
    {
      name: "correctness-planner",
      perspective: "correctness",
      model: models.correctness,
      tier: "A",
      spawnWith: "cursor-task",
      task: `${basePrompt}

## Your perspective: CORRECTNESS
Focus on: type safety, edge cases, error handling, validation, data integrity, invariants.
Ask: What can go wrong? What are the failure modes? Are the interfaces correct?`,
    },
    {
      name: "robustness-planner",
      perspective: "robustness",
      model: models.robustness,
      tier: "C",
      spawnWith: "cursor-task",
      task: `${basePrompt}

## Your perspective: ROBUSTNESS
Focus on: performance, scalability, retry logic, timeouts, graceful degradation, observability.
Ask: What happens under load? What are the operational concerns? How does it fail gracefully?`,
    },
    {
      name: "ergonomics-planner",
      perspective: "ergonomics",
      model: models.ergonomics,
      tier: "B",
      spawnWith: "cursor-task",
      task: `${basePrompt}

## Your perspective: ERGONOMICS
Focus on: API design, developer experience, naming, documentation, discoverability, simplicity.
Ask: Is it easy to use correctly? Hard to misuse? Does it follow existing patterns in the codebase?`,
    },
  ];
}
