#!/usr/bin/env node
/**
 * sessionStart hook: warn if a previous orchestration session exists.
 */
const fs = require("fs");
const path = require("path");

const cwd = process.cwd();
const candidates = [
  path.join(cwd, ".pi-flywheel", "checkpoint.json"),
  path.join(cwd, ".pi-orchestrator", "checkpoint.json"),
];
const f = candidates.find((p) => fs.existsSync(p));
if (!f) {
  process.exit(0);
}
try {
  const raw = fs.readFileSync(f, "utf8");
  const e = JSON.parse(raw);
  const s = e.state;
  if (s && s.phase && s.phase !== "idle" && s.phase !== "complete") {
    const goal = s.selectedGoal ? ` goal="${s.selectedGoal}"` : "";
    console.log(
      `⚠️ Previous flywheel session detected: phase=${s.phase}${goal}. Resume with /start or /flywheel, or reset with /flywheel-stop.`
    );
  }
} catch {
  // ignore corrupt checkpoint
}
process.exit(0);
