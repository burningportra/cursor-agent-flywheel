/**
 * Cursor-native outcome grader — coordinator spawns a Task, then submits stdout.
 */

import { loadFlywheelConfigWithWarnings } from "./flywheel-config.js";

const DEFAULT_CURSOR_GRADER_MODEL = "opus-4.6";

/** When true, flywheel_grade_outcome returns a Task spec instead of codex/claude CLI. */
export function useCursorGraderBackend(): boolean {
  const b = process.env.FW_GRADER_BACKEND?.trim().toLowerCase();
  if (b === "codex" || b === "claude" || b === "claude-cli") return false;
  return true;
}

export function resolveCursorGraderModel(cwd: string): string {
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  const fromConfig = (config as { grader?: { model?: string } }).grader?.model?.trim();
  if (fromConfig) return fromConfig;
  const fromEnv = process.env.FW_GRADER_MODEL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_CURSOR_GRADER_MODEL;
}

export function buildCursorGraderCoordinatorPlaybook(model: string): string {
  return [
    "## Cursor outcome grader (decorrelated from impl swarm)",
    "",
    "1. Call `flywheel_grade_outcome({ cwd })` **without** `graderStdout` first.",
    "2. If `kind === 'grader_deferred'`, spawn **one** Task:",
    "   ```",
    "   Task({",
    `     model: "${model}",`,
    '     subagent_type: "generalPurpose",',
    "     description: \"Outcome grader\",",
    "     prompt: <data.graderTask.prompt>",
    "   })",
    "   ```",
    "3. Take the Task's **raw stdout** (JSON only) and call:",
    "   `flywheel_grade_outcome({ cwd, graderStdout: <stdout> })`",
    "4. Present **AskQuestion** from `data.askQuestion` on the final response (needs_revision menu).",
    "",
    "Do not run `codex exec` or `claude --print` for grading in the Cursor port.",
  ].join("\n");
}
