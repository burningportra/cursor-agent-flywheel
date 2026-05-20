/**
 * flywheel_start_menu — Step 0d AskQuestion payload from code (cursor-native).
 */
import { buildStartMenu, inferStartMenuVariant } from "../cursor-start-menu.js";
import { toCompactGatePayload } from "../cursor-user-gates.js";
import { makeOkToolResult } from "./shared.js";
export async function runStartMenu(_ctx, args) {
    const variant = args.variant ??
        inferStartMenuVariant({
            hasCheckpoint: Boolean(args.phase && args.phase !== "idle"),
            checkpointPhase: args.phase,
            openBeadCount: args.openBeadCount ?? 0,
        });
    const menu = buildStartMenu({
        variant,
        recentPlanPaths: args.recentPlanPaths,
        isFirstRun: args.isFirstRun,
        goal: args.goal,
        phase: args.phase,
        openBeadCount: args.openBeadCount,
    });
    const compact = toCompactGatePayload({
        kind: "review_mode",
        title: "Start menu",
        rationale: menu.primaryEntryPointsMarkdown,
        options: menu.options.map((o) => ({
            id: o.id,
            label: o.label,
            detail: o.description,
            coordinatorAction: o.route,
        })),
        instructions: "AskQuestion(structuredContent.data.askQuestion); route via routeHints.",
    });
    const data = {
        variant: menu.variant,
        primaryEntryPointsMarkdown: menu.primaryEntryPointsMarkdown,
        recentPlanPaths: menu.recentPlanPaths,
        routeHints: menu.routeHints,
        options: menu.options,
        ...compact,
    };
    return makeOkToolResult("flywheel_start_menu", "start_menu", `flywheel_start_menu: variant=${menu.variant} | AskQuestion(data.askQuestion) → routeHints`, data);
}
//# sourceMappingURL=start-menu.js.map