/**
 * RECOV001 / RECOV002 — recover-gates command contract guards.
 *
 * RECOV001: Ban prose commit/continue prompts in recovery command files.
 * RECOV002: Flag positive instructions to load start_ceremony / start_discover / start body.
 *
 * Applies only to recover-gates command paths. Anti-pattern tables, fallback blocks,
 * and explicit negations (Never / Do not load) are exempt.
 */
const RECOVER_COMMAND_RE = /(?:^|[/\\])(?:recover-gates|flywheel-recover-gates|orchestrate-recover-gates)\.md$/i;
/** Prose gate prompts that must use AskQuestion + MCP gates instead. */
export const RECOV001_PHRASES = [
    "want to commit",
    "should I commit",
    "should I continue",
    /reply with 1\s*\/\s*2\s*\/\s*3/i,
    /reply with \d/i,
];
/** Positive load patterns for bootstrap skills during recovery. */
const RECOV002_PATTERNS = [
    {
        re: /flywheel_get_skill\s*\(\s*\{[^}]*name:\s*["']agent-flywheel:start_ceremony["']/i,
        label: "flywheel_get_skill start_ceremony",
    },
    {
        re: /flywheel_get_skill\s*\(\s*\{[^}]*name:\s*["']agent-flywheel:start_discover["']/i,
        label: "flywheel_get_skill start_discover",
    },
    {
        re: /flywheel_get_skill\s*\(\s*\{[^}]*name:\s*["']agent-flywheel:start["']/i,
        label: "flywheel_get_skill start",
    },
    {
        re: /\bload\s+`start_ceremony`/i,
        label: "load start_ceremony",
    },
    {
        re: /\bload\s+`start_discover`/i,
        label: "load start_discover",
    },
    {
        re: /\bload\s+`start`\s+body/i,
        label: "load start body",
    },
    {
        re: /\bLoad\s+`\/start`\s+for\s+recovery/i,
        label: "Load /start for recovery",
    },
];
function isRecoverCommandFile(filePath) {
    return RECOVER_COMMAND_RE.test(filePath.replace(/\\/g, "/"));
}
function findSectionSpans(source, headingRe) {
    const lines = source.split("\n");
    const spans = [];
    let inSection = false;
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^##\s/.test(line)) {
            if (inSection) {
                spans.push({ startLine, endLine: i });
                inSection = false;
            }
            if (headingRe.test(line)) {
                inSection = true;
                startLine = i + 1;
            }
            continue;
        }
    }
    if (inSection)
        spans.push({ startLine, endLine: lines.length });
    return spans;
}
function inSection(line, spans) {
    return spans.some((s) => line >= s.startLine && line <= s.endLine);
}
function insideBacktickQuote(lineText, index) {
    let backticks = 0;
    for (let i = 0; i < index && i < lineText.length; i++) {
        if (lineText[i] === "`" && (i === 0 || lineText[i - 1] !== "\\"))
            backticks++;
    }
    return backticks % 2 === 1;
}
function isNegativeInstruction(line) {
    if (/\b(Never|Don't|don't|not ad-hoc|forbid)\b/i.test(line))
        return true;
    if (/\bDo\s+\*\*not\*\*/i.test(line))
        return true;
    if (/\bDo not\b/i.test(line))
        return true;
    return false;
}
function isFallbackLine(line) {
    return /\*\*Fallback:\*\*/i.test(line);
}
function compilePhrasePatterns() {
    return RECOV001_PHRASES.map((p) => {
        if (p instanceof RegExp)
            return new RegExp(p.source, p.flags);
        return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    });
}
function scanRecov001(source, filePath) {
    const findings = [];
    const lines = source.split("\n");
    const antiPatternSpans = findSectionSpans(source, /^##\s+Anti-patterns\b/i);
    const compiled = compilePhrasePatterns();
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line1 = lineIdx + 1;
        const lineText = lines[lineIdx];
        if (inSection(line1, antiPatternSpans))
            continue;
        if (isFallbackLine(lineText))
            continue;
        if (isNegativeInstruction(lineText))
            continue;
        for (const re of compiled) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(lineText)) !== null) {
                if (insideBacktickQuote(lineText, m.index)) {
                    if (m.index === re.lastIndex)
                        re.lastIndex++;
                    continue;
                }
                findings.push({
                    ruleId: "RECOV001",
                    severity: "error",
                    file: filePath,
                    line: line1,
                    column: m.index + 1,
                    message: `Prose gate prompt "${m[0]}" is forbidden in recovery commands — use flywheel_*_gate MCP + AskQuestion.`,
                    hint: "Document fallback numbered choices only inside a **Fallback:** line when AskQuestion is unavailable.",
                });
                if (m.index === re.lastIndex)
                    re.lastIndex++;
            }
        }
    }
    return findings;
}
function scanRecov002(source, filePath) {
    const findings = [];
    const lines = source.split("\n");
    const antiPatternSpans = findSectionSpans(source, /^##\s+Anti-patterns\b/i);
    const contextBudgetSpans = findSectionSpans(source, /^##\s+Context budget\b/i);
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line1 = lineIdx + 1;
        const lineText = lines[lineIdx];
        if (inSection(line1, antiPatternSpans))
            continue;
        if (inSection(line1, contextBudgetSpans))
            continue;
        if (isNegativeInstruction(lineText))
            continue;
        if (/\*\*not\*\*\s+`agent-flywheel:start`/i.test(lineText))
            continue;
        if (/~~/.test(lineText))
            continue;
        for (const { re, label } of RECOV002_PATTERNS) {
            re.lastIndex = 0;
            const m = re.exec(lineText);
            if (m === null)
                continue;
            if (insideBacktickQuote(lineText, m.index) && label.startsWith("load "))
                continue;
            findings.push({
                ruleId: "RECOV002",
                severity: "error",
                file: filePath,
                line: line1,
                column: m.index + 1,
                message: `Recovery must not load bootstrap start skills (${label}) — use gate MCP + start_review/start_wrapup on demand.`,
                hint: "See context-budget.mdc Recovery section and the Anti-patterns table in flywheel-recover-gates.md.",
            });
        }
    }
    return findings;
}
export const recov001 = {
    id: "RECOV001",
    description: "Recovery command files must not instruct agents to ask prose commit/continue prompts.",
    severity: "error",
    check(doc, ctx) {
        if (!isRecoverCommandFile(ctx.filePath))
            return [];
        return scanRecov001(doc.source ?? ctx.source, ctx.filePath);
    },
};
export const recov002 = {
    id: "RECOV002",
    description: "Recovery command files must not instruct loading start_ceremony, start_discover, or start body.",
    severity: "error",
    check(doc, ctx) {
        if (!isRecoverCommandFile(ctx.filePath))
            return [];
        return scanRecov002(doc.source ?? ctx.source, ctx.filePath);
    },
};
export const recoverGatesRules = [recov001, recov002];
export default recoverGatesRules;
//# sourceMappingURL=recoverGates.js.map