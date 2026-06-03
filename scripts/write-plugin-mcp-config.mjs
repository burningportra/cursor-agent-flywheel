#!/usr/bin/env node
/**
 * Write mcp.json with an absolute path to the MCP launcher (Cursor resolves
 * relative args from $HOME, not the plugin root).
 *
 * Agent Mail HTTP MCP requires Authorization when the server runs with auth
 * (default). Token is read from MCP_AGENT_MAIL_TOKEN, HTTP_BEARER_TOKEN, or
 * ~/.config/mcp-agent-mail/config.env — never written to git.
 *
 * Usage:
 *   node scripts/write-plugin-mcp-config.mjs [pluginRoot]
 * Default pluginRoot: plugins/cursor-orchestrator (repo) or pass local install path.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
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

/** @returns {string | null} */
async function loadAgentMailBearerToken() {
  const fromEnv = process.env.MCP_AGENT_MAIL_TOKEN?.trim() || process.env.HTTP_BEARER_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const configEnv = path.join(os.homedir(), ".config", "mcp-agent-mail", "config.env");
  try {
    const raw = await fs.readFile(configEnv, "utf8");
    const match = raw.match(/^HTTP_BEARER_TOKEN=(.+)$/m);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }

  const legacyEnv = path.join(os.homedir(), "mcp_agent_mail", ".env");
  try {
    const raw = await fs.readFile(legacyEnv, "utf8");
    const match = raw.match(/^HTTP_BEARER_TOKEN=(.+)$/m);
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }

  return null;
}

const bearerToken = await loadAgentMailBearerToken();
/** @type {Record<string, unknown>} */
const agentMail = {
  type: "http",
  url: "http://127.0.0.1:8765/mcp",
};
if (bearerToken) {
  agentMail.headers = { Authorization: `Bearer ${bearerToken}` };
} else {
  process.stderr.write(
    "write-plugin-mcp-config: HTTP_BEARER_TOKEN not found — agent-mail MCP will 401 until configured (see agent-mail INSTALL.md)\n",
  );
}

const config = {
  mcpServers: {
    "agent-mail": agentMail,
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
console.log(`  agent-mail → ${agentMail.url}${bearerToken ? " (bearer token from local config)" : " (no bearer token)"}`);
