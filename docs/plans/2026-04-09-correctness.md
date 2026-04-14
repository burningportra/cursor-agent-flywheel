# Correctness plan: Root AGENTS.md + MCP `orch_review` hygiene

**Perspective:** Correctness — types, invariants, parse failures, and clear semantics.

**Goal:** Add repo-root `AGENTS.md` for the multi-plugin template. Tighten `plugins/cursor-orchestrator/mcp-server/src/tools/review.ts` and related docs so “review tool cleanup” means **real** issues, not false positives from static scans of `dist/`.

---

## Executive summary

1. **Root `AGENTS.md`:** Describe the monorepo layout (`plugins/*`, `extensions/`, `scripts/`, `.cursor-plugin/`) and state that **orchestrator implementation rules** live under `plugins/cursor-orchestrator/AGENTS.md`. Avoid duplicating hard constraints; link instead.

2. **`review.ts`:** The profile TODO that cited `dist/tools/review.js` and “console.log” refers to **Gate 3’s checklist text** (`Check for: ... console.log not cleaned up`), not a stray `console.log` in the MCP server. **Correctness work:** (a) Reword Gate 3 so it is obvious this is a *human/agent checklist* for the *user’s* codebase, not an admission of MCP bugs. (b) Audit `review.ts` for any real `console.log` — if none, document that in the synthesis so scanners stop flagging false positives. (c) Keep JSON-RPC safe: no stdout logging (already aligned with plugin AGENTS.md).

3. **Tests:** `__tests__/tools/review.test.ts` exists — root or plugin `AGENTS.md` should not claim “no test suite” if Vitest is configured. Update `plugins/cursor-orchestrator/AGENTS.md` **Testing** section for factual correctness.

---

## Failure modes

| Risk | Mitigation |
|------|------------|
| Root AGENTS contradicts plugin AGENTS | Single source of truth for MCP rules stays in `plugins/cursor-orchestrator/AGENTS.md`; root only orients. |
| `br show` / `br ready` returns non-JSON | Already handled with `isError` returns; extend tests if new branches are added. |
| Gate text misread as broken product | Clarify wording; optional comment in source above `gateChecks` array. |

---

## File-level changes

| Phase | Files |
|-------|--------|
| A | Create `/AGENTS.md` (repo root): overview, directory map, links to `plugins/cursor-orchestrator/AGENTS.md`, validation commands (`validate-template.mjs`, `verify-cursor-orchestrator.mjs`). |
| B | `plugins/cursor-orchestrator/mcp-server/src/tools/review.ts` — adjust Gate 3 string; add short comment if useful. |
| C | `plugins/cursor-orchestrator/AGENTS.md` — fix Testing section to reference `npm test` / Vitest when present. |
| D | `cd mcp-server && npm run build` — refresh `dist/`; CI `git diff` on dist must stay clean. |

---

## Testing strategy

- Run `npm test` in `plugins/cursor-orchestrator/mcp-server`.
- Run `scripts/verify-cursor-orchestrator.mjs` from repo root.

---

## Acceptance criteria

- [ ] Root `AGENTS.md` exists and accurately maps the repo; links to orchestrator AGENTS.
- [ ] Gate 3 text does not imply the MCP ships uncleared `console.log`.
- [ ] Plugin AGENTS testing section matches reality.
- [ ] Build + tests pass; committed `dist` matches fresh build.

---

## Risks

- **Low:** Doc-only root AGENTS could go stale; mitigate with “see README for scripts” and link to plugin AGENTS.
