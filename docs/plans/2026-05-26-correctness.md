# Correctness plan: recover-gates + post-implement gate UX

**Perspective:** Correctness — type safety, edge cases, gate action mapping, AskQuestion payloads, `confirmAction` flows, exhaustive handling, epoch/state invariants.

**Date:** 2026-05-26
**Project:** `/Volumes/1tb/Projects/cursor-agent-flywheel`
**Scope:** `/recover-gates` + `/flywheel-recover-gates` commands, `flywheel_wave_review_gate`, `flywheel_wrap_up_gate`, `flywheel_review('__gates__')`, the compact `toCompactGatePayload` contract, and the rules that govern them (`rules/cursor-user-gates.mdc`, `rules/context-budget.mdc`).

**Related (do not duplicate):**

- [`docs/plans/2026-05-26-ergonomics.md`](./2026-05-26-ergonomics.md) — UX, naming, discoverability, slash-command matrix, decision tree (already in flight).
- [`docs/plans/2026-05-20-correctness.md`](./2026-05-20-correctness.md) — `coordinatorEpoch`, `steeringEvents`, profile drift (this plan **builds on** its invariants).
- [`plugins/cursor-orchestrator/mcp-server/src/tools/user-gate.ts`](../../plugins/cursor-orchestrator/mcp-server/src/tools/user-gate.ts), [`cursor-user-gates.ts`](../../plugins/cursor-orchestrator/mcp-server/src/cursor-user-gates.ts), [`steering-events.ts`](../../plugins/cursor-orchestrator/mcp-server/src/steering-events.ts), [`tools/review.ts`](../../plugins/cursor-orchestrator/mcp-server/src/tools/review.ts).

**Non-goals (this plan):** ergonomics polish (covered above), new MCP tools, NTM/CLI paths, refactoring `gates.ts` `runGuidedGates`, changes to bead approval gates beyond shared helpers, outcome grader internals.

---

## Executive summary

The recovery surface (`/recover-gates`, `/flywheel-recover-gates`, the two gate MCP tools, and the compact `data.{gateMeta,askQuestion,actions}` payload) is functionally **complete** today — the gaps that matter are **correctness** gaps: silent fall-through on unknown actions, stringly-typed action ids, label-substring action mapping, epoch bumps that fire before validation, and inconsistent input validation between the build path and the confirm path. Each gap is a footgun an LLM coordinator can step into without any tool surfacing the mistake.

| # | Gap | Today | Correctness fix |
|---|-----|-------|-----------------|
| C1 | `WaveReviewGateArgs.confirmAction` is `string` | LLM-supplied typos reach the runtime | Closed enum `WaveReviewConfirmAction` + Zod parse at MCP boundary |
| C2 | Unknown `confirmAction` falls through to generic success | Epoch bumps, no error returned | Exhaustive switch + `unsupported_action` error envelope |
| C3 | `gateActionsFromOptions` is label-substring matching | Renaming a label silently breaks `data.actions` | Data-driven mapping — option carries `action: ActionKey` field |
| C4 | `recordGateSteering` runs **before** validation | Epoch advances on invalid confirms | Validate first; bump only on success |
| C5 | `runWaveReviewGate` `beadIds` check is build-path only | Confirm path accepts empty/missing beads | Symmetric validation in `confirmWaveReviewAction` |
| C6 | `resolveReviewBeadId` misleading error when `beadIds.length === 0` | Returns "Multi-bead wave" for empty input | Distinguish `empty_input` vs `multi_bead_missing_id` |
| C7 | `runWrapUpGate` already-confirmed short-circuit returns a fake gate | Compact payload looks like a fresh prompt | Return a distinct `kind: "wrap_up_already_confirmed"` envelope |
| C8 | `wrapUpConfirmActionId` non-exhaustive default | Future enum members compile silently | `never` exhaustiveness check |
| C9 | `--gates-only` + `--wrap-up-only` mutual exclusion only documented | Command can be misinvoked | Document **and** server-side warning when both signals arrive in one turn |
| C10 | Compact payload `actions` map is `Record<string, string>` | Lossy; consumers re-grep strings | Discriminated union `ActionKey` exported from `types.ts` |
| C11 | `WrapUpGateArgs.force` semantics undocumented and not migration-tested | Re-prompt may re-bump epoch unexpectedly | Explicit `force` semantics + idempotence test |
| C12 | `gitPorcelain` `.slice(3).trim()` mishandles rename arrows | Confirm-path preview lies on renamed files | Use git porcelain v2 `-z` or parse rename `->` |
| C13 | Recovery command files don't show the error/retry contract | Agent has no template for malformed input | Add "On error" tables in both command files |
| C14 | No regression tests for invalid `confirmAction` | Bug class can ship undetected | Vitest matrix: each invalid string → `unsupported_action` |
| C15 | `acceptWaveBeadsAtReview` ordering: bumps then closes | If bead close fails mid-loop, epoch+steering still happened | Two-phase: dry-validate every bead exists → bump → close |

**Estimated effort:** 4–5 days across 7 beads. T1, T2, T4 are load-bearing prereqs; T3 unlocks the rest. T5–T7 are tests + docs.

**Recommended order:** T1 (types/schemas) → T2 (exhaustive confirm router) → T3 (action-key data-driven mapping) → T4 (validation-before-bump) → T5 (test matrix) → T6 (command/rule alignment) → T7 (compact payload contract test).

---

## Problem statement (current code)

### Surface: `mcp-server/src/tools/user-gate.ts`

`confirmWaveReviewAction(ctx, args, epoch)` (`user-gate.ts` ~L141–300) dispatches on `args.confirmAction`:

```ts
if (confirmAction === "looks-good-all") { ... }
if (confirmAction === "fresh-eyes")     { ... }
if (confirmAction === "self-review")    { ... }
if (confirmAction === "duel-review")    { ... }
return makeOkToolResult(  // ← fall-through "success" for any other string
  "flywheel_wave_review_gate",
  state.phase,
  `Wave review action recorded: ${confirmAction} (epoch ${epoch}).`,
  { kind: "wave_review_confirmed", confirmAction, ... },
);
```

The fall-through returns success with `kind: "wave_review_confirmed"` for **anything** the coordinator sends — including `"foo"`, `"LOOKS_GOOD"`, an old action like `"looks-good"` (singular), or a future action that hasn't been wired. `recordGateSteering` (called immediately before this function in `runWaveReviewGate`) has **already** bumped `coordinatorEpoch` and persisted a `SteeringEvent`. Net effect: every typo permanently advances epoch and logs a spurious gate resolution.

Two correctness consequences:

1. **Race regressions.** `coordinatorEpoch` is the source of truth for `cursor-impl-tick.ts` stale-tick guards (I1–I5 in `docs/plans/2026-05-20-correctness.md`). Spurious bumps mark a perfectly valid in-flight tick as stale, breaking I4. Conversely, hint deduplication (`shouldSuppressNextActionHint`) keys on `steeringEvents.normalizedKey` of the last 3 events; spurious `confirmAction` strings poison that ring buffer.
2. **Silent UX failure.** Coordinator sees `success: true`; user sees nothing change. The wave isn't reviewed, the beads aren't closed, but the agent reports "Wave review action recorded".

### Surface: `mcp-server/src/cursor-user-gates.ts` `gateActionsFromOptions`

```ts
export function gateActionsFromOptions(gate: FlywheelUserGate): Record<string, string> {
  const map: Record<string, string> = {};
  for (const o of gate.options) {
    const label = o.label.toLowerCase();
    if (label.includes("duel"))           map[o.id] = "duel-review";
    else if (label.includes("fresh"))      map[o.id] = "fresh-eyes";
    else if (label.includes("self"))       map[o.id] = "self-review";
    else if (label.includes("full wrap"))  map[o.id] = "wrap-up-full";
    // ... 20 more substring rules ...
    else map[o.id] = o.coordinatorAction?.slice(0, 48) ?? o.id;
  }
  return map;
}
```

This is **the** translator between UI labels and the coordinator's confirm calls. Substring matching means:

- Renaming "Looks good — accept all" → "Accept all (looks good)" silently keeps mapping to `looks-good-all` because the substring still hits, but renaming → "Approve wave" maps to the option's `coordinatorAction` slice (a 48-char hint string, not an action key).
- Order matters: `"Launch anyway"` must match **before** `"launch"` to avoid `bead-launch` capturing the wrong option. The current code orders them carefully (`label.includes("launch") && !label.includes("anyway")`), but any new label with "launch" in it can shadow either.
- The fallback `o.coordinatorAction?.slice(0, 48)` produces an opaque mapping that the coordinator must then string-compare on its side — defeating the closed-set contract `data.actions` exists to enforce.
- The whole function operates on **gate output**, not gate definition. A misclassified option produces `data.actions["3"] = "Start; Step 7 single Task lo"` instead of an action key, and there is no test that round-trips every gate's options through the mapper.

### Surface: `WaveReviewGateArgs.confirmAction?: string` (`types.ts` L932–940)

```ts
export interface WaveReviewGateArgs {
  cwd: string;
  beadIds: string[];
  confirmAction?: string;
  reviewBeadId?: string;
}
```

TypeScript cannot help. Compare to the well-typed `WrapUpGateArgs.confirmWrapUp?: 'full' | 'commit_only' | 'skip'` (same file, L943) — that one already catches typos at compile time. Wave-review is the loosely typed outlier.

### Surface: `runWrapUpGate` already-confirmed path

```ts
if (state.wrapUpConfirmed && !args.force) {
  const gate = buildWrapUpGate({ uncommittedCount: 0, uncommittedPreview: [] });
  return makeOkToolResult(
    "flywheel_wrap_up_gate",
    state.phase,
    "Wrap-up already confirmed. ...",
    { ...toCompactGatePayload(gate), wrapUpConfirmed: true },
  );
}
```

The returned `gateMeta.kind === "wrap_up"` and `askQuestion.questions[0].options.length === 3` are identical to a fresh prompt. A coordinator that didn't read `wrapUpConfirmed: true` (placed on the data envelope but not in `gateMeta`) will call `AskQuestion` again, then re-call `flywheel_wrap_up_gate({ confirmWrapUp })`, **re-bumping `coordinatorEpoch` and appending a duplicate `steeringEvent`**. There is no idempotence guard on the confirm path.

### Surface: bead-id validation asymmetry

`runWaveReviewGate` validates `args.beadIds` is non-empty only **on the build path** (lines 319–326). On the confirm path the function delegates straight to `recordGateSteering` (line 310) then `confirmWaveReviewAction`. Inside:

- `looks-good-all` → `acceptWaveBeadsAtReview(ctx, beadIds)` which **does** validate empty input (review.ts L203), but only after the epoch has already advanced.
- `fresh-eyes` / `self-review` → `resolveReviewBeadId(beadIds, args.reviewBeadId)` which returns the misleading "Multi-bead wave: pass reviewBeadId" error when `beadIds.length === 0`.
- `duel-review` → falls through to the risky-bead filter; `riskyIds` becomes `[]`, then `targets = beadIds` (still `[]`), and the payload happily reports "Duel review routed for (epoch N)".

### Surface: `gitPorcelain`

```ts
return r.stdout
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => l.slice(3).trim());
```

`.slice(3)` correctly skips `XY ` for non-rename status entries. For renames, `git status --porcelain` v1 emits `R  old -> new` and the function returns `old -> new` as a single "path", which then appears in the wrap-up gate's `uncommittedPreview` and the rationale text. Edge case but visible to the user, and consumers downstream cannot path-resolve it.

### Surface: command file contracts

`commands/recover-gates.md` (compact) and `commands/flywheel-recover-gates.md` (full) are **the** agent-facing contract. Neither describes:

- What to do when `flywheel_wave_review_gate` returns `unsupported_action` (today: nothing — the fall-through suppresses it).
- The mutual exclusion between `--gates-only` and `--wrap-up-only` is one sentence in the full file; the compact file omits it entirely.
- The post-confirm path: after `looks-good-all` with N beads, the response includes `reviewOutcome` from `acceptWaveBeadsAtReview` which can return errors mid-loop (one bead missing in `br show`). The command doesn't say "if reviewOutcome.isError, surface to user and stop bumping".

---

## Architecture

### Core invariants (must hold in production after this plan)

| ID | Invariant | Violation symptom | Enforcement |
|----|-----------|-------------------|-------------|
| K1 | `WaveReviewGateArgs.confirmAction` is `WaveReviewConfirmAction \| undefined` | Stringly-typed typos | TS closed enum + Zod parse at tool boundary |
| K2 | Every `confirmAction` value in K1 has a handler returning `kind: 'wave_review_confirmed'` **or** the function returns `unsupported_action`; no third path | Silent success on unknown | Exhaustive `switch (action)` with `never` assertion in default |
| K3 | `coordinatorEpoch` only bumps when (a) args validate and (b) the chosen handler returns success | Spurious epoch advances | Bump moves **after** validation; failed handlers do not bump |
| K4 | `beadIds.length >= 1` is validated **before** any `confirmAction` dispatch | Empty waves silently "succeed" | New helper `assertWaveBeadIds(args, phase)` called first in both build and confirm branches |
| K5 | `gateActionsFromOptions(gate)[id]` returns a closed-enum `ActionKey` for every option in every shipping gate kind | Label rename → fallback string leaks into `data.actions` | Round-trip test per gate kind asserts every value ∈ `ACTION_KEYS` |
| K6 | `FlywheelUserGateOption.action: ActionKey` is the source of truth (not label parsing) | Substring fragility | New required field on option; `gateActionsFromOptions` reads it |
| K7 | `wrapUpConfirmActionId(x)` is exhaustive (`never` check); adding a new `confirmWrapUp` member fails the build | Future enum drift | TS `never` exhaustiveness pattern |
| K8 | `runWrapUpGate` with `state.wrapUpConfirmed && !force` returns `kind: 'wrap_up_already_confirmed'`, not `'wrap_up'`; payload omits `askQuestion` | Coordinator re-prompts user | Distinct kind; `askQuestion: null`; compact-payload test |
| K9 | `runWrapUpGate` with `state.wrapUpConfirmed && confirmWrapUp` is a no-op (idempotent): no second epoch bump, no second steering event | Duplicate steering ledger entries | Idempotence guard before `recordGateSteering` |
| K10 | `acceptWaveBeadsAtReview` runs all `br show` checks **before** any `br update --status closed` | Partial close on missing bead | Two-phase: validate-all → mutate-all |
| K11 | Compact payload type `CompactGatePayload` is exported and round-trip parsed by Zod at the MCP boundary | Drift between server and consumer | Schema + `safeParse` in tests; `data.actions` value enum |
| K12 | `--gates-only` and `--wrap-up-only` are documented as mutually exclusive in both command files; agent algorithm explicitly rejects both | Combined flag invocation runs both | Docs + algorithm pseudocode + lint check (E6 from ergonomics plan extended) |
| K13 | `gitPorcelain` returns one entry per changed path; rename arrow `->` is split correctly | Wrap-up preview lies on renames | Use `git status --porcelain=v1 -z` (NUL-separated) or split rename arrow |
| K14 | Every command file documents the `unsupported_action` / `invalid_input` recovery contract | Agent has no template | "On error" section added |
| K15 | `runWaveReviewGate` rejects unknown bead ids on the **confirm** path before bumping epoch (currently only build path reads beads) | Confirm-time bead drift | `readBeads` once in confirm path; intersect with `beadIds` |

### Type contracts (`types.ts` extensions)

All additions are **additive** — pre-v3.20 checkpoints continue to load (no schemaVersion bump; matches the v3.13.0 / v3.19.0 pattern).

```ts
// ── Wave-review confirm actions (closed enum) ──────────────────
export const WAVE_REVIEW_CONFIRM_ACTIONS = [
  "looks-good-all",
  "self-review",
  "fresh-eyes",
  "duel-review",
] as const;
export type WaveReviewConfirmAction =
  (typeof WAVE_REVIEW_CONFIRM_ACTIONS)[number];

// ── Wrap-up confirm actions (already typed; export for clients) ─
export const WRAP_UP_CONFIRM_ACTIONS = [
  "full",
  "commit_only",
  "skip",
] as const;
export type WrapUpConfirmAction = (typeof WRAP_UP_CONFIRM_ACTIONS)[number];

// ── Action keys carried in compact payload ─────────────────────
// Closed enum; gateActionsFromOptions returns ActionKey strictly.
export const ACTION_KEYS = [
  // wave_review
  "looks-good-all", "self-review", "fresh-eyes", "duel-review",
  // wrap_up
  "wrap-up-full", "wrap-up-commit-only", "wrap-up-skip",
  // wrap_up_verdict
  "iterate-remediate", "continue-wrap-up", "abort",
  // bead_review / launch / low_quality / hotspot
  "bead-score-and-launch-gate", "bead-polish", "bead-launch",
  "bead-launch-anyway", "bead-back-to-plan",
  "bead-coordinator-serial", "bead-swarm-launch",
  // bead_coverage / dedup
  "bead-coverage-create", "bead-coverage-defer",
  "bead-dedup-merge-all", "bead-dedup-review-pairs",
  "bead-dedup-keep",
  // batch-review synthesized beads gate
  "synthesized-approve-all", "synthesized-approve-subset",
  "synthesized-reject-all", "synthesized-regress-plan",
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

// Updated:
export interface WaveReviewGateArgs {
  cwd: string;
  beadIds: string[];
  confirmAction?: WaveReviewConfirmAction; // K1
  reviewBeadId?: string;
}

// Updated gate-option contract — `action` is now load-bearing:
export interface FlywheelUserGateOption {
  id: string;
  label: string;
  detail?: string;
  /** Source of truth for data.actions mapping (K6). */
  action: ActionKey;
  /** Free-text hint for humans; never used for mapping. */
  coordinatorAction?: string;
}

export interface CompactGatePayload {
  gateMeta: {
    kind: FlywheelUserGate["kind"];
    title: string;
    rationale: string;
    beadIds?: string[];
    riskyBeadIds?: string[];
  };
  askQuestion: CursorAskQuestionPayload | null; // K8: null when no prompt
  actions: Record<string, ActionKey>;
}
```

### Zod schemas at the MCP tool boundary

`server.ts` already validates each tool's input via Zod. The wave-review tool's schema (`WaveReviewGateArgsSchema`) currently allows `confirmAction: z.string().optional()`; tighten to:

```ts
export const WaveReviewGateArgsSchema = z.object({
  cwd: z.string().min(1),
  beadIds: z.array(z.string().min(1)).min(1, "beadIds must be non-empty"),
  confirmAction: z.enum(WAVE_REVIEW_CONFIRM_ACTIONS).optional(),
  reviewBeadId: z.string().min(1).optional(),
});
```

Same hardening for `WrapUpGateArgsSchema` (already uses enum, but verify `force: z.boolean().optional()` is present and add `.strict()` to forbid unknown keys — current shape silently accepts garbage).

### Exhaustive confirm router

Replace the if-chain in `confirmWaveReviewAction` with a `switch` whose default arm fails the build:

```ts
async function confirmWaveReviewAction(
  ctx: ToolContext,
  args: ConfirmWaveReviewArgs, // beadIds: non-empty (validated by caller)
  epoch: number,
): Promise<McpToolResult> {
  switch (args.confirmAction) {
    case "looks-good-all": return handleLooksGoodAll(ctx, args, epoch);
    case "self-review":    return handleSelfReview(ctx, args, epoch);
    case "fresh-eyes":     return handleFreshEyes(ctx, args, epoch);
    case "duel-review":    return handleDuelReview(ctx, args, epoch);
    default: {
      const exhaustive: never = args.confirmAction;
      return makeToolError(
        "flywheel_wave_review_gate",
        ctx.state.phase,
        "unsupported_action",
        `Unknown confirmAction: ${String(exhaustive)}. ` +
          `Valid: ${WAVE_REVIEW_CONFIRM_ACTIONS.join(", ")}.`,
        { confirmAction: args.confirmAction },
      );
    }
  }
}
```

Adding a new action becomes a compile-time TODO across `WAVE_REVIEW_CONFIRM_ACTIONS` + the switch.

### Validation-before-bump

`recordGateSteering` should happen inside each handler **after** it has decided it will succeed — not before dispatch. Concretely, `runWaveReviewGate` becomes:

```ts
export async function runWaveReviewGate(ctx, args) {
  const validated = validateWaveReviewArgs(ctx, args); // K1, K4, K15
  if ("error" in validated) return validated.error;

  if (validated.confirmAction === undefined) {
    return buildAndReturnGate(ctx, validated.beadIds); // no bump
  }

  // Confirm path — handler owns the bump.
  return confirmWaveReviewAction(ctx, validated, /* epoch bumped inside */);
}
```

Each handler calls `recordGateSteering` **first thing** if and only if it knows it will return success (looks-good-all bumps before the close loop runs, but fresh-eyes/self-review/duel-review can bump only after `resolveReviewBeadId` succeeds).

K3 trade-off note: bumping after partial success in `looks-good-all` (e.g., bead 3 of 5 fails `br show`) needs a deliberate policy. Recommend:

- **Pre-validate phase:** `validateAllBeadsExist(ctx, beadIds)` — read once, fail fast.
- **Bump once** after pre-validate passes (the user *did* steer; closure happens next).
- **Run closes**; if mid-loop close fails, return `cli_failure` envelope with `partiallyClosed: string[]` so the recovery command can surface the partial state.

This mirrors K10: validate-all → bump → mutate-all.

### Compact payload contract test

Add `CompactGatePayloadSchema` (Zod). In `__tests__/cursor-user-gates.test.ts`, for **every** `buildXGate` constructor, assert:

```ts
const gate = buildWaveReviewGate(beads, state);
const compact = toCompactGatePayload(gate);
expect(CompactGatePayloadSchema.safeParse(compact).success).toBe(true);
for (const [optionId, actionKey] of Object.entries(compact.actions)) {
  expect(ACTION_KEYS).toContain(actionKey);            // K5
  expect(compact.askQuestion!.questions[0].options.map(o => o.id))
    .toContain(optionId);                              // every id resolvable
}
```

### Action mapping (data-driven)

`gateActionsFromOptions` becomes one line:

```ts
export function gateActionsFromOptions(gate: FlywheelUserGate): Record<string, ActionKey> {
  return Object.fromEntries(gate.options.map(o => [o.id, o.action]));
}
```

Every `buildXGate` in `cursor-user-gates.ts` must populate `option.action: ActionKey`. The substring heuristic is **deleted** — this is a hard cut, not a soft deprecation. The build-time test (K5) prevents missing fields from shipping.

### `runWrapUpGate` idempotence + new kind

```ts
export async function runWrapUpGate(ctx, args) {
  const validated = WrapUpGateArgsSchema.safeParse(args);
  if (!validated.success) return makeToolError(...);

  // Idempotence (K8/K9): treat already-confirmed as a terminal state.
  if (ctx.state.wrapUpConfirmed && !args.force) {
    return makeOkToolResult(
      "flywheel_wrap_up_gate",
      ctx.state.phase,
      "Wrap-up already confirmed; pass force=true to re-prompt.",
      {
        gateMeta: {
          kind: "wrap_up_already_confirmed",
          title: "Wrap-up already confirmed",
          rationale: `Recorded at ${ctx.state.wrapUpConfirmedAt ?? "(no timestamp)"}.`,
          beadIds: undefined,
          riskyBeadIds: undefined,
        },
        askQuestion: null, // ← consumer must not AskQuestion
        actions: {},
        wrapUpConfirmed: true,
      },
    );
  }

  // ... existing build/confirm logic, but: confirm branch checks wrapUpConfirmed
  // before calling recordGateSteering (K9).
}
```

A new `wrap_up_already_confirmed` member is added to `FlywheelUserGate["kind"]`. Coordinator code in command files explicitly handles the kind by reporting state and stopping (no AskQuestion).

### Command-file error contracts (K13/K14)

Both `commands/recover-gates.md` and `commands/flywheel-recover-gates.md` gain a small **"On error"** table — same shape, kept ~10 lines so context budget holds:

```markdown
## On error

| Error code | Cause | Recovery |
|------------|-------|----------|
| `invalid_input` | `beadIds` empty or `confirmAction` typo | Re-call with corrected args; do not retry blindly |
| `unsupported_action` | `confirmAction` not in {looks-good-all,self-review,fresh-eyes,duel-review} | Surface to user; map via `data.actions` only |
| `not_found` | A bead id in the wave no longer exists in `br` | Drop that id, re-call with remaining; do not bump epoch |
| `cli_failure` | `br update --status closed` failed mid-loop | Read `partiallyClosed: string[]`; resume by re-calling with remaining ids |
```

Mutual-exclusion enforcement (K12):

```markdown
**Mutually exclusive flags:** `--gates-only` and `--wrap-up-only` cannot combine. If `$ARGUMENTS` contains both, stop and surface: "These flags target different gates; pick one and re-invoke."
```

---

## Phased plan (T1–T7)

### T1 — Type contracts + Zod schemas (`types.ts`, `server.ts`)

**Depends on:** nothing.
**Blocks:** T2, T3, T4, T5.

**Deliverables:**

- `WAVE_REVIEW_CONFIRM_ACTIONS`, `WaveReviewConfirmAction`, `WRAP_UP_CONFIRM_ACTIONS`, `WrapUpConfirmAction`, `ACTION_KEYS`, `ActionKey`, `CompactGatePayload`, `CompactGatePayloadSchema` exported from `mcp-server/src/types.ts`.
- `FlywheelUserGateOption.action: ActionKey` field added (required for new gates; old options will compile-error until T3 populates).
- Strict Zod schemas on `WaveReviewGateArgs` and `WrapUpGateArgs` in `server.ts`; `.strict()` to reject unknown keys.
- Single new error envelope: reuse existing `unsupported_action` (already in `FLYWHEEL_ERROR_CODES`).

**Edge cases:**

| Case | Expected |
|------|----------|
| Pre-T3 build with new required `action` field | Compile error in `cursor-user-gates.ts` builders (intentional; T3 fills) |
| Client sends `confirmAction: "LOOKS-GOOD-ALL"` (case mismatch) | Zod rejects at boundary; tool returns `invalid_input` with hint |
| `confirmAction: null` (JSON `null`) | Zod rejects (optional ≠ nullable) |
| Legacy checkpoint loaded; new fields absent | No change — these live only on args/outputs, not state |
| Action key reused by two gate kinds | Permitted; mapping stays per-gate via option `action` |

**Acceptance:**

- [ ] `npm test` compiles after T1 alone fails until T3 lands (intentional; T3 is the same PR).
- [ ] `server.ts` Zod schemas reject every invalid `confirmAction` in a new `__tests__/server-schemas.test.ts`.

---

### T2 — Exhaustive confirm router + validate-before-bump

**Depends on:** T1.
**Blocks:** T5.

**Deliverables:**

- `confirmWaveReviewAction` becomes a `switch` with a `never` default that returns `unsupported_action` (defensive — Zod already rejects, but defense-in-depth catches `as never` casts in tests).
- `recordGateSteering` is removed from `runWaveReviewGate`'s pre-dispatch path; each handler calls it first thing on its own success branch.
- `runWrapUpGate` confirm branch checks `state.wrapUpConfirmed` before bumping (K9).

**File changes:**

| File | Change |
|------|--------|
| `mcp-server/src/tools/user-gate.ts` | Extract `handleLooksGoodAll`, `handleSelfReview`, `handleFreshEyes`, `handleDuelReview`; switch router; move epoch bumps |
| `mcp-server/src/tools/user-gate.ts` | `runWrapUpGate`: check `wrapUpConfirmed && confirmWrapUp` → return `wrap_up_already_confirmed` without bump |
| `mcp-server/src/cursor-user-gates.ts` | Add `kind: "wrap_up_already_confirmed"` to `FlywheelUserGate["kind"]` union |
| `mcp-server/src/steering-events.ts` | `wrapUpConfirmActionId` adds `default: const _: never = confirmWrapUp; return confirmWrapUp;` |

**Edge cases:**

| Case | Expected |
|------|----------|
| `confirmAction: "looks-good-all"`, all beads close cleanly | Single epoch bump, single steering event, all beads closed |
| `confirmAction: "looks-good-all"`, bead 3 of 5 fails `br show` | Pre-validate fails before bump; returns `not_found` with the failing id; no epoch bump |
| `confirmAction: "fresh-eyes"`, `beadIds: []` | T1 Zod rejects (`beadIds.min(1)`) — never reaches handler |
| `confirmAction: "fresh-eyes"`, `beadIds: ["a","b"]`, no `reviewBeadId` | `resolveReviewBeadId` returns `invalid_input` with hint *before* bump |
| `confirmAction: "duel-review"`, no risky beads | Handler falls back to full wave; bump after fallback decided |
| `confirmWrapUp: "full"` called twice | Second call returns `wrap_up_already_confirmed`; no second bump |
| `confirmWrapUp: "full"` with `force: true` | Second call bumps as expected (idempotence only when `!force`) |
| `state.wrapUpConfirmed: true`, build path called (no `confirmWrapUp`) | Returns `wrap_up_already_confirmed` (kind), `askQuestion: null` |

**Acceptance:**

- [ ] Vitest: `__tests__/tools/user-gate.confirm-action.test.ts` covers all 4 valid actions + 6 invalid action strings + null/undefined.
- [ ] Vitest: idempotence test for `confirmWrapUp` called twice asserts `steeringEvents.length === 1`.
- [ ] Coverage of `confirmWaveReviewAction` branches reaches 100% per Vitest report.

---

### T3 — Data-driven action mapping (kill the substring heuristic)

**Depends on:** T1.
**Blocks:** T5 (round-trip test).

**Deliverables:**

- Every `buildXGate` in `cursor-user-gates.ts` populates `option.action: ActionKey`. The substring-matching body of `gateActionsFromOptions` is deleted; the function becomes a one-line `Object.fromEntries`.
- Each gate kind's options are unit-tested for the right `action` value (no label-substring tests).

**File changes:**

| File | Change |
|------|--------|
| `mcp-server/src/cursor-user-gates.ts` | Each `buildXGate` literal gains `action: "<key>"`; `gateActionsFromOptions` shrinks to one line |
| `mcp-server/src/__tests__/cursor-user-gates.test.ts` | Per-gate test: every option's `action` is an `ActionKey`; round-trip via `toCompactGatePayload` matches |

**Edge cases:**

| Case | Expected |
|------|----------|
| Gate option label localised / paraphrased in a future PR | Mapping unaffected — driven by `action` field |
| Gate option `action` typo (e.g. `"lookgood-all"`) | TS rejects (not in `ActionKey` union) |
| Two options share the same `action` (intentional) | Allowed; `data.actions` keys remain per-option-id |
| `riskyBeadIds` triggers extra Duel option | Duel option always carries `action: "duel-review"`; tested independently |

**Acceptance:**

- [ ] Per-gate test asserts every shipped option has a valid `ActionKey`.
- [ ] Snapshot test of `gateActionsFromOptions` output for `buildWaveReviewGate(beadsMulti)` matches `{ "1": "looks-good-all", "2": "self-review", "3": "fresh-eyes", "4": "duel-review" }` when risky beads present.

---

### T4 — Validation symmetry on confirm path + bead existence check

**Depends on:** T1, T2.
**Blocks:** T5.

**Deliverables:**

- New helper `validateWaveReviewArgs(ctx, args): { ok, beadIds, confirmAction? } | { error: McpToolResult }`. Used by both build and confirm paths.
- Helper `validateAllBeadsExist(ctx, beadIds): Promise<{ missing: string[] }>` — single `readBeads` call; intersect.
- `gitPorcelain` parses rename arrows (`->`) and uses `-z` for NUL separation to handle paths with spaces/newlines.

**File changes:**

| File | Change |
|------|--------|
| `mcp-server/src/tools/user-gate.ts` | Add `validateWaveReviewArgs`, `validateAllBeadsExist` helpers; call from both paths |
| `mcp-server/src/tools/user-gate.ts` | Rewrite `gitPorcelain` to use `git status --porcelain=v1 -z`; parse rename arrows |
| `mcp-server/src/cursor-user-gates.ts` | `resolveReviewBeadId` distinguishes `empty_input` from `multi_bead_missing_id` |

**Edge cases:**

| Case | Expected |
|------|----------|
| `beadIds: []` on confirm path | `invalid_input`: "beadIds must be a non-empty array..." (same message as build path) |
| `beadIds: ["tb-1","does-not-exist"]` on confirm | `not_found` with `details.missing: ["does-not-exist"]`; no bump |
| `beadIds.length === 0` with `confirmAction: fresh-eyes` and no `reviewBeadId` | Returns `invalid_input` "beadIds empty" (not the misleading multi-bead error) |
| Rename in working tree: `git mv old new` | `uncommittedPreview` contains `old`, `new` as separate entries; preview rationale shows correct count |
| Filename with embedded newline / control chars | NUL-split handles correctly; `slice(3)` removed in favour of porcelain v2 record parsing |
| `git` binary missing | `gitPorcelain` returns `[]`; gate text falls back to "Working tree is clean aside from any intentional WIP." (existing behavior preserved) |
| Detached HEAD (no commits yet) | `gitBeadCommitCount` returns `undefined`; text omits the bead-commit line (existing) |

**Acceptance:**

- [ ] Vitest: empty `beadIds` on every confirm-action path returns `invalid_input` with consistent message.
- [ ] Vitest: missing bead id on `looks-good-all` returns `not_found` without bumping epoch.
- [ ] Vitest fixture: `git status --porcelain` with a rename arrow yields two entries; full path with space yields one entry.

---

### T5 — Vitest matrix for gate correctness

**Depends on:** T1–T4.
**Blocks:** T7 (acceptance).

**New / extended test files:**

| File | Coverage |
|------|----------|
| `__tests__/tools/user-gate.confirm-action.test.ts` | All 4 valid `confirmAction` values × {0 beads, 1 bead, 3 beads, 1 risky bead}; all 8 invalid strings → `unsupported_action` (post-T2) or `invalid_input` (Zod, pre-handler); both paths assert no epoch bump on failure |
| `__tests__/tools/user-gate.idempotence.test.ts` | `runWrapUpGate({ confirmWrapUp: "full" })` ×2 → 1 steering event; ×3 with `force: true` between → 2 events |
| `__tests__/cursor-user-gates.compact-payload.test.ts` | `CompactGatePayloadSchema.safeParse(toCompactGatePayload(gate))` for every `buildXGate`; assert every `actions[id]` ∈ `ACTION_KEYS` |
| `__tests__/tools/user-gate.gitporcelain.test.ts` | Rename arrow, embedded space, embedded newline (via mocked exec) |
| `__tests__/recover-gates.contract.test.ts` | Structural: command files contain `## On error`, `Mutually exclusive flags`, and reference `data.actions` exactly once per action key |
| `__tests__/tools/user-gate.bead-existence.test.ts` | Missing bead id on confirm → `not_found`; no bump |

**Test matrix template (confirm-action × wave shape):**

```ts
describe.each([
  ["looks-good-all", 0, "invalid_input"],
  ["looks-good-all", 1, "wave_review_confirmed"],
  ["looks-good-all", 3, "wave_review_confirmed"],
  ["fresh-eyes",     0, "invalid_input"],
  ["fresh-eyes",     1, "wave_review_confirmed"],
  ["fresh-eyes",     3, "invalid_input"], // missing reviewBeadId
  ["self-review",    0, "invalid_input"],
  ["self-review",    1, "wave_review_confirmed"],
  ["self-review",    3, "invalid_input"], // missing reviewBeadId
  ["duel-review",    0, "invalid_input"],
  ["duel-review",    1, "wave_review_confirmed"],
  ["duel-review",    3, "wave_review_confirmed"],
  ["bogus",          1, "invalid_input"], // Zod
  ["LOOKS-GOOD-ALL", 1, "invalid_input"], // Zod
  ["",               1, "invalid_input"], // Zod
])("runWaveReviewGate(%s, beads=%i)", (action, n, expectedKind) => { ... });
```

**Test fixtures:**

- `__tests__/fixtures/checkpoint-pre-t1.json` — frozen pre-T1 state; load via `validateCheckpoint`; assert new fields undefined.
- `__tests__/fixtures/git-status-rename.txt` — `-z` NUL-separated output for the rename test.

**Acceptance:**

- [ ] All new tests pass under `npm test` from `plugins/cursor-orchestrator/mcp-server/`.
- [ ] Coverage for `tools/user-gate.ts` ≥ 90% lines (was ~70%).
- [ ] Coverage for `cursor-user-gates.ts` ≥ 95% (gate builders are pure).
- [ ] No new flake (3 consecutive green runs).

---

### T6 — Command file + rule alignment (correctness clauses)

**Depends on:** T1 (new error codes), T2 (idempotence kind), T4 (validation contract).
**Blocks:** T7.

**Deliverables:**

- Both `commands/recover-gates.md` and `commands/flywheel-recover-gates.md` gain an **"On error"** table (K14) and a **mutual-exclusion** note (K12).
- `.cursor/commands/recover-gates.md` (workspace symlink/copy) updated; or noted as auto-synced from the plugin via `scripts/link-cursor-commands.mjs`.
- `rules/cursor-user-gates.mdc` gains one bullet: *"After `confirmAction` / `confirmWrapUp`, check the response `kind`; if `wave_review_confirmed` is absent, surface the error rather than retry blindly."*
- `rules/context-budget.mdc` recovery section gains: *"Skip re-calling the gate after a `wrap_up_already_confirmed` response; load `start_wrapup` only if the user requested wrap-up details."*

**File changes:**

| File | Change |
|------|--------|
| `plugins/cursor-orchestrator/commands/recover-gates.md` | `## On error` (compact, 4 rows) + mutual-exclusion note |
| `plugins/cursor-orchestrator/commands/flywheel-recover-gates.md` | Same table (full prose) + matching mutual-exclusion enforcement in Step 4 |
| `.cursor/commands/recover-gates.md` | Mirror compact file (auto-sync — verify after `node scripts/link-cursor-commands.mjs`) |
| `plugins/cursor-orchestrator/rules/cursor-user-gates.mdc` | One error-handling bullet |
| `plugins/cursor-orchestrator/rules/context-budget.mdc` | `wrap_up_already_confirmed` skip rule |

**Edge cases:**

| Case | Expected (documented) |
|------|----------------------|
| User runs `/recover-gates --gates-only --wrap-up-only` | Agent rejects in chat; suggests two separate invocations |
| `flywheel_wave_review_gate` returns `unsupported_action` | Agent surfaces the message, does not retry, does not bump |
| `flywheel_wrap_up_gate` returns `kind: "wrap_up_already_confirmed"` | Agent reports "already confirmed", does not AskQuestion, optionally loads `start_wrapup` only if user asks for wrap-up details |
| `flywheel_wave_review_gate` returns `not_found` mid-batch | Agent re-calls with the surviving bead ids; does not chain epoch bumps |

**Acceptance:**

- [ ] `npm run lint:skill` passes on updated command files.
- [ ] Structural test `__tests__/recover-gates.contract.test.ts` (T5) finds both required headings.

---

### T7 — Compact payload contract + boundary parse test

**Depends on:** T1, T3, T5.

**Deliverables:**

- `CompactGatePayloadSchema` (Zod) exported from `cursor-user-gates.ts`; re-exported from `types.ts`.
- `toCompactGatePayload` runs `CompactGatePayloadSchema.parse` in test builds and `safeParse + log.warn` in production (guard: production cost is one Zod parse per gate response — sub-millisecond).
- Snapshot test of compact payload for each gate kind, frozen in `__snapshots__/`. Future label changes that don't break the contract produce a diff the reviewer must approve.

**File changes:**

| File | Change |
|------|--------|
| `mcp-server/src/cursor-user-gates.ts` | `CompactGatePayloadSchema`; optional `safeParse` guard in `toCompactGatePayload` |
| `mcp-server/src/types.ts` | Re-export `CompactGatePayloadSchema` |
| `mcp-server/src/__tests__/__snapshots__/cursor-user-gates.test.ts.snap` | One snapshot per gate kind |

**Acceptance:**

- [ ] `CompactGatePayloadSchema.safeParse(payload).success === true` for every shipping gate.
- [ ] CI fails if any `buildXGate` adds an option without an `action: ActionKey` field.
- [ ] Snapshot diff is reviewed for every gate-option change.

---

## Checkpoint compatibility

No `schemaVersion` bump. All additive:

| Field added | Where | Default when absent |
|-------------|-------|---------------------|
| `state.wrapUpConfirmedAt?: string` (optional ISO timestamp; surfaced in `wrap_up_already_confirmed` rationale) | `FlywheelState` | undefined; rationale renders `(no timestamp)` |
| New `kind: "wrap_up_already_confirmed"` | `FlywheelUserGate["kind"]` (output only) | n/a — never persisted |

The `WaveReviewGateArgs` / `WrapUpGateArgs` tightening is at the **MCP boundary**, not in checkpoint. Pre-T1 checkpoints continue to load via the existing v3.13.0 migration tests. Add `__tests__/fixtures/checkpoint-pre-t1.json` (copy of v3.19 frozen fixture) to T5 to lock the regression.

---

## Vitest strategy

### Discipline

- **Pure builders first.** `cursor-user-gates.ts` has zero I/O; test gate constructors with plain object inputs (no `createMockExec` needed). One file per gate kind keeps assertion sets focused.
- **Tools second.** `user-gate.ts` runs the full `runWaveReviewGate` / `runWrapUpGate` with `createMockExec` for `br show`, `br update`, `br ready --json`, and `git status --porcelain`. Already the pattern in `__tests__/tools/user-gate.test.ts` — extend, don't replace.
- **Boundary third.** `server-schemas.test.ts` covers Zod rejection paths without invoking handlers (fastest layer).
- **Snapshots last.** Only the compact-payload snapshots are introduced. Action-id maps are explicit object asserts (more meaningful diffs).

### File layout

```
mcp-server/src/__tests__/
  cursor-user-gates.test.ts                # extend with action-key round-trip
  cursor-user-gates.compact-payload.test.ts # NEW — Zod parse + snapshot
  recover-gates.contract.test.ts            # NEW — command-file structure
  server-schemas.test.ts                    # NEW — Zod rejection matrix
  tools/
    user-gate.test.ts                       # keep existing; remove invalid-action
                                            # fall-through coverage (now errors)
    user-gate.confirm-action.test.ts        # NEW — exhaustive matrix
    user-gate.idempotence.test.ts           # NEW — double confirm = single bump
    user-gate.bead-existence.test.ts        # NEW — missing-id validation
    user-gate.gitporcelain.test.ts          # NEW — rename, space, NUL
```

### Test invariants (assert in code)

- `expect(ctx.state.coordinatorEpoch).toBe(initial)` on every invalid-input path.
- `expect(ctx.state.steeringEvents ?? []).toHaveLength(0)` on every invalid-input path.
- `expect(result.isError).toBe(true)` and `expect(err.data.error.code).toBe(expectedCode)` on every error envelope.
- `expect(result.structuredContent.data.kind).toBe("wave_review_confirmed")` on every success.
- For idempotence: capture `state.coordinatorEpoch` and `state.steeringEvents.length` before+after each call.

### Vitest commands

```bash
cd plugins/cursor-orchestrator/mcp-server
npm test -- user-gate                       # focused
npm test -- cursor-user-gates compact       # builder + boundary
npm test                                    # full suite (CI parity)
npm run build                               # commit dist/ in same PR
```

---

## Acceptance criteria

### Correctness (must pass)

- [ ] `WaveReviewGateArgs.confirmAction` is typed as `WaveReviewConfirmAction | undefined`. Unknown strings fail Zod at the MCP boundary.
- [ ] `confirmWaveReviewAction` is a `switch` with `never` exhaustiveness; adding a new action requires updating `WAVE_REVIEW_CONFIRM_ACTIONS` and the switch (compile-error otherwise).
- [ ] No code path bumps `coordinatorEpoch` or appends a `SteeringEvent` on validation failure.
- [ ] `gateActionsFromOptions` is one line; every shipped option carries `action: ActionKey`.
- [ ] `runWrapUpGate` second confirm with same `confirmWrapUp` is a no-op (no second bump, no second steering event).
- [ ] `runWrapUpGate` already-confirmed build path returns `kind: "wrap_up_already_confirmed"` with `askQuestion: null`.
- [ ] `wrapUpConfirmActionId` is exhaustive (`never` arm; build fails if `WRAP_UP_CONFIRM_ACTIONS` grows without updating it).
- [ ] `gitPorcelain` parses rename arrows and `-z`-separated paths correctly.
- [ ] `acceptWaveBeadsAtReview` is two-phase: validate-all-exist → bump → mutate-all.

### Tests

- [ ] All new test files (T5) pass.
- [ ] `tools/user-gate.ts` coverage ≥ 90% lines.
- [ ] `cursor-user-gates.ts` coverage ≥ 95% lines.
- [ ] No new flake across 3 consecutive `npm test` runs.

### Documentation

- [ ] Both `recover-gates.md` and `flywheel-recover-gates.md` carry an **"On error"** table referencing `unsupported_action`, `invalid_input`, `not_found`, `cli_failure`.
- [ ] Both command files state the `--gates-only` / `--wrap-up-only` mutual exclusion.
- [ ] `rules/cursor-user-gates.mdc` documents the post-confirm `kind` check.
- [ ] `rules/context-budget.mdc` documents the `wrap_up_already_confirmed` skip rule.

### CI / build

- [ ] `cd plugins/cursor-orchestrator/mcp-server && npm test && npm run build` clean.
- [ ] `node scripts/validate-template.mjs && node scripts/verify-cursor-orchestrator.mjs` clean.
- [ ] `npm run lint:skill` clean on updated command files.

---

## Risks & mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Adding required `action` field to `FlywheelUserGateOption` breaks downstream consumers (extension, viewer) | Medium | Build-break in `extensions/cursor-orchestrator-menu/` | Audit consumers in T1; gate option `action` is **output-side only** — consumers that read `data.actions` use the map, not the option field |
| R2 | Tightening Zod on `WaveReviewGateArgs` rejects in-flight requests from older command files | Low | Recovery breaks for users mid-session | Ship T1 + T2 + T6 in **one** PR; command-file changes prevent producing invalid args |
| R3 | New `kind: "wrap_up_already_confirmed"` confuses consumers that switch on `kind` | Medium | Coordinator falls back to default branch — usually fine, but logs noise | Document in `cursor-user-gates.mdc`; T6 adds explicit handling in command files |
| R4 | `validateAllBeadsExist` adds a `readBeads` call to every confirm path | Low | Slight latency on confirm | `readBeads` is already O(1) `br list --json` parse; cache could be added later if needed |
| R5 | `gitPorcelain` rewrite to `-z` may behave differently on Windows shells | Low | wrap-up preview wrong | Add Windows CI matrix entry (existing `orchestrator-mcp.yml` runs ubuntu-latest only — consider adding macos-latest at minimum); fallback unchanged |
| R6 | Snapshot tests churn on innocuous label tweaks | Medium | PR review fatigue | Snapshots cover compact payload shape, not labels — label tweaks change only `askQuestion.questions[0].options[].label`, not `gateMeta.kind` / `actions` |
| R7 | T2 epoch-bump move alters timing of `recordGateSteering` for `flywheel_review('looks-good')` callers that depend on pre-bump observation | Low | None known; epoch is monotonic | Existing `__tests__/coordinator-epoch.test.ts` still passes; bump still happens before tool returns success |
| R8 | Removing label-substring matching breaks any external skill that reverse-engineered the heuristic | Very low | None observed in repo | `gateActionsFromOptions` is internal (no external import); confirmed by `grep -r "gateActionsFromOptions"` |
| R9 | `wrap_up_already_confirmed` short-circuit hides genuine retry needs (e.g., `force: true` not passed by mistake) | Low | User must re-invoke with `force` | Surface clear text in `text` field: "pass force=true to re-prompt" — existing message preserved |
| R10 | Stricter validation surfaces existing-but-tolerated bugs elsewhere in skills | Medium | Cascade of skill edits | Triage in T6; if a skill's gate-call pattern relies on prior tolerance, file a follow-up bead — do not weaken validation |

---

## Out of scope (explicit)

- **Ergonomics polish** (covered by `2026-05-26-ergonomics.md`): naming matrix tweaks, `flywheel_observe` recovery hint (E3), bead-pick second AskQuestion (E4), `suggestedBeadIds` on empty input (E5), `lint:skill` prose-prompt rule (E6).
- **`runGuidedGates`** (`gates.ts`) — the `__gates__` checklist loop is its own subsystem; correctness audit deferred.
- **Outcome grading verdict gate** (`buildWrapUpVerdictGate`) — typed correctly already; covered by `_wrapup.md` flow.
- **Bead approval gates** (`buildBeadReviewGate`, `buildBeadLaunchGate`, `buildBeadLowQualityGate`, `buildBeadHotspotGate`, coverage/dedup) — share the same action-key refactor (T3 covers them via `ACTION_KEYS`), but their flows are governed by `/flywheel-beads-review` not `/recover-gates`. Tests in T5 still round-trip every kind through `CompactGatePayloadSchema` so the contract is enforced uniformly.
- **`flywheel_review('__gates__')` early-exit** — recovery loop today only honors `looks-good` (clean rounds counter); adding a user-facing "abort gates" action is left to a future ergonomics pass.
- **NTM / CLI orchestration** — recovery is Cursor-port only.
- **MCP protocol/schema versioning bump** — additive only; no envelope change.

---

## Cross-references

- **`docs/plans/2026-05-20-correctness.md`** — defines `coordinatorEpoch` invariants (I1–I10), `steeringEvents` ring buffer, `recordGateSteering` semantics. This plan **extends** I1 (monotonicity) with a stricter "no bump on validation failure" rule and adds K9 (idempotence) which complements I4 (stale-tick guard).
- **`docs/plans/2026-05-26-ergonomics.md`** — UX polish layered on top of this plan. Ergonomics improvements (E3 observe hint, E4 bead-pick AskQuestion, E5 suggested ids) **assume** the correctness contracts here; load order is correctness → ergonomics.
- **`plugins/cursor-orchestrator/AGENTS.md`** — "Cursor port" table will gain a Correctness row referencing this plan once T1–T7 land.

---

## File-level change summary

| File | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
|------|----|----|----|----|----|----|----|
| `mcp-server/src/types.ts` | ✓ | – | – | – | – | – | ✓ |
| `mcp-server/src/server.ts` | ✓ | – | – | – | ✓ | – | – |
| `mcp-server/src/tools/user-gate.ts` | – | ✓ | – | ✓ | ✓ | – | – |
| `mcp-server/src/cursor-user-gates.ts` | – | ✓ | ✓ | ✓ | – | – | ✓ |
| `mcp-server/src/steering-events.ts` | – | ✓ | – | – | – | – | – |
| `mcp-server/src/tools/review.ts` | – | ✓ | – | ✓ | – | – | – |
| `mcp-server/src/__tests__/...` | – | – | – | – | ✓ | – | ✓ |
| `plugins/cursor-orchestrator/commands/recover-gates.md` | – | – | – | – | – | ✓ | – |
| `plugins/cursor-orchestrator/commands/flywheel-recover-gates.md` | – | – | – | – | – | ✓ | – |
| `.cursor/commands/recover-gates.md` | – | – | – | – | – | ✓ | – |
| `plugins/cursor-orchestrator/rules/cursor-user-gates.mdc` | – | – | – | – | – | ✓ | – |
| `plugins/cursor-orchestrator/rules/context-budget.mdc` | – | – | – | – | – | ✓ | – |
| `mcp-server/dist/` (committed) | rebuild | rebuild | rebuild | rebuild | – | – | rebuild |

Rebuild + commit `dist/` in the same PR per `plugins/cursor-orchestrator/AGENTS.md` discipline (`dist-drift` CI gate).
