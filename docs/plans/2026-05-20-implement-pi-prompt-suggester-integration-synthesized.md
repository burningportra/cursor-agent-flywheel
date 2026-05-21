# Synthesized plan: pi-prompt-suggester integration (cursor-orchestrator MCP)

**Date:** 2026-05-20  
**Sources:** `2026-05-20-correctness.md`, `2026-05-20-robustness.md`, `2026-05-20-ergonomics.md`  
**Spec:** [`docs/research-pi-prompt-suggester-integration.md`](../research-pi-prompt-suggester-integration.md)  
**Goal:** Coordinator epoch guards, profile staleness on plan/AGENTS/config drift, post-wave next-action hints

---

## Executive summary

Port three patterns from [pi-prompt-suggester](https://github.com/guwidoe/pi-prompt-suggester) into the Cursor flywheel MCP **without** new UI, blocking LLM calls, or a parallel `.pi/suggester/` tree. The integrated design:

1. **Epoch guards (T1–T3)** — Monotonic `state.coordinatorEpoch`; every `flywheel_impl_tick` tags `data.epoch`; server returns `kind: 'stale'` (no `implTasks`) when the user steered mid-tick. Fixes the race where gate clicks still spawn pre-gate Tasks.
2. **Profile intent staleness (T6–T7)** — sha256 watch registry for plan, AGENTS, README, config, rubric; `profileStale` surfaced in observe/doctor/tick; default **nudge** (not auto-rescan).
3. **Next-action hints (T4–T5, T8)** — Single-line `nextActionHint` on wave_complete/advance/dispatch; steering events suppress repeated rejected hints; playbook documents client-side epoch check.

**Ship in three PRs:** (A) epoch core, (B) profile staleness, (C) hints + steering + docs. Each PR: `npm test`, `npm run build`, commit `dist/`.

**Non-goals:** Ghost Composer text, v2 LLM hints (config stub only), agentic seeder, Pi extension port.

---

## Perspective synthesis

| Topic | Correctness strength | Robustness strength | Ergonomics strength | **Decision (winner)** |
|-------|---------------------|---------------------|---------------------|------------------------|
| Stale tick behavior | Invariant: no `implTasks` when stale | Server-side drop + log + `FW_COORDINATOR_EPOCH_GUARDS=0` escape | Clear one-line stale message | **Correctness + Robustness** — hard server drop default on; env opt-out for debug |
| Epoch bump sites | Exhaustive table, tests per site | Idempotent bump, ops runbook | Minimal coordinator steps | **Correctness** — bump list is the contract; robustness adds logging |
| Profile refresh | Hash mismatch definition | Debounced auto_refresh, file error tolerance | One-line observe hint | **Robustness** for `staleAction` + debounce; **Ergonomics** for hint copy |
| Hint content | Schema-bound `generationEpoch` | Length cap, no LLM v1 | Central template builder, text line 1 mirrors hint | **Ergonomics** — new `next-action-hint.ts` module; correctness owns epoch match |
| Steering suppression | `normalizedKey` invariant | FIFO cap 20 events | Stop hint spam | **Blend** — correctness defines shape; robustness caps size |
| Implementation order | T1→T3 before hints | PR split for rollback | T4 visible early after T2 | **Synthesized** — see phases below |
| Doctor check | Parse/schema validity | Yellow not red for intentional edits | Actionable remediation text | **Robustness** — yellow `profile_intent_stale` |

---

## Architecture (integrated)

### State extensions (`FlywheelState`)

```typescript
coordinatorEpoch?: number;                    // default 0
steeringEvents?: SteeringEvent[];             // FIFO max 20
profileWatch?: { registeredAt: string; files: { path: string; sha256: string }[] };
profileStale?: boolean;
profileStaleReason?: string;
lastProfileRefreshAt?: string;
```

### New modules

| Module | Responsibility |
|--------|----------------|
| `coordinator-epoch.ts` | `getCoordinatorEpoch`, `bumpCoordinatorEpoch` |
| `profile-staleness.ts` | `hashFile`, `registerProfileWatch`, `checkProfileStaleness`, debounce helper |
| `next-action-hint.ts` | `buildNextActionHint(kind, ctx)` — templates, gate-action follow-ups, 160-char cap |

### impl_tick structured extensions

- `data.epoch` — captured at tick start
- `data.kind` — add `'stale'`
- `data.nextActionHint` — advisory, epoch-tagged
- `data.snapshot.profileStale` — boolean

### Config block (defaults)

```yaml
coordinator:
  epochGuards: true
  nextActionHints: true
  suggesterModel: composer-2.5-fast   # v2 only

profile:
  watchIntentFiles: true
  staleAction: nudge
  debounceSeconds: 300
```

### Coordinator contract (skill + playbook)

> Before spawning Tasks from `flywheel_impl_tick` or `flywheel_advance_wave`, verify `response.data.epoch === checkpoint.coordinatorEpoch`. On mismatch, discard and re-call `flywheel_impl_tick`. Prefer `data.nextActionHint.text` for scan; follow `nextStep` / `data.kind` for control flow.

---

## Ordered phases (T1–T8)

### PR A — Epoch guards (ship first)

| Phase | Work | Files | Tests |
|-------|------|-------|-------|
| **T1** | Epoch helpers + types | `types.ts`, `coordinator-epoch.ts` | `coordinator-epoch.test.ts` |
| **T2** | Tick tagging + stale kind | `cursor-impl-tick.ts`, `flywheel-config.ts` | `impl-tick.test.ts` |
| **T3** | Bump on steering paths | `advance-wave.ts`, `review.ts`, `user-gate.ts`, closedBeadIds in tick | `review.test.ts`, `advance-wave.test.ts` |

**Exit criteria PR A:** Mid-tick gate simulation returns `kind: 'stale'`, zero `implTasks`; epoch persists in checkpoint.

### PR B — Profile staleness

| Phase | Work | Files | Tests |
|-------|------|-------|-------|
| **T6** | Watch registry + hash check | `profile-staleness.ts`, `tools/profile.ts`, `tools/plan.ts`, rubric hook | `profile-staleness.test.ts` |
| **T7** | Surface stale flags | `observe.ts`, `doctor.ts`, tick snapshot | `observe.test.ts`, `doctor.test.ts` |

**Exit criteria PR B:** Plan edit on same commit → `profileStale`; `flywheel_profile({ force: true })` clears; doctor yellow with actionable hint.

### PR C — Hints + steering + docs

| Phase | Work | Files | Tests |
|-------|------|-------|-------|
| **T4** | Template hints | `next-action-hint.ts`, `cursor-impl-tick.ts`, `advance-wave.ts` | `next-action-hint.test.ts`, impl-tick snapshots |
| **T5** | Steering events + suppression | `review.ts`, `user-gate.ts`, hint builder | user-gate / review tests |
| **T8** | Playbook + skill | `_implement.cursor.md`, `buildImplTickCoordinatorPlaybook` | lint:skill if skill changed |

**Exit criteria PR C:** `wave_complete` includes hint with correct beadIds; repeated fresh-eyes skip suppresses duplicate hint; playbook lists epoch step.

---

## File-level change matrix

| File | T1–T3 | T4–T5 | T6–T7 | T8 |
|------|-------|-------|-------|-----|
| `types.ts` | ✓ | ✓ | ✓ | |
| `coordinator-epoch.ts` | ✓ new | | | |
| `profile-staleness.ts` | | | ✓ new | |
| `next-action-hint.ts` | | ✓ new | | |
| `cursor-impl-tick.ts` | ✓ | ✓ | ✓ | ✓ |
| `tools/advance-wave.ts` | ✓ | ✓ | | |
| `tools/review.ts` | ✓ | ✓ | | |
| `tools/user-gate.ts` | ✓ | ✓ | | |
| `tools/profile.ts` | | | ✓ | |
| `tools/plan.ts` | | | ✓ | |
| `tools/observe.ts` | | | ✓ | |
| `tools/doctor.ts` | | | ✓ | |
| `flywheel-config.ts` | ✓ | | ✓ | |
| `cursor-user-gates.ts` | | ✓ | | |
| `skills/start/_implement.cursor.md` | | | | ✓ |
| `capabilities.test.ts.snap` | | | ✓ | |

---

## Testing strategy (consolidated)

```bash
cd plugins/cursor-orchestrator/mcp-server && npm test && npm run build
node scripts/verify-cursor-orchestrator.mjs   # from repo root
```

| Area | Key cases |
|------|-----------|
| Epoch | Monotonic bump; stale mid-tick; tags present when guards disabled |
| Profile | Hash change → stale; force refresh clears; missing file → stale reason |
| Hints | Template strings; epoch match; suppression after 3 identical steering keys |
| Integration | Manual: gate click during tick window; edit AGENTS.md → observe warn |

Update `capabilities.test.ts.snap` when doctor check enum grows.

---

## Acceptance criteria (release)

- [ ] **Race fix:** No `implTasks` when `kind === 'stale'` and `epochGuards: true`.
- [ ] **Persistence:** `coordinatorEpoch`, `profileWatch`, `steeringEvents` survive checkpoint reload.
- [ ] **Profile:** Intent file edit without commit sets `profileStale`; doctor shows yellow `profile_intent_stale`.
- [ ] **Hints:** `wave_complete` / `advance_wave` / `dispatch_impl_tasks` include valid `nextActionHint`.
- [ ] **DX:** Human text line 1 matches hint; playbook documents epoch check.
- [ ] **Safety:** No stdout logging; observe budget preserved; all tests green; `dist/` committed.

---

## Unresolved tensions

| Tension | Options | Recommendation |
|---------|---------|----------------|
| **Client-only vs server stale drop** | Skill-only discard vs MCP `kind: 'stale'` | **Both** — skill is primary; server drop is safety net (robustness) |
| **Bump on `closedBeadIds` vs only gates** | Bump may cause extra stale ticks if coordinator passes closed ids often | **Keep bump** (spec) but document: passing `closedBeadIds` invalidates in-flight ticks — coordinator should pass ids once then re-tick |
| **auto_refresh vs nudge default** | Auto profile mid-impl may surprise | **Default nudge**; auto_refresh behind yaml + debounce |
| **Hint vs `nextStep` authority** | Hint could drift if built separately | **Single builder** reads `nextStep` — ergonomics module called from tick/advance, not duplicated strings |
| **v2 LLM hints** | Better text vs latency/cost | **Defer** — config key present, implementation v2; v1 templates only |
| **Multi-agent same repo** | Shared checkpoint epoch | Document single-coordinator assumption; out of scope for v1 |
| **Steering suppression semantics** | Which action ids count as "rejection" | Ship with `fresh-eyes`, defer paths configurable; tune from dogfood |

---

## Risks (merged)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missed bump site | High | Correctness checklist + grep for `bumpCoordinatorEpoch` call sites only in module |
| Checkpoint growth | Low | Cap steeringEvents at 20 |
| False stale drops | Medium | Bump only user steering events |
| Hash I/O on observe | Medium | In-process hash cache per session |
| dist drift | Medium | CI gate + PR discipline |
| Scope creep (LLM hints) | Medium | Explicit v2 milestone |

---

## Recommended execution path

1. **`/start`** or direct implementation: land **PR A** first (~1 day).
2. **PR B** profile staleness (~1 day) — independent of hints.
3. **PR C** hints + docs (~1–2 days).
4. Optional v2 bead: LLM hint Task with epoch guard.

**Total:** ~3–5 days engineering (matches spec estimate).

---

## Planning provenance

Three perspective plans written by planning-trinity (Cursor deep plan). Synthesis blends correctness invariants, robustness degradation/ops, and ergonomics template/hint DX. Implementation is docs-only in this session; MCP code follows this plan in a subsequent `/start` cycle.
