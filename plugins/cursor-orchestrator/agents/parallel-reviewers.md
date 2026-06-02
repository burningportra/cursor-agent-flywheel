---
name: parallel-reviewers
description: Five combined fresh-eyes + thermo-nuclear reviewer personas for bead review (Step 8).
---

# Parallel review personas (Cursor)

When `flywheel_review` returns five `agentTasks` for `action: "hit-me"`, spawn **five** **Task** subagents in parallel. Every persona receives the shared **thermo-nuclear preamble** (structural standards); the fifth agent runs the full `/thermo-nuclear-code-quality-review` skill.

| Persona | Focus | Subagent | Model |
|---------|-------|----------|-------|
| **fresh-eyes** | Bugs, oversights, correctness | `generalPurpose` | Tier A/B |
| **adversarial** | Security, UBS, edge-case attacks | `generalPurpose` | Tier A |
| **ergonomics** | Naming, API design, DX | `generalPurpose` | Tier B |
| **reality-check** | Goal fit vs bead intent | `generalPurpose` | Tier B |
| **thermo-nuclear** | Structural quality, code judo, 1k-line rule | `thermo-nuclear-code-quality-review` | `review.thermo_nuclear_model` (default Tier A) |

The **thermo-nuclear** agent writes the canonical verdict JSON to `.pi-flywheel/review-verdicts/<beadId>-r<round>.json`. After all five finish, re-call `flywheel_review({ action: "hit-me", beadId })` to collect and auto-beadify blocking findings.

Each reviewer sends findings via **agent-mail** `send_message` to the coordinator (path only, not full bodies); no broadcast to `"*"`.
