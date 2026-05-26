/**
 * Cursor flywheel user gates — numbered options + MCP confirm payloads.
 * Replaces Claude `AskUserQuestion` for review, wrap-up, and post-impl flows.
 */
import { createLogger } from "./logger.js";
import { CompactGatePayloadSchema, } from "./types.js";
export { CompactGatePayloadSchema } from "./types.js";
const log = createLogger("cursor-user-gates");
/** Short action keys — map in skills/start/_review.md and _wrapup.md. */
export function gateActionsFromOptions(gate) {
    return Object.fromEntries(gate.options.map((o) => [o.id, o.action]));
}
/** MCP payload without duplicating options/coordinatorAction (saves ~80% JSON vs full userGate). */
export function toCompactGatePayload(gate) {
    const payload = {
        gateMeta: {
            kind: gate.kind,
            title: gate.title,
            rationale: gate.rationale,
            beadIds: gate.beadIds,
            riskyBeadIds: gate.riskyBeadIds,
        },
        askQuestion: buildAskQuestionFromGate(gate),
        actions: gateActionsFromOptions(gate),
    };
    const parsed = CompactGatePayloadSchema.safeParse(payload);
    if (!parsed.success) {
        log.warn("compact gate payload failed schema validation", {
            kind: gate.kind,
            issues: parsed.error.issues,
        });
    }
    return payload;
}
export function buildAskQuestionFromGate(gate) {
    const needsBeadFollowUp = gate.options.some((o) => /reply with bead id/i.test(o.detail ?? o.label));
    const prompt = [
        gate.rationale,
        needsBeadFollowUp
            ? "If you pick Self review or Fresh-eyes, reply in chat with one bead id after submitting this form."
            : "",
    ]
        .filter(Boolean)
        .join("\n\n");
    return {
        title: gate.title,
        questions: [
            {
                id: gate.kind,
                prompt,
                options: gate.options.map((o) => ({
                    id: o.id,
                    label: o.label,
                    description: o.detail,
                })),
            },
        ],
    };
}
const RISKY_LABEL_RE = /security|auth|crypto|secret|permission|migration|breaking-change/i;
export function isRiskyBead(bead, state) {
    if (bead.priority === 0)
        return true;
    const text = `${bead.title} ${bead.description} ${(bead.labels ?? []).join(" ")}`;
    if (RISKY_LABEL_RE.test(text))
        return true;
    const result = state.beadResults?.[bead.id];
    if (result?.status === "partial")
        return true;
    return false;
}
/** Step 8 wave-completion gate (after all impl agents in a wave report back). */
export function buildWaveReviewGate(beads, state) {
    const ids = beads.map((b) => b.id);
    const risky = beads.filter((b) => isRiskyBead(b, state)).map((b) => b.id);
    const multi = beads.length > 1;
    const idList = ids.join(", ");
    const options = multi
        ? [
            {
                id: "1",
                label: "Looks good — accept all",
                detail: `Mark ${ids.length} beads reviewed and advance`,
                action: "looks-good-all",
                coordinatorAction: `For each bead in [${idList}]: flywheel_review({ action: "looks-good", beadId })`,
            },
            {
                id: "2",
                label: "Self review",
                detail: "Send the original implementor back to audit its diff (one bead — reply with bead id)",
                action: "self-review",
                coordinatorAction: "Follow skills/start/_review.md §8 self-review; then flywheel_review looks-good for that bead",
            },
            {
                id: "3",
                label: "Fresh-eyes review",
                detail: "5 parallel reviewers on one bead (reply with bead id)",
                action: "fresh-eyes",
                coordinatorAction: 'flywheel_review({ action: "hit-me", beadId: "<id>" }) then spawn reviewers per _review.md',
            },
        ]
        : [
            {
                id: "1",
                label: "Looks good",
                detail: "Accept and advance",
                action: "looks-good-all",
                coordinatorAction: `flywheel_review({ action: "looks-good", beadId: "${ids[0]}" })`,
            },
            {
                id: "2",
                label: "Self review",
                detail: "Same implementor re-reads its diff",
                action: "self-review",
                coordinatorAction: `Follow _review.md §8 self-review for ${ids[0]}`,
            },
            {
                id: "3",
                label: "Fresh-eyes",
                detail: "5 parallel independent reviewers",
                action: "fresh-eyes",
                coordinatorAction: `flywheel_review({ action: "hit-me", beadId: "${ids[0]}" })`,
            },
        ];
    if (risky.length > 0) {
        options.push({
            id: String(options.length + 1),
            label: "Duel review (risky bead)",
            detail: `Adversarial review for: ${risky.join(", ")} — /dueling-idea-wizards`,
            action: "duel-review",
            coordinatorAction: "Invoke dueling-idea-wizards per _review.md §8.0a (security vs reliability mode)",
        });
    }
    return {
        kind: "wave_review",
        title: multi
            ? `Wave complete — review ${ids.length} beads`
            : `Bead ${ids[0]} complete — review`,
        rationale: [
            multi
                ? `All ${ids.length} implement agents reported done: ${idList}.`
                : `Implement agent finished ${ids[0]}.`,
            risky.length > 0
                ? `Risky bead(s) detected (${risky.join(", ")}) — duel review is available.`
                : "No high-risk signals — standard review menu is enough.",
            "Do not skip to commit or wrap-up until the user picks a review option.",
        ].join(" "),
        options,
        beadIds: ids,
        riskyBeadIds: risky.length > 0 ? risky : undefined,
        instructions: [
            "Cursor: call AskQuestion with outcome.askQuestion (clickable UI). Do not ask the user to type 1/2/3 in prose.",
            "After the user submits AskQuestion, map option id to coordinatorAction. Never ask 'want to commit?' in free text.",
            "When the bead queue is empty after review, call flywheel_wrap_up_gate({ cwd }).",
        ].join(" "),
    };
}
/** Step 9.5 wrap-up gate — commit / docs / version bump. */
export function buildWrapUpGate(opts) {
    const { uncommittedCount, uncommittedPreview, beadCommitCount } = opts;
    const strayHint = uncommittedCount > 0
        ? `${uncommittedCount} uncommitted path(s) in the tree (e.g. ${uncommittedPreview.slice(0, 3).join(", ")}).`
        : "Working tree is clean aside from any intentional WIP.";
    return {
        kind: "wrap_up",
        title: "Flywheel wrap-up",
        rationale: [
            "Implementation and review phases are done — choose how to land the work.",
            strayHint,
            beadCommitCount != null
                ? `~${beadCommitCount} bead commit(s) from this session (see git log).`
                : "",
        ]
            .filter(Boolean)
            .join(" "),
        options: [
            {
                id: "1",
                label: "Full wrap-up (recommended)",
                detail: "Review commits, update docs, version bump, rebuild",
                action: "wrap-up-full",
                coordinatorAction: "Read skills/start/_wrapup.md Step 9.5 — full path (sub-steps 1–7)",
            },
            {
                id: "2",
                label: "Commit only",
                detail: "Commit/push strays — skip docs and version bump",
                action: "wrap-up-commit-only",
                coordinatorAction: "Read _wrapup.md — Commit only branch (sub-steps 1, 3, 7)",
            },
            {
                id: "3",
                label: "Skip wrap-up",
                detail: "Leave tree as-is; proceed to learnings / post-flywheel menu",
                action: "wrap-up-skip",
                coordinatorAction: "Read _wrapup.md Step 10+ without commit sub-steps",
            },
        ],
        instructions: [
            "Cursor: call AskQuestion with outcome.askQuestion (clickable UI). Do not ask the user to type 1/2/3 in prose.",
            'On option 1 or 2, follow _wrapup.md — sub-choices also use AskQuestion when available.',
            "After wrap-up, read _wrapup.md Steps 10–12 for CASS and post-flywheel menu.",
        ].join(" "),
    };
}
/** Batch review auto-synthesized beads — approve / reject gate. */
export function buildBatchReviewSynthesizedGate(beadCount) {
    return {
        kind: "wrap_up_verdict",
        title: "Batch review — synthesized beads",
        rationale: `${beadCount} bead(s) were created from blocking fresh-eyes findings.`,
        options: [
            {
                id: "1",
                label: "Approve all",
                detail: "Merge every bead into the active wave",
                action: "synthesized-approve-all",
                coordinatorAction: "Merge bead IDs into state.activeBeadIds; continue impl tick",
            },
            {
                id: "2",
                label: "Approve subset",
                detail: "Multi-select which beads to keep",
                action: "synthesized-approve-subset",
                coordinatorAction: "Rollback unchosen via rollbackSynthesizedBeads",
            },
            {
                id: "3",
                label: "Reject all",
                detail: "Roll back every synthesized bead",
                action: "synthesized-reject-all",
                coordinatorAction: "rollbackSynthesizedBeads for the sha range",
            },
            {
                id: "4",
                label: "Regress to plan",
                detail: "Findings need plan-level rework",
                action: "synthesized-regress-plan",
                coordinatorAction: "Return to planning Step 5.6",
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion. On approve, re-call flywheel_impl_tick to dispatch new beads.",
    };
}
/** Step 9.5.0 outcome grading verdict gate. */
export function buildWrapUpVerdictGate(verdict) {
    const status = verdict.status;
    const base = verdict.explanation ?? `Grader status: ${status}`;
    if (status === "satisfied") {
        return {
            kind: "wrap_up_verdict",
            title: "Outcome grading — satisfied",
            rationale: base,
            options: [
                {
                    id: "1",
                    label: "Continue to wrap-up",
                    detail: "Proceed to commit review and landing",
                    action: "continue-wrap-up",
                    coordinatorAction: "flywheel_wrap_up_gate({ cwd })",
                },
                {
                    id: "2",
                    label: "Abort cycle",
                    detail: "Stop before wrap-up",
                    action: "abort",
                    coordinatorAction: "Stop; do not call wrap_up_gate",
                },
            ],
            instructions: "User accepted the rubric verdict. Call flywheel_wrap_up_gate next unless they pick Abort.",
        };
    }
    if (status === "failed") {
        return {
            kind: "wrap_up_verdict",
            title: "Outcome grading — failed",
            rationale: base,
            options: [
                {
                    id: "1",
                    label: "Abort",
                    detail: "Stop the cycle",
                    action: "abort",
                    coordinatorAction: "End flywheel run",
                },
            ],
            instructions: "Do not proceed to wrap-up. Hint: fix rubric.md and re-run flywheel_grade_outcome({ force: true }).",
        };
    }
    if (status === "max_iterations_reached") {
        return {
            kind: "wrap_up_verdict",
            title: "Outcome grading — iteration cap reached",
            rationale: base,
            options: [
                {
                    id: "1",
                    label: "Accept anyway",
                    detail: "Continue wrap-up with final failing verdict recorded",
                    action: "continue-wrap-up",
                    coordinatorAction: "flywheel_wrap_up_gate({ cwd })",
                },
                {
                    id: "2",
                    label: "Abort",
                    detail: "Stop before commit review or wrap-up",
                    action: "abort",
                    coordinatorAction: "End flywheel run",
                },
            ],
            instructions: "Iterate is not available at the cap. Cursor: AskQuestion with data.askQuestion.",
        };
    }
    // needs_revision / partial
    return {
        kind: "wrap_up_verdict",
        title: "Outcome grading — needs revision",
        rationale: base,
        options: [
            {
                id: "1",
                label: "Iterate — create remediation beads",
                detail: "One bead per failing criterion (recommended)",
                action: "iterate-remediate",
                coordinatorAction: 'flywheel_approve_beads({ action: "remediate", ... }) per _wrapup.md',
            },
            {
                id: "2",
                label: "Accept anyway",
                detail: "Continue wrap-up; verdict stays on record",
                action: "continue-wrap-up",
                coordinatorAction: "flywheel_wrap_up_gate({ cwd }) per _wrapup.md",
            },
            {
                id: "3",
                label: "Abort",
                detail: "Stop before commit review or wrap-up",
                action: "abort",
                coordinatorAction: "End flywheel run",
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion. On Iterate, remediate beads then Step 6; on Accept anyway, continue wrap-up.",
    };
}
/** Step 6 — first menu after beads exist (review / polish / reject). */
export function buildBeadReviewGate(beadCount) {
    return {
        kind: "bead_review",
        title: "Review implementation beads",
        rationale: [
            `${beadCount} open bead(s) are ready for review.`,
            "Pick whether to refine the bead graph, score and launch, or reject and restart.",
            "Do not spawn implement Tasks until the launch gate confirms Launch.",
        ].join(" "),
        options: [
            {
                id: "1",
                label: "Start implementing",
                detail: "Score beads and show the launch confirmation gate (recommended)",
                action: "bead-score-and-launch-gate",
                coordinatorAction: 'flywheel_bead_approval_gate({ cwd, step: "launch" }) then AskQuestion',
            },
            {
                id: "2",
                label: "Polish further",
                detail: "Refine bead titles, descriptions, and dependencies before launch",
                action: "bead-polish",
                coordinatorAction: 'flywheel_approve_beads({ action: "polish" }) then flywheel_bead_approval_gate({ step: "review" })',
            },
            {
                id: "3",
                label: "Reject",
                detail: "Discard these beads and return to goal selection",
                action: "abort",
                coordinatorAction: 'flywheel_approve_beads({ action: "reject" })',
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion. On Start, call flywheel_bead_approval_gate step=launch — not flywheel_approve_beads start yet.",
    };
}
/** Step 6 — launch confirmation when quality ≥ 0.75 and no hotspot override. */
export function buildBeadLaunchGate(opts) {
    const { qualityScore, beadCount, convergencePct } = opts;
    const q = (qualityScore * 100).toFixed(0);
    const conv = convergencePct != null ? ` Convergence ${convergencePct.toFixed(0)}%.` : "";
    return {
        kind: "bead_launch",
        title: "Launch implementation",
        rationale: [
            `Quality score ${q}/100.${conv}`,
            `${beadCount} bead(s) passed the 0.75 threshold.`,
            "Confirm launch before Step 7 (impl models, commit-batch, flywheel_approve_beads start).",
        ].join(" "),
        options: [
            {
                id: "1",
                label: "Launch",
                detail: `Start implementing ${beadCount} bead(s) with agents (recommended)`,
                action: "bead-launch",
                coordinatorAction: "Step 7: flywheel_confirm_impl_models → commit-batch AskQuestion → flywheel_approve_beads({ action: \"start\" })",
            },
            {
                id: "2",
                label: "Polish more",
                detail: "Another refinement round on the bead graph",
                action: "bead-polish",
                coordinatorAction: 'flywheel_approve_beads({ action: "polish" }) then flywheel_bead_approval_gate({ step: "review" })',
            },
            {
                id: "3",
                label: "Back to plan",
                detail: "Return to plan refinement (Step 5.6) before implementing",
                action: "bead-back-to-plan",
                coordinatorAction: "Re-enter planning; do not call approve start",
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion. Only on Launch call flywheel_approve_beads action=start.",
    };
}
/** Step 6 — quality below 0.75. */
export function buildBeadLowQualityGate(opts) {
    const q = (opts.qualityScore * 100).toFixed(0);
    return {
        kind: "bead_low_quality",
        title: "Bead quality below threshold",
        rationale: [
            `Quality score ${q}/100 — below the 0.75 launch threshold.`,
            opts.weakSummary || "Review weak beads in br list before launching.",
        ].join(" "),
        options: [
            {
                id: "1",
                label: "Polish beads",
                detail: "Run another bead refinement round (recommended)",
                action: "bead-polish",
                coordinatorAction: 'flywheel_approve_beads({ action: "polish" }) then flywheel_bead_approval_gate({ step: "review" })',
            },
            {
                id: "2",
                label: "Back to plan",
                detail: "Refine the plan itself (Step 5.6)",
                action: "bead-back-to-plan",
                coordinatorAction: "Return to planning gate — do not launch",
            },
            {
                id: "3",
                label: "Launch anyway",
                detail: "Proceed despite low score — note the risk in your summary",
                action: "bead-launch-anyway",
                coordinatorAction: "Step 7 pre-loop then flywheel_approve_beads({ action: \"start\" })",
            },
            {
                id: "4",
                label: "Reject",
                detail: "Discard beads and pick a new goal",
                action: "abort",
                coordinatorAction: 'flywheel_approve_beads({ action: "reject" })',
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion.",
    };
}
/** Step 6 — shared-file contention across ready beads. */
export function buildBeadHotspotGate(matrixSummary) {
    return {
        kind: "bead_hotspot",
        title: "Launch mode — file contention",
        rationale: [
            "Shared-write contention detected across ready beads.",
            matrixSummary,
            "Pick a launch mode before Step 7.",
        ].join(" "),
        options: [
            {
                id: "1",
                label: "Coordinator-serial",
                detail: "One bead at a time through the coordinator — contention-safe (recommended)",
                action: "bead-coordinator-serial",
                coordinatorAction: 'Set launchMode coordinator-serial; Step 7 single Task loop; flywheel_approve_beads({ action: "start" })',
            },
            {
                id: "2",
                label: "Swarm anyway",
                detail: "Parallel agents — accept contention risk",
                action: "bead-swarm-launch",
                coordinatorAction: 'Step 7 parallel Tasks; flywheel_approve_beads({ action: "start" })',
            },
            {
                id: "3",
                label: "Polish beads",
                detail: "Refine beads to remove overlapping file scope",
                action: "bead-polish",
                coordinatorAction: 'flywheel_approve_beads({ action: "polish" }) then flywheel_bead_approval_gate({ step: "review" })',
            },
            {
                id: "4",
                label: "Reject",
                detail: "Discard beads and return to goal selection",
                action: "abort",
                coordinatorAction: 'flywheel_approve_beads({ action: "reject" })',
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion.",
    };
}
/** Step 5.5 — plan section coverage check. */
export function buildBeadCoverageGate(opts) {
    const missing = opts.missingSections.length > 0
        ? ` Missing: ${opts.missingSections.slice(0, 5).join("; ")}${opts.missingSections.length > 5 ? "…" : ""}.`
        : "";
    return {
        kind: "bead_coverage",
        title: "Plan–bead coverage",
        rationale: `Plan coverage ${opts.covered}/${opts.total} sections.${missing}`,
        options: [
            {
                id: "1",
                label: "All covered",
                detail: "Every plan section has at least one bead — proceed to dedup",
                action: "continue-wrap-up",
                coordinatorAction: 'flywheel_bead_approval_gate({ cwd, step: "dedup" })',
            },
            {
                id: "2",
                label: "Create catch-up beads",
                detail: "Generate beads for missing section(s) (recommended when gaps exist)",
                action: "bead-coverage-create",
                coordinatorAction: "br create per missing section, then re-run coverage gate",
            },
            {
                id: "3",
                label: "Sections out of scope",
                detail: "Mark missing sections deferred in the plan, then dedup",
                action: "bead-coverage-defer",
                coordinatorAction: "Append ## Deferred to plan, then step=dedup",
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion.",
    };
}
/** Step 5.5 — deduplication sweep. */
export function buildBeadDedupGate(pairCount) {
    const list = pairCount > 0
        ? `${pairCount} overlap pair(s) flagged — resolve before Step 6.`
        : "No overlaps detected — proceed to bead review gate.";
    return {
        kind: "bead_dedup",
        title: "Bead deduplication",
        rationale: list,
        options: [
            {
                id: "1",
                label: "None found",
                detail: "No real overlaps — proceed to Step 6 review gate (recommended when scan is empty)",
                action: "continue-wrap-up",
                coordinatorAction: 'flywheel_bead_approval_gate({ cwd, step: "review" })',
            },
            {
                id: "2",
                label: "Merge all",
                detail: "Combine each pair into the canonical richer bead",
                action: "bead-dedup-merge-all",
                coordinatorAction: "br update + br close duplicates, then step=review",
            },
            {
                id: "3",
                label: "Review per-pair",
                detail: "Go through each pair in chat before merging",
                action: "bead-dedup-review-pairs",
                coordinatorAction: "User picks per pair, then step=review",
            },
            {
                id: "4",
                label: "Keep separate",
                detail: "Pairs are distinct — add rationale to each description",
                action: "bead-dedup-keep",
                coordinatorAction: 'flywheel_bead_approval_gate({ cwd, step: "review" })',
            },
        ],
        instructions: "Cursor: AskQuestion with data.askQuestion.",
    };
}
//# sourceMappingURL=cursor-user-gates.js.map