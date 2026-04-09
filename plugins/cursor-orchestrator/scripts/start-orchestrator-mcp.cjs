#!/usr/bin/env node
/**
 * Launches the orchestrator MCP server with cwd set to the plugin root so
 * relative paths inside the server resolve consistently.
 */
const path = require("path");
const { spawn } = require("child_process");

const pluginRoot = path.resolve(__dirname, "..");
const serverJs = path.join(pluginRoot, "mcp-server", "dist", "server.js");

const child = spawn(process.execPath, [serverJs], {
  cwd: pluginRoot,
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
