/**
 * Recovery context resolver — checkpoint trust, bead scan, and manual fallback.
 * Read-only: never mutates flywheel state.
 */

import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { readBeads } from "./beads.js";
import { readCheckpoint, type ReadCheckpointResult } from "./checkpoint.js";
import { createLogger } from "./logger.js";
import type {
  Bead,
  CheckpointEnvelope,
  FlywheelState,
  RecoverGateContext,
  RecoverGateMode,
  RecoverGateNextAction,
  ToolContext,
} from "./types.js";

const execFileAsync = promisify(execFile);
const log = createLogger("recover-gates");

export const RECOVER_CHECKPOINT_STALE_MS = 24 * 60 * 60 * 1000;
export const RECOVER_BEAD_SCAN_TIMEOUT_MS = 1500;
export const RECOVER_CANDIDATE_CAP = 25;
export const RECOVER_WARNING_CAP = 5;
export const RECOVER_GIT_HEAD_TIMEOUT_MS = 1000;

const RECOVER_PHASES = new Set<FlywheelState["phase"]>([
  "implementing",
  "iterating",
  "reviewing",
]);

export interface RecoverGateResolveArgs {
  beadIds?: string[];
  mode?: RecoverGateMode;
}

export interface RecoverGateCaps {
  checkpointStaleMs?: number;
  beadScanTimeoutMs?: number;
  candidateCap?: number;
  warningCap?: number;
}

export interface CheckpointTrustOpts {
  currentGitHead?: string;
  nowMs?: number;
  checkpointStaleMs?: number;
  knownBeadIds?: Set<string>;
}

export interface CheckpointTrustClassification {
  trusted: boolean;
  confidence: RecoverGateContext["confidence"];
  ageMs: number;
  branchMismatch: boolean;
  warnings: string[];
  phase?: string;
}

function capWarnings(warnings: string[], cap: number): string[] {
  if (warnings.length <= cap) return warnings;
  const trimmed = warnings.slice(0, cap);
  trimmed.push(`warnings truncated (${warnings.length - cap} omitted)`);
  return trimmed;
}

function resolveCaps(caps?: RecoverGateCaps) {
  return {
    checkpointStaleMs: caps?.checkpointStaleMs ?? RECOVER_CHECKPOINT_STALE_MS,
    beadScanTimeoutMs: caps?.beadScanTimeoutMs ?? RECOVER_BEAD_SCAN_TIMEOUT_MS,
    candidateCap: caps?.candidateCap ?? RECOVER_CANDIDATE_CAP,
    warningCap: caps?.warningCap ?? RECOVER_WARNING_CAP,
  };
}

function isSuccessfulBeadResult(status: unknown): boolean {
  return status === "success" || status === "closed";
}

export function extractCheckpointCandidateIds(state: FlywheelState): string[] {
  const ids = new Set<string>();
  const results = state.beadResults ?? {};
  for (const [beadId, result] of Object.entries(results)) {
    const status = (result as { status?: unknown }).status;
    if (isSuccessfulBeadResult(status)) {
      ids.add(beadId);
    }
  }
  for (const beadId of state.activeBeadIds ?? []) {
    const result = results[beadId] as { status?: unknown } | undefined;
    if (result && isSuccessfulBeadResult(result.status)) {
      ids.add(beadId);
    }
  }
  return [...ids];
}

export function classifyCheckpointTrust(
  envelope: CheckpointEnvelope,
  opts: CheckpointTrustOpts = {},
): CheckpointTrustClassification {
  const checkpointStaleMs = opts.checkpointStaleMs ?? RECOVER_CHECKPOINT_STALE_MS;
  const nowMs = opts.nowMs ?? Date.now();
  const ageMs = Math.max(0, nowMs - Date.parse(envelope.writtenAt));
  const warnings: string[] = [];
  const phase = envelope.state.phase;

  let branchMismatch = false;
  if (
    envelope.gitHead &&
    opts.currentGitHead &&
    envelope.gitHead !== opts.currentGitHead
  ) {
    branchMismatch = true;
    warnings.push(
      `branch mismatch: checkpoint gitHead ${envelope.gitHead.slice(0, 7)} ≠ current ${opts.currentGitHead.slice(0, 7)}`,
    );
  }

  if (ageMs > checkpointStaleMs) {
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    warnings.push(`checkpoint is stale (${hours}h old)`);
  }

  if (!RECOVER_PHASES.has(phase)) {
    warnings.push(`checkpoint phase "${phase}" is not a post-implement recovery phase`);
  }

  const candidateIds = extractCheckpointCandidateIds(envelope.state);
  if (candidateIds.length === 0) {
    warnings.push("checkpoint has no successful bead candidates");
  }

  if (opts.knownBeadIds && candidateIds.length > 0) {
    const missing = candidateIds.filter((id) => !opts.knownBeadIds!.has(id));
    if (missing.length > 0) {
      warnings.push(
        `${missing.length} checkpoint candidate bead(s) missing from br list`,
      );
    }
  }

  const trusted =
    warnings.length === 0 &&
    candidateIds.length > 0 &&
    !branchMismatch &&
    ageMs <= checkpointStaleMs &&
    RECOVER_PHASES.has(phase);

  const confidence: RecoverGateContext["confidence"] = trusted
    ? "trusted"
    : warnings.some((w) => w.includes("stale") || w.includes("mismatch"))
      ? "stale"
      : "degraded";

  return {
    trusted,
    confidence: trusted ? "trusted" : confidence,
    ageMs,
    branchMismatch,
    warnings,
    phase,
  };
}

async function readCurrentGitHead(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd, timeout: RECOVER_GIT_HEAD_TIMEOUT_MS },
    );
    const head = stdout.trim();
    return head || undefined;
  } catch {
    return undefined;
  }
}

function capCandidateIds(ids: string[], cap: number): { ids: string[]; truncated: boolean } {
  if (ids.length <= cap) {
    return { ids, truncated: false };
  }
  return { ids: ids.slice(0, cap), truncated: true };
}

export async function scanBeadCandidates(
  ctx: ToolContext,
  opts: { timeoutMs?: number; cap?: number } = {},
): Promise<{ beadIds: string[]; truncated: boolean; warnings: string[] }> {
  const timeoutMs = opts.timeoutMs ?? RECOVER_BEAD_SCAN_TIMEOUT_MS;
  const cap = opts.cap ?? RECOVER_CANDIDATE_CAP;
  const warnings: string[] = [];

  let beads: Bead[];
  try {
    beads = await Promise.race([
      readBeads(ctx.exec, ctx.cwd),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "bead scan failed";
    warnings.push(`Could not read beads: ${message}`);
    return { beadIds: [], truncated: false, warnings };
  }

  const closedIds = beads
    .filter((bead) => bead.status === "closed")
    .map((bead) => bead.id)
    .sort();

  const { ids, truncated } = capCandidateIds(closedIds, cap);
  if (truncated) {
    log.info("candidate cap hit", {
      source: "bead_scan",
      cap,
      totalClosed: closedIds.length,
      candidateCount: ids.length,
    });
    warnings.push(
      `bead scan truncated to ${cap} candidates (${closedIds.length} closed beads)`,
    );
  }

  return { beadIds: ids, truncated, warnings };
}

export function degradeToManual(
  warnings: string[],
  caps?: Pick<RecoverGateCaps, "warningCap">,
): RecoverGateContext {
  const warningCap = caps?.warningCap ?? RECOVER_WARNING_CAP;
  const nextAction: RecoverGateNextAction = {
    type: "ask_for_bead_ids",
    prompt: "Paste bead IDs, run /flywheel-swarm-status, or cancel.",
  };

  return {
    mode: "auto",
    beadIds: [],
    source: "manual_required",
    confidence: "degraded",
    warnings: capWarnings(warnings, warningCap),
    nextAction,
  };
}

function mergeWarnings(
  base: string[],
  extra: string[],
  warningCap: number,
): string[] {
  return capWarnings([...base, ...extra], warningCap);
}

function filterCandidatesToKnown(
  candidateIds: string[],
  knownBeadIds?: Set<string>,
): { beadIds: string[]; warnings: string[] } {
  if (!knownBeadIds) {
    return { beadIds: candidateIds, warnings: [] };
  }
  const filtered = candidateIds.filter((id) => knownBeadIds.has(id));
  const missing = candidateIds.length - filtered.length;
  const warnings =
    missing > 0
      ? [`${missing} checkpoint candidate bead(s) missing from br list`]
      : [];
  return { beadIds: filtered, warnings };
}

async function probeCheckpoint(
  cwd: string,
): Promise<
  | { ok: true; result: ReadCheckpointResult }
  | { ok: false; warnings: string[] }
> {
  const checkpoint = readCheckpoint(cwd);
  if (!checkpoint) {
    return {
      ok: false,
      warnings: ["checkpoint missing or corrupt — ignored"],
    };
  }
  return { ok: true, result: checkpoint };
}

async function probeBeadsForTrust(
  ctx: ToolContext,
  timeoutMs: number,
): Promise<{ knownBeadIds?: Set<string>; warnings: string[] }> {
  try {
    const beads = await Promise.race([
      readBeads(ctx.exec, ctx.cwd),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
    if (beads.length === 0) {
      return {
        warnings: ["bead list empty — skipping checkpoint candidate verification"],
      };
    }
    return { knownBeadIds: new Set(beads.map((b) => b.id)), warnings: [] };
  } catch {
    return {
      warnings: ["bead list unavailable for checkpoint candidate verification"],
    };
  }
}

export async function resolveRecoveryContext(
  ctx: ToolContext,
  args: RecoverGateResolveArgs = {},
  caps?: RecoverGateCaps,
): Promise<RecoverGateContext> {
  const resolvedCaps = resolveCaps(caps);
  const mode = args.mode ?? "auto";
  const explicitIds = (args.beadIds ?? []).filter(Boolean);

  if (explicitIds.length > 0) {
    return {
      mode,
      beadIds: explicitIds,
      source: "explicit_args",
      confidence: "trusted",
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const [checkpointSettled, gitHeadSettled, beadProbeSettled] =
    await Promise.allSettled([
      probeCheckpoint(ctx.cwd),
      readCurrentGitHead(ctx.cwd),
      probeBeadsForTrust(ctx, resolvedCaps.beadScanTimeoutMs),
    ]);

  const currentGitHead =
    gitHeadSettled.status === "fulfilled" ? gitHeadSettled.value : undefined;
  if (gitHeadSettled.status === "rejected") {
    warnings.push("git HEAD probe failed — checkpoint trust unknown");
  }

  let knownBeadIds: Set<string> | undefined;
  if (beadProbeSettled.status === "fulfilled") {
    knownBeadIds = beadProbeSettled.value.knownBeadIds;
    warnings.push(...beadProbeSettled.value.warnings);
  } else {
    warnings.push("bead list unavailable for checkpoint candidate verification");
  }

  if (
    checkpointSettled.status === "fulfilled" &&
    checkpointSettled.value.ok
  ) {
    const { envelope } = checkpointSettled.value.result;
    warnings.push(...(checkpointSettled.value.result.warnings ?? []));

    const trust = classifyCheckpointTrust(envelope, {
      currentGitHead,
      checkpointStaleMs: resolvedCaps.checkpointStaleMs,
      knownBeadIds,
    });
    warnings.push(...trust.warnings);

    const rawCandidates = extractCheckpointCandidateIds(envelope.state);
    const { beadIds: filteredCandidates, warnings: filterWarnings } =
      filterCandidatesToKnown(rawCandidates, knownBeadIds);
    warnings.push(...filterWarnings);

    const { ids, truncated } = capCandidateIds(
      filteredCandidates,
      resolvedCaps.candidateCap,
    );
    if (truncated) {
      log.info("candidate cap hit", {
        source: "checkpoint",
        cap: resolvedCaps.candidateCap,
        totalCandidates: filteredCandidates.length,
        candidateCount: ids.length,
      });
      warnings.push(
        `checkpoint candidates truncated to ${resolvedCaps.candidateCap}`,
      );
    }

    if (trust.confidence === "stale") {
      log.info("stale checkpoint classified", {
        ageMs: trust.ageMs,
        candidateCount: ids.length,
        branchMismatch: trust.branchMismatch,
      });
    }

    if (ids.length > 0) {
      return {
        mode,
        beadIds: ids,
        source: "checkpoint",
        confidence: trust.trusted ? "trusted" : trust.confidence,
        warnings: mergeWarnings(warnings, [], resolvedCaps.warningCap),
        truncated: truncated || undefined,
        requiresConfirmation: !trust.trusted,
        checkpoint: {
          exists: true,
          trusted: trust.trusted,
          phase: trust.phase,
          ageMs: trust.ageMs,
          branchMismatch: trust.branchMismatch,
        },
      };
    }
  } else if (
    checkpointSettled.status === "fulfilled" &&
    !checkpointSettled.value.ok
  ) {
    warnings.push(...checkpointSettled.value.warnings);
  } else if (checkpointSettled.status === "rejected") {
    warnings.push("checkpoint read failed");
  }

  const scan = await scanBeadCandidates(ctx, {
    timeoutMs: resolvedCaps.beadScanTimeoutMs,
    cap: resolvedCaps.candidateCap,
  });
  warnings.push(...scan.warnings);

  if (scan.beadIds.length > 0) {
    log.info("bead scan degraded", {
      candidateCount: scan.beadIds.length,
      truncated: scan.truncated,
    });
    return {
      mode,
      beadIds: scan.beadIds,
      source: "bead_scan",
      confidence: "degraded",
      warnings: mergeWarnings(warnings, [], resolvedCaps.warningCap),
      truncated: scan.truncated || undefined,
      requiresConfirmation: true,
      checkpoint: {
        exists: checkpointSettled.status === "fulfilled" &&
          checkpointSettled.value.ok,
        trusted: false,
      },
    };
  }

  return degradeToManual(warnings, { warningCap: resolvedCaps.warningCap });
}
