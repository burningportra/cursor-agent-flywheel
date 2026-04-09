#!/usr/bin/env node
/**
 * Parity check for cursor-orchestrator: 19 commands, plugin artifacts, validate-template.
 * Run from repository root: node scripts/verify-cursor-orchestrator.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "plugins", "cursor-orchestrator");
const commandsDir = path.join(pluginRoot, "commands");

async function assertFile(absPath, label) {
  try {
    const st = await fs.stat(absPath);
    if (!st.isFile()) {
      console.error(`${label} is not a file: ${absPath}`);
      process.exit(1);
    }
  } catch {
    console.error(`Missing ${label}: ${absPath}`);
    process.exit(1);
  }
}

async function readJson(absPath, label) {
  const raw = await fs.readFile(absPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    console.error(`Invalid JSON (${label}): ${absPath}`);
    process.exit(1);
  }
}

/** @param {string} dir */
async function listCommandStems(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(
      (e) =>
        e.name.endsWith(".md") &&
        !e.isDirectory() &&
        (e.isFile() || e.isSymbolicLink()),
    )
    .map((e) => e.name.replace(/\.md$/, ""))
    .sort();
}

/**
 * Repo-root `.cursor/commands` must mirror `plugins/cursor-orchestrator/commands`
 * (same basenames; each pair should resolve to the same real path — symlinks OK).
 */
async function assertWorkspaceSlashCommandsParity(pluginStems) {
  const workspaceCommandsDir = path.join(repoRoot, ".cursor", "commands");
  let wsStems;
  try {
    wsStems = await listCommandStems(workspaceCommandsDir);
  } catch {
    console.error(`Missing or unreadable workspace commands directory: ${workspaceCommandsDir}`);
    console.error("Add symlinks from .cursor/commands/<name>.md → plugins/cursor-orchestrator/commands/<name>.md");
    process.exit(1);
  }

  const pSet = new Set(pluginStems);
  const wSet = new Set(wsStems);
  const onlyPlugin = pluginStems.filter((n) => !wSet.has(n));
  const onlyWorkspace = wsStems.filter((n) => !pSet.has(n));

  if (onlyPlugin.length > 0 || onlyWorkspace.length > 0) {
    if (onlyPlugin.length > 0) {
      console.error("Slash command parity: present under plugins/cursor-orchestrator/commands but missing in .cursor/commands:");
      console.error(`  ${onlyPlugin.join(", ")}`);
    }
    if (onlyWorkspace.length > 0) {
      console.error("Slash command parity: present under .cursor/commands but missing in plugins/cursor-orchestrator/commands:");
      console.error(`  ${onlyWorkspace.join(", ")}`);
    }
    process.exit(1);
  }

  for (const name of pluginStems) {
    const pluginFile = path.join(pluginRoot, "commands", `${name}.md`);
    const workspaceFile = path.join(workspaceCommandsDir, `${name}.md`);
    let rpPlugin;
    let rpWorkspace;
    try {
      rpPlugin = await fs.realpath(pluginFile);
      rpWorkspace = await fs.realpath(workspaceFile);
    } catch (e) {
      console.error(`Slash command parity: could not resolve paths for ${name}.md — ${e}`);
      process.exit(1);
    }
    if (rpPlugin !== rpWorkspace) {
      console.error(
        `Slash command parity: ${name}.md — workspace file resolves to:\n  ${rpWorkspace}\n` +
          `but plugin file resolves to:\n  ${rpPlugin}\n` +
          "Expected the same real path (use symlinks from .cursor/commands to the plugin commands).",
      );
      process.exit(1);
    }
  }
}

async function main() {
  await assertFile(path.join(pluginRoot, "mcp-server", "package-lock.json"), "mcp-server/package-lock.json");
  await assertFile(path.join(pluginRoot, "mcp-server", "dist", "server.js"), "MCP server dist/server.js");
  await assertFile(path.join(pluginRoot, "scripts", "start-orchestrator-mcp.cjs"), "MCP launcher");
  await assertFile(path.join(pluginRoot, "mcp.json"), "plugin mcp.json");
  const mcpMeta = await readJson(path.join(pluginRoot, "mcp.json"), "mcp.json");
  if (!mcpMeta || typeof mcpMeta !== "object") {
    console.error("plugin mcp.json must be a JSON object");
    process.exit(1);
  }
  const servers = mcpMeta.mcpServers;
  if (!servers || typeof servers !== "object") {
    console.error("plugin mcp.json: missing mcpServers");
    process.exit(1);
  }
  const agentMail = servers["agent-mail"];
  if (
    !agentMail ||
    typeof agentMail.url !== "string" ||
    (!agentMail.url.startsWith("http://") && !agentMail.url.startsWith("https://"))
  ) {
    console.error(
      'plugin mcp.json: agent-mail must use Cursor-style { "url": "http://..." } (remote MCP)',
    );
    process.exit(1);
  }
  const orch = servers.orchestrator;
  if (!orch || orch.type !== "stdio") {
    console.error('plugin mcp.json: orchestrator must include "type": "stdio"');
    process.exit(1);
  }
  if (orch.command !== "node") {
    console.error("plugin mcp.json: orchestrator.command must be node");
    process.exit(1);
  }
  if (!Array.isArray(orch.args) || orch.args.length < 1) {
    console.error("plugin mcp.json: orchestrator.args must be a non-empty array");
    process.exit(1);
  }
  const launcherArg = orch.args[0];
  if (typeof launcherArg !== "string" || !launcherArg.includes("start-orchestrator-mcp.cjs")) {
    console.error(
      "plugin mcp.json: orchestrator.args[0] must reference start-orchestrator-mcp.cjs",
    );
    process.exit(1);
  }

  await assertFile(path.join(pluginRoot, "hooks", "hooks.json"), "hooks/hooks.json");
  const hooksFile = await readJson(path.join(pluginRoot, "hooks", "hooks.json"), "hooks/hooks.json");
  if (hooksFile.version !== 1) {
    console.error(`hooks/hooks.json: expected version 1, got ${hooksFile.version}`);
    process.exit(1);
  }
  if (!hooksFile.hooks?.sessionStart?.length || !hooksFile.hooks?.postToolUse?.length) {
    console.error("hooks/hooks.json: expected non-empty sessionStart and postToolUse");
    process.exit(1);
  }

  const md = await listCommandStems(commandsDir);

  if (md.length === 0) {
    console.error(`No .md command files under ${commandsDir}`);
    process.exit(1);
  }

  await assertWorkspaceSlashCommandsParity(md);

  const validate = spawnSync(process.execPath, ["scripts/validate-template.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (validate.status !== 0) {
    process.exit(validate.status ?? 1);
  }

  console.log(
    `cursor-orchestrator: lockfile + dist + launcher + mcp.json (url+stdio) + hooks + ${md.length} commands + .cursor/commands parity + validate-template OK`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
