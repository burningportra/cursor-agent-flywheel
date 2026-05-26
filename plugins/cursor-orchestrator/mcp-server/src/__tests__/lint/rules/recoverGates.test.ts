import { describe, it, expect } from "vitest";
import { parse } from "../../../lint/parser.js";
import { recov001, recov002, RECOV001_PHRASES } from "../../../lint/rules/recoverGates.js";
import type { Finding, Rule, RuleContext } from "../../../lint/types.js";

const RECOVER_FILE = "commands/flywheel-recover-gates.md";
const OTHER_FILE = "commands/start.md";

async function run(rule: Rule, source: string, filePath: string): Promise<Finding[]> {
  const doc = await parse(source, filePath);
  return rule.check(doc, { filePath, source: doc.source });
}

describe("RECOV001 phrase dictionary", () => {
  it("exports the planned prose prompt patterns", () => {
    expect(RECOV001_PHRASES.length).toBeGreaterThanOrEqual(4);
  });
});

describe("RECOV001 (recovery prose gate prompts)", () => {
  it("flags want to commit in recovery command prose", async () => {
    const src = `# Recover\n\nAsk the user if they want to commit now.\n`;
    const findings = await run(recov001, src, RECOVER_FILE);
    expect(findings.some((f) => f.ruleId === "RECOV001")).toBe(true);
  });

  it("does not flag recover-gates files outside command paths", async () => {
    const src = `Ask if they want to commit now.\n`;
    const findings = await run(recov001, src, OTHER_FILE);
    expect(findings).toEqual([]);
  });

  it("does not flag Never ask want to commit on the same line", async () => {
    const src = `# Recover\n\n**Never** ask "want to commit?" in prose.\n`;
    const findings = await run(recov001, src, RECOVER_FILE);
    expect(findings).toEqual([]);
  });

  it("does not flag phrases inside the Anti-patterns section", async () => {
    const src = `# Recover\n\n## Anti-patterns\n\n| Don't | Do instead |\n| "Want to commit?" in prose | wrap_up_gate |\n`;
    const findings = await run(recov001, src, RECOVER_FILE);
    expect(findings).toEqual([]);
  });

  it("does not flag fallback numbered-choice guidance", async () => {
    const src = `# Recover\n\n**Fallback:** reply with 1/2/3 only if AskQuestion fails.\n`;
    const findings = await run(recov001, src, RECOVER_FILE);
    expect(findings).toEqual([]);
  });

  it("flags should I continue outside exempt blocks", async () => {
    const src = `# Recover\n\nBefore proceeding, should I continue with wrap-up?\n`;
    const findings = await run(recov001, src, RECOVER_FILE);
    expect(findings.some((f) => /should I continue/i.test(f.message))).toBe(true);
  });
});

describe("RECOV002 (recovery start-skill loads)", () => {
  it("flags flywheel_get_skill start_ceremony in recovery commands", async () => {
    const src = `# Recover\n\nCall flywheel_get_skill({ name: "agent-flywheel:start_ceremony" }) first.\n`;
    const findings = await run(recov002, src, RECOVER_FILE);
    expect(findings.some((f) => f.ruleId === "RECOV002")).toBe(true);
  });

  it("allows start_review on demand", async () => {
    const src = `# Recover\n\nLoad flywheel_get_skill({ name: "agent-flywheel:start_review" }) if needed.\n`;
    const findings = await run(recov002, src, RECOVER_FILE);
    expect(findings).toEqual([]);
  });

  it("does not flag start_ceremony in Anti-patterns Don't column", async () => {
    const src = `# Recover\n\n## Anti-patterns\n\n| Don't | Do instead |\n| Load \`start_ceremony\` body | use recover-gates |\n`;
    const findings = await run(recov002, src, RECOVER_FILE);
    expect(findings).toEqual([]);
  });

  it("does not flag Never rows in Context budget table", async () => {
    const src = `# Recover\n\n## Context budget (recovery)\n\n| Artifact | Load? |\n| start_ceremony body | **Never** |\n`;
    const findings = await run(recov002, src, RECOVER_FILE);
    expect(findings).toEqual([]);
  });

  it("does not flag Do not load start_ceremony prose", async () => {
    const src = `# Recover\n\nDo **not** load \`start_ceremony\` for recovery.\n`;
    const findings = await run(recov002, src, RECOVER_FILE);
    expect(findings).toEqual([]);
  });
});

describe("RECOV rules against shipping recover-gates command files", () => {
  it("flywheel-recover-gates.md passes RECOV001 and RECOV002", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
    const path = join(repoRoot, "commands", "flywheel-recover-gates.md");
    const source = readFileSync(path, "utf8");
    const doc = await parse(source, path);
    const ctx: RuleContext = { filePath: path, source: doc.source };
    expect(recov001.check(doc, ctx)).toEqual([]);
    expect(recov002.check(doc, ctx)).toEqual([]);
  });

  it("recover-gates.md passes RECOV001 and RECOV002", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
    const path = join(repoRoot, "commands", "recover-gates.md");
    const source = readFileSync(path, "utf8");
    const doc = await parse(source, path);
    const ctx: RuleContext = { filePath: path, source: doc.source };
    expect(recov001.check(doc, ctx)).toEqual([]);
    expect(recov002.check(doc, ctx)).toEqual([]);
  });
});
