/**
 * Cursor implement-swarm model wiring — per-complexity Task subagent models.
 *
 * Defaults mirror deep-plan tiers mapped to bead complexity; override via
 * `flywheel.config.yaml` `implement:` or `FW_IMPL_MODEL_*` env vars.
 */
import { adaptPromptForClaude } from "./adapters/claude-prompt.js";
import { CURSOR_AGENT_MAIL_PROGRAM } from "./cursor-adapters.js";
import { classifyBeadComplexity } from "./model-routing.js";
import { collectBeadFilePaths } from "./beads.js";
import { loadFlywheelConfigWithWarnings } from "./flywheel-config.js";
/** Default Cursor model slugs for implement waves (by bead complexity). */
export const DEFAULT_CURSOR_IMPL_MODELS = {
    simple: "composer-2.5",
    medium: "gpt-5.5-xhigh",
    complex: "opus-4.6",
};
/** When config leaves medium === simple, bump medium for meaningful tier separation. */
export const DEFAULT_MEDIUM_WHEN_COLLAPSED = "gpt-5.5-xhigh";
export function differentiatedImplModels(models) {
    if (models.medium !== models.simple)
        return models;
    return { ...models, medium: DEFAULT_MEDIUM_WHEN_COLLAPSED };
}
const ENV_BY_COMPLEXITY = {
    simple: "FW_IMPL_MODEL_SIMPLE",
    medium: "FW_IMPL_MODEL_MEDIUM",
    complex: "FW_IMPL_MODEL_COMPLEX",
};
/** Use NTM / cc-cod-gem lane prompts only when explicitly requested. */
export function useNtmImplBackend() {
    return process.env.FW_IMPL_BACKEND === "ntm";
}
function envOverride(key) {
    const v = process.env[ENV_BY_COMPLEXITY[key]]?.trim();
    return v || undefined;
}
function configOverride(cwd) {
    const { config } = loadFlywheelConfigWithWarnings(cwd);
    const impl = config.implement;
    if (!impl)
        return undefined;
    const out = {};
    if (impl.simple)
        out.simple = impl.simple;
    if (impl.medium)
        out.medium = impl.medium;
    if (impl.complex)
        out.complex = impl.complex;
    return Object.keys(out).length > 0 ? out : undefined;
}
/** Resolve implement models: defaults → flywheel.config.yaml → env → tier differentiation. */
export function getCursorImplModels(cwd) {
    const fromConfig = configOverride(cwd) ?? {};
    const merged = {
        simple: envOverride("simple") ??
            fromConfig.simple ??
            DEFAULT_CURSOR_IMPL_MODELS.simple,
        medium: envOverride("medium") ??
            fromConfig.medium ??
            DEFAULT_CURSOR_IMPL_MODELS.medium,
        complex: envOverride("complex") ??
            fromConfig.complex ??
            DEFAULT_CURSOR_IMPL_MODELS.complex,
    };
    return differentiatedImplModels(merged);
}
const COMPLEXITY_RANK = {
    complex: 0,
    medium: 1,
    simple: 2,
};
export function classifyBeadsForSwarm(beads, models) {
    return beads
        .map((bead) => {
        const result = classifyBeadComplexity(bead);
        return {
            beadId: bead.id,
            title: bead.title,
            complexity: result.complexity,
            reason: result.reason,
            score: result.score,
            fileCount: result.fileCount,
            acceptanceCount: result.acceptanceCount,
            recommendedModel: modelForComplexity(models, result.complexity),
        };
    })
        .sort((a, b) => COMPLEXITY_RANK[a.complexity] - COMPLEXITY_RANK[b.complexity]
        || b.score - a.score
        || a.beadId.localeCompare(b.beadId));
}
export function formatBeadClassificationTable(rows, maxRows = 12) {
    if (rows.length === 0)
        return "";
    const shown = rows.slice(0, maxRows);
    const lines = [
        "| Bead | Tier | Model | Signals |",
        "|------|------|-------|---------|",
        ...shown.map((r) => `| ${r.beadId} | ${r.complexity} | \`${r.recommendedModel}\` | ${r.reason.slice(0, 80)} |`),
    ];
    if (rows.length > maxRows) {
        lines.push(`| … | | | ${rows.length - maxRows} more bead(s) omitted |`);
    }
    return lines.join("\n");
}
export function modelForComplexity(models, complexity) {
    return models[complexity];
}
/**
 * Recommend implement models from ready-bead complexity (deterministic, no LLM).
 * Coordinator should explain `rationale` to the user before they pick an option.
 */
export function recommendImplModels(cwd, beads = []) {
    const baseline = getCursorImplModels(cwd);
    const preview = { simple: 0, medium: 0, complex: 0, total: 0 };
    const beadClassifications = classifyBeadsForSwarm(beads, baseline);
    for (const row of beadClassifications) {
        preview[row.complexity]++;
        preview.total++;
    }
    if (preview.total === 0) {
        return {
            models: { ...baseline },
            rationale: "No ready beads were sampled — using your flywheel.config.yaml implement: defaults. Re-run after beads exist for a queue-aware recommendation.",
            preview,
            beadClassifications: [],
        };
    }
    const reasons = [
        `Ready queue (${preview.total} beads): ${preview.simple} simple, ${preview.medium} medium, ${preview.complex} complex.`,
    ];
    if (preview.simple === preview.total) {
        const fast = baseline.simple;
        return {
            models: { simple: fast, medium: fast, complex: fast },
            rationale: [
                ...reasons,
                `All beads look lightweight (docs/config/style) — recommend \`${fast}\` for every implement Task to save cost.`,
            ].join(" "),
            preview,
            beadClassifications,
        };
    }
    const complexShare = preview.complex / preview.total;
    const hardShare = (preview.complex + preview.medium) / preview.total;
    if (complexShare >= 0.2 ||
        preview.complex >= 2 ||
        (hardShare >= 0.5 && preview.complex >= 1)) {
        const models = {
            simple: baseline.simple,
            medium: baseline.medium,
            complex: baseline.complex,
        };
        return {
            models,
            rationale: [
                ...reasons,
                `Substantial complex work — recommend \`${models.complex}\` for complex beads, \`${models.medium}\` for medium, \`${models.simple}\` for simple.`,
                "Review beadClassifications before confirming — override per-tier models if any row looks wrong.",
            ].join(" "),
            preview,
            beadClassifications,
        };
    }
    if (preview.medium > 0 || preview.complex > 0) {
        const models = differentiatedImplModels(baseline);
        return {
            models,
            rationale: [
                ...reasons,
                `Mixed queue — recommend tiered models: \`${models.simple}\` (simple), \`${models.medium}\` (medium), \`${models.complex}\` (complex).`,
                "Review beadClassifications before confirming.",
            ].join(" "),
            preview,
            beadClassifications,
        };
    }
    return {
        models: { ...baseline },
        rationale: [
            ...reasons,
            `Balanced mix — recommend config defaults: \`${baseline.simple}\` (simple), \`${baseline.medium}\` (medium), \`${baseline.complex}\` (complex).`,
        ].join(" "),
        preview,
        beadClassifications,
    };
}
export function resolveImplModelsConfirm(cwd, input, beads = []) {
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
export function formatCursorImplModelTable(models) {
    return [
        "| Bead complexity | Cursor Task `model` |",
        "|-----------------|---------------------|",
        `| simple | \`${models.simple}\` |`,
        `| medium | \`${models.medium}\` |`,
        `| complex | \`${models.complex}\` |`,
    ].join("\n");
}
export function buildImplModelsGate(cwd, beads = []) {
    const defaults = getCursorImplModels(cwd);
    const { models: recommended, rationale, preview, beadClassifications } = recommendImplModels(cwd, beads);
    const { source } = loadFlywheelConfigWithWarnings(cwd);
    const recDetail = `simple=${recommended.simple}, medium=${recommended.medium}, complex=${recommended.complex}`;
    return {
        kind: "confirm_impl_models",
        defaults,
        recommended,
        rationale,
        preview,
        beadClassifications,
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
                detail: 'Reply: simple=<slug> medium=<slug> complex=<slug> (e.g. simple=composer-2.5 medium=gpt-5.5-xhigh complex=opus-4.6)',
            },
            {
                id: "4",
                label: "Use flywheel.config.yaml defaults only (ignore recommendation)",
                detail: `simple=${defaults.simple}, medium=${defaults.medium}, complex=${defaults.complex}`,
            },
        ],
        instructions: [
            "Explain implModelsGate.rationale to the user in plain language, then show formatCursorImplModelTable(recommended).",
            "Show formatBeadClassificationTable(implModelsGate.beadClassifications) so the user can sanity-check per-bead tier assignments.",
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
export function buildBeadDispatchContext(bead, complexity, agentName, coordinatorName, projectKey) {
    const descLines = bead.description.split("\n");
    const acceptance = descLines
        .filter((l) => /^\s*[-*]\s/.test(l))
        .map((l) => l.replace(/^\s*[-*]\s*/, "").trim())
        .filter(Boolean);
    return {
        beadId: bead.id,
        title: bead.title,
        description: bead.description,
        acceptance: acceptance.length > 0 ? acceptance : ["Complete the bead as described."],
        complexity,
        relevantFiles: collectBeadFilePaths(bead),
        priorArtBeads: [],
        agentName,
        coordinatorName,
        projectKey,
    };
}
export function buildCursorImplSpawnInstructions(models, cwd, options) {
    const mode = options?.executionMode ?? "single-branch";
    const lines = [
        "## Cursor implement swarm (MANDATORY)",
        "",
        "Spawn each bead with the Cursor **Task** tool in parallel (stagger ~30s). **Each Task MUST set `model` from the table below** — do not run all impl agents on the parent session model.",
        "",
        formatCursorImplModelTable(models),
        "",
        "Per bead: `Task({ model: <from complexity>, subagent_type: \"generalPurpose\", run_in_background: true, description: \"Impl <beadId>\", prompt: <prompt from nextWave> })`",
        "",
        "**Single-branch coordination:** all Tasks work in the **shared repo root** on the same branch. Do **not** run `git worktree add`.",
        `Agent Mail is **mandatory**: \`macro_start_session\` with \`program: "${CURSOR_AGENT_MAIL_PROGRAM}"\`; exclusive \`file_reservation_paths\` before edits.`,
        "Install pre-commit guard if missing: Agent Mail \`install_precommit_guard\` or flywheel \`scaffoldPreCommitGuard\`.",
        "Coordinator: `git pull` before the first wave; agents `git pull --rebase` before editing.",
        "",
        `Coordination mode: \`${mode}\`.`,
        "Do not use NTM or external Codex/Gemini CLIs unless the user explicitly opts in (`FW_IMPL_BACKEND=ntm`).",
    ];
    if (options?.hotspotWarnings?.length) {
        lines.push("", "## Wave hotspot warnings", ...options.hotspotWarnings);
    }
    return lines.join("\n");
}
/** Cursor implement prompt — Claude template with program=model fixes for Task spawns. */
export function adaptPromptForCursor(bead, taskModel, executionMode = "single-branch") {
    const adapted = adaptPromptForClaude(bead, {
        mode: executionMode,
        program: CURSOR_AGENT_MAIL_PROGRAM,
        model: taskModel,
    });
    const preamble = [
        "## Coordinator spawn contract",
        `You are started by a Cursor Task with \`model: "${taskModel}"\` (bead complexity: ${bead.complexity}).`,
        `Coordinator spawn: Task({ model: "${taskModel}", subagent_type: "generalPurpose", run_in_background: true, description: "Impl ${bead.beadId}", prompt: <this message> })`,
        `Work in the **shared repo checkout** at \`${bead.projectKey}\` — single branch, no worktrees.`,
        "",
    ].join("\n");
    return { prompt: preamble + adapted.prompt, model: taskModel };
}
//# sourceMappingURL=cursor-implement-swarm.js.map