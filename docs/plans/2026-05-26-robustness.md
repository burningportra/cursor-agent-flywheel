# Robustness plan: recover-gates + post-implement gate UX

**Perspective:** Robustness - load degradation, stale checkpoint handling, idempotent gate confirmation, CI coverage, and observability for dropped post-implement gates.

**Date:** 2026-05-26  
**Project:** `/Volumes/1tb/Projects/cursor-agent-flywheel`  
**Scope:** `/recover-gates`, `/flywheel-recover-gates`, `flywheel_wave_review_gate`, `flywheel_wrap_up_gate`, compact `AskQuestion` payloads, and context-budget recovery paths.

**Companion plan:** [`docs/plans/2026-05-26-ergonomics.md`](./2026-05-26-ergonomics.md) owns naming, copy, discoverability, and human menu clarity. This plan owns failure modes, invariants, degradation behavior, and verification.

**Non-goals:** Replacing the existing gate tools, bypassing `AskQuestion`, loading `/start` during recovery, changing outcome-grader semantics, changing NTM legacy behavior, or adding a broad new orchestration state machine.

---

## Executive summary

Recover-gates is a safety rail for the moment when implementation has finished but the coordinator skipped the mandatory post-implement gates. The happy path is already mostly present: gate tools return compact `{ gateMeta, askQuestion, actions }`, the short `/recover-gates` command avoids ceremony, and wrap-up confirmation is tracked in checkpoint state.

The robustness gaps are around retries and degraded state:

| Failure class | Current risk | Robustness target |
|---|---|---|
| Stale checkpoint | Recovery may infer bead IDs from an old branch or old run | Never auto-select stale checkpoint candidates without a warning and confirmation |
| Duplicate gate confirm | Retried `confirmAction` / `confirmWrapUp` can bump epoch repeatedly or re-surface spawn work | Gate confirmations are idempotent by resolution key |
| Empty / huge bead graph | Recovery falls back to broad `br list` or a manual prompt | Candidate inference is capped, structured, and degrades to one manual ID prompt |
| MCP / CLI failure | `br` or checkpoint parse errors can derail the recovery command | Explicit degraded envelope with next safe action, not a crash or context dump |
| Context bloat | Agents may read ceremony/start/large JSON to recover one gate | Commands and tests enforce compact gate-only recovery |
| Low observability | Hard to tell whether recovery used args, checkpoint, or bead scan | Structured `recovery` metadata, logs, and observe hints explain the chosen path |

Recommended ship order:

1. Add recovery context and stale-checkpoint classification.
2. Make wave-review and wrap-up confirmations idempotent.
3. Harden load degradation and manual fallback surfaces.
4. Add CI assertions and observability hints.
5. Align command docs with the new structured behavior.

Estimated effort: 2-4 days across 6 implementation beads.

---

## Current-state findings

### What is solid

- `plugins/cursor-orchestrator/mcp-server/src/cursor-user-gates.ts` already centralizes compact gate payload generation through `toCompactGatePayload`.
- `plugins/cursor-orchestrator/mcp-server/src/tools/user-gate.ts` already records steering for wave-review and wrap-up confirmations through `recordGateSteering`.
- `plugins/cursor-orchestrator/mcp-server/src/checkpoint.ts` validates checkpoint hashes and moves corrupt files aside instead of throwing.
- `plugins/cursor-orchestrator/mcp-server/src/tools/observe.ts` follows the right degradation pattern: idempotent, non-mutating, capped probes, and `hints[]` instead of hard failure.
- `plugins/cursor-orchestrator/commands/recover-gates.md` is intentionally compact and context-budget compliant.

### What is fragile

- `plugins/cursor-orchestrator/commands/flywheel-recover-gates.md` asks the agent to read checkpoint and run `br list --json` directly. That is useful as a human playbook, but it gives agents a path to over-read and mis-infer stale state.
- `flywheel_wave_review_gate` rejects empty `beadIds`, but does not return a compact candidate set to help recovery.
- Multi-bead self-review and fresh-eyes confirmations require `reviewBeadId`. If a user repeats a selection or the model loses the follow-up bead ID, recovery can bounce without a structured next step.
- `flywheel_wrap_up_gate` returns an `askQuestion` payload even when `state.wrapUpConfirmed && !force`; that is retry-safe in state, but confusing in UX because the response says already confirmed while still carrying a menu-shaped payload.
- `recordGateSteering` bumps `coordinatorEpoch` on every confirmation call. A duplicate confirm should not look like a new operator decision.

---

## Robustness principles

1. **Explicit args beat inference.** If the user passes bead IDs, do not read checkpoint or scan beads.
2. **Stale state is advisory, never silent.** If checkpoint age, branch, hash, or phase is suspicious, the tool may suggest candidates but must mark them as untrusted.
3. **Retried confirms are safe.** Repeating the same gate confirmation should not duplicate epoch bumps, bead closure work, or Task dispatch instructions.
4. **Degrade to smaller surfaces.** Under load or tool failure, return a compact degraded result and one next action, not a broad JSON dump or full `/start` path.
5. **Checkpoint remains additive.** Any new state fields are optional, capped, and compatible with old checkpoints.
6. **MCP output is the source of truth.** Chat copy and command docs describe behavior; gate tools enforce it.
7. **Observe, don't surprise.** Recovery should leave enough structured breadcrumbs to debug what happened without increasing normal chat context.

---

## Target behavior

### Recovery decision flow

```text
User invokes /recover-gates [args]
  -> parse flags and explicit bead IDs
  -> if IDs present: call wave gate directly
  -> else call compact recovery-context resolver
      -> args > trusted checkpoint > recent bead scan > manual ID prompt
  -> call exactly one gate by default
  -> AskQuestion(data.askQuestion)
  -> map selection through data.actions
  -> confirm with idempotency key
  -> if queue empty and user asked full chain, then wrap-up gate
```

### Degraded outcomes

| Condition | Tool behavior | Coordinator behavior |
|---|---|---|
| Corrupt checkpoint | Ignore checkpoint, report `checkpoint.trusted=false`, include warning | Use explicit args or manual bead ID prompt |
| Checkpoint branch mismatch | Candidates marked `requiresConfirmation=true` | Ask before using inferred IDs |
| Checkpoint older than 24h | Candidates marked stale, not authoritative | Prefer args / live bead scan |
| `br list` fails | Return `beads.unavailable=true` with first error excerpt | Ask user to paste bead IDs |
| Candidate count exceeds cap | Return top capped candidates plus `truncated=true` | Ask user to narrow IDs |
| Duplicate confirm | Return `idempotentReplay=true` and prior resolution metadata | Do not re-spawn reviewers or re-prompt |
| Wrap-up already confirmed | Return `kind: "wrap_up_already_confirmed"` without a fresh menu unless `force=true` | Load `start_wrapup` only if continuing chosen branch |

---

## Proposed technical design

### 1. Recovery context resolver

Create a small resolver used by the recovery command path and gate tooling. It should be a pure helper first, not a large new orchestrator.

Proposed file:

- `plugins/cursor-orchestrator/mcp-server/src/recover-gates.ts`

Core contract:

```typescript
interface RecoverGateContext {
  mode: "review" | "wrap_up" | "gates_only" | "auto";
  beadIds: string[];
  source: "explicit_args" | "checkpoint" | "bead_scan" | "manual_required";
  confidence: "trusted" | "stale" | "degraded";
  warnings: string[];
  truncated?: boolean;
  checkpoint?: {
    exists: boolean;
    trusted: boolean;
    phase?: string;
    ageMs?: number;
    branchMismatch?: boolean;
  };
}
```

The helper should:

- Accept parsed command arguments, current `ToolContext`, and optional caps.
- Use `readCheckpoint(cwd)` instead of direct file reads.
- Treat checkpoint candidates as trusted only when validation passed, branch/head are compatible, and age is within threshold.
- Use `readBeads` with existing field-limited behavior, then cap candidate rows before returning.
- Never throw for checkpoint or bead CLI failures; return `manual_required` with warnings.

Expose the helper in one of two ways:

1. Preferred minimal path: `flywheel_wave_review_gate({ beadIds: [] })` returns `suggestedBeadIds` and recovery metadata instead of a plain `invalid_input` when the caller is a recovery command.
2. If the input contract must remain strict: add `flywheel_recover_gate_context` as a compact read-only MCP tool.

Use option 1 if it can stay clean; use option 2 if overloading `wave_review_gate` makes normal errors ambiguous.

### 2. Idempotent gate confirmations

Add a capped gate-resolution ledger to checkpoint state.

Proposed optional field in `FlywheelState`:

```typescript
gateResolutions?: Array<{
  key: string;
  kind: "wave_review" | "wrap_up";
  actionId: string;
  beadIds?: string[];
  reviewBeadId?: string;
  coordinatorEpoch: number;
  resolvedAt: string;
}>;
```

Key derivation:

```text
sha256(kind | actionId | sorted beadIds | reviewBeadId | planDocument? | selectedGoal?)
```

Rules:

- Check the ledger before calling `recordGateSteering`.
- If key exists, return a success envelope with `idempotentReplay: true` and do not bump epoch.
- For `looks-good-all`, still reconcile bead status idempotently if needed, but do not append another steering event.
- For `fresh-eyes` and `self-review`, include a `dispatchKey` in the response. If replayed, mark it as replay so the coordinator does not spawn duplicate reviewers without an explicit user choice.
- Cap the ledger at 20 entries, matching `steeringEvents`.

### 3. Wrap-up already-confirmed shape

Change `runWrapUpGate` retry behavior:

- Current behavior: returns compact wrap-up gate payload plus `wrapUpConfirmed: true`.
- Target behavior: returns a compact non-menu payload:

```typescript
{
  kind: "wrap_up_already_confirmed",
  wrapUpConfirmed: true,
  confirmedAction?: "full" | "commit_only" | "skip",
  nextSkill: "agent-flywheel:start_wrapup",
  forceHint: "Pass force=true to re-open the wrap-up menu."
}
```

This avoids presenting a second `AskQuestion` after the user already chose. Preserve `force=true` for intentional re-prompting.

### 4. Load degradation caps

Add constants near the resolver, aligned with `observe.ts` style:

```typescript
const RECOVER_CHECKPOINT_STALE_MS = 24 * 60 * 60 * 1000;
const RECOVER_BEAD_SCAN_TIMEOUT_MS = 1500;
const RECOVER_CANDIDATE_CAP = 25;
const RECOVER_WARNING_CAP = 5;
```

Expected behavior:

- Use `Promise.allSettled` where checkpoint and bead probes can be independent.
- Return at most 25 candidate IDs and at most 5 warning strings.
- Never include full bead descriptions in recovery payloads.
- Prefer IDs, titles, statuses, and source metadata only.
- If cap is hit, require explicit bead IDs before wave review confirmation.

### 5. Observability

Add structured breadcrumbs without increasing chat context:

- Logger: `createLogger("recover-gates")`
- Gate payload metadata:
  - `gateMeta.recoverySource`
  - `gateMeta.recoveryConfidence`
  - `gateMeta.idempotencyKey` when confirming
  - `gateMeta.idempotentReplay` when applicable
- `steeringEvents` or `gateResolutions` entries for confirmed gates only.
- `flywheel_observe` hint when:
  - phase is `implementing` or `iterating`
  - closed/success bead candidates exist
  - no recent wave-review steering event exists
  - wrap-up is not confirmed

The hint should be one line:

```text
Post-implement gate may be pending. Run /recover-gates or pass explicit bead IDs.
```

---

## Implementation units

### U1. Recovery context resolver

**Goal:** Centralize bead ID inference, checkpoint trust classification, load caps, and degraded fallback.

**Files:**

- Create: `plugins/cursor-orchestrator/mcp-server/src/recover-gates.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/tools/user-gate.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/types.ts`
- Test: `plugins/cursor-orchestrator/mcp-server/src/__tests__/recover-gates.test.ts`
- Test: `plugins/cursor-orchestrator/mcp-server/src/__tests__/tools/user-gate.test.ts`

**Approach:**

- Build a pure resolver that returns `RecoverGateContext`.
- Use `readCheckpoint` for validation and warnings.
- Use `readBeads` only when explicit bead IDs are absent and checkpoint candidates are missing or untrusted.
- Treat branch/head mismatch as stale, not fatal.
- Return `manual_required` when candidates cannot be inferred safely.

**Test scenarios:**

- Happy path: explicit `["tb-1", "tb-2"]` returns source `explicit_args` and performs no bead scan.
- Happy path: valid checkpoint with `beadResults.success` returns source `checkpoint`.
- Edge case: corrupt checkpoint returns warning and falls through to bead scan.
- Edge case: branch mismatch marks checkpoint candidates `stale`.
- Error path: `br list` failure returns `manual_required`, not an exception.
- Load path: 200 closed beads returns capped candidates with `truncated=true`.

**Verification:**

- Recovery with explicit IDs does not read checkpoint or invoke `br list`.
- Recovery without IDs produces a compact structured payload with no full bead descriptions.

### U2. Idempotent wave-review confirmations

**Goal:** Retried `confirmAction` calls should be safe and observable.

**Files:**

- Modify: `plugins/cursor-orchestrator/mcp-server/src/tools/user-gate.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/steering-events.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/types.ts`
- Test: `plugins/cursor-orchestrator/mcp-server/src/__tests__/tools/user-gate.test.ts`
- Test: `plugins/cursor-orchestrator/mcp-server/src/__tests__/steering-events.test.ts`

**Approach:**

- Add gate-resolution key helpers beside steering-event normalization.
- Check the key before `recordGateSteering`.
- Record only after the confirm succeeds.
- Return `idempotentReplay: true` on duplicate confirms.
- For `fresh-eyes` / `self-review`, include `dispatchKey` and replay semantics.

**Test scenarios:**

- Duplicate `looks-good-all` closes beads once and bumps `coordinatorEpoch` once.
- Duplicate `fresh-eyes` returns replay metadata and does not append a second steering event.
- Same action with different `reviewBeadId` produces a distinct key.
- Same bead IDs in different order produce the same key.
- Legacy checkpoint with no `gateResolutions` still works.

**Verification:**

- `state.steeringEvents` and `state.gateResolutions` stay capped.
- Confirm envelopes remain compact and do not include full gate JSON.

### U3. Wrap-up confirmation retry shape

**Goal:** Make `flywheel_wrap_up_gate` retry-safe and unambiguous after confirmation.

**Files:**

- Modify: `plugins/cursor-orchestrator/mcp-server/src/tools/user-gate.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/cursor-user-gates.ts` if shared helpers are useful
- Modify: `plugins/cursor-orchestrator/mcp-server/src/types.ts`
- Test: `plugins/cursor-orchestrator/mcp-server/src/__tests__/tools/user-gate.test.ts`

**Approach:**

- Preserve `force=true` to intentionally re-open the menu.
- Store the selected wrap-up action, not only `wrapUpConfirmed`.
- When already confirmed and `force` is absent, return `kind: "wrap_up_already_confirmed"` with no `askQuestion`.
- Treat duplicate `confirmWrapUp` as an idempotent replay.

**Test scenarios:**

- First `confirmWrapUp: "full"` sets `wrapUpConfirmed`, stores action, bumps epoch once.
- Second `confirmWrapUp: "full"` returns replay and does not bump epoch.
- `flywheel_wrap_up_gate({ cwd })` after confirmation returns no `askQuestion`.
- `force=true` re-shows the menu.
- Old checkpoint with only `wrapUpConfirmed: true` returns already-confirmed with unknown action and a force hint.

**Verification:**

- No post-confirm retry path can accidentally ask the user to choose wrap-up again.

### U4. Command degradation and context-budget lock-in

**Goal:** Keep recovery commands aligned with the robust MCP behavior while preserving compact context use.

**Files:**

- Modify: `plugins/cursor-orchestrator/commands/recover-gates.md`
- Modify: `plugins/cursor-orchestrator/commands/flywheel-recover-gates.md`
- Modify: `.cursor/rules/context-budget.mdc`
- Modify: `.cursor/rules/cursor-user-gates.mdc` if wording needs the new stale/replay cases
- Test: `plugins/cursor-orchestrator/mcp-server/src/__tests__/skills/start/menu-options.test.ts` or the command/skill lint suite if it owns command checks

**Approach:**

- State that stale checkpoint candidates require confirmation.
- Prefer resolver/gate structured output over direct checkpoint and `br list` reads.
- Keep the compact command as the agent default.
- Add a short branch for `idempotentReplay`: do not spawn duplicate reviewers unless the user explicitly asks to retry.

**Test scenarios:**

- Lint catches command text that suggests loading `start_ceremony` for recovery.
- Lint catches prose commit prompts in recovery paths.
- Command docs mention `AskQuestion(data.askQuestion)` and `data.actions` mapping.

**Verification:**

- A cold agent can recover a gate by reading only the compact command and using MCP gate output.

### U5. Observe hints and degraded telemetry

**Goal:** Make pending gates and degraded recovery visible without increasing normal chat payloads.

**Files:**

- Modify: `plugins/cursor-orchestrator/mcp-server/src/tools/observe.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/__tests__/tools/observe.test.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/logger.ts` only if a new logger context registry is needed

**Approach:**

- Add a best-effort pending post-implement gate hint.
- Never fail observe when bead probing or checkpoint inspection fails.
- Include only high-signal fields in hints: severity, message, nextAction.
- Log degraded recovery with `createLogger("recover-gates")`, never stdout.

**Test scenarios:**

- `phase: "implementing"`, successful bead results, no recent wave-review steering -> observe emits warn hint.
- Recent `wave_review` steering suppresses the hint.
- Invalid checkpoint or bead probe failure keeps observe status ok.
- Hint text stays short and does not include full bead descriptions.

**Verification:**

- `/start` resume can surface the pending recovery path without loading phase skills.

### U6. CI and regression matrix

**Goal:** Prevent backsliding on gate compactness, idempotency, stale checkpoint handling, and context-budget rules.

**Files:**

- Modify: `plugins/cursor-orchestrator/mcp-server/src/__tests__/tools/user-gate.test.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/__tests__/cursor-user-gates.test.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/__tests__/checkpoint.test.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/__tests__/migration.test.ts`
- Modify: `plugins/cursor-orchestrator/mcp-server/src/lint/rules/*` if command prose linting is implemented there
- Modify: `plugins/cursor-orchestrator/mcp-server/dist/` after source changes are built

**Approach:**

- Add unit tests for each degradation condition.
- Add migration tests for new optional state fields.
- Add compactness assertions: no `coordinatorAction` in tool text, no full `userGate` in structured recovery payloads.
- Add command/skill lint coverage for forbidden recovery prompts.

**Test scenarios:**

- Old checkpoint fixture loads with missing `gateResolutions`.
- Recovery payload remains under a fixed size for a 50-bead wave.
- Distinct action keys still map through `data.actions`.
- `orch_*` aliases, if applicable, preserve the same structured shape.

**Verification:**

- MCP test suite passes and dist drift is clean after rebuild.

---

## Load degradation details

### Timeouts and caps

| Probe | Budget | Cap | Failure behavior |
|---|---:|---:|---|
| Checkpoint read | local sync read | n/a | Ignore checkpoint, warning |
| Git head/branch | 1s | n/a | Mark checkpoint trust unknown |
| Bead scan | 1.5s | 25 candidates | Manual ID prompt if unavailable/truncated |
| Warning strings | n/a | 5 | Add `warningsTruncated=true` |
| Gate resolutions | n/a | 20 entries | FIFO trim |

### Degraded result shape

```typescript
{
  kind: "recover_gate_context",
  source: "manual_required",
  confidence: "degraded",
  warnings: ["Could not read beads: timeout after 1500ms"],
  nextAction: {
    type: "ask_for_bead_ids",
    prompt: "Paste bead IDs, run /flywheel-swarm-status, or cancel."
  }
}
```

No degraded path should instruct the agent to run `/start`, read ceremony, or ask to commit.

---

## Stale checkpoint policy

Checkpoint candidates are **trusted** only when all are true:

- `readCheckpoint(cwd)` returns a validated envelope.
- `state.phase` is one of the post-implement phases where recovery makes sense.
- The envelope git head matches current head, or current head cannot be determined but the checkpoint is fresh.
- The checkpoint is younger than 24 hours.
- Candidate bead IDs are still present in `br list` when a bead scan is available.

If any check fails:

- Keep candidate IDs as suggestions if they exist.
- Mark `confidence: "stale"` or `"degraded"`.
- Require explicit confirmation before using them.
- Prefer user-passed bead IDs over all inference.

This policy avoids the worst failure: accepting or wrapping up the wrong wave after a branch switch or stale resume.

---

## Idempotency policy

### Idempotent by default

These should be idempotent:

- `flywheel_wave_review_gate({ confirmAction: "looks-good-all", beadIds })`
- `flywheel_wave_review_gate({ confirmAction: "self-review", beadIds, reviewBeadId })`
- `flywheel_wave_review_gate({ confirmAction: "fresh-eyes", beadIds, reviewBeadId })`
- `flywheel_wave_review_gate({ confirmAction: "duel-review", beadIds })`
- `flywheel_wrap_up_gate({ confirmWrapUp })`

### Not silently idempotent

These require explicit `force` or a new action key:

- Re-opening wrap-up menu after confirmation.
- Re-spawning fresh-eyes reviewers after a replay.
- Changing from one wrap-up choice to another.
- Accepting stale checkpoint-inferred bead IDs.

### Replay output

Replay should be visible:

```typescript
{
  kind: "wave_review_confirmed",
  confirmAction: "fresh-eyes",
  idempotentReplay: true,
  dispatchKey: "...",
  nextAction: "Review was already routed. Do not spawn duplicate reviewers unless user asks to retry."
}
```

---

## Observability plan

### Structured fields

Add or preserve:

- `coordinatorEpoch`
- `steeringEvents`
- `gateResolutions`
- `gateMeta.recoverySource`
- `gateMeta.recoveryConfidence`
- `idempotentReplay`
- `dispatchKey`

### Logs

Use `createLogger("recover-gates")` for:

- stale checkpoint classified
- bead scan degraded
- candidate cap hit
- duplicate confirm replayed
- wrap-up already-confirmed response

Log fields should use IDs and counts, not full bead descriptions.

### Operator-facing surfaces

- `flywheel_observe.hints[]`: pending post-implement gate, stale checkpoint recovery risk.
- Tool text: one-line explanation plus `AskQuestion` instruction.
- Command docs: fallback path and explicit ID preference.

---

## CI plan

### Unit tests

- Recovery resolver source priority and degradation.
- Checkpoint trust classification.
- Idempotent wave-review confirms.
- Idempotent wrap-up confirms.
- Compact gate payload size and absence of `coordinatorAction` in text.
- Observe pending-gate hints.

### Migration tests

- v3.12 checkpoint fixture loads with `gateResolutions` absent.
- Checkpoint with malformed `gateResolutions` does not crash if optional validation is best-effort.
- State hash round-trip remains stable after adding optional fields.

### Command / skill lint

- Ban prose prompts matching:
  - `want to commit`
  - `should I commit`
  - `should I continue`
  - `reply with 1/2/3` in gate paths unless marked as fallback
- Flag recovery command text that says to load `start_ceremony`, `start_discover`, or full `start` for recovery.
- Preserve allowed fallback language when `AskQuestion` fails.

### Integration assertions

- `flywheel_wave_review_gate` with 30 bead IDs returns compact metadata and an AskQuestion payload without large option duplication.
- Recovery with stale checkpoint plus explicit IDs uses explicit IDs.
- Wrap-up after confirmation returns no menu unless forced.

After MCP source changes, rebuild and commit `plugins/cursor-orchestrator/mcp-server/dist/` with the source changes.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| New resolver becomes another orchestration engine | Keep it read-only and candidate-focused; existing gate tools still execute gates |
| Idempotency hides a legitimate retry | Include `force` / explicit retry path for reviewer respawn and wrap-up re-prompt |
| Gate ledger bloats checkpoint | FIFO cap at 20, compact keys only |
| Stale checkpoint policy blocks useful recovery | Mark stale candidates as confirmable suggestions, not hard failures |
| Observe hint becomes noisy | Suppress when recent `wave_review` or `wrap_up` steering exists |
| Command docs drift from MCP behavior | Add command lint and keep compact command as default agent contract |
| Context-budget regression | Compactness tests and command rules forbid loading ceremony/start for recovery |

---

## Acceptance criteria

### Load degradation

- [ ] Recovery with explicit bead IDs performs no checkpoint or bead scan.
- [ ] `br list` failure produces a manual-ID degraded path, not a thrown tool error.
- [ ] Candidate lists are capped and never include full bead bodies.
- [ ] Huge bead graphs do not cause large `AskQuestion` or chat payloads.

### Stale checkpoint

- [ ] Corrupt checkpoint is ignored with warning.
- [ ] Branch/head mismatch marks checkpoint candidates stale.
- [ ] Stale checkpoint candidates require explicit confirmation before wave review.
- [ ] Old checkpoints without new fields load successfully.

### Idempotent gates

- [ ] Duplicate wave-review confirm does not bump epoch twice.
- [ ] Duplicate fresh-eyes/self-review confirm does not silently instruct duplicate reviewer spawns.
- [ ] Duplicate wrap-up confirm returns replay/already-confirmed shape.
- [ ] `force=true` still allows intentional wrap-up re-prompt.

### Context budget

- [ ] Gate tools return compact `{ gateMeta, askQuestion, actions }` for menus.
- [ ] Recovery command docs forbid ceremony/discover/start loading.
- [ ] Tool text does not contain full `coordinatorAction` blobs.

### CI and observability

- [ ] Tests cover degraded checkpoint, failed bead scan, huge bead list, duplicate confirm, and already-confirmed wrap-up.
- [ ] Observe emits a short pending-gate hint only when appropriate.
- [ ] Logs use `createLogger` and never write to stdout.
- [ ] Dist is rebuilt after MCP source changes.

---

## Bead breakdown

| Bead | Title | Effort | Depends |
|---|---|---:|---|
| R1 | Add recovery context resolver with stale checkpoint classification | M | - |
| R2 | Make wave-review confirmations idempotent | M | R1 |
| R3 | Make wrap-up confirmation retry shape unambiguous | S | R2 |
| R4 | Add load-degradation caps and manual-ID fallback surfaces | S | R1 |
| R5 | Add observe hints and recover-gates structured logs | S | R1 |
| R6 | Add CI/lint regression coverage for recovery gates | M | R2, R3, R4 |

**Total:** 2-4 days. R1-R3 are the robustness core; R4-R6 make the behavior durable across degraded runs and future edits.

---

## Recommended next step

Implement R1-R3 as the first PR. That PR makes recovery safe under stale checkpoints and duplicate submissions without changing the user-facing gate model. Then land R4-R6 to harden load behavior, observability, and CI.
