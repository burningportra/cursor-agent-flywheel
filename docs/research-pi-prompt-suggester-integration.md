# Integration Proposal: pi-prompt-suggester patterns (items 1–3)

**Source:** https://github.com/guwidoe/pi-prompt-suggester @ c21bea2  
**Date:** 2026-05-20  
**Scope:** Post-wave next-action hints · profile refresh on plan drift · impl-tick epoch guards

Parent research: [`research-pi-prompt-suggester-2026-05-20.md`](./research-pi-prompt-suggester-2026-05-20.md)

---

## Goals

| # | Feature | User outcome |
|---|---------|--------------|
| 1 | **Post-wave next-action hints** | After a wave completes, coordinator sees one compact line: what to do next (review gate, next wave, wrap-up) without re-reading full MCP JSON |
| 2 | **Profile refresh on plan drift** | When plan or intent files change, flywheel detects staleness and nudges (or auto-triggers) `flywheel_profile({ force: true })` |
| 3 | **Impl tick epoch guards** | Async tick/advance_wave results are dropped if the user acted meanwhile (gate click, new submit) |

**Non-goals:** Ghost text in Composer, blocking LLM on every turn, Pi extension port, `.pi/suggester/` artifact tree.

---

## Feature 1: Post-wave next-action hints

### Behavior

When `flywheel_impl_tick` returns `kind: 'wave_complete'` or `flywheel_advance_wave` sets `nextStep.kind === 'wave_review_gate'`, attach a **single-line coordinator hint** in structured output:

```json
{
  "nextActionHint": {
    "text": "Wave done (3 beads). Run wave review gate, then spawn wave 2 or wrap up.",
    "primaryTool": "flywheel_wave_review_gate",
    "beadIds": ["abc-1", "abc-2", "abc-3"],
    "generationEpoch": 42
  }
}
```

After wave review gate resolves, record steering and optionally suggest the **next** action:

| Gate choice (`actions` id) | Hint text |
|----------------------------|-----------|
| `looks-good-all` / `1` | "Accepted wave. Call `flywheel_impl_tick` or advance if more beads ready." |
| `fresh-eyes` / `3` | "Spawn fresh-eyes on `<beadId>`, then re-run wave review." |
| `self-review` / `2` | "Self-review `<beadId>`, then `flywheel_review looks-good`." |

Hints are **advisory** — coordinator still follows MCP `nextStep` and skills; hint is for human scan + context budget.

### Implementation map

| File | Change |
|------|--------|
| `mcp-server/src/types.ts` | Add `CoordinatorNextActionHint`, `SteeringEvent`, `coordinatorEpoch`, `steeringEvents?[]` to `FlywheelState` |
| `mcp-server/src/cursor-impl-tick.ts` | Populate `nextActionHint` on `wave_complete`, `advance_wave`, `dispatch_impl_tasks` |
| `mcp-server/src/tools/advance-wave.ts` | Same hint on `wave_review_gate` nextStep |
| `mcp-server/src/tools/user-gate.ts` | On wave review resolution path (via `flywheel_review` caller): append `SteeringEvent` when coordinator maps `actions` |
| `mcp-server/src/cursor-user-gates.ts` | Optional: one-line `hintSummary` on `FlywheelUserGate` for AskQuestion description |

### Suggestion content (Tier C, async, optional v2)

**v1 (no LLM):** Template hints from bead titles + queue state (ready count, phase).

**v2 (optional):** Background Task with `flywheel.config.yaml`:

```yaml
coordinator_hint:
  model: composer-2.5-fast
  enabled: true
  maxChars: 120
```

Inputs: last closed bead titles, `selectedGoal`, next ready bead title, last steering event. Output: one line only. Guard with epoch (Feature 3).

### Tests

- `cursor-impl-tick.test.ts`: `wave_complete` includes `nextActionHint` with bead ids
- `user-gate.test.ts`: steering event shape when review action recorded (mock saveState)

---

## Feature 2: Profile refresh on plan drift

### Current state

`profiler.ts` already caches by **git HEAD only** (`profile-cache.json`). Plan edits on the same commit do not invalidate cache. `flywheel_profile({ force: true })` bypasses cache.

### Behavior

Track **intent file fingerprints** separately from git HEAD:

| Watched path | When registered |
|--------------|-----------------|
| `state.planDocument` | After `flywheel_plan` registers plan |
| `AGENTS.md`, `README.md` | Always (project root) |
| `flywheel.config.yaml` | Always |
| `.pi-flywheel/plans/<slug>/rubric.md` | After rubric synthesize |

Store in checkpoint:

```typescript
profileWatch?: {
  registeredAt: string;
  files: Array<{ path: string; sha256: string }>;
};
profileStale?: boolean;
profileStaleReason?: string;
lastProfileRefreshAt?: string;
```

**Staleness check** runs in:

- `flywheel_observe` (hint: `severity: warn`, "Profile stale — plan file changed")
- `flywheel_impl_tick` (snapshot flag `profileStale: true`)
- `flywheel_doctor` (new check `profile_intent_stale`: yellow)

**Refresh policy (configurable):**

```yaml
profile:
  watchIntentFiles: true
  staleAction: nudge   # nudge | auto_refresh
  debounceSeconds: 300
```

- `nudge` (default): set `profileStale`, hint in observe/tick; coordinator calls `flywheel_profile({ force: true })` when convenient
- `auto_refresh`: debounced background profile (fire-and-forget in `profile.ts`, same as cache write today)

**Do not** run agentic 16-step seeder; reuse existing `profileRepo()` collectors.

### Implementation map

| File | Change |
|------|--------|
| `mcp-server/src/types.ts` | `ProfileWatchState` fields on `FlywheelState` |
| `mcp-server/src/profile-staleness.ts` | **New:** `hashFile`, `registerProfileWatch`, `checkProfileStaleness` |
| `mcp-server/src/tools/profile.ts` | After scan: update watch registry; on `force`: clear stale flags |
| `mcp-server/src/tools/plan.ts` | Call `registerProfileWatch` when plan file registered |
| `mcp-server/src/tools/observe.ts` | Include `profileStale` in hints |
| `mcp-server/src/tools/doctor.ts` | Add `profile_intent_stale` check |
| `mcp-server/src/cursor-impl-tick.ts` | Include `profileStale` in snapshot |

### Tests

- `profile-staleness.test.ts`: hash change on plan file → stale; same content → not stale
- `observe.test.ts`: hint when stale flag set

---

## Feature 3: Impl tick epoch guards

### Problem

Coordinator may:

1. Call `flywheel_impl_tick` → get `dispatch_impl_tasks` with Task specs
2. User clicks wave review gate or starts new work
3. Stale tick result still spawns old tasks or shows outdated wave

Pi solves with `RuntimeRef.bumpEpoch()` + `generationId` on async sinks.

### Behavior

Add monotonic **`state.coordinatorEpoch`** (integer, default 0).

**Bump epoch when:**

| Event | Location |
|-------|----------|
| User resolves wave review gate (via `flywheel_review` after gate) | `tools/review.ts` |
| User resolves wrap-up gate | `tools/user-gate.ts` / wrap-up confirm |
| `flywheel_advance_wave` starts (before async work) | `tools/advance-wave.ts` |
| `closedBeadIds` passed to impl_tick (user signaled wave progress) | `cursor-impl-tick.ts` |
| Phase regression beads (`__regress_to_*__`) | `tools/review.ts` |

**Tag outgoing work:**

- Every `flywheel_impl_tick` response: `data.epoch: state.coordinatorEpoch` (at tick start)
- Every `implTasks[]` entry and `nextActionHint.generationEpoch`
- `flywheel_advance_wave` verification block: `dispatchEpoch`

**Consumer rule (coordinator skill + playbook):**

> Before spawning Tasks from a prior tick, verify `response.data.epoch === current checkpoint coordinatorEpoch`. If mismatch, discard and re-call `flywheel_impl_tick`.

**Server-side guard (optional hard drop):**

If tick completes and `state.coordinatorEpoch !== epochAtTickStart`, return `kind: 'stale'` instead of impl tasks (prevents race within same process).

### Implementation map

| File | Change |
|------|--------|
| `mcp-server/src/types.ts` | `coordinatorEpoch?: number` |
| `mcp-server/src/coordinator-epoch.ts` | **New:** `bumpCoordinatorEpoch(state)`, `getCoordinatorEpoch(state)` |
| `mcp-server/src/cursor-impl-tick.ts` | Capture epoch at start; attach to structured output; stale kind |
| `mcp-server/src/tools/advance-wave.ts` | Bump on entry; tag prompts |
| `mcp-server/src/tools/review.ts` | Bump on looks-good / hit-me / skip after gate |
| `skills/start/_implement.cursor.md` | Document epoch check in coordinator playbook |
| `cursor-impl-tick.ts` `buildImplTickCoordinatorPlaybook` | Add epoch verification step |

### Tests

- Epoch bumps on review looks-good
- Tick started at epoch 5, bumped to 6 before return → `kind: 'stale'` or omitted implTasks
- `nextActionHint.generationEpoch` matches tick epoch

---

## Cross-feature: steering suppression (supports #1)

When user picks `changed_course` equivalent (e.g. skipped fresh-eyes twice for same bead), suppress repeating the same hint:

```typescript
interface SteeringEvent {
  at: string;
  source: 'wave_review' | 'wrap_up' | 'bead_launch';
  actionId: string;       // e.g. "fresh-eyes", "looks-good-all"
  beadIds?: string[];
  normalizedKey: string;  // hash of actionId + sorted beadIds
}
```

Before emitting `nextActionHint`, skip if last 3 steering events contain same `normalizedKey` with rejection semantics (configurable list: defer, skip review paths).

---

## Config block (flywheel.config.yaml)

```yaml
coordinator:
  epochGuards: true
  nextActionHints: true
  suggesterModel: composer-2.5-fast   # v2 LLM hints only

profile:
  watchIntentFiles: true
  staleAction: nudge
  debounceSeconds: 300
```

---

## Bead breakdown (for `/start`)

| Bead | Title | Effort |
|------|-------|--------|
| T1 | Add `coordinatorEpoch` + bump helpers + tests | S |
| T2 | Impl tick epoch tagging + stale kind | S |
| T3 | Bump epoch on review/gate paths | S |
| T4 | `nextActionHint` templates on wave_complete/advance_wave | M |
| T5 | `steeringEvents` + repeat suppression | S |
| T6 | `profile-staleness.ts` + watch registry | M |
| T7 | observe/doctor/tick stale surfacing | S |
| T8 | Update `_implement.cursor.md` playbook | S |

**Total:** ~3–5 days, no new UI surface in v1.

---

## Recommended path

1. **Implement T1–T3 first** (epoch guards) — lowest risk, immediate race fix
2. **T6–T7** (profile drift) — leverages existing cache infrastructure
3. **T4–T5** (hints + steering) — improves coordinator UX after gates

Say **implement via `/start`** to convert beads, or **implement now** to land T1–T3 in this session.
