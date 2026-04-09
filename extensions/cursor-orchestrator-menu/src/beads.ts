import { execFileSync } from "node:child_process";

export interface BeadRow {
  id: string;
  title: string;
  status: string;
  priority?: number;
}

/** Returns [] if br is missing or JSON parse fails. */
export function listBeads(cwd: string, limit = 40): BeadRow[] {
  try {
    const out = execFileSync("br", ["list", "--json"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 15000,
    });
    const rows = JSON.parse(out) as BeadRow[];
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.slice(0, limit);
  } catch {
    return [];
  }
}
