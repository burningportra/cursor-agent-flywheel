#!/usr/bin/env node
/**
 * Mirror plugins/cursor-orchestrator/commands → .cursor/commands
 * and create orchestrate-* back-compat aliases → flywheel-* / start.
 *
 * Default: copy real files (Cursor often does not list symlinked .md in / menu).
 * Pass --symlink for legacy symlink layout.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "plugins", "cursor-orchestrator");
const pluginCmd = path.join(pluginRoot, "commands");
const pluginRules = path.join(pluginRoot, "rules");
const wsCmd = path.join(repoRoot, ".cursor", "commands");
const wsRules = path.join(repoRoot, ".cursor", "rules");

const useSymlink = process.argv.includes("--symlink");

const ORCHESTRATE_ALIASES = [
  ["orchestrate-setup", "flywheel-setup"],
  ["orchestrate-status", "flywheel-status"],
  ["orchestrate-healthcheck", "flywheel-healthcheck"],
  ["orchestrate-research", "flywheel-research"],
  ["orchestrate-scan", "flywheel-scan"],
  ["orchestrate-fix", "flywheel-fix"],
  ["orchestrate-audit", "flywheel-audit"],
  ["orchestrate-drift-check", "flywheel-drift-check"],
  ["orchestrate-swarm", "flywheel-swarm"],
  ["orchestrate-swarm-status", "flywheel-swarm-status"],
  ["orchestrate-swarm-stop", "flywheel-swarm-stop"],
  ["orchestrate-recover-gates", "flywheel-recover-gates"],
  ["orchestrate-stop", "flywheel-stop"],
  ["orchestrate-rollback", "flywheel-rollback"],
  ["orchestrate-cleanup", "flywheel-cleanup"],
  ["orchestrate-tool-feedback", "flywheel-tool-feedback"],
  ["orchestrate-refine-skill", "flywheel-refine-skill"],
  ["orchestrate-refine-skills", "flywheel-refine-skills"],
  ["orchestrate", "start"],
];

function patchCommandName(markdown, commandName) {
  const stem = commandName.replace(/\.md$/, "");
  if (!markdown.startsWith("---\n")) {
    return markdown;
  }
  const end = markdown.indexOf("\n---", 4);
  if (end < 0) {
    return markdown;
  }
  const body = markdown.slice(end + 4);
  const front = markdown.slice(4, end);
  const lines = front.split("\n");
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith("name:")) {
      found = true;
      return `name: ${stem}`;
    }
    return line;
  });
  if (!found) {
    next.unshift(`name: ${stem}`);
  }
  return `---\n${next.join("\n")}\n---${body}`;
}

async function installFile(src, dest, { commandName } = {}) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.unlink(dest);
  } catch {
    /* absent */
  }
  if (useSymlink) {
    const rel = path.relative(path.dirname(dest), src);
    await fs.symlink(rel, dest);
    return;
  }
  let content = await fs.readFile(src, "utf8");
  const destName = commandName ?? path.basename(dest);
  if (destName !== path.basename(src)) {
    content = patchCommandName(content, destName);
  }
  await fs.writeFile(dest, content, "utf8");
}

async function main() {
  await fs.mkdir(wsCmd, { recursive: true });

  const entries = await fs.readdir(pluginCmd, { withFileTypes: true });
  let commandCount = 0;
  for (const ent of entries) {
    if (!ent.name.endsWith(".md")) continue;
    const src = path.join(pluginCmd, ent.name);
    const dest = path.join(wsCmd, ent.name);
    await installFile(src, dest);
    commandCount += 1;
  }
  for (const [orch, target] of ORCHESTRATE_ALIASES) {
    const src = path.join(pluginCmd, `${target}.md`);
    const dest = path.join(wsCmd, `${orch}.md`);
    await installFile(src, dest, { commandName: `${orch}.md` });
  }

  let ruleCount = 0;
  try {
    const rules = await fs.readdir(pluginRules, { withFileTypes: true });
    for (const ent of rules) {
      if (!ent.isFile() || !ent.name.endsWith(".mdc")) continue;
      const src = path.join(pluginRules, ent.name);
      const dest = path.join(wsRules, ent.name);
      await installFile(src, dest);
      ruleCount += 1;
    }
  } catch {
    /* no rules dir */
  }

  const mode = useSymlink ? "symlink" : "copy";
  console.log(
    `link-cursor-commands: OK (${mode}: ${commandCount} commands + ${ORCHESTRATE_ALIASES.length} orchestrate aliases + ${ruleCount} rules)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
