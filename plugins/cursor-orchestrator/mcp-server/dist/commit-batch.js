import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FindingSchema } from "./types.js";
import { loadFlywheelConfigWithWarnings } from "./flywheel-config.js";
import { createLogger } from "./logger.js";
const log = createLogger("commit-batch");
const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;
const BR_TIMEOUT_MS = 15_000;
const REJECT_REASON = "rejected via batch-review approve/reject gate";
/**
 * Count commits since the batch-review baseline. Uses `git rev-list --count
 * <sha>..HEAD` via execFile (shell-injection-safe — sha is an argv element,
 * not a shell-interpolated string). If `sha` is empty/undefined, returns the
 * total HEAD commit count of the branch. Throws on git failure so callers
 * can decide whether to surface the error or skip the batch-review tick.
 */
export async function countCommitsSinceLastBatchReview(cwd, sha) {
    const args = sha && sha.length > 0
        ? ["rev-list", "--count", `${sha}..HEAD`]
        : ["rev-list", "--count", "HEAD"];
    let stdout;
    try {
        const result = await execFileAsync("git", args, { cwd, timeout: GIT_TIMEOUT_MS });
        stdout = result.stdout;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`git rev-list failed in ${cwd}: ${msg}`);
    }
    const trimmed = stdout.trim();
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) {
        throw new Error(`git rev-list returned non-integer count: "${trimmed}"`);
    }
    return n;
}
/**
 * Resolve commit-batch fresh-eyes threshold for this session.
 *
 * Priority: checkpoint `state.commitBatchThreshold` (incl. explicit `0` to
 * disable) → `FW_COMMIT_BATCH_THRESHOLD` env → `flywheel.config.yaml`
 * `impl_tick.commit_batch_threshold` → `0` (off).
 */
export function resolveCommitBatchThreshold(cwd, state) {
    if (typeof state.commitBatchThreshold === "number"
        && Number.isInteger(state.commitBatchThreshold)
        && state.commitBatchThreshold >= 0) {
        return state.commitBatchThreshold;
    }
    const envRaw = process.env.FW_COMMIT_BATCH_THRESHOLD?.trim();
    if (envRaw !== undefined && envRaw !== "") {
        const n = Number.parseInt(envRaw, 10);
        if (Number.isInteger(n) && n >= 0) {
            return n;
        }
    }
    const fromConfig = loadFlywheelConfigWithWarnings(cwd).config.impl_tick?.commit_batch_threshold;
    if (typeof fromConfig === "number"
        && Number.isInteger(fromConfig)
        && fromConfig >= 0) {
        return fromConfig;
    }
    return 0;
}
/**
 * Pure check: should the coordinator dispatch a batch review now? Returns
 * true iff the feature is enabled (`threshold` is a positive integer) AND
 * the live commit count has reached the threshold.
 *
 * The caller MUST compute `count` from `countCommitsSinceLastBatchReview(cwd,
 * state.lastBatchReviewSha)` and pass it in.
 */
export function shouldTriggerBatchReview(threshold, count) {
    if (!Number.isInteger(threshold) || threshold <= 0) {
        return false;
    }
    return count >= threshold;
}
/** Seed batch-review baseline from cycle start when impl begins counting commits. */
export function ensureBatchReviewBaseline(state, headSha) {
    if (state.lastBatchReviewSha && state.lastBatchReviewSha.length > 0) {
        return state;
    }
    const baseline = state.cycleStartSha ?? headSha;
    if (!baseline) {
        return state;
    }
    return { ...state, lastBatchReviewSha: baseline };
}
/**
 * Record a dispatched batch review against the state. Returns a NEW state
 * object — the input is not mutated. Sets `lastBatchReviewSha` to the
 * snapshot sha (dispatch time, not verdict time — risk #3 in the plan),
 * resets `commitBatchCounter` to 0, and pre-initializes
 * `batchReviewSynthesizedBeads[verdict.sha_range]` to an empty array when
 * the verdict is blocking so the synthesize loop has a record to append to.
 */
/**
 * Mark a batch review as dispatched (baseline advances at dispatch time).
 * Clears re-arm until the verdict is collected via flywheel_review / impl_tick.
 */
export function markBatchReviewDispatched(state, reviewSha, shaRange) {
    return {
        ...state,
        lastBatchReviewSha: reviewSha,
        commitBatchCounter: 0,
        pendingBatchReviewRange: shaRange,
    };
}
/** Clear in-flight batch review after verdict is processed. */
export function clearPendingBatchReview(state) {
    if (state.pendingBatchReviewRange === undefined) {
        return state;
    }
    const next = { ...state };
    delete next.pendingBatchReviewRange;
    return next;
}
export function recordBatchReview(state, sha, verdict) {
    const next = {
        ...state,
        lastBatchReviewSha: sha,
        commitBatchCounter: 0,
    };
    if (verdict.status === "blocking") {
        const existing = state.batchReviewSynthesizedBeads ?? {};
        next.batchReviewSynthesizedBeads = {
            ...existing,
            [verdict.sha_range]: existing[verdict.sha_range] ?? [],
        };
    }
    return next;
}
/**
 * Synthesize one bead per finding via `br create --silent` and record each
 * created ID in `state.batchReviewSynthesizedBeads[range]` immediately so a
 * mid-batch failure leaves a valid partial-rollback record. Mutates the
 * passed `state` (the record is the durable artifact callers rely on for
 * rollback). Throws on the first `br create` failure — callers MUST invoke
 * `rollbackSynthesizedBeads(cwd, state.batchReviewSynthesizedBeads[range])`
 * to clean up the partial set.
 *
 * Every finding is validated against `FindingSchema` before the `br create`
 * shells out; a single invalid finding short-circuits the whole batch (the
 * caller falls back to `needs_attention` mode).
 *
 * All severities synthesize — no filter. (Alignment-check round 2 decision:
 * severity is preserved in the bead description for downstream prioritization
 * via the Approve subset gate.)
 */
export async function synthesizeBeadsFromFindings(cwd, state, findings, range, labels = ['auto-batch-review']) {
    if (!state.batchReviewSynthesizedBeads) {
        state.batchReviewSynthesizedBeads = {};
    }
    if (!state.batchReviewSynthesizedBeads[range]) {
        state.batchReviewSynthesizedBeads[range] = [];
    }
    const created = [];
    for (let i = 0; i < findings.length; i++) {
        const finding = FindingSchema.parse(findings[i]);
        const body = formatFindingBody(finding, range);
        let stdout;
        try {
            const result = await execFileAsync("br", [
                "create",
                "--title", finding.suggested_bead_title,
                "--type", "task",
                "--priority", "2",
                "--description", body,
                "--labels", labels.join(","),
                "--silent",
            ], { cwd, timeout: BR_TIMEOUT_MS });
            stdout = result.stdout;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`br create failed for finding ${i + 1}/${findings.length} (${finding.severity}: ${finding.suggested_bead_title}): ${msg}`);
        }
        const beadId = stdout.trim().split(/\s+/)[0] ?? "";
        if (!beadId) {
            throw new Error(`br create --silent returned empty stdout for finding ${i + 1}/${findings.length}`);
        }
        state.batchReviewSynthesizedBeads[range].push(beadId);
        created.push(beadId);
    }
    return created;
}
/**
 * Tear down auto-synthesized beads when the user picks Reject all (or the
 * rejected subset of Approve subset). Primary path: `br delete <id>
 * --reason "<REJECT_REASON>"`. If delete fails (dependents, tombstone
 * conflict, etc.) the fallback is `br update <id> --status closed
 * --notes "<REJECT_REASON>"` so the graph reflects intent. Never throws —
 * collects per-bead outcomes so the caller can surface partial-failure
 * info to the operator.
 */
export async function rollbackSynthesizedBeads(cwd, beadIds) {
    const deleted = [];
    const closed = [];
    const failed = [];
    for (const id of beadIds) {
        let deletedOk = false;
        try {
            await execFileAsync("br", ["delete", id, "--reason", REJECT_REASON], { cwd, timeout: BR_TIMEOUT_MS });
            deleted.push(id);
            deletedOk = true;
        }
        catch (err) {
            log.warn("br delete failed; will try close fallback", {
                beadId: id,
                err: err instanceof Error ? err.message : String(err),
            });
        }
        if (deletedOk)
            continue;
        try {
            await execFileAsync("br", ["update", id, "--status", "closed", "--notes", REJECT_REASON], { cwd, timeout: BR_TIMEOUT_MS });
            closed.push(id);
        }
        catch (err) {
            log.error("rollback: both delete and close failed", {
                beadId: id,
                err: err instanceof Error ? err.message : String(err),
            });
            failed.push(id);
        }
    }
    return { deleted, closed, failed };
}
function formatFindingBody(finding, range) {
    const files = finding.affected_files.map((f) => `- ${f}`).join("\n");
    return [
        finding.summary,
        "",
        `Found during batch review (sha range ${range}).`,
        "",
        `Severity: ${finding.severity}`,
        "",
        "Affected files:",
        files,
        "",
        "Evidence:",
        finding.evidence_excerpt,
    ].join("\n");
}
//# sourceMappingURL=commit-batch.js.map