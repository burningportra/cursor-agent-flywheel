# Synthesized plan: Root AGENTS.md + MCP review tool / docs alignment

**Date:** 2026-04-09  
**Sources:** `2026-04-09-correctness.md`, `2026-04-09-robustness.md`, `2026-04-09-ergonomics.md`  
**Selected goal:** Add repo-root `AGENTS.md` for the multi-plugin workspace; clean up `orch_review` implementation in `plugins/cursor-orchestrator/mcp-server/src/tools/review.ts` and align docs with CI.

---

## Executive summary

1. **Add `/AGENTS.md` (repo root)** — Short orientation: what this monorepo is, table of `plugins/*`, `extensions/`, `scripts/`, `.cursor-plugin/`, where each `package.json` lives, and links to **`plugins/cursor-orchestrator/AGENTS.md`** for orchestrator-specific MCP rules (no `console.log`, never edit `dist/`, etc.). Include a “Before you push” bullet list: `node scripts/validate-template.mjs`, `node scripts/verify-cursor-orchestrator.mjs`, and `cd plugins/cursor-orchestrator/mcp-server && npm test && npm run build`.

2. **Review tool (`review.ts`)** — Automated repo profiling flagged `console.log` in `dist/tools/review.js` because **Gate 3’s checklist string** contains the words “console.log not cleaned up.” There is no evidence of runtime `console.log` in `review.ts`. **Action:** Reword Gate 3 so it clearly applies to **the code being reviewed**, not the MCP itself; add a one-line source comment above `gateChecks` if helpful. Grep `review.ts` for any unused code paths; remove only if truly dead.

3. **Plugin `AGENTS.md` accuracy** — Update the **Testing** section: Vitest/`npm test` exists under `mcp-server`; remove or replace “No test suite is configured yet” if still present.

4. **Rebuild** — After TS edits: `cd plugins/cursor-orchestrator/mcp-server && npm test && npm run build`; ensure `git diff` on `mcp-server/dist/` is clean before commit (matches CI).

---

## Implementation phases (ordered)

| Phase | Work | Depends on |
|-------|------|------------|
| **1** | Create root `AGENTS.md` (map + links + validation commands). | — |
| **2** | Edit `review.ts` Gate 3 text (+ optional comment). | — |
| **3** | Update `plugins/cursor-orchestrator/AGENTS.md` Testing section. | — |
| **4** | Run tests, build, verify script; commit including refreshed `dist/` if changed. | 2–3 |

Phases 1–3 can be parallelized in separate worktrees; phase 4 must be last.

---

## Testing & verification

- `cd plugins/cursor-orchestrator/mcp-server && npm test && npm run build`
- `node scripts/verify-cursor-orchestrator.mjs` from repo root
- Optional: `node scripts/validate-template.mjs`

---

## Acceptance criteria

- [ ] Root `AGENTS.md` exists and links to `plugins/cursor-orchestrator/AGENTS.md` without duplicating long constraint lists.
- [ ] Gate 3 in `review.ts` is unambiguous (checklist for reviewed code).
- [ ] Plugin AGENTS testing section reflects Vitest/`npm test`.
- [ ] MCP `dist/` is consistent with `src/`; tests pass.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Doc drift between root and plugin AGENTS | Keep root as index; defer deep rules to plugin doc. |
| Forgetting rebuild | Document in root AGENTS; CI catches `dist` drift. |

---

## Note on deep-plan execution

Parallel planner tasks were spawned; existing on-disk plans for **marketplace CI parity** were **not** aligned with this goal, so coordinator replaced perspective files with goal-specific content before synthesis. **Agent Mail** (`macro_start_session` / `TeamCreate`) was not available in this workspace’s MCP list; planning used parallel **Task** subagents and on-disk artifacts only.
