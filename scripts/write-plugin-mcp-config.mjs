#!/usr/bin/env node
/**
 * Write mcp.json with an absolute path to the MCP launcher (Cursor resolves
 * relative args from $HOME, not the plugin root).
 *
 * Usage:
 *   node scripts/write-plugin-mcp-config.mjs [pluginRoot]
 * Default pluginRoot: plugins/cursor-orchestrator (repo) or pass local install path.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pluginRoot = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "plugins", "cursor-orchestrator"),
);
const launcher = path.join(pluginRoot, "scripts", "start-orchestrator-mcp.cjs");
const targets = [path.join(pluginRoot, "mcp.json")];

const wsMcp = path.join(repoRoot, ".cursor", "mcp.json");
try {
  await fs.access(wsMcp);
  targets.push(wsMcp);
} catch {
  /* no workspace mcp */
}

const config = {
  mcpServers: {
    "agent-mail": {
      url: "http://127.0.0.1:8765/mcp",
    },
    orchestrator: {
      type: "stdio",
      command: "node",
      args: [launcher],
    },
  },
};

for (const mcpPath of targets) {
  await fs.writeFile(mcpPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`write-plugin-mcp-config: ${mcpPath}`);
}
console.log(`  orchestrator → node ${launcher}`);
