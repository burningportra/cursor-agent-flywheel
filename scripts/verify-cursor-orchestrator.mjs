#!/usr/bin/env node
/**
 * Parity check for cursor-orchestrator: plugin commands ↔ .cursor/commands, artifacts, validate-template.
 * Run from repository root: node scripts/verify-cursor-orchestrator.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "plugins", "cursor-orchestrator");
const commandsDir = path.join(pluginRoot, "commands");

/** Upstream flywheel command set (plugin); workspace adds flywheel.md + orchestrate-* aliases. */
const REQUIRED_PLUGIN_COMMANDS = [
  "start",
  "flywheel-setup",
  "flywheel-doctor",
  "flywheel-status",
  "flywheel-swarm",
  "flywheel-recover-gates",
  "recover-gates",
  "flywheel-stop",
  "memory",
];

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
 * (same basenames; symlink to same inode OR byte-identical copy).
 */
async function fileContentMatches(pluginFile, workspaceFile) {
  const [a, b] = await Promise.all([fs.readFile(pluginFile), fs.readFile(workspaceFile)]);
  return a.equals(b);
}

async function assertWorkspaceSlashCommandsParity(pluginStems) {
  const workspaceCommandsDir = path.join(repoRoot, ".cursor", "commands");
  let wsStems;
  try {
    wsStems = await listCommandStems(workspaceCommandsDir);
  } catch {
    console.error(`Missing or unreadable workspace commands directory: ${workspaceCommandsDir}`);
    console.error("Run: node scripts/link-cursor-commands.mjs");
    process.exit(1);
  }

  const pSet = new Set(pluginStems);
  const wSet = new Set(wsStems);
  const onlyPlugin = pluginStems.filter((n) => !wSet.has(n));

  if (onlyPlugin.length > 0) {
    console.error("Slash command parity: present under plugins/cursor-orchestrator/commands but missing in .cursor/commands:");
    console.error(`  ${onlyPlugin.join(", ")}`);
    console.error("Run: node scripts/link-cursor-commands.mjs");
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
      const same = await fileContentMatches(pluginFile, workspaceFile);
      if (!same) {
        console.error(
          `Slash command parity: ${name}.md — workspace file is out of date.\n` +
            `  workspace: ${rpWorkspace}\n  plugin:    ${rpPlugin}\n` +
            "Run: node scripts/link-cursor-commands.mjs",
        );
        process.exit(1);
      }
    }
  }
}

async function ensurePluginMcpConfig() {
  const mcpPath = path.join(pluginRoot, "mcp.json");
  try {
    await fs.access(mcpPath);
    return;
  } catch {
    /* gitignored — install script writes absolute launcher paths per machine */
  }
  const writeScript = path.join(repoRoot, "scripts", "write-plugin-mcp-config.mjs");
  const r = spawnSync(process.execPath, [writeScript, pluginRoot], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("verify: failed to generate plugin mcp.json via write-plugin-mcp-config.mjs");
    process.exit(1);
  }
}

async function main() {
  await assertFile(path.join(pluginRoot, "mcp-server", "package-lock.json"), "mcp-server/package-lock.json");
  await assertFile(path.join(pluginRoot, "mcp-server", "dist", "server.js"), "MCP server dist/server.js");
  await assertFile(path.join(pluginRoot, "scripts", "start-orchestrator-mcp.cjs"), "MCP launcher");
  await ensurePluginMcpConfig();
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
  if (!hooksFile.hooks?.preToolUse?.length) {
    console.error("hooks/hooks.json: expected non-empty preToolUse (agent-mail guard)");
    process.exit(1);
  }
  const endHooks = hooksFile.hooks?.sessionEnd?.length || hooksFile.hooks?.stop?.length;
  if (!endHooks) {
    console.error("hooks/hooks.json: expected sessionEnd or stop for agent-mail reservation release");
    process.exit(1);
  }

  await assertFile(path.join(pluginRoot, "SYNC_MANIFEST.json"), "SYNC_MANIFEST.json");
  await assertFile(
    path.join(pluginRoot, "mcp-server", "dist", "skills.bundle.json"),
    "skills.bundle.json",
  );
  await assertFile(path.join(pluginRoot, "flywheel.config.yaml"), "flywheel.config.yaml");

  const md = await listCommandStems(commandsDir);
  for (const stem of REQUIRED_PLUGIN_COMMANDS) {
    if (!md.includes(stem)) {
      console.error(`Missing required plugin command: ${stem}.md`);
      process.exit(1);
    }
  }

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

  const serverJs = path.join(pluginRoot, "mcp-server", "dist", "server.js");
  const serverSrc = await fs.readFile(serverJs, "utf8");
  const flywheelTools = (serverSrc.match(/name: 'flywheel_/g) ?? []).length;
  if (flywheelTools < 15) {
    console.error(`Expected >= 15 flywheel_* tool definitions in dist/server.js, got ${flywheelTools}`);
    process.exit(1);
  }

  console.log(
    `cursor-orchestrator: lockfile + dist + bundle + SYNC_MANIFEST + hooks (incl. preToolUse) + ${md.length} commands + ${flywheelTools} flywheel_* tools + .cursor/commands parity + validate-template OK`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
