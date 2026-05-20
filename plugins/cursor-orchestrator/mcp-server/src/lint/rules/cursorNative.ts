/**
 * CUR001 — Cursor-native skill slices must not embed AskUserQuestion JSON.
 */

import type { Document, Finding, Rule, RuleContext } from "../types.js";

export const cur001: Rule = {
  id: "CUR001",
  description:
    "In *.cursor.md files, forbid AskUserQuestion( blocks; use AskQuestion + gate MCP instead.",
  severity: "error",
  check(doc: Document, ctx: RuleContext): Finding[] {
    if (!ctx.filePath.endsWith(".cursor.md")) return [];
    if (!/AskUserQuestion\s*\(/.test(doc.source)) return [];
    return [
      {
        ruleId: "CUR001",
        severity: "error",
        file: ctx.filePath,
        line: 1,
        column: 1,
        message:
          "AskUserQuestion JSON blocks are forbidden in .cursor.md — use AskQuestion tables and gate MCP askQuestion payloads.",
      },
    ];
  },
};

export const cursorNativeRules: Rule[] = [cur001];
