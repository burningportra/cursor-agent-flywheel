#!/usr/bin/env node
/**
 * sessionStart hook: warn if a previous orchestration session exists.
 */
const fs = require("fs");
const path = require("path");

const f = path.join(process.cwd(), ".pi-orchestrator", "checkpoint.json");
if (!fs.existsSync(f)) {
  process.exit(0);
}
try {
  const raw = fs.readFileSync(f, "utf8");
  const e = JSON.parse(raw);
  const s = e.state;
  if (s && s.phase && s.phase !== "idle" && s.phase !== "complete") {
    const goal = s.selectedGoal ? ` goal="${s.selectedGoal}"` : "";
    console.log(
      `⚠️ Previous orchestration session detected: phase=${s.phase}${goal}. Resume with the Orchestrate command or reset with Orchestrate Stop.`
    );
  }
} catch {
  // ignore corrupt checkpoint
}
process.exit(0);
