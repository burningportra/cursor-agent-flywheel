---
name: planning-trinity
description: Three parallel deep-plan perspectives with distinct Cursor models (auto-wired via flywheel_plan mode=deep).
---

# Deep plan: three planners (Cursor)

`flywheel_plan({ mode: "deep" })` returns `planAgents[]` with a **distinct `model` per planner**. The orchestrator MUST pass that `model` on every Cursor **Task** spawn.

| Planner | Perspective | Default model | Tier |
|---------|-------------|---------------|------|
| `correctness-planner` | Invariants, edge cases, failure modes | `opus-4.6` | A |
| `ergonomics-planner` | API shape, DX, consistency | `composer-2.5` | B |
| `robustness-planner` | Ops, load, observability | `gpt-5.5-xhigh` | C |
| `plan-synthesizer` | Merge plans | `opus-4.6` | A |

## Configure models

Edit **`flywheel.config.yaml`** at the repo root:

```yaml
deep_plan:
  correctness: opus-4.6
  ergonomics: composer-2.5
  robustness: gpt-5.5-xhigh
  synthesis: opus-4.6
```

Or set env vars (override file): `FW_DEEP_PLAN_MODEL_CORRECTNESS`, `_ERGONOMICS`, `_ROBUSTNESS`, `_SYNTHESIS`.

Model slugs must match **Cursor → Settings → Models** exactly. If a spawn fails, pick the slug Cursor shows for that model.

## Spawn contract

```text
Task({
  model: "<from planAgents[i].model>",
  subagent_type: "generalPurpose",
  run_in_background: true,
  description: "Deep plan: <perspective>",
  prompt: "<planAgents[i].task>",
})
```

Each planner: `macro_start_session` with `program: "cursor"`, write `docs/plans/<date>-<perspective>.md`, notify coordinator via agent-mail with the path only.

**Do not** spawn all three planners without `model` — that duplicates the parent session model and defeats triangulation.
