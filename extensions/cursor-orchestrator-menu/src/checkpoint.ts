import * as fs from "node:fs";
import * as path from "node:path";

export interface CheckpointSummary {
  exists: boolean;
  phase?: string;
  goal?: string;
  planDocument?: string;
  writtenAt?: string;
}

export function readCheckpoint(root: string): CheckpointSummary {
  const p = path.join(root, ".pi-orchestrator", "checkpoint.json");
  try {
    if (!fs.existsSync(p)) {
      return { exists: false };
    }
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
  const p = path.join(root, ".pi-orchestrator", "checkpoint.json");
  try {
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
