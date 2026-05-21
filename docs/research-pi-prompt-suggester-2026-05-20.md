# Research Proposal: pi-prompt-suggester

**Source:** https://github.com/guwidoe/pi-prompt-suggester @ c21bea2  
**Date:** 2026-05-20  
**Researcher:** BoldForge (flywheel-research pipeline)

---

## Executive summary

`pi-prompt-suggester` is a mature **Pi coding-agent extension** that predicts the user's next prompt after each assistant turn. It combines a **two-stage architecture** (background repo seeding + per-turn suggestion), **ghost-text UX** in the terminal editor, and a **steering feedback loop** that learns from accept/reject behavior.

For **cursor-agent-flywheel**, the valuable exports are **architectural patterns** (generation epoch, two-stage intent, staleness hashing, guarded rollout), not the Pi-specific implementation. The ghost editor, blocking `agent_end` LLM calls, and `.pi/suggester/` state tree should **not** be ported. Flywheel should adopt ideas via existing MCP tools (`flywheel_profile`, `flywheel_impl_tick`, gate telemetry) and explicit Cursor model tiers.

---

## What it is

| Attribute | Value |
|-----------|-------|
| Package | `@guwidoe/pi-prompt-suggester@0.3.9` |
| Host | Pi extension (`@earendil-works/pi-coding-agent`) |
| Language | TypeScript ESM, ~76 source files |
| Tests | Node.js built-in `node:test` (~19 files, unit-only) |
| Persistence | `.pi/suggester/` (seed, session state, config, NDJSON logs) |

**Product thesis:** The best next prompt combines short-horizon context (last turn), long-horizon intent (repo seed), and steering signal (user followed vs changed course).

---

## Architecture (five runtime pieces)

1. **Suggestion pipeline** — fires on `agent_end`; compact or transcript-steering strategy
2. **Agentic reseed runner** — async background; read-only `ls/find/grep/read` loop (≤16 LLM steps)
3. **Steering tracker** — Jaccard + LCS classifier on user submit vs last suggestion
4. **UI sink** — ghost text in editor or widget panel below
5. **Observability** — `.pi/suggester/logs/events.ndjson`

### Layering

```
index.ts → composition/root.ts (DI)
  ├── domain/     (TurnContext, SeedArtifact, SteeringClassification)
  ├── app/
  │   ├── orchestrators/  (SessionStart, TurnEnd, UserSubmit, ReseedRunner)
  │   ├── services/       (SuggestionEngine, SteeringClassifier, StalenessChecker)
  │   └── ports/          (ModelClient, SeedStore, StateStore, Logger, …)
  ├── infra/pi/   (ExtensionAdapter, GhostSuggestionEditor, PiModelClient)
  └── prompts/    (suggestion, seeder, transcript-steering templates)
```

---

## Deep-dive highlights

### Ghost editor + generation epoch

- `RuntimeRef.bumpEpoch()` on every `agent_end` and user submit
- Async suggestion passes `generationId`; stale results silently dropped
- Ghost renders dim suffix when editor empty, cursor at EOL, prefix-compatible
- Space/Right accepts; any other key suppresses until suggestion revision changes

**Flywheel lesson:** Apply epoch guards to `flywheel_impl_tick` and Task dispatch — discard stale wave prompts after gate clicks.

### Agentic seeder

- Validates `categoryFindings` for `vision`, `architecture`, `principles_guidelines` (must report `found: false` with rationale)
- Trigger coalescing merges concurrent reseed requests
- Path-jailed read-only tools; atomic JSON writes

**Flywheel lesson:** Reuse `flywheel_profile` for seeding; require honest category coverage in profile output; debounce refresh on file hash drift.

### Transcript-steering experiment

- Reuses live session system prompt + branch transcript + steering suffix
- Cache-oriented: prefix shared with next real user turn
- Guards: rollout %, context usage %, try/catch → compact fallback
- **Gap:** `transcriptMaxMessages`/`transcriptMaxChars` in config but not enforced at runtime

**Flywheel lesson:** Suffix-only A/B for impl Task prompts; log fallback reasons; enforce or remove config knobs.

---

## Inversion analysis (what to avoid)

| Severity | Anti-pattern |
|----------|--------------|
| **Critical** | Ghost editor takeover — breaks with other extensions; no Cursor equivalent |
| **Critical** | Blocking LLM on every turn end |
| **Critical** | Transcript-steering full-context every turn (token explosion) |
| **High** | Pi-coupled model client with session-default provider |
| **High** | Parallel `.pi/suggester/` state tree |
| **High** | A/B variant subsystem without eval harness |
| **High** | Lexical steering classifier (no tests, mislabels paraphrases) |
| **Medium** | 16-step agentic seeder on active coding sessions |
| **Medium** | Space-as-accept default |
| **Medium** | Silent reseed failure (stale seed, no user warning) |

---

## Blunder hunt (top risks if ported naively)

1. **Reseed storms** — `checkAfterEveryTurn` + key-file hash drift during impl → periodic 17+ LLM call seeder runs
2. **Steering misclassification** — corrupts prompt conditioning; no unit tests
3. **Config footguns** — `fastPathContinueOnError: true` injects generic `"continue"` after failures
4. **Double session-start** — `session_start` + `session_tree` both trigger staleness
5. **Claude-bridge global symbol shim** — fragile across host upgrades

---

## Applicability to cursor-agent-flywheel

### Adopt (ideas → flywheel primitives)

| Pattern | Flywheel implementation |
|---------|-------------------------|
| Generation epoch | `flywheel_impl_tick`, Task specs, checkpoint version |
| Two-stage intent | `flywheel_profile` seed + per-gate compact hint |
| Staleness hashing | Hash plan + AGENTS.md; debounced re-profile |
| Steering telemetry | Wave/bead gate `data.actions` ids, not text diff |
| Guarded rollout | Three-guard ladder for heavy MCP/skills |
| Suggest never auto-send | Already aligned with AskQuestion gates |
| NDJSON observability | `.pi-flywheel/logs/events.ndjson` |

### Skip (Pi-specific)

- GhostSuggestionEditor, CustomEditor, ANSI cursor regex
- Pi extension hooks (`agent_end`, `input`)
- InMemoryTaskQueue + ReseedRunner shell tools
- SuggesterVariantStore A/B UI
- `.pi/suggester/` artifact paths

### Recommended MVP spike

**Scope:** Epoch guard + gate-based steering suppression in existing wave review flow.

- No new UI surface
- Store `steeringEvents[]` in checkpoint when user picks wave review options
- Suppress repeated coordinator nudges matching prior rejected action
- Doctor yellow when profile cache age exceeds threshold

**Effort:** S–M (3–5 days)

---

## Related documents

- [Applicable patterns](./research/pi-prompt-suggester-apply.md)
- [Ergonomics ideas](./research/pi-prompt-suggester-ergonomics.md)
- Prior research: [superpowers](./research-superpowers-2026-05-20.md)

---

## Open questions for user (Phase 5)

1. **Primary goal:** Extract insights only, or pursue **Major Feature Integration** (Phases 8–12)?
2. **UI surface:** Activity Bar hint, gate pre-fill, or async Task-only (no composer UI)?
3. **Trigger point:** Post-wave review, impl tick idle, or every agent response?
4. **Model budget:** Tier C only for suggestions, or also Tier A profile re-seed?

---

## Recommended next actions

| Action | When |
|--------|------|
| **Shelve** | If prompt suggestion is not a current flywheel priority |
| **Refine** | Answer Phase 5 questions → run integration proposal (Phase 8) |
| **Implement via `/start`** | Convert MVP spike to beads: epoch guard, steering events, doctor check |
