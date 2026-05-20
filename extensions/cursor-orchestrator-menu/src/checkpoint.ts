import * as fs from "node:fs";
import * as path from "node:path";

export interface CheckpointSummary {
  exists: boolean;
  phase?: string;
  goal?: string;
  planDocument?: string;
  writtenAt?: string;
}

function checkpointCandidates(root: string): string[] {
  return [
    path.join(root, ".pi-flywheel", "checkpoint.json"),
    path.join(root, ".pi-orchestrator", "checkpoint.json"),
  ];
}

function firstExisting(paths: string[]): string | undefined {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export function readCheckpoint(root: string): CheckpointSummary {
  const p = firstExisting(checkpointCandidates(root));
  if (!p) {
    return { exists: false };
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw) as {
      writtenAt?: string;
      state?: { phase?: string; selectedGoal?: string; planDocument?: string };
    };
    return {
      exists: true,
      phase: j.state?.phase,
      goal: j.state?.selectedGoal,
      planDocument: j.state?.planDocument,
      writtenAt: j.writtenAt,
    };
  } catch {
    return { exists: false };
  }
}

export function deleteCheckpoint(root: string): boolean {
  let removed = false;
  for (const p of checkpointCandidates(root)) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed = true;
      }
    } catch {
      /* continue */
    }
  }
  return removed;
}
