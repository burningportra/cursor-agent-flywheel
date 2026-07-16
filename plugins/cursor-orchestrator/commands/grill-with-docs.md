---
description: "Relentless goal/design interview that writes brainstorm + optional ADRs/glossary, then hands off to flywheel planning."
argument-hint: "[goal]"
---

**First action:** Load `skills/grill-with-docs/SKILL.md` via `flywheel_get_skill({ name: "agent-flywheel:grill-with-docs" })` (or Read the skill path). Do not re-implement the interview.

# `/grill-with-docs` — thin pointer

1. If `$ARGUMENTS` is non-empty, treat it as `RAW_GOAL`.
2. Follow `skills/grill-with-docs/SKILL.md` with **AskQuestion** gates.
3. On `GRILL_STATUS=approved`, caller must `flywheel_select` with `GRILL_ENRICHED_GOAL` then enter planning. This command does **not** create beads or plans.
4. On `GRILL_STATUS=aborted`, stop with no artifacts.
