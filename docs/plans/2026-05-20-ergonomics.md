# Ergonomics deep plan: pi-prompt-suggester MCP integration

**Perspective:** Ergonomics — coordinator playbook clarity, `nextActionHint` UX, `flywheel.config.yaml` discoverability, context budget discipline, `AskQuestion` gate integration, agent-native parity with upstream flywheel.

**Date:** 2026-05-20  
**Project:** `/Volumes/1tb/Projects/cursor-agent-flywheel`  
**Sources:**

- [`docs/research-pi-prompt-suggester-integration.md`](../research-pi-prompt-suggester-integration.md)
- [`docs/research-pi-prompt-suggester-2026-05-20.md`](../research-pi-prompt-suggester-2026-05-20.md)
- [`docs/research/pi-prompt-suggester-ergonomics.md`](../research/pi-prompt-suggester-ergonomics.md)
- [`plugins/cursor-orchestrator/skills/start/_implement.cursor.md`](../../plugins/cursor-orchestrator/skills/start/_implement.cursor.md)

**Non-goals (explicit):** Ghost text in Composer, blocking LLM on every turn, Pi extension port, `.pi/suggester/` artifact tree, new slash-command explosion, auto-send suggestions.

---

## Executive summary

The **pi-prompt-suggester** extension solves a problem flywheel coordinators already feel: after a wave completes, an impl tick returns, or a gate resolves, the parent agent must re-read large MCP JSON and phase skills to decide the next move. Pi addresses this with ghost suggestions and generation epochs; flywheel should adopt the **ideas** through existing MCP primitives without importing Pi-specific UX.

This plan specifies three integrated features:

| # | Feature | Ergonomic outcome |
|---|---------|-------------------|
| 1 | **Post-wave `nextActionHint`** | One scannable line after `wave_complete` / `advance_wave` — what tool to call next, with bead ids — without pasting full structured payloads into chat |
| 2 | **Profile refresh on plan drift** | When plan or intent files change on the same git commit, doctor/observe/tick surface **profile stale** instead of silently serving HEAD-only cache |
| 3 | **Impl tick epoch guards** | Stale tick results and Task specs are discarded after gate clicks or wave progress — coordinator playbook documents the check |

Cross-cutting ergonomics:

- **Coordinator playbook** (`buildImplTickCoordinatorPlaybook` + `_implement.cursor.md`) becomes the single human-readable loop doc; hints supplement, never replace, MCP `nextStep` and skills.
- **`flywheel.config.yaml`** gains one `coordinator:` and one `profile:` block — no second settings TUI.
- **Context budget:** hints live in structured MCP output; chat shows one line; full gate JSON never echoed.
- **AskQuestion:** optional `hintSummary` enriches gate descriptions; steering logged from `data.actions` ids, not text diff.
- **Agent-native parity:** same checkpoint fields and tool semantics as upstream flywheel; Cursor port adds compact coordinator affordances only.

**Estimated effort:** 3–5 days across 8 beads (S/M mix). Recommended order: epoch guards → profile drift → hints + steering.

---

## Problem statement (coordinator ergonomics today)

### Pain points observed in Step 7

From `_implement.cursor.md`, the coordinator loop branches on `data.kind` across seven outcomes (`monitor`, `batch_review_*`, `advance_wave`, `dispatch_impl_tasks`, `wave_complete`). Each tick returns:

- A full `coordinatorPlaybook` string (~15 lines) on **every** response
- Snapshot counters (ready/in-progress/closed)
- Optional `implTasks[]` with full marching-order prompts (large)
- Optional `advanceWave` envelope

**What goes wrong:**

1. **Scan fatigue:** Parent agent re-parses JSON to answer "what now?" even when `kind` is obvious.
2. **Race confusion:** User clicks wave review gate while a background tick still returns `dispatch_impl_tasks` from the prior epoch — wrong Tasks spawn.
3. **Stale intent:** Operator edits `docs/plans/*.md` or `AGENTS.md` without re-running profile; discovery/planning context drifts while cache says fresh (same git HEAD).
4. **Repeated nudges:** After user twice picks "fresh-eyes" then skips, coordinator still suggests the same path — no steering memory.
5. **Context bloat:** Models paste `coordinatorPlaybook` or full `implTasks` into chat despite `context-budget.mdc`.

### What pi-prompt-suggester teaches (without porting)

| Pi pattern | Flywheel ergonomic translation |
|------------|--------------------------------|
| Generation epoch | `state.coordinatorEpoch` + `data.epoch` on tick/advance |
| Two-stage intent (seed + turn hint) | `flywheel_profile` seed + template `nextActionHint` |
| Staleness hashing | `profileWatch` fingerprints beyond git HEAD |
| Steering telemetry | `steeringEvents[]` from gate `actionId`, not Jaccard on text |
| Suggest never auto-send | Already aligned with AskQuestion gates |
| Ghost editor | **Skip** — use one-line chat hint + structured field |

---

## Design principles (ergonomics lens)

1. **Advisory hints, authoritative MCP.** Hints never bypass gates, never auto-spawn Tasks, never replace `flywheel_review` / `flywheel_wrap_up_gate`.
2. **One line in chat, details in structured content.** Coordinator may quote `nextActionHint.text` only; must not dump `coordinatorPlaybook` every tick.
3. **Explicit actions over inference.** Steering comes from `data.actions` map (`looks-good-all`, `fresh-eyes`), not lexical comparison of user messages.
4. **Config knob discipline.** Every key in `flywheel.config.yaml` must gate real behavior; no pi-style `transcriptMaxMessages` theater.
5. **Tier C for hints, Tier A for profile refresh.** `coordinator.suggesterModel` defaults to fast tier; never session-default Opus for one-line templates.
6. **Progressive disclosure.** Gate `AskQuestion` descriptions may include `hintSummary`; full Task prompts stay in MCP until spawn.
7. **Agent-native parity.** Checkpoint fields additive; upstream NTM path unchanged; Cursor-only docs in `_implement.cursor.md`.

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Coordinator (Cursor Agent)                     │
│  Reads: data.kind, data.nextActionHint, data.epoch, data.askQuestion   │
│  Chat: one-line hint │ AskQuestion once │ never full gate JSON          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 flywheel_impl_tick      flywheel_advance_wave    flywheel_wave_review_gate
        │                       │                       │
        ├─ coordinatorEpoch ────┼─ bump on gate/review ─┤
        ├─ nextActionHint ──────┼─ on wave_review_gate ─┤
        ├─ profileStale flag ─┼─ from profileWatch ───┤
        └─ coordinatorPlaybook (compact reference) ─────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                       ▼                       ▼
 coordinator-epoch.ts    profile-staleness.ts     cursor-user-gates.ts
 (bump/get/stale)        (hash/register/check)    (hintSummary optional)
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                ▼
                    .pi-flywheel/checkpoint.json
                    (coordinatorEpoch, steeringEvents[],
                     profileWatch, profileStale)
```

### Data flow: wave complete → review → next wave

```
impl agents finish
    → flywheel_impl_tick({ closedBeadIds })
        → runAdvanceWave → waveComplete + nextStep.wave_review_gate
        → returns kind: wave_complete
        → nextActionHint: { text, primaryTool: flywheel_wave_review_gate, beadIds, generationEpoch }
    → coordinator quotes hint one line in chat
    → flywheel_wave_review_gate → AskQuestion (optional hintSummary in description)
    → user picks option → map via data.actions
    → record SteeringEvent; bump coordinatorEpoch
    → flywheel_review per action
    → flywheel_impl_tick (fresh epoch) → advance_wave or dispatch_impl_tasks
```

### Staleness flow: plan edit without commit

```
operator edits docs/plans/foo.md (same git HEAD)
    → checkProfileStaleness on observe/tick/doctor
    → profileStale: true, profileStaleReason: "plan file changed"
    → observe hint severity: warn
    → nextActionHint may append: "Profile stale — run flywheel_profile({ force: true }) when convenient."
    → coordinator calls flywheel_profile({ force: true })
    → watch registry refreshed; profileStale cleared
```

---

## Feature 1: Post-wave `nextActionHint`

### UX specification

**Primary surface:** `structuredContent.data.nextActionHint` on:

- `flywheel_impl_tick` when `kind === 'wave_complete'`
- `flywheel_impl_tick` when `kind === 'advance_wave'` or `dispatch_impl_tasks` (idle capacity)
- `flywheel_advance_wave` when `nextStep.kind === 'wave_review_gate'`

**Chat surface:** Coordinator SHOULD emit exactly:

> **Next:** Wave done (3 beads). Run wave review gate, then spawn wave 2 or wrap up.

**Structured shape:**

```typescript
interface CoordinatorNextActionHint {
  /** Single line, ≤120 chars in v1 templates */
  text: string;
  /** MCP tool name for the primary next call */
  primaryTool:
    | 'flywheel_wave_review_gate'
    | 'flywheel_impl_tick'
    | 'flywheel_wrap_up_gate'
    | 'flywheel_review'
    | 'flywheel_profile';
  beadIds?: string[];
  /** Matches coordinatorEpoch at hint emission time */
  generationEpoch: number;
  /** Optional expand key for coordinator — not shown in chat by default */
  detailRef?: 'advanceWave' | 'implTasks' | 'reviewEnvelope';
}
```

### Template catalog (v1 — no LLM)

| Trigger | `primaryTool` | Template |
|---------|---------------|----------|
| `wave_complete` | `flywheel_wave_review_gate` | `Wave done ({n} beads). Run wave review gate, then spawn wave {next} or wrap up.` |
| `advance_wave` + prompts | `flywheel_impl_tick` | `Next wave ready ({n} beads). Spawn impl Tasks from tick, stagger ~30s.` |
| `dispatch_impl_tasks` | `flywheel_impl_tick` | `Idle capacity — {n} ready beads. Spawn Tasks or wait for in-progress.` |
| `monitor` + queue empty | `flywheel_wrap_up_gate` | `Queue drained. Run wrap-up gate before commit.` |
| `profileStale` on tick | `flywheel_profile` | `Profile stale ({reason}). Refresh with flywheel_profile({ force: true }).` |

### Post-gate hint mapping (after wave review resolves)

When coordinator maps `data.actions` from wave review gate:

| Action id | Follow-up hint |
|-----------|----------------|
| `looks-good-all` | `Accepted wave. Call flywheel_impl_tick or advance if more beads ready.` |
| `fresh-eyes` | `Spawn fresh-eyes on {beadId}, then re-run wave review.` |
| `self-review` | `Self-review {beadId}, then flywheel_review looks-good.` |
| `duel-review` | `Spawn duel review Task for risky beads, then wave review again.` |

Hints emitted on the **next** tick or via `flywheel_review` structured response — not auto-sent.

### v2 optional: LLM-compressed hints

Guarded by config:

```yaml
coordinator:
  nextActionHints: true
  suggesterModel: composer-2.5-fast  # Tier C
  hintMaxChars: 120
  llmHints: false   # v2 — default off
```

When `llmHints: true`, background Task inputs: last closed bead titles, `selectedGoal`, next ready bead title, last `SteeringEvent`. Output one line; **must** include `generationEpoch`; discard if epoch bumped before Task returns.

### Ergonomic integration with context budget

| Do | Don't |
|----|-------|
| Quote `nextActionHint.text` in chat | Paste `coordinatorPlaybook` every tick |
| Use `detailRef` to know where full prompts live | Inline `implTasks[].prompt` in chat |
| Load `_implement.cursor.md` once per Step 7 session | Re-read skill on every tick |
| Call `flywheel_get_skill` for phase bodies | `includeBodyInText: true` |

### AskQuestion enhancement (optional v1.1)

Extend `FlywheelUserGate` in `cursor-user-gates.ts`:

```typescript
interface FlywheelUserGate {
  // ...existing fields...
  /** One line for AskQuestion question description — not coordinatorAction */
  hintSummary?: string;
}
```

Example wave review gate description:

> Wave 3 complete (beads: abc-1, abc-2, abc-3). **Suggested:** fresh-eyes on abc-2 (security path).

User still clicks; no pre-send. `hintSummary` is derived from bead risk tags + template, not LLM, in v1.

---

## Feature 2: Profile refresh on plan drift

### UX specification

**Operator-visible signals:**

| Surface | Signal |
|---------|--------|
| `flywheel_observe` | `hints[]`: `{ severity: 'warn', message: 'Profile stale — plan file changed' }` |
| `flywheel_impl_tick` | `snapshot.profileStale: true`, optional `nextActionHint` → profile refresh |
| `flywheel_doctor` | Check `profile_intent_stale`: **yellow** |
| Chat (coordinator) | One line when stale detected at session resume |

**Not operator-visible:** Raw SHA256 list in checkpoint (inspect via observe structured only if needed).

### Watched files

| Path | Registration trigger |
|------|---------------------|
| `state.planDocument` | `flywheel_plan` registers plan |
| `AGENTS.md`, `README.md` | Always at project root |
| `flywheel.config.yaml` | Always (root + plugin copy if present) |
| `.pi-flywheel/plans/<slug>/rubric.md` | After `flywheel_synthesize_rubric` |

### Checkpoint fields

```typescript
interface ProfileWatchState {
  registeredAt: string;
  files: Array<{ path: string; sha256: string }>;
}

// On FlywheelState:
profileWatch?: ProfileWatchState;
profileStale?: boolean;
profileStaleReason?: string;
lastProfileRefreshAt?: string;
```

### Refresh policy (`flywheel.config.yaml`)

```yaml
profile:
  watchIntentFiles: true
  staleAction: nudge      # nudge | auto_refresh
  debounceSeconds: 300
```

- **`nudge` (default):** Set flags + hints; coordinator refreshes when convenient (e.g. before discover/plan, or at impl tick if stale > debounce).
- **`auto_refresh`:** Debounced `profileRepo()` fire-and-forget; never blocks tick; clears stale on success.

**Ergonomics:** Avoid pi's "reseed storm" — no LLM seeder on every turn; reuse existing `profileRepo()` collectors only.

### Coordinator playbook addition

Add to `_implement.cursor.md` pre-loop or tick section:

> If `observe` or tick reports `profileStale`, call `flywheel_profile({ force: true })` once before the next discover/plan/implement wave — unless you are mid-gate (finish gate first).

---

## Feature 3: Impl tick epoch guards

### UX specification

**Coordinator rule (documented in playbook):**

> Before spawning Tasks from a prior tick, verify `response.data.epoch === checkpoint.coordinatorEpoch`. On mismatch, discard the response and re-call `flywheel_impl_tick`.

**Server rule:**

If tick completes and `state.coordinatorEpoch !== epochAtTickStart`, return:

```typescript
{
  kind: 'stale',
  epochAtTickStart: number,
  currentEpoch: number,
  nextActionHint: {
    text: 'Tick result stale — user acted during tick. Re-call flywheel_impl_tick.',
    primaryTool: 'flywheel_impl_tick',
    generationEpoch: currentEpoch,
  }
}
```

No `implTasks` in stale response — prevents wrong spawns.

### Epoch bump events

| Event | Module |
|-------|--------|
| Wave review gate resolved → `flywheel_review` | `tools/review.ts` |
| Wrap-up gate confirmed | `tools/user-gate.ts` |
| `flywheel_advance_wave` entry | `tools/advance-wave.ts` |
| `closedBeadIds` passed to impl_tick | `cursor-impl-tick.ts` |
| Phase regression (`__regress_to_*__`) | `tools/review.ts` |
| Bead launch gate → `flywheel_approve_beads start` | `tools/approve-beads.ts` (optional v1.1) |

### Tagging outgoing work

Every tagged artifact carries `generationEpoch`:

- `flywheel_impl_tick` → `data.epoch`
- `nextActionHint.generationEpoch`
- Each `implTasks[]` entry → `epoch` field (new optional property)
- `flywheel_advance_wave` → `dispatchEpoch`

Coordinator compares before **each** Task spawn batch.

### Playbook diff (`buildImplTickCoordinatorPlaybook`)

Insert after step 2:

```
2b. Before spawning Tasks from tick data, confirm data.epoch matches checkpoint coordinatorEpoch.
    If flywheel_impl_tick returns kind: stale, re-call immediately — do not spawn.
```

---

## Cross-feature: Steering suppression

### Behavior

When user repeatedly rejects the same coordinator nudge (e.g. picks `skip` or defers fresh-eyes twice for same bead set), suppress identical `nextActionHint` for that `normalizedKey`.

```typescript
interface SteeringEvent {
  at: string;  // ISO-8601
  source: 'wave_review' | 'wrap_up' | 'bead_launch';
  actionId: string;
  beadIds?: string[];
  normalizedKey: string;  // hash(actionId + sorted beadIds)
}
```

**Suppression rule:** If last 3 `steeringEvents` share `normalizedKey` and `actionId` is in `coordinator.suppressRepeatActions` (default: defer/skip paths), skip hint emission once; still return full MCP `nextStep`.

**Ergonomics:** Reduces nagging without hiding gate requirements — gates remain mandatory via MCP tools.

---

## `flywheel.config.yaml` schema (additive)

Full block for template and plugin default:

```yaml
# --- pi-prompt-suggester ergonomics port (v3.19+) ---

coordinator:
  epochGuards: true              # Feature 3 — default on
  nextActionHints: true          # Feature 1 — template hints
  llmHints: false                # v2 — LLM one-liners
  suggesterModel: composer-2.5-fast
  hintMaxChars: 120
  suppressRepeatActions:         # steering suppression
    - skip
    - defer

profile:
  watchIntentFiles: true
  staleAction: nudge             # nudge | auto_refresh
  debounceSeconds: 300

# Existing keys unchanged:
# deep_plan, implement, duel, convergence, impl_tick, grader, ...
```

### Env overrides (parity with existing patterns)

| Env | Purpose |
|-----|---------|
| `FW_COORDINATOR_EPOCH_GUARDS=0` | Disable epoch stale kind (emergency) |
| `FW_NEXT_ACTION_HINTS=0` | Disable hint emission |
| `FW_PROFILE_WATCH=0` | Disable intent file watching |
| `FW_PROFILE_STALE_ACTION=auto_refresh` | Override staleAction |

Document in plugin `AGENTS.md` env table; do not add new slash commands.

---

## Coordinator playbook (`_implement.cursor.md`) changes

### Section: Supervision loop — add hint + epoch rows

Extend the `data.kind` table:

| `data.kind` | Coordinator action |
|-------------|-------------------|
| `stale` | Epoch mismatch — re-call `flywheel_impl_tick` immediately; do not spawn Tasks |
| `wave_complete` | Quote `nextActionHint.text` → `flywheel_wave_review_gate` → **AskQuestion** |
| *(all kinds)* | If `snapshot.profileStale`, note one line; refresh profile when not mid-gate |

### Section: New "Hint discipline"

```markdown
### Hint discipline (context budget)

- **Chat:** At most one line from `nextActionHint.text` per tick.
- **Never** echo full `coordinatorPlaybook`, `implTasks[].prompt`, or gate JSON.
- Hints are advisory; gates and `nextStep` are authoritative.
- Verify `data.epoch` before spawning Tasks from a prior tick response.
```

### Section: Wave end — tie hint to gate

Replace bare `wave_complete` row with:

> `wave_complete` → read `nextActionHint` → `flywheel_wave_review_gate({ beadIds })` → **AskQuestion** with `data.askQuestion` → map `data.actions` → record steering → `flywheel_review`.

### `buildImplTickCoordinatorPlaybook` alignment

Keep playbook as **reference** for models that lost skill context; shorten default emission:

- v1: Still include playbook in structured output (backward compatible)
- v1.1 (optional): Add `coordinatorPlaybookCompact: string` (5 lines) when `nextActionHints: true`; full playbook behind `detailRef`

---

## AskQuestion integration

### Current contract (preserve)

From `cursor-user-gates.mdc` and `context-budget.mdc`:

1. MCP returns compact payload: `gateMeta`, `askQuestion`, `actions`
2. Coordinator calls **AskQuestion** once with `data.askQuestion`
3. Map clicked id via `data.actions`
4. Do not echo full gate JSON

### Enhancements (ergonomics)

| Enhancement | Mechanism |
|-------------|-----------|
| Richer gate descriptions | `hintSummary` on `FlywheelUserGate` → maps to `AskQuestion.questions[].prompt` suffix |
| Post-choice guidance | Next tick's `nextActionHint` reflects chosen `actionId` |
| Hide hints mid-gate | If `state.pendingUserGate` (future) or last tool was gate without resolution, omit `nextActionHint` |
| Progressive disclosure | `coordinatorAction` on gate options stays in structured `actions` map — not chat |

### Fallback (models without AskQuestion)

Unchanged: present numbered `userGate.options` from compact payload; hints still one line.

---

## Agent-native parity checklist

Ensure Cursor port remains aligned with upstream flywheel semantics:

| Concern | Parity requirement |
|---------|-------------------|
| Checkpoint schema | All new fields optional; migration test updated |
| Tool names | `flywheel_*` canonical; `orch_*` aliases unchanged |
| NTM path | No changes to `skills/legacy/ntm/*`; epoch/hints Cursor-only in structured fields |
| Gate mandatory | Wave review / wrap-up gates still required — hints don't skip |
| Profile tool | `flywheel_profile({ force: true })` semantics unchanged; watch registry additive |
| Doctor | New check `profile_intent_stale` follows existing severity patterns |
| Error envelope | No new fatal codes for hints; `stale` tick kind is success status `ok` |
| Structured contract tests | Extend `structured-contract-state-coherence.test.ts` |
| Upstream sync | Document in `SYNC_MANIFEST.json` notes when landing |

Reference: [`docs/plans/agent-flywheel-cursor-parity.md`](./agent-flywheel-cursor-parity.md).

---

## Implementation phases

### Phase 0: Foundation (epoch — highest ROI, lowest UX risk)

**Beads:** T1, T2, T3

- Add `coordinator-epoch.ts` + `state.coordinatorEpoch`
- Tag `flywheel_impl_tick` responses with `data.epoch`
- Bump epoch on review/gate/advance paths
- Return `kind: 'stale'` when epoch drifts during tick
- Update `_implement.cursor.md` + `buildImplTickCoordinatorPlaybook`
- Tests: epoch bump, stale kind, playbook contains step 2b

**Exit criteria:** Coordinator doc explicit; stale tick never returns `implTasks`.

### Phase 1: Profile drift (visibility)

**Beads:** T6, T7

- Add `profile-staleness.ts`
- Register watch on plan/rubric/config
- Surface in observe, doctor, tick snapshot
- Config block `profile:*`
- Tests: hash change → stale; force refresh clears

**Exit criteria:** Doctor yellow when plan edited; observe hint on resume.

### Phase 2: Hints + steering (UX polish)

**Beads:** T4, T5, T8

- `nextActionHint` templates on wave_complete / advance / dispatch
- `steeringEvents[]` + suppression
- Optional `hintSummary` on wave review gate
- Config block `coordinator:*`
- Tests: hint shape, suppression after repeat action

**Exit criteria:** `wave_complete` includes hint with bead ids; chat discipline documented.

### Phase 3: v2 optional (defer unless requested)

- LLM hints via `coordinator.llmHints`
- `coordinatorPlaybookCompact`
- NDJSON event log `.pi-flywheel/logs/coordinator-events.ndjson`
- Activity Bar extension shows last hint (extension scope — separate plan)

---

## File-level changes (complete map)

### New files

| File | Purpose |
|------|---------|
| `mcp-server/src/coordinator-epoch.ts` | `bumpCoordinatorEpoch`, `getCoordinatorEpoch` |
| `mcp-server/src/profile-staleness.ts` | `hashFile`, `registerProfileWatch`, `checkProfileStaleness` |
| `mcp-server/src/coordinator-hints.ts` | Template hint builder, steering suppression |
| `mcp-server/src/__tests__/coordinator-epoch.test.ts` | Epoch unit tests |
| `mcp-server/src/__tests__/profile-staleness.test.ts` | Staleness unit tests |
| `mcp-server/src/__tests__/coordinator-hints.test.ts` | Hint + suppression tests |

### Modified files — MCP server

| File | Changes |
|------|---------|
| `mcp-server/src/types.ts` | `CoordinatorNextActionHint`, `SteeringEvent`, `ProfileWatchState`, `coordinatorEpoch`, extend `ImplTickStructured` |
| `mcp-server/src/cursor-impl-tick.ts` | Epoch capture, stale kind, hints, profileStale in snapshot, compact playbook option |
| `mcp-server/src/tools/advance-wave.ts` | Hint on wave_review_gate; bump epoch on entry; dispatchEpoch |
| `mcp-server/src/tools/review.ts` | Bump epoch on looks-good/hit-me/skip/regression; record steering |
| `mcp-server/src/tools/user-gate.ts` | Bump epoch on wrap-up confirm; steering on wrap-up actions |
| `mcp-server/src/tools/profile.ts` | Update watch registry; clear stale on force refresh |
| `mcp-server/src/tools/plan.ts` | `registerProfileWatch` on plan register |
| `mcp-server/src/tools/observe.ts` | `profileStale` in hints |
| `mcp-server/src/tools/doctor.ts` | `profile_intent_stale` check |
| `mcp-server/src/cursor-user-gates.ts` | Optional `hintSummary`; export for wave review |
| `mcp-server/src/flywheel-config.ts` | Parse `coordinator` + `profile` blocks |
| `mcp-server/dist/*` | Rebuild committed |

### Modified files — skills / rules / config

| File | Changes |
|------|---------|
| `plugins/cursor-orchestrator/skills/start/_implement.cursor.md` | Hint discipline, epoch check, profile stale note, wave_complete flow |
| `plugins/cursor-orchestrator/skills/start/_review.md` | One paragraph: steering events recorded from gate actions |
| `.cursor/rules/context-budget.mdc` | Add bullet: quote `nextActionHint.text` only |
| `flywheel.config.yaml` | Add `coordinator` + `profile` blocks with comments |
| `plugins/cursor-orchestrator/flywheel.config.yaml` | Same blocks (plugin template) |
| `plugins/cursor-orchestrator/AGENTS.md` | Env table rows; doctor check count +1 |

### Not changed (explicit)

- Pi extension code, ghost editor, `.pi/suggester/`
- NTM implement path (`FW_IMPL_BACKEND=ntm`)
- Gate mandatory semantics
- `flywheel_capabilities` / `flywheel_robot_docs` (avoid bloat unless version bump)

---

## Testing strategy

### Unit tests (Vitest)

| Suite | Cases |
|-------|-------|
| `coordinator-epoch.test.ts` | bump increments; default 0; persists via saveState mock |
| `profile-staleness.test.ts` | register watch; content change → stale; same hash → fresh; missing file → stale |
| `coordinator-hints.test.ts` | wave_complete template; max chars; suppression after 3 repeats |
| `cursor-impl-tick.test.ts` | `nextActionHint` on wave_complete; `kind: stale` when epoch bumps mid-tick; `data.epoch` present |
| `user-gate.test.ts` | steering event appended on mock review resolution |
| `observe.test.ts` | warn hint when profileStale |
| `doctor.test.ts` | `profile_intent_stale` yellow |

### Integration / contract tests

- Extend `structured-contract-state-coherence.test.ts` for new checkpoint fields
- Golden snapshot: `flywheel_impl_tick` wave_complete structured shape (hint + epoch)

### Manual smoke (Cursor IDE)

1. `/start` → implement wave with 2 beads
2. Close beads → tick with `closedBeadIds` → verify hint one line in coordinator chat
3. During tick delay, click wave review gate → confirm stale or fresh epoch on re-tick
4. Edit plan file without commit → `flywheel_observe` shows warn
5. `flywheel_doctor` shows yellow `profile_intent_stale`
6. Pick same skip action twice → third hint suppressed

### Lint / CI

```bash
cd plugins/cursor-orchestrator/mcp-server && npm test
cd plugins/cursor-orchestrator/mcp-server && npm run build
node scripts/verify-cursor-orchestrator.mjs
```

---

## Acceptance criteria

### Feature 1: nextActionHint

- [ ] `flywheel_impl_tick` returns `nextActionHint` when `kind === 'wave_complete'`
- [ ] Hint includes correct `beadIds` and `primaryTool: flywheel_wave_review_gate`
- [ ] Hint text ≤120 chars for template v1
- [ ] `_implement.cursor.md` documents hint discipline (one line in chat)
- [ ] No auto-spawn or auto-gate from hint alone

### Feature 2: Profile drift

- [ ] Editing registered plan file on same git HEAD sets `profileStale`
- [ ] `flywheel_observe` emits warn hint when stale
- [ ] `flywheel_doctor` reports `profile_intent_stale` yellow
- [ ] `flywheel_profile({ force: true })` clears stale and updates watch registry
- [ ] `auto_refresh` debounces per config (test with fake timers)

### Feature 3: Epoch guards

- [ ] `state.coordinatorEpoch` monotonic; persisted in checkpoint
- [ ] Every impl_tick response includes `data.epoch`
- [ ] Epoch bump on wave review resolution and wrap-up confirm
- [ ] Stale tick returns `kind: 'stale'` without `implTasks`
- [ ] Playbook documents epoch verification before Task spawn

### Cross-cutting ergonomics

- [ ] `flywheel.config.yaml` documents all new keys
- [ ] Context budget rule updated for hints
- [ ] AskQuestion flow unchanged; optional `hintSummary` does not replace gate
- [ ] Agent-native parity: migration test passes; optional fields only
- [ ] All new tests green in CI

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Coordinators ignore epoch check | High | Stale kind server-side; playbook hard rule; lint skill spot-check |
| Hint contradicts MCP `nextStep` | High | Hints generated from same code path as nextStep; single builder function |
| Profile auto_refresh storm | Medium | Debounce 300s; no LLM seeder; doctor surfaces failures |
| Context bloat from playbook | Medium | Compact playbook v1.1; context-budget.mdc; hint replaces playbook in chat |
| Steering suppression hides needed nudge | Medium | Suppress hint only, not gates; max 1 suppression per key |
| Config drift (two yaml copies) | Low | Sync root + plugin template in same PR |
| Upstream merge conflicts | Low | Optional checkpoint fields; document in SYNC_MANIFEST |
| LLM hints (v2) wrong tool | Medium | Defer v2; template-only v1; epoch guard on async |
| AskQuestion models skip UI | Low | Existing fallback numbered options |
| Test flakiness on timing | Low | `vi.useFakeTimers` for debounce tests |

---

## Bead breakdown (for `/start`)

| Bead | Title | Effort | Phase | Depends |
|------|-------|--------|-------|---------|
| T1 | Add `coordinatorEpoch` + bump helpers + tests | S | 0 | — |
| T2 | Impl tick epoch tagging + stale kind | S | 0 | T1 |
| T3 | Bump epoch on review/gate/advance paths | S | 0 | T1 |
| T4 | `nextActionHint` templates on wave_complete/advance_wave | M | 2 | T1 |
| T5 | `steeringEvents` + repeat suppression | S | 2 | T4 |
| T6 | `profile-staleness.ts` + watch registry | M | 1 | — |
| T7 | observe/doctor/tick stale surfacing | S | 1 | T6 |
| T8 | Update `_implement.cursor.md` + playbook + config template | S | 0–2 | T2, T4, T7 |

**Total:** ~3–5 days engineering + 0.5 day doc/CI.

---

## Rollout and documentation

1. Land Phase 0 behind `coordinator.epochGuards: true` (default on).
2. CHANGELOG entry under v3.19.0 "Coordinator ergonomics (pi-prompt-suggester patterns)".
3. No new slash commands — discoverability via doctor hints + `_implement.cursor.md`.
4. Optional: one paragraph in root `AGENTS.md` linking this plan and config blocks.
5. CASS store pattern: "epoch mismatch → re-tick" after first production use.

---

## Appendix A: Example structured tick response (wave complete)

```json
{
  "tool": "flywheel_impl_tick",
  "version": 1,
  "status": "ok",
  "data": {
    "kind": "wave_complete",
    "epoch": 7,
    "tickAt": "2026-05-20T18:00:00.000Z",
    "nextTickInSeconds": 240,
    "snapshot": {
      "headSha": "abc123",
      "readyCount": 0,
      "inProgressCount": 0,
      "closedCount": 12,
      "profileStale": false
    },
    "nextActionHint": {
      "text": "Wave done (3 beads). Run wave review gate, then spawn wave 2 or wrap up.",
      "primaryTool": "flywheel_wave_review_gate",
      "beadIds": ["br-a1", "br-a2", "br-a3"],
      "generationEpoch": 7
    },
    "coordinatorPlaybook": "…"
  }
}
```

## Appendix B: Example stale tick response

```json
{
  "data": {
    "kind": "stale",
    "epoch": 8,
    "epochAtTickStart": 7,
    "nextActionHint": {
      "text": "Tick result stale — re-call flywheel_impl_tick.",
      "primaryTool": "flywheel_impl_tick",
      "generationEpoch": 8
    }
  }
}
```

## Appendix C: Coordinator chat examples (good vs bad)

**Good:**

> Wave 3 complete. **Next:** Run wave review gate for br-a1, br-a2, br-a3.

**Bad:**

> Here's the full tick response: { "kind": "wave_complete", "coordinatorPlaybook": "…15 lines…", "implTasks": […] }

## Appendix D: Relationship to pi-prompt-suggester features explicitly skipped

| Pi feature | Flywheel decision |
|------------|-------------------|
| GhostSuggestionEditor | Skip — use chat one-liner |
| Blocking agent_end LLM | Skip — template hints; optional async v2 |
| Agentic 16-step seeder | Skip — `profileRepo` only |
| Jaccard steering classifier | Skip — gate action ids |
| `/suggesterSettings` TUI | Skip — yaml + doctor |
| Space to accept | Skip — AskQuestion click |

---

## Recommended next step

Run **`/start`** with goal: *Implement pi-prompt-suggester ergonomics port (epoch, profile drift, nextActionHint)* — or invoke **`implement now`** for Phase 0 only (T1–T3) as the lowest-risk first landing.
