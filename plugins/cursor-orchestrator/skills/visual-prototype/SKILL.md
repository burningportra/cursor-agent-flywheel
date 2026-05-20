---
name: visual_prototype
description: Use during flywheel planning (Step 4.5–5) when mockups, layouts, or diagrams help the user decide before beads. Optional browser companion — not for implement or review.
---

# Visual prototype server (planning only)

Local server for **planning-phase** visual exploration: wireframes, layout options, architecture sketches. Adapted from [obra/superpowers](https://github.com/obra/superpowers) Visual Companion — see `ATTRIBUTION.md`.

**Scope:** Planning and pre-bead design only (`start_planning`, Step 4.5–5). Do **not** use during implement, wave review, or wrap-up — use MCP `AskQuestion` gates there.

## When to offer

After Step 4.5 pressure-test (or when skipping it), **before** `flywheel_plan`, if upcoming questions are **visual**:

- UI mockups, wireframes, navigation
- Side-by-side layout or theme comparisons
- Diagrams the user should *see*

**Not** for: scope floors, adjacency lists, plan mode picks, rubric gates — use **AskQuestion** / terminal.

Offer in **its own message** (consent + token note). Wait for yes/no before starting the server.

## Quick start

From workspace root (`cwd`):

```bash
plugins/cursor-orchestrator/skills/visual-prototype/scripts/start-server.sh \
  --project-dir "$(pwd)" \
  --foreground
```

**Cursor:** Prefer `--foreground` with a background shell or sufficient `block_until_ms`; on the next turn read `state/server-info` under the session dir if stdout was missed.

Persist path: `.pi-flywheel/visual/<session>/` — add `.pi-flywheel/` to `.gitignore` if missing.

Full loop, CSS helpers, and event format: **`visual-companion.md`** in this directory.

## Hard rules

1. **Write** HTML fragments to `content/` — never `cat` heredoc.
2. **New file per screen** — semantic names (`layout-a.html`, `nav-v2.html`).
3. Check `state/server-info` exists before each write; restart if `server-stopped` present.
4. Read `state/events` after user replies in terminal.
5. Push `waiting.html` when returning to text-only questions.
6. **Stop server** when planning ends: `scripts/stop-server.sh <session_dir>`.

## Link to planning skill

Load with planning phase:

`flywheel_get_skill({ name: "agent-flywheel:visual_prototype" })`

Canonical planning steps remain in `agent-flywheel:start_planning`.
