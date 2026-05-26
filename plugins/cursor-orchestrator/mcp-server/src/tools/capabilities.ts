/**
 * `flywheel_capabilities` — read-only handler that returns the entire MCP
 * contract surface in a single call. Agents use this to pin contract
 * versions, discover valid action enums, list error codes, and read the
 * env-var dictionary without grepping source.
 *
 * R-001 from the agent-ergonomics audit (priority 985). The output is
 * snapshot-tested so the contract cannot drift silently.
 *
 * Design constraint: this tool MUST NOT import from server.ts (circular).
 * The TOOLS list is passed in from server.ts at registration time via the
 * `runCapabilitiesWith` closure factory.
 */

import type { McpToolResult, ToolContext } from '../types.js';
import { FLYWHEEL_ERROR_CODES, DEFAULT_HINTS, DEFAULT_RETRYABLE, DEFAULT_TRY_THIS } from '../errors.js';
import { DOCTOR_CHECK_NAMES } from './doctor.js';
import { makeToolResult } from './shared.js';

/**
 * Bumped any time the capabilities envelope shape (NOT the tool list)
 * changes in a way clients must observe. Tool additions/removals do NOT
 * bump this — they are surfaced in `mcp_tools[]` and pinned by the
 * snapshot test.
 */
export const CAPABILITIES_CONTRACT_VERSION = 1 as const;

/**
 * Tool descriptor shape — structurally matches the entries in server.ts
 * PRIMARY_TOOLS. The `type` field is widened to `string` because the
 * literal in server.ts is not declared `as const` and the array contains
 * heterogeneous shapes; we only read `name`, `description`, and the inner
 * required/properties anyway.
 */
interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface ToolSummary {
  name: string;
  description: string;
  required: string[];
  optional: string[];
  enums: Record<string, readonly string[]>;
  deprecated: boolean;
  deprecation_replacement?: string;
  /** R-003: relative path inside the MCP server install root pointing at the JSON Schema for this tool's input. */
  schema_url: string;
}

interface CapabilitiesData {
  kind: 'capabilities';
  contract_version: typeof CAPABILITIES_CONTRACT_VERSION;
  generated_at: string;
  /**
   * Pass-6 finding-1 — top-level alias for `mcp_tools`. The simulator hit
   * the universal first-call confusion: `Object.keys(envelope.data)` shows
   * `mcp_tools` and an agent has to recognize the `mcp_` prefix is
   * implementer-leaking. `tools` is the plain name. Both are kept for
   * backward compatibility (additive change; same array reference).
   */
  tools: ToolSummary[];
  mcp_tools: ToolSummary[];
  doctor_check_names: readonly string[];
  error_codes: Array<{
    code: string;
    default_hint: string;
    /** R-007 (pass 3) — paste-ready next-step. Parallel to default_hint. */
    default_try_this: string;
    retryable: boolean;
  }>;
  env_vars: Record<string, string>;
  exit_code_contract: Record<string, string>;
  references: {
    schemas_url: string | null;
    robot_docs_tool: string | null;
    /** Prose pointer (legacy field — kept for narrative readers). */
    handbook: string;
    /**
     * Pass-6 finding-2 — structured `{tool, args}` form so smaller models
     * can pattern-match the next call instead of text-extracting it from
     * a sentence. Mirrors the same intent as `handbook`.
     */
    handbook_call: {
      tool: string;
      args: Record<string, unknown>;
      description: string;
    } | null;
  };
}

interface CapabilitiesEnvelope {
  tool: 'flywheel_capabilities';
  version: 1;
  status: 'ok';
  phase: 'idle';
  data: CapabilitiesData;
}

/**
 * Hand-curated env-var dictionary. Agents look here before grepping source.
 * Update this when a new FW_* env var is read by any tool runner.
 */
export const FLYWHEEL_ENV_VARS: Record<string, string> = {
  FW_ATTESTATION_REQUIRED:
    '"1" | "true" — when set, flywheel_advance_wave hard-blocks instead of warning when a closed bead lacks an attestation file.',
  FW_COMPLIANCE_OVERRIDE:
    '"1" | "true" — skip the entire compliance audit. Comma-separated bead ids skip only those beads (audit runs on the rest). Emergency use only.',
  FW_COMPLIANCE_BACKEND:
    '"cursor" (default in Cursor plugin) — defer to Task + afterTask re-call. "claude" — legacy claude -p skill spawn from MCP.',
  FW_COMPLIANCE_MODEL:
    'Cursor Task model for compliance audit (default opus-4.6).',
  FW_COMMIT_BATCH_THRESHOLD:
    'Commits since last batch-review baseline before flywheel_impl_tick dispatches fresh-eyes review (0 = off). Overridden by checkpoint state.commitBatchThreshold when set. Also configurable via flywheel.config.yaml impl_tick.commit_batch_threshold.',
  FW_IMPL_TICK_INTERVAL_SECONDS:
    'Seconds between coordinator flywheel_impl_tick calls (default 240). Overrides flywheel.config.yaml impl_tick.interval_seconds.',
  FW_IMPL_TICK_REVIEW_MODEL:
    'Cursor Task model for commit-batch fresh-eyes review (default opus-4.6). Overrides impl_tick.review_model.',
  FW_IMPL_TICK_MAX_PARALLEL:
    'Max parallel impl Tasks suggested per tick (default 3). Overrides impl_tick.max_parallel_impl.',
  FW_GRADER_BACKEND:
    '"cursor" (default in Cursor plugin) — defer to Task + graderStdout. "codex" | "claude" — legacy CLI subprocess from MCP.',
  FW_GRADER_FORCE_CLAUDE:
    'Legacy only: "1" | "true" — force claude --print instead of probing codex first (requires FW_GRADER_BACKEND=codex).',
  FW_DEEP_PLAN_BACKEND:
    'Set to "claude" to use Claude Code Agent/NTM deep-plan spawn configs. Default (unset) uses Cursor Task models from flywheel.config.yaml deep_plan: or FW_DEEP_PLAN_MODEL_* env vars.',
  FW_DEEP_PLAN_MODEL_CORRECTNESS:
    'Cursor model slug for the correctness deep-plan planner (overrides flywheel.config.yaml).',
  FW_DEEP_PLAN_MODEL_ERGONOMICS:
    'Cursor model slug for the ergonomics deep-plan planner (overrides flywheel.config.yaml).',
  FW_DEEP_PLAN_MODEL_ROBUSTNESS:
    'Cursor model slug for the robustness deep-plan planner (overrides flywheel.config.yaml).',
  FW_DEEP_PLAN_MODEL_SYNTHESIS:
    'Cursor model slug for the deep-plan synthesizer Task (overrides flywheel.config.yaml).',
  FW_DUEL_BACKEND:
    'Set to "ntm" for legacy NTM + external CLIs dueling wizards. Default (unset) uses Cursor Task models from flywheel.config.yaml duel: or FW_DUEL_MODEL_* env vars.',
  FW_DUEL_MODEL_WIZARD_A:
    'Cursor model slug for duel wizard A (overrides flywheel.config.yaml).',
  FW_DUEL_MODEL_WIZARD_B:
    'Cursor model slug for duel wizard B (overrides flywheel.config.yaml).',
  FW_DUEL_MODEL_WIZARD_C:
    'Cursor model slug for optional duel wizard C (overrides flywheel.config.yaml).',
  FW_DUEL_MODEL_SYNTHESIS:
    'Cursor model slug for duel synthesizer Task (overrides flywheel.config.yaml).',
  FW_GRADER_MODEL:
    'Cursor: Task model slug for decorrelated grader (overrides flywheel.config.yaml grader.model). Legacy codex: passed to codex exec --model.',
  FW_GRADER_MODEL_DEFAULT:
    'Default grader model id used when FW_GRADER_MODEL is not set.',
  FW_GRADER_TIMEOUT_MS:
    'Legacy CLI grader timeout in milliseconds. Default: 120000. Cursor port uses Task + graderStdout instead.',
  FW_LOG_LEVEL:
    '"debug" | "info" | "warn" | "error" — server log verbosity. Set to "debug" when triaging tool failures.',
  FW_MAX_OUTCOME_ITERATIONS:
    'Cap on outcome-grading iterations per cycle (1–5, default 3). Used when checkpoint maxOutcomeIterations is unset.',
  FW_RUBRIC_SYNTH_TIMEOUT_MS:
    'Per-call timeout for flywheel_synthesize_rubric. Default: 60000.',
  FW_SESSION_ID:
    'Session id used for telemetry correlation; auto-generated if unset.',
  FW_SKILL_BUNDLE:
    'Override path to the skills bundle used by flywheel_get_skill. When unset the server reads from the plugin install root.',
  FW_VIEWER_BIND:
    'Bind address for the bead-viewer HTTP server. Default: 127.0.0.1.',
};

/**
 * Documented exit-code contract. The MCP layer uses 0 for success and the
 * structured-error envelope for failure (no shell exit codes). This dict is
 * what the CLI shim should emit if/when one is added.
 */
export const EXIT_CODE_CONTRACT: Record<string, string> = {
  '0': 'success',
  '1': 'user-input-error — invalid args, missing required field, enum violation',
  '2': 'safety-block — refused destructive op without --yes; refused mutation under blocked_state',
  '3': 'tool-environment-error — required CLI missing, network unreachable, fs not writable',
  '4': 'concurrent-write — another process holds the mutex; retry with backoff',
  '5': 'parse-failure — input file or upstream output failed schema validation',
};

/**
 * Build a single tool summary with required/optional/enum extraction.
 * Pure function so the snapshot test can call it directly.
 */
export function summarizeTool(tool: ToolDescriptor): ToolSummary {
  const props = (tool.inputSchema.properties ?? {}) as Record<
    string,
    { enum?: readonly string[] }
  >;
  const required = tool.inputSchema.required ?? [];
  const allFields = Object.keys(props);
  const optional = allFields.filter((f) => !required.includes(f));
  const enums: Record<string, readonly string[]> = {};
  for (const [field, schema] of Object.entries(props)) {
    if (schema && Array.isArray(schema.enum) && schema.enum.length > 0) {
      enums[field] = schema.enum;
    }
  }
  const deprecated = tool.name.startsWith('orch_');
  return {
    name: tool.name,
    description: tool.description,
    required: [...required].sort(),
    optional: optional.sort(),
    enums,
    deprecated,
    deprecation_replacement: deprecated
      ? tool.name.replace(/^orch_/, 'flywheel_')
      : undefined,
    schema_url: `schemas/inputs/${tool.name}.json`,
  };
}

/**
 * Assemble the full capabilities payload. Pure function (no I/O) so tests
 * can pin its output deterministically.
 */
export function buildCapabilitiesPayload(
  tools: readonly ToolDescriptor[],
  options: { now?: () => string } = {},
): CapabilitiesEnvelope {
  const now = options.now ?? (() => new Date().toISOString());
  const summaries = [...tools].sort((a, b) => a.name.localeCompare(b.name)).map(summarizeTool);
  const errorCodes = [...FLYWHEEL_ERROR_CODES].sort().map((code) => ({
    code,
    default_hint: DEFAULT_HINTS[code],
    default_try_this: DEFAULT_TRY_THIS[code],
    retryable: DEFAULT_RETRYABLE[code],
  }));
  return {
    tool: 'flywheel_capabilities',
    version: 1,
    status: 'ok',
    phase: 'idle',
    data: {
      kind: 'capabilities',
      contract_version: CAPABILITIES_CONTRACT_VERSION,
      generated_at: now(),
      // Pass-6 finding-1 — both keys point at the SAME summaries array
      // so future writes don't drift. `tools` is the plain name; `mcp_tools`
      // stays as a deprecated alias for one minor cycle (drop in v4.0).
      tools: summaries,
      mcp_tools: summaries,
      doctor_check_names: [...DOCTOR_CHECK_NAMES].sort(),
      error_codes: errorCodes,
      env_vars: FLYWHEEL_ENV_VARS,
      exit_code_contract: EXIT_CODE_CONTRACT,
      references: {
        schemas_url: 'schemas/index.json',
        robot_docs_tool: 'flywheel_robot_docs',
        handbook:
          'Call flywheel_robot_docs (default section="all") for the paste-ready handbook. AGENTS.md in the repo root is the verbose long-form.',
        // Pass-6 finding-2 — structured form parallel to `handbook`.
        // Smaller models pattern-match this; larger ones can use either.
        handbook_call: {
          tool: 'flywheel_robot_docs',
          args: { cwd: '<repo-root>', section: 'all' },
          description: 'Returns the 6-section paste-ready handbook in one call.',
        },
      },
    },
  };
}

/**
 * Closure factory: server.ts calls this once with its TOOLS array; the
 * returned runner satisfies the ToolRunner shape and can be wired into
 * EXTENSION_RUNNERS. Avoids the capabilities.ts → server.ts circular import.
 */
export function runCapabilitiesWith(
  tools: readonly ToolDescriptor[],
): (ctx: ToolContext, args: Record<string, unknown>) => Promise<McpToolResult> {
  return async (_ctx, _args) => {
    const payload = buildCapabilitiesPayload(tools);
    const text = `flywheel_capabilities: contract_version=${payload.data.contract_version} tools=${payload.data.mcp_tools.length} error_codes=${payload.data.error_codes.length} doctor_checks=${payload.data.doctor_check_names.length}`;
    return makeToolResult(text, payload);
  };
}
