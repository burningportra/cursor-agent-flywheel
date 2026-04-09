---
name: parallel-reviewers
description: Five fresh-eyes reviewer personas for bead review (use with orchestrate Step 8).
---

# Parallel review personas (Cursor)

When `orch_review` returns five task specs, spawn **five** **Task** subagents in parallel. Assign **Cursor Tier B** (or mix A/B) per subagent. Each prompt should include Agent Mail bootstrap (`macro_start_session`, `program: "cursor"`) when coordination requires it.

1. **Correctness** — Logic bugs, edge cases, error handling, invariants.
2. **Security** — Injection, authz, secrets, dependency risks.
3. **Tests** — Coverage gaps, missing cases, flaky tests.
4. **Maintainability** — Naming, structure, duplication, docs.
5. **Product fit** — Requirements vs implementation, UX regressions.

Each reviewer sends findings via **agent-mail** `send_message` to the coordinator; no broadcast to `"*"`.
