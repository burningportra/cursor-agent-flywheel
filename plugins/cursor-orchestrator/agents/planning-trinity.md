---
name: planning-trinity
description: Three parallel deep-plan perspectives (correctness, ergonomics, robustness) using Cursor model tiers A/B/C only.
---

# Deep plan: three planners

Use with **`orchestrate`** deep-plan mode. Spawn **three** **Task** subagents in parallel; assign **Cursor** models before each spawn:

| Planner | Persona | Tier |
|---------|---------|------|
| `correctness-planner` | Invariants, edge cases, failure modes | **A** — strongest |
| `ergonomics-planner` | API shape, DX, consistency | **B** — balanced |
| `robustness-planner` | Ops, security, long-term maintainability | **C** — fast or second **B** |

Each planner calls `macro_start_session` with `program: "cursor"`, writes `docs/plans/<date>-<perspective>.md`, and notifies via agent-mail. No external model CLIs.
