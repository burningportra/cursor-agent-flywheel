---
name: parallel-reviewers
description: Five fresh-eyes reviewer personas for bead review (use with orchestrate Step 8).
---

# Parallel review personas (Cursor)

When `orch_review` returns five task specs, spawn **five** **Task** subagents in parallel. Map personas to **Cursor model tiers** from the plugin README (e.g. **Tier A** for correctness and security, **Tier B** for tests/maintainability/product—adjust to your enabled models). Each prompt should include Agent Mail bootstrap (`macro_start_session`, `program: "cursor"`) when coordination requires it.

1. **Correctness** — Logic bugs, edge cases, error handling, invariants. (**Tier A**)
2. **Security** — Injection, authz, secrets, dependency risks. (**Tier A** or **B**)
3. **Tests** — Coverage gaps, missing cases, flaky tests. (**Tier B**)
4. **Maintainability** — Naming, structure, duplication, docs. (**Tier B**)
5. **Product fit** — Requirements vs implementation, UX regressions. (**Tier B** or **C**)

Each reviewer sends findings via **agent-mail** `send_message` to the coordinator; no broadcast to `"*"`.
