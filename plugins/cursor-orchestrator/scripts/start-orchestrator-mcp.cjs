#!/usr/bin/env node
/**
 * Launches the orchestrator MCP stdio server with cwd = plugin root so
 * mcp-server/dist/server.js resolves reliably.
 *
 * Path resolution (plugin-packaged MCP):
 * - Cursor is expected to spawn `node` with args pointing at this file. Relative args
 *   in plugin-root `mcp.json` (e.g. `./scripts/start-orchestrator-mcp.cjs`) assume the
 *   IDE uses the plugin directory as the spawn cwd; if not, set ORCHESTRATOR_PLUGIN_ROOT.
 * - This script always resolves the plugin root from __dirname (…/scripts → parent)
 *   or from ORCHESTRATOR_PLUGIN_ROOT, then execs dist/server.js with cwd = plugin root.
 *
 * Debug: ORCHESTRATOR_MCP_DEBUG=1 logs cwd, __dirname, and resolved paths to stderr.
 *
 * Orchestration state (.pi-orchestrator/) is per tool `cwd` in MCP requests, not process.cwd.
 */
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

function pluginRoot() {
  if (process.env.ORCHESTRATOR_PLUGIN_ROOT) {
    return path.resolve(process.env.ORCHESTRATOR_PLUGIN_ROOT);
  }
  return path.resolve(__dirname, "..");
}

const root = pluginRoot();
const serverJs = path.join(root, "mcp-server", "dist", "server.js");

if (process.env.ORCHESTRATOR_MCP_DEBUG === "1") {
  console.error(
    "[orchestrator-mcp] debug cwd=%s __dirname=%s ORCHESTRATOR_PLUGIN_ROOT=%s resolvedRoot=%s serverJs=%s",
    process.cwd(),
    __dirname,
    process.env.ORCHESTRATOR_PLUGIN_ROOT ?? "(unset)",
    root,
    serverJs,
  );
}

if (!fs.existsSync(serverJs)) {
  console.error(
    `[orchestrator-mcp] Missing ${serverJs}. From ${root}, run: cd mcp-server && npm ci && npm run build`,
  );
  process.exit(1);
}

const child = spawn(process.execPath, [serverJs], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
