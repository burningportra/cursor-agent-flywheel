# Ergonomics plan: Root AGENTS.md + clearer review gates

**Perspective:** Ergonomics — discoverability, minimal duplication, clear naming.

**Goal:** Add a **repo-root** `AGENTS.md` so Cursor agents opening the workspace at the monorepo root see orientation **without** replacing the detailed `plugins/cursor-orchestrator/AGENTS.md`. Improve Gate 3 wording in `review.ts` so humans read it as a **review checklist**, not a bug report.

---

## Executive summary

**Why root AGENTS:** `orch_profile` and many tools assume a root `AGENTS.md`. This template has three plugins plus an extension; agents need a **map** (where is `package.json`? where do I run tests?).

**Layering:**

| Doc | Audience | Content |
|-----|----------|---------|
| `/AGENTS.md` | Any agent at repo root | Monorepo map, links, “start here” |
| `plugins/cursor-orchestrator/AGENTS.md` | Orchestrator MCP contributors | Strict TS/MCP rules, beads, skills |

**Review UX:** Gate 3 currently says `console.log not cleaned up` in the same sentence as MCP gate text — easy to mis-parse. Prefer: *“In the **changed** code: no stray `console.log`; remove TODO/FIXME that should be resolved; no dead code.”*

---

## Root AGENTS.md outline (suggested)

1. **What this repo is** (one paragraph): Marketplace template, multiple plugins, orchestrator is the heavy plugin.
2. **Directory map** — table: `plugins/starter-simple`, `plugins/starter-advanced`, `plugins/cursor-orchestrator`, `extensions/cursor-orchestrator-menu`, `scripts/`, `.cursor-plugin/`.
3. **Where to work** — “Editing orchestrator MCP → see `plugins/cursor-orchestrator/AGENTS.md`.”
4. **Common commands** — bullet list with paths: `node scripts/validate-template.mjs`, `node scripts/verify-cursor-orchestrator.mjs`, `cd plugins/cursor-orchestrator/mcp-server && npm test`.
5. **Deep plans** — `docs/plans/` optional pointer.

---

## File-level changes

- Create `/AGENTS.md` (above).
- `review.ts`: reword `gateChecks[2]` for clarity (ergonomics of reading).
- Optionally add a single line in root `README.md`: “Agent orientation: see `AGENTS.md`.” (only if README does not already duplicate.)

---

## Acceptance criteria

- [ ] New contributors find Node packages and test commands within one hop from root `AGENTS.md`.
- [ ] Gate 3 reads naturally as a **checklist for the implementation under review**.

---

## Risks

- **Duplication:** If root AGENTS copies long passages from plugin AGENTS, they will drift. Keep root short; link.
