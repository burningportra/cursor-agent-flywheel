#!/usr/bin/env node
/**
 * Local pre-publish gate: same order as CI verification (template + orchestrator + optional MCP build/test).
 * Usage (repo root):
 *   node scripts/publish-gate.mjs
 *   node scripts/publish-gate.mjs --with-mcp
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const repoRoot = process.cwd();
const withMcp = process.argv.includes("--with-mcp");

function run(label, cmd, args, opts = {}) {
  console.log(`\n— ${label} —`);
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (r.status !== 0) {
    console.error(`\npublish-gate: FAILED (${label})`);
    process.exit(r.status ?? 1);
  }
}

run("validate-template", process.execPath, ["scripts/validate-template.mjs"]);
run("verify-cursor-orchestrator", process.execPath, ["scripts/verify-cursor-orchestrator.mjs"]);

if (withMcp) {
  const mcpDir = "plugins/cursor-orchestrator/mcp-server";
  run("mcp-server npm ci", "npm", ["ci"], { cwd: `${repoRoot}/${mcpDir}` });
  run("mcp-server build", "npm", ["run", "build"], { cwd: `${repoRoot}/${mcpDir}` });
  run("mcp-server test", "npm", ["test"], { cwd: `${repoRoot}/${mcpDir}` });
  const drift = spawnSync("git", ["diff", "--exit-code", "--", "plugins/cursor-orchestrator/mcp-server/dist"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (drift.status !== 0) {
    console.error("\npublish-gate: committed mcp-server/dist does not match clean build (--with-mcp)");
    process.exit(1);
  }
}

console.log("\npublish-gate: OK");
