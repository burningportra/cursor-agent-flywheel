/**
 * Step 0d start menus — AskQuestion payloads + route hints for Cursor.
 */
import { buildAskQuestionFromGate, } from "./cursor-user-gates.js";
function gateFromOptions(kind, title, rationale, options) {
    return {
        kind,
        title,
        rationale,
        options: options.map((o) => ({
            id: o.id,
            label: o.recommended ? `${o.label} (Recommended)` : o.label,
            detail: o.description,
            action: o.action,
            coordinatorAction: o.route,
        })),
        instructions: "Present AskQuestion with askQuestion. Map selected option id to routeHints[ id ].",
    };
}
function primaryBlock(variant, ctx) {
    const plans = "  • <RECENT_PLAN_PATHS[0]> … (see observe.recentPlanPaths)";
    if (variant === "previous-session-exists") {
        return [
            `Primary entry points (active session: '${ctx.goal ?? "?"}' @ ${ctx.phase ?? "?"}):`,
            "  • Resume swarm · Resume session · Set a goal · Pick up existing plan",
            "",
            "Recent plans:",
            plans,
            "",
            "More: Work on beads · New goal · Reality check · Duel · Simplify · Research · Audit · Setup",
        ].join("\n");
    }
    if (variant === "open-beads-exist") {
        return [
            `Primary entry points (${ctx.openBeads ?? "?"} open beads):`,
            "  • Resume swarm · Work on beads · Set a goal · Pick up existing plan",
            "",
            "Recent plans:",
            plans,
            "",
            "More: Reality check · Duel · New goal · Simplify · Research · Audit · Setup",
        ].join("\n");
    }
    return [
        "Primary entry points:",
        "  • Set a goal · Pick up existing plan · Scan & discover · Reality check",
        "",
        "Recent plans:",
        plans,
        "",
        "More: Research · Simplify · Duel · Audit · Setup · Quick fix",
    ].join("\n");
}
export function buildStartMenu(input) {
    const recentPlanPaths = input.recentPlanPaths ?? [];
    let options;
    switch (input.variant) {
        case "previous-session-exists":
            options = [
                {
                    id: "resume-swarm",
                    label: "Resume swarm",
                    description: "/flywheel-resume — Cursor Task + worktrees",
                    route: "Resume swarm",
                    action: "continue-wrap-up",
                    recommended: true,
                },
                {
                    id: "resume-session",
                    label: "Resume session",
                    description: "Continue manually from checkpoint",
                    route: "Resume session",
                    action: "continue-wrap-up",
                },
                {
                    id: "set-goal",
                    label: "Set a goal",
                    description: "Type goal in Other; append-mode",
                    route: "Set a goal",
                    action: "bead-back-to-plan",
                },
                {
                    id: "pick-plan",
                    label: "Pick up existing plan",
                    description: "Path in Other → flywheel_plan → Step 5.45 validate",
                    route: "Pick up existing plan",
                    action: "bead-back-to-plan",
                },
            ];
            break;
        case "open-beads-exist":
            options = [
                {
                    id: "resume-swarm",
                    label: "Resume swarm",
                    description: "/flywheel-resume",
                    route: "Resume swarm",
                    action: "continue-wrap-up",
                    recommended: true,
                },
                {
                    id: "work-beads",
                    label: "Work on beads",
                    description: "Manual refine / implement / inspect",
                    route: "Work on beads",
                    action: "bead-launch",
                },
                {
                    id: "set-goal",
                    label: "Set a goal",
                    description: "Append new beads",
                    route: "Set a goal",
                    action: "bead-back-to-plan",
                },
                {
                    id: "pick-plan",
                    label: "Pick up existing plan",
                    description: "Merge via Step 5.45",
                    route: "Pick up existing plan",
                    action: "bead-back-to-plan",
                },
            ];
            break;
        default: {
            if (input.isFirstRun) {
                options = [
                    {
                        id: "tour",
                        label: "Take the 5-min tour",
                        description: "_tutorial_bead.md",
                        route: "Take the 5-min tour",
                        action: "continue-wrap-up",
                        recommended: true,
                    },
                    {
                        id: "set-goal",
                        label: "Set a goal",
                        description: "Type goal in Other",
                        route: "Set a goal",
                        action: "bead-back-to-plan",
                    },
                    {
                        id: "pick-plan",
                        label: "Pick up existing plan",
                        description: "Step 5.45 validate menu",
                        route: "Pick up existing plan",
                        action: "bead-back-to-plan",
                    },
                    {
                        id: "scan-discover",
                        label: "Scan & discover",
                        description: "Profile + discover ideas",
                        route: "Scan & discover",
                        action: "bead-back-to-plan",
                    },
                ];
            }
            else {
                const rec = recentPlanPaths.length > 0
                    ? "pick-plan"
                    : "scan-discover";
                options = [
                    {
                        id: "set-goal",
                        label: "Set a goal",
                        description: "Type goal in Other",
                        route: "Set a goal",
                        action: "bead-back-to-plan",
                    },
                    {
                        id: "pick-plan",
                        label: "Pick up existing plan",
                        description: "Step 5.45 validate before beads",
                        route: "Pick up existing plan",
                        action: "bead-back-to-plan",
                        recommended: rec === "pick-plan",
                    },
                    {
                        id: "scan-discover",
                        label: "Scan & discover",
                        description: "Greenfield default",
                        route: "Scan & discover",
                        action: "bead-back-to-plan",
                        recommended: rec === "scan-discover",
                    },
                    {
                        id: "reality-check",
                        label: "Reality check",
                        description: "/reality-check-for-project",
                        route: "Reality check",
                        action: "fresh-eyes",
                    },
                ];
            }
        }
    }
    const gate = gateFromOptions("review_mode", "Start", "What would you like to do? Extra entry points: slash commands listed in start_ceremony 0e.", options);
    const routeHints = {};
    for (const o of options)
        routeHints[o.id] = o.route;
    return {
        variant: input.variant,
        askQuestion: buildAskQuestionFromGate(gate),
        options,
        routeHints,
        recentPlanPaths,
        primaryEntryPointsMarkdown: primaryBlock(input.variant, {
            goal: input.goal,
            phase: input.phase,
            openBeads: input.openBeadCount,
        }),
    };
}
/** Infer menu variant from observe-shaped hints (caller passes structured fields). */
export function inferStartMenuVariant(input) {
    if (input.hasCheckpoint &&
        input.checkpointPhase &&
        input.checkpointPhase !== "idle") {
        return "previous-session-exists";
    }
    if (input.openBeadCount > 0)
        return "open-beads-exist";
    return "fresh-start";
}
//# sourceMappingURL=cursor-start-menu.js.map