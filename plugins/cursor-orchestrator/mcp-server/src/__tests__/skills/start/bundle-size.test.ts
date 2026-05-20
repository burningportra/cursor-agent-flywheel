import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = resolve(__dirname, "../../../../../");
const CEREMONY_MAX_CHARS = 18_000;
describe("cursor-native bundle — start_ceremony size", () => {
  it("source _ceremony.md is under 18k chars", () => {
    const ceremonyPath = resolve(REPO, "skills/start/_ceremony.md");
    const body = readFileSync(ceremonyPath, "utf-8");
    expect(body.length).toBeLessThan(CEREMONY_MAX_CHARS);
  });

  it("cursor-native bundle excludes start_inflight_prompt when dist script exists", () => {
    const distScript = resolve(REPO, "mcp-server/dist/scripts/build-skills-bundle.js");
    if (!existsSync(distScript)) {
      // Built in CI via npm run build; skip when only sources are present.
      return;
    }
    const out = resolve(REPO, "mcp-server/dist/skills.bundle.test.json");
    execFileSync(
      "node",
      [distScript, "--profile", "cursor-native", "--output", out],
      { cwd: resolve(REPO, "mcp-server"), encoding: "utf8" },
    );
    const raw = readFileSync(out, "utf-8");
    expect(raw).not.toContain("agent-flywheel:start_inflight_prompt");
    const bundle = JSON.parse(raw) as { entries: Array<{ name: string; body: string }> };
    const ceremony = bundle.entries.find((e) => e.name === "agent-flywheel:start_ceremony");
    expect(ceremony?.body.length ?? 0).toBeLessThan(CEREMONY_MAX_CHARS);
  });
});
