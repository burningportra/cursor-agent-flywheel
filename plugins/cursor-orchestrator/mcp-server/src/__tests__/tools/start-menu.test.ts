import { describe, it, expect } from "vitest";
import { buildStartMenu, inferStartMenuVariant } from "../../cursor-start-menu.js";

describe("flywheel_start_menu builders", () => {
  it("infers previous-session-exists from checkpoint phase", () => {
    expect(
      inferStartMenuVariant({
        hasCheckpoint: true,
        checkpointPhase: "implementing",
        openBeadCount: 0,
      }),
    ).toBe("previous-session-exists");
  });

  it("fresh-start menu includes Set a goal and Pick up existing plan", () => {
    const menu = buildStartMenu({
      variant: "fresh-start",
      recentPlanPaths: ["docs/plans/foo.md"],
    });
    const labels = menu.options.map((o) => o.label);
    expect(labels).toContain("Set a goal");
    expect(labels).toContain("Pick up existing plan");
    expect(menu.askQuestion.questions[0].options.length).toBe(4);
  });
});
