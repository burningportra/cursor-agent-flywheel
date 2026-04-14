# Robustness plan: root `AGENTS.md` + MCP review hygiene

**Date:** 2026-04-09  
**Scope:** Repository-level agent onboarding, `orch_review` / review stack cleanup, build–test–dist parity with CI.

---

## Executive summary

This repo is a **multi-plugin Cursor marketplace template** with a heavyweight **`cursor-orchestrator`** plugin (MCP server under `plugins/cursor-orchestrator/mcp-server/`). Quality is gated by **`scripts/verify-cursor-orchestrator.mjs`** (artifact + slash-command parity + `validate-template`) and a **`build-test`** job that runs **`npm ci` → `npm run build` → `npm test`** in `mcp-server`, then **`git diff --exit-code` on `dist/`** to prevent uncommitted drift.

Work has two pillars: (1) add a **root `AGENTS.md`** so agents see the monorepo layout, key scripts, and where Node packages live without opening multiple READMEs; (2) **tighten the review-related TypeScript surface**—remove unused code, eliminate any mistaken stdout logging, rebuild **`dist/`**, and align **`plugins/cursor-orchestrator/AGENTS.md`** with reality (tests exist; **no `console.log`** on the MCP stdio path; logging policy).

**Agent Mail:** not used for this plan (no `macro_start_session`). Implementation should not assume agent-mail for contributors who lack it; root/plugin docs can describe orchestrator MCP as primary and agent-mail as optional where applicable.

---

## Current CI / verify gates (how quality is enforced)

| Step | What it proves |
|------|----------------|
| `node scripts/verify-cursor-orchestrator.mjs` | `mcp-server/package-lock.json`, committed **`dist/server.js`**, launcher, `mcp.json` shape, hooks, slash commands ↔ `.cursor/commands` parity, **`validate-template`** passes. |
| `npm run build` (`tsc`) | TypeScript compiles under **strict** + **NodeNext**; outputs fresh **`dist/`**. |
| `npm test` (**vitest**) | Review tool and other units behave as tests assert (`src/__tests__` excluded from `tsc` but executed by vitest). |
| `git diff --exit-code -- plugins/cursor-orchestrator/mcp-server/dist` | **Committed `dist` matches** a clean build—catches forgotten rebuilds after source edits. |

**Operational takeaway:** Any change under `mcp-server/src/` is incomplete until **`npm run build`** is run and **`dist/`** is committed in lockstep with CI expectations.

---

## Phase 1 — Root `AGENTS.md`

**Goal:** One entrypoint for “where is everything?” for agents working at repo root.

**Suggested sections (substantive, not a second README clone):**

- **Repo shape:** `plugins/starter-simple`, `plugins/starter-advanced`, `plugins/cursor-orchestrator`; root `.cursor-plugin/marketplace.json`; symlinked `.cursor/commands` → orchestrator commands (see verify script).
- **Scripts:** `scripts/validate-template.mjs` (marketplace/plugin validation), `scripts/verify-cursor-orchestrator.mjs` (orchestrator-specific parity), `scripts/publish-gate.mjs` where relevant to publishing docs.
- **Node package locations:**
  - `plugins/cursor-orchestrator/mcp-server/` — MCP server (`npm ci` / `npm run build` / `npm test`).
  - `extensions/cursor-orchestrator-menu/` — optional VS Code sidebar extension (separate `package.json`).
- **Pointers:** Link to `plugins/cursor-orchestrator/AGENTS.md` for MCP constraints (stdio, `dist/`, exec timeouts).
- **Flywheel commands:** Brief pointer to `.cursor/commands/` and `README.md` “Getting started” for `/flywheel`, `/orchestrate`.

**Files:** New `AGENTS.md` at repository root.

---

## Phase 2 — Align `plugins/cursor-orchestrator/AGENTS.md` with reality

**Issues today:**

- **Testing:** States “No test suite” but **`package.json`** defines **`vitest`** and **`.github/workflows/orchestrator-mcp.yml`** runs **`npm test`**. Update to: run **`cd plugins/cursor-orchestrator/mcp-server && npm test`** (and build) after MCP changes.
- **Agent coordination:** References **`macro_start_session`** and agent-mail workflows. For environments **without** Agent Mail, add a short **“without agent-mail”** note: use **`orch_*` tools** and repo conventions only—avoid hard dependency on mail for core flows.
- **Logging:** Already states **no `console.log`** (stdout corrupts JSON-RPC). Keep; optionally note that **`console.error` / `console.warn`** go to **stderr** and are acceptable for diagnostics (consistent with `server.ts` and `cli-exec.ts`).

**Files:** `plugins/cursor-orchestrator/AGENTS.md` (edit only sections that are wrong or misleading).

---

## Phase 3 — Review tool TypeScript: dead code, logging, parity

### 3.1 `tools/review.ts` (`orch_review`)

- **Stray `console.log`:** Current source has **no** `console.log` calls; the only “console.log” substring is inside **Gate 3** prompt text (meta-instruction to reviewers). No removal needed unless a future grep finds real calls in **`dist/`** from an older build—if so, fix source and rebuild.
- **Dead / redundant logic:** Review for **unreachable branches**, duplicated helpers, or state fields written but never read (beyond what tests cover). Prefer **small refactors** that preserve behavior; **`review.test.ts`** is the regression net.
- **Odd repos / missing `br`:** Already returns **structured errors** when `br show` fails or JSON parse fails—preserve **graceful, user-facing** `McpToolResult` text (no stack traces to stdout).

### 3.2 `bead-review.ts` (cross-model bead review)

- **`crossModelBeadReview`** and **`parseSuggestions`** are **not imported** from any other module under `mcp-server/src/`—only `bead-review.ts` self-references. The **`approve`** tool’s **`cross-model`** advanced action **does not** call this module; it emits instructions for a manual agent spawn.
- **Decision (pick one in implementation):**
  - **Remove** `bead-review.ts` (and generated `dist/bead-review.*`) if the team confirms **no external/script import** and no near-term plan to wire `pi`; **or**
  - **Wire** `crossModelBeadReview` into the `cross-model` path behind a feature flag / env check so the file earns its keep; **or**
  - **Keep file** but add a one-line comment that it is **reserved for non–Cursor-Code paths** (e.g. `pi` CLI)—least preferred if unused.

Default robustness recommendation: **remove dead module** + tests if any exist solely for `parseSuggestions` (currently **no** `bead-review` test file—grep confirms). If removal would delete **`parseSuggestions`**, consider moving minimal parsing tests into **`review.test.ts`** only if something still exports it from a smaller helper.

### 3.3 Rebuild and CI alignment

- After edits: **`cd plugins/cursor-orchestrator/mcp-server && npm run build && npm test`**.
- Confirm **`git status`** shows only intentional changes under **`dist/`**; commit **`dist`** changes together with **`src`**.

---

## Phase 4 — Logging policy (robustness lens)

| Channel | Use |
|--------|-----|
| **stdout** | **JSON-RPC only** — never `console.log` / `console.info` in MCP server code paths. |
| **stderr** | **`console.error`** for fatal/tool errors; **`console.warn`** for recoverable diagnostics (matches existing `server.ts`, `cli-exec.ts`, `checkpoint.ts`). |
| **Tool results** | User-visible errors via **`McpToolResult`** `content` + `isError: true`, not stderr alone. |

If cleaning review-related code, **do not** “fix” stderr warnings by moving them to stdout.

---

## Testing checklist (acceptance)

- [ ] `node scripts/verify-cursor-orchestrator.mjs` (from repo root) **passes**.
- [ ] `cd plugins/cursor-orchestrator/mcp-server && npm run build` **passes**.
- [ ] `cd plugins/cursor-orchestrator/mcp-server && npm test` **passes** (vitest, including **`__tests__/tools/review.test.ts`**).
- [ ] `git diff --exit-code -- plugins/cursor-orchestrator/mcp-server/dist` **clean** after build.
- [ ] Manual spot-check: `orch_review` behaviors covered by tests remain unchanged (sentinels, gates, hit-me JSON payload).

---

## Risks

| Risk | Mitigation |
|------|------------|
| Removing **`bead-review.ts`** breaks an undocumented external import | Grep whole repo + any docs referencing **`crossModelBeadReview`** before delete. |
| **`dist/`** drift | Always rebuild and commit **`dist`** in the same PR as **`src`**. |
| Over-refactoring **`review.ts`** | Keep changes **surgical**; rely on **`review.test.ts`**; add tests only for new branches if logic splits. |
| Docs claim agent-mail is required | Root + plugin **`AGENTS.md`** clarify **optional** mail; core flow via **`orch_*`**. |

---

## File-level summary

| File | Action |
|------|--------|
| `AGENTS.md` (root) | **Create** — multi-plugin layout, scripts, Node roots, pointers. |
| `plugins/cursor-orchestrator/AGENTS.md` | **Update** — testing (`vitest`), optional agent-mail, logging note. |
| `plugins/cursor-orchestrator/mcp-server/src/tools/review.ts` | **Audit** — remove dead code if any; no stdout logging. |
| `plugins/cursor-orchestrator/mcp-server/src/bead-review.ts` | **Remove or wire** — currently unused. |
| `plugins/cursor-orchestrator/mcp-server/dist/*` | **Regenerate** via `npm run build`; commit with source. |

---

## Out of scope (unless explicitly expanded)

- Changing **GitHub Actions** workflow structure (already sufficient).
- **`gates.ts`** vs inline **`runGates`** in **`review.ts`** consolidation (larger behavioral surface).
- Extension **`extensions/cursor-orchestrator-menu`** beyond documenting its path in root **`AGENTS.md`**.
