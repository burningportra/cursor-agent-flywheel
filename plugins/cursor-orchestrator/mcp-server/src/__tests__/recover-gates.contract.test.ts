/**
 * recover-gates P6 — structural contract on shipping command files.
 * Prevents doc drift: On error table, mutual-exclusion note, data.actions mapping,
 * and RECOV001/RECOV002 banned-prose guards.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { parse } from "../lint/parser.js";
import { recov001, recov002 } from "../lint/rules/recoverGates.js";

const WAVE_REVIEW_ACTION_KEYS = [
  "looks-good-all",
  "self-review",
  "fresh-eyes",
  "duel-review",
] as const;

const ON_ERROR_CODES = [
  "invalid_input",
  "unsupported_action",
  "not_found",
  "cli_failure",
  "wave_review_bead_pick_required",
  "idempotentReplay: true",
  "wrap_up_already_confirmed",
  'recoverySource: "manual_required"',
] as const;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const COMMAND_FILES = [
  "commands/recover-gates.md",
  "commands/flywheel-recover-gates.md",
] as const;

function readCommand(relativePath: string): { path: string; source: string } {
  const path = join(REPO_ROOT, relativePath);
  return { path, source: readFileSync(path, "utf8") };
}

describe("recover-gates command-file contract", () => {
  describe.each(COMMAND_FILES)("%s", (relativePath) => {
    it("contains ## On error section", () => {
      const { source } = readCommand(relativePath);
      expect(source).toMatch(/^## On error$/m);
    });

    it("contains mutual-exclusion note for --gates-only and --wrap-up-only", () => {
      const { source } = readCommand(relativePath);
      expect(source).toMatch(/Mutually exclusive flags/i);
      expect(source).toMatch(/--gates-only/);
      expect(source).toMatch(/--wrap-up-only/);
      expect(source).toMatch(/cannot combine/i);
    });

    it("references data.actions for gate option mapping", () => {
      const { source } = readCommand(relativePath);
      expect(source).toMatch(/data\.actions/);
    });

    it("documents every wave-review action key", () => {
      const { source } = readCommand(relativePath);
      for (const key of WAVE_REVIEW_ACTION_KEYS) {
        expect(source, `missing action key ${key}`).toContain(key);
      }
    });

    it("On error table includes required error codes", () => {
      const { source } = readCommand(relativePath);
      const onErrorIdx = source.indexOf("## On error");
      expect(onErrorIdx).toBeGreaterThanOrEqual(0);
      const onErrorSection = source.slice(onErrorIdx);
      for (const code of ON_ERROR_CODES) {
        expect(onErrorSection, `missing error code ${code}`).toContain(code);
      }
    });

    it("passes RECOV001 (no banned prose gate prompts)", async () => {
      const { path, source } = readCommand(relativePath);
      const doc = await parse(source, path);
      expect(recov001.check(doc, { filePath: path, source: doc.source })).toEqual([]);
    });

    it("passes RECOV002 (no bootstrap skill loads)", async () => {
      const { path, source } = readCommand(relativePath);
      const doc = await parse(source, path);
      expect(recov002.check(doc, { filePath: path, source: doc.source })).toEqual([]);
    });
  });

  it("compact recover-gates.md maps options via data.actions[optionId]", () => {
    const { source } = readCommand("commands/recover-gates.md");
    expect(source).toMatch(/data\.actions\[optionId\]/);
  });

  it("compact and full command files share On error table rows", () => {
    const compact = readCommand("commands/recover-gates.md").source;
    const full = readCommand("commands/flywheel-recover-gates.md").source;

    for (const code of ON_ERROR_CODES) {
      expect(compact).toContain(code);
      expect(full).toContain(code);
    }
  });
});
