# pi-prompt-suggester → cursor-agent-flywheel: Applicable Patterns

**Source:** https://github.com/guwidoe/pi-prompt-suggester @ c21bea2

## High-value ports

### 1. Generation epoch for async work invalidation

When `flywheel_impl_tick`, wave dispatch, or background profile refresh completes after user action, tag work with a monotonic epoch at dispatch time. Drop stale results at the sink — same pattern as `PiSuggestionSink.showSuggestion({ generationId })`.

**Flywheel touchpoints:** `flywheel_impl_tick`, Task spawn specs, checkpoint updates after gate clicks.

### 2. Two-stage intent (slow seed + fast suggest)

Maps directly to flywheel **profile → plan → implement**:

- **Seed** = durable repo intent (`.pi/suggester/seed.json` schema: objectives, constraints, categoryFindings, keyFiles with hashes)
- **Suggest** = compact per-turn hint from last assistant turn + seed + steering history

Implement seeding via `flywheel_profile` (not a bespoke 16-step agentic grep loop). Refresh on plan registration or explicit `/profile --force`.

### 3. Staleness via file hashes

Hash tracked key files (AGENTS.md, plan doc, flywheel.config.yaml) and trigger background re-profile when drift detected — debounced and coalesced, not per-turn.

### 4. Steering telemetry from explicit gates (not string similarity)

Replace pi's Jaccard/LCS classifier with flywheel-native signals:

- Wave review gate selections (`looks-good-all`, `fresh-eyes`, etc.)
- Bead approval gate outcomes
- AskQuestion option ids via `data.actions`

Suppress repeated rejected coordinator prompts (pi's `repeatedRejectedSuggestion` pattern).

### 5. Transcript-steering prompt framing (suffix-only experiment)

For impl Task A/B: stable shared prefix (plan excerpt + bead AC) + variant-specific suffix instruction. Log `requestedStrategy` vs actual `strategy` + `fallbackReason` in `.pi-flywheel/` telemetry.

### 6. Guarded rollout ladder

Before enabling heavier strategies (transcript-style impl ticks, full thread context):

1. Deterministic rollout % (stable hash on bead/wave id)
2. Context budget % ceiling
3. try/catch → compact fallback

Copy three-guard structure from `SuggestionEngine.generateWithBestAvailableStrategy`.

### 7. Category-tagged key files

Tag discovered files by role (`vision`, `architecture`, `testing`, `plan`) with honest `found: false` + rationale — reuse in bead coverage gate and plan synthesis.

### 8. NDJSON event log for observability

Append-only `.pi-flywheel/logs/events.ndjson` for seeder runs, suggestion turns, gate decisions. Enables `/suggester seed-trace`-style debugging without stdout noise.

## Do not port (implementation)

| pi-prompt-suggester | Why skip |
|---------------------|----------|
| Ghost editor / CustomEditor | Cursor Composer has no replaceable TUI editor |
| Pi extension lifecycle hooks | Use MCP + Cursor hooks instead |
| Blocking LLM on `agent_end` | Use async flywheel tick / Task |
| `.pi/suggester/` parallel state tree | Extend `.pi-flywheel/checkpoint.json` + CASS |
| Agentic 16-step seeder | Use `flywheel_profile` once per plan cycle |
| A/B variant store (11 knobs) | Use `flywheel_duel` + outcome rubric |
| Session-default model inheritance | Explicit Cursor tier C slugs per orchestrator rules |

## Suggested flywheel integration points

1. **Post-wave review:** Optional one-line "next prompt" chip derived from bead queue + plan context (Tier C model, async).
2. **Impl tick metadata:** Epoch-guarded hint in `flywheel_impl_tick` response when queue has ready beads.
3. **Profile refresh:** Debounced re-profile when plan file or AGENTS.md hash changes mid-cycle.
4. **Doctor check:** Yellow if seed/profile older than N days or key files drifted.

## Effort estimate (spike → MVP)

| Component | Effort |
|-----------|--------|
| Epoch guard in impl tick | S (1–2 days) |
| Seed schema in checkpoint | M (3–5 days) |
| Async post-turn suggester Task | M (3–5 days) |
| Steering from gate telemetry | S (1–2 days) |
| Cursor-native suggestion UI | L (needs product decision) |

**Recommended first spike:** Generation epoch + gate-based steering suppression in existing wave review flow — no new UI surface required.
