import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CHECKPOINT_DIR,
  CHECKPOINT_FILE,
  computeStateHash,
} from "../checkpoint.js";
import {
  RECOVER_BEAD_SCAN_TIMEOUT_MS,
  RECOVER_CANDIDATE_CAP,
  RECOVER_CHECKPOINT_STALE_MS,
  classifyCheckpointTrust,
  degradeToManual,
  extractCheckpointCandidateIds,
  resolveRecoveryContext,
  scanBeadCandidates,
} from "../recover-gates.js";
import type { Bead, CheckpointEnvelope, FlywheelState, ToolContext } from "../types.js";
import { createMockExec, makeState } from "./helpers/mocks.js";
import { invalidateBeadCache } from "../beads.js";

const BR_LIST_ARGS = [
  "list",
  "--json",
  "--fields",
  "id,title,description,status,priority,issue_type,labels,estimate,parent,created_at,updated_at,closed_at",
  "--deferred",
];

function makeBead(id: string, status: Bead["status"] = "closed"): Bead {
  return {
    id,
    title: "Test bead",
    description: "desc",
    status,
    priority: 2,
    type: "task",
    labels: [],
  };
}

function makeEnvelope(
  state: FlywheelState,
  overrides: Partial<CheckpointEnvelope> = {},
): CheckpointEnvelope {
  const envelope: CheckpointEnvelope = {
    schemaVersion: 1,
    writtenAt: new Date().toISOString(),
    flywheelVersion: "3.20.0",
    gitHead: "aaa111bbb222ccc333ddd444eee555666777888999000",
    state,
    stateHash: "",
    ...overrides,
  };
  envelope.stateHash = computeStateHash(envelope.state);
  return envelope;
}

function writeCheckpoint(cwd: string, envelope: CheckpointEnvelope): void {
  const dir = join(cwd, CHECKPOINT_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, CHECKPOINT_FILE), JSON.stringify(envelope, null, 2));
}

function makeCtx(
  execCalls: Parameters<typeof createMockExec>[0] = [],
  stateOverrides: Partial<FlywheelState> = {},
  cwd?: string,
): ToolContext {
  return {
    exec: createMockExec(execCalls),
    cwd: cwd ?? "/fake/project",
    state: makeState(stateOverrides),
    saveState: () => {},
    clearState: () => {},
  };
}

describe("recover-gates", () => {
  let tempDir: string;

  afterEach(() => {
    invalidateBeadCache();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  beforeEach(() => {
    invalidateBeadCache();
  });

  describe("classifyCheckpointTrust", () => {
    it("marks fresh matching checkpoint as trusted", () => {
      const state = makeState({
        phase: "implementing",
        beadResults: {
          "tb-1": { beadId: "tb-1", status: "success", summary: "done" },
        },
      });
      const envelope = makeEnvelope(state);
      const result = classifyCheckpointTrust(envelope, {
        currentGitHead: envelope.gitHead,
        nowMs: Date.parse(envelope.writtenAt) + 1000,
        knownBeadIds: new Set(["tb-1"]),
      });
      expect(result.trusted).toBe(true);
      expect(result.confidence).toBe("trusted");
      expect(result.branchMismatch).toBe(false);
    });

    it("marks checkpoint older than 24h as stale", () => {
      const state = makeState({
        phase: "implementing",
        beadResults: {
          "tb-1": { beadId: "tb-1", status: "success", summary: "done" },
        },
      });
      const writtenAt = new Date(Date.now() - RECOVER_CHECKPOINT_STALE_MS - 60_000).toISOString();
      const envelope = makeEnvelope(state, { writtenAt });
      const result = classifyCheckpointTrust(envelope, {
        currentGitHead: envelope.gitHead,
        nowMs: Date.now(),
        knownBeadIds: new Set(["tb-1"]),
      });
      expect(result.trusted).toBe(false);
      expect(result.confidence).toBe("stale");
      expect(result.warnings.some((w) => w.includes("stale"))).toBe(true);
    });

    it("marks branch mismatch as stale", () => {
      const state = makeState({
        phase: "implementing",
        beadResults: {
          "tb-1": { beadId: "tb-1", status: "success", summary: "done" },
        },
      });
      const envelope = makeEnvelope(state);
      const result = classifyCheckpointTrust(envelope, {
        currentGitHead: "different-head-sha-0000000000000000000000000000000000",
        knownBeadIds: new Set(["tb-1"]),
      });
      expect(result.trusted).toBe(false);
      expect(result.branchMismatch).toBe(true);
      expect(result.confidence).toBe("stale");
    });
  });

  describe("extractCheckpointCandidateIds", () => {
    it("collects success and legacy closed beadResults", () => {
      const state = makeState({
        beadResults: {
          "tb-a": { beadId: "tb-a", status: "success", summary: "ok" },
          "tb-b": { status: "closed", reviewPasses: 1 } as never,
        },
      });
      expect(extractCheckpointCandidateIds(state).sort()).toEqual(["tb-a", "tb-b"]);
    });
  });

  describe("degradeToManual", () => {
    it("returns manual_required with capped warnings and nextAction", () => {
      const warnings = Array.from({ length: 8 }, (_, i) => `warn-${i}`);
      const result = degradeToManual(warnings, { warningCap: 5 });
      expect(result.source).toBe("manual_required");
      expect(result.confidence).toBe("degraded");
      expect(result.warnings.length).toBeLessThanOrEqual(6);
      expect(result.nextAction?.type).toBe("ask_for_bead_ids");
    });
  });

  describe("scanBeadCandidates", () => {
    it("returns closed beads capped at RECOVER_CANDIDATE_CAP", async () => {
      const beads = Array.from({ length: 30 }, (_, i) =>
        makeBead(`tb-${i}`, "closed"),
      );
      const ctx = makeCtx([
        {
          cmd: "br",
          args: BR_LIST_ARGS,
          result: { code: 0, stdout: JSON.stringify({ issues: beads }), stderr: "" },
        },
      ]);

      const result = await scanBeadCandidates(ctx, { cap: RECOVER_CANDIDATE_CAP });
      expect(result.beadIds).toHaveLength(RECOVER_CANDIDATE_CAP);
      expect(result.truncated).toBe(true);
      expect(result.warnings.some((w) => w.includes("truncated"))).toBe(true);
    });

    it("returns empty beadIds when br list times out", async () => {
      vi.useFakeTimers();
      const ctx = makeCtx([]);
      ctx.exec = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, RECOVER_BEAD_SCAN_TIMEOUT_MS + 100));
        return { code: 0, stdout: JSON.stringify({ issues: [] }), stderr: "" };
      }) as ToolContext["exec"];

      const pending = scanBeadCandidates(ctx, { timeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(60);
      const result = await pending;
      expect(result.beadIds).toEqual([]);
      expect(result.warnings.some((w) => w.includes("Could not read beads"))).toBe(true);
    });
  });

  describe("resolveRecoveryContext", () => {
    it("returns explicit_args without checkpoint or br list probes", async () => {
      const exec = vi.fn(async () => ({
        code: 1,
        stdout: "",
        stderr: "should not be called",
      }));
      const ctx: ToolContext = {
        ...makeCtx([]),
        exec,
      };

      const result = await resolveRecoveryContext(ctx, {
        beadIds: ["tb-1", "tb-2"],
      });
      expect(result.source).toBe("explicit_args");
      expect(result.confidence).toBe("trusted");
      expect(result.beadIds).toEqual(["tb-1", "tb-2"]);
      expect(exec).not.toHaveBeenCalled();
    });

    it("returns trusted checkpoint candidates when envelope is fresh and beads exist", async () => {
      tempDir = mkdtempSync(join(tmpdir(), "recover-gates-trusted-"));
      const state = makeState({
        phase: "implementing",
        beadResults: {
          "cursor-agent-flywheel-31n": {
            beadId: "cursor-agent-flywheel-31n",
            status: "success",
            summary: "done",
          },
        },
      });
      const envelope = makeEnvelope(state, {
        gitHead: "16ede83abc123def4567890123456789012345678",
      });
      writeCheckpoint(tempDir, envelope);

      const ctx = makeCtx(
        [
          {
            cmd: "br",
            args: BR_LIST_ARGS,
            result: {
              code: 0,
              stdout: JSON.stringify({
                issues: [makeBead("cursor-agent-flywheel-31n", "closed")],
              }),
              stderr: "",
            },
          },
          {
            cmd: "git",
            args: ["rev-parse", "HEAD"],
            result: {
              code: 0,
              stdout: "16ede83abc123def4567890123456789012345678\n",
              stderr: "",
            },
          },
        ],
        {},
        tempDir,
      );

      const result = await resolveRecoveryContext(ctx, { beadIds: [] });
      expect(result.source).toBe("checkpoint");
      expect(result.confidence).toBe("trusted");
      expect(result.beadIds).toEqual(["cursor-agent-flywheel-31n"]);
    });

    it("falls through to bead_scan when checkpoint is corrupt", async () => {
      tempDir = mkdtempSync(join(tmpdir(), "recover-gates-corrupt-"));
      const dir = join(tempDir, CHECKPOINT_DIR);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, CHECKPOINT_FILE), "{not-json", "utf8");

      const ctx = makeCtx(
        [
          {
            cmd: "br",
            args: BR_LIST_ARGS,
            result: {
              code: 0,
              stdout: JSON.stringify({ issues: [makeBead("tb-scan-1")] }),
              stderr: "",
            },
          },
          {
            cmd: "git",
            args: ["rev-parse", "HEAD"],
            result: { code: 0, stdout: "abc\n", stderr: "" },
          },
        ],
        {},
        tempDir,
      );

      const result = await resolveRecoveryContext(ctx, { beadIds: [] });
      expect(result.source).toBe("bead_scan");
      expect(result.beadIds).toEqual(["tb-scan-1"]);
      expect(result.warnings.some((w) => w.includes("corrupt"))).toBe(true);
    });

    it("returns manual_required when checkpoint and bead scan both fail", async () => {
      tempDir = mkdtempSync(join(tmpdir(), "recover-gates-manual-"));
      const ctx = makeCtx(
        [
          {
            cmd: "br",
            args: BR_LIST_ARGS,
            result: { code: 1, stdout: "", stderr: "br down" },
          },
          {
            cmd: "git",
            args: ["rev-parse", "HEAD"],
            result: { code: 1, stdout: "", stderr: "not a repo" },
          },
        ],
        {},
        tempDir,
      );

      const result = await resolveRecoveryContext(ctx, { beadIds: [] });
      expect(result.source).toBe("manual_required");
      expect(result.confidence).toBe("degraded");
      expect(result.beadIds).toEqual([]);
      expect(result.nextAction?.type).toBe("ask_for_bead_ids");
    });
  });
});
