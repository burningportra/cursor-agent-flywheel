import { describe, it, expect } from "vitest";
import {
  buildStartMenu,
  inferStartMenuVariant,
  FRESH_EYES_REVIEW_OPTION,
  RESEARCH_REPO_OPTION,
} from "../../cursor-start-menu.js";

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
    expect(labels).toContain("Fresh-eyes review");
    expect(labels).toContain("Research repo");
    expect(menu.askQuestion.questions[0].options.length).toBe(6);
  });

  it("open-beads and previous-session menus include Fresh-eyes review and Research repo", () => {
    for (const variant of ["open-beads-exist", "previous-session-exists"] as const) {
      const menu = buildStartMenu({ variant });
      expect(menu.options.map((o) => o.id)).toContain(FRESH_EYES_REVIEW_OPTION.id);
      expect(menu.options.map((o) => o.id)).toContain(RESEARCH_REPO_OPTION.id);
    }
  });
});
