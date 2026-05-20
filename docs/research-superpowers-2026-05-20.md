# Research: obra/superpowers

**Source:** https://github.com/obra/superpowers @ f2cbfbef  
**Studied:** 2026-05-20  
**Focus:** Brainstorm “Visual Companion” local server for prototyping ideas in the browser (user-requested)

---

## Executive summary

Superpowers is an **agentic skills framework** — markdown workflows agents must follow (brainstorm → worktree → plan → implement → review). The standout pattern you called out is the **Brainstorm Visual Companion**: a **zero-dependency Node HTTP + WebSocket server** that lets the agent push HTML mockups to a local URL while the user clicks choices; selections land in a **JSONL event file** the agent reads on the next turn.

That pattern decouples **rich UI prototyping** from the chat transcript: the agent writes files, the browser hot-reloads, the terminal stays the control plane.

---

## Architecture overview

| Layer | What it is |
|-------|------------|
| **Skills** | `skills/<name>/SKILL.md` — mandatory process docs with YAML frontmatter |
| **Hooks / plugins** | Platform adapters (Claude Code, Codex, OpenCode, Cursor, etc.) |
| **Tests** | Heavy investment in skill-triggering, subagent flows, and **brainstorm-server** integration tests |
| **Brainstorm server** | `skills/brainstorming/scripts/server.cjs` + `start-server.sh` / `stop-server.sh` |

Core workflow chain: `brainstorming` → `writing-plans` → `subagent-driven-development` | `executing-plans`, with TDD and code-review skills enforced in between.

---

## Brainstorm prototype server (deep dive)

### Purpose

During **brainstorming** (before any implementation), the agent sometimes needs to show **mockups, layouts, or diagrams** instead of ASCII in chat. The Visual Companion:

1. Starts a **session-scoped** local server (random port in 49152–65535 range).
2. Agent writes **HTML fragments** to `content/` (new file per screen).
3. User opens `http://localhost:<port>/` — sees newest screen.
4. User clicks `[data-choice]` options → events appended to `state/events` (JSONL).
5. Agent reads events on the next turn and continues the Socratic design loop.

### Design choices (why it works)

**Filesystem as the API (agent-friendly)**

- Agent uses normal **Write** tool to drop HTML — no custom MCP for “push screen”.
- `fs.watch` on `content/` debounces reloads; WebSocket broadcasts `{ type: 'reload' }` to open tabs.
- **Newest `.html` wins** on `/` — simple mental model for “latest prototype”.

**Minimal dependencies in production**

- `server.cjs` implements **RFC 6455 WebSocket** encode/decode in ~70 lines (exported for unit tests).
- No Express, no Vite — one `node` process, easy to ship inside a skill folder.

**Session isolation**

- `start-server.sh` creates `$$-<timestamp>` session dirs under `--project-dir/.superpowers/brainstorm/` or `/tmp`.
- Writes `server-info` JSON to disk so agents can recover URL/port after background launch.

**Lifecycle safety**

- **Owner PID** monitoring: server exits if parent agent process dies (with Windows/WSL fallbacks).
- **30-minute idle timeout** + explicit `server-stopped` marker.
- Platform matrix in `visual-companion.md`: Codex foreground, Windows `run_in_background`, Gemini `--foreground`, etc.

**Content model**

- **Fragments by default**: partial HTML wrapped in `frame-template.html` (theme, selection chrome, helper script).
- Full documents only when the agent needs total control.
- Static assets via `/files/<basename>` from the same content dir.

**User input channel**

- `helper.js` in browser: WebSocket client, click → `{ type, choice, text }`.
- Server appends choice lines to `state/events`; also logs structured JSON to stdout for harnesses.

### Test strategy

| Test | Location | What it proves |
|------|----------|----------------|
| WS framing unit tests | `tests/brainstorm-server/ws-protocol.test.js` | RFC 6455 correctness without network |
| Integration | `tests/brainstorm-server/server.test.js` | HTTP, WS, file watch, workflow |
| Windows lifecycle | `tests/brainstorm-server/windows-lifecycle.test.sh` | Server survives 60s+ when owner PID empty |

This is **TDD for infrastructure**: protocol tests first, then full server, then OS-specific process reaping.

### Agent workflow (from skills)

1. Offer Visual Companion in **its own message** (consent; token cost warning).
2. Per question: browser only if **seeing** beats **reading** (mockups yes, scope questions no).
3. `start-server.sh --project-dir <repo root>` → save `screen_dir`, `state_dir`, give user URL.
4. Loop: check `server-info` alive → write new `*.html` → user selects → read `state/events`.
5. After design approval → spec file → `writing-plans` only (hard gate).

---

## What to adopt in cursor-agent-flywheel

### High-value fit

Your flywheel already has **MCP `askQuestion` gates** for discrete choices (bead approval, wave review, wrap-up). A brainstorm-style server would complement that for **continuous visual exploration** during:

- **Discovery / planning** (`flywheel_plan`, `start_discover`, `/brainstorming`)
- **Step 5.45** plan validation (architecture sketches, UI flows)
- **Duel synthesis** when comparing wizard outputs visually

**Suggested shape (minimal port)**

```
plugins/cursor-orchestrator/
  skills/start/visual-companion.md   # when to offer, loop, gates
  scripts/brainstorm/
    server.cjs          # fork or submodule from superpowers
    start-server.sh
    frame-template.html
    helper.js
```

**MCP optional layer:** `flywheel_visual_session_start` / `flywheel_visual_push_screen` could wrap the shell scripts, but **filesystem-first** (like superpowers) keeps impl agents able to prototype without new tools.

### Mapping to existing primitives

| Superpowers | Flywheel today | Hybrid idea |
|-------------|------------------|-------------|
| `state/events` JSONL | `askQuestion` one-shot | JSONL for multi-click mockups; AskQuestion for commit gates |
| `screen_dir` HTML files | Plan markdown in `docs/plans/` | Link plan sections to generated mockup files |
| Skill hard gate | `flywheel_bead_approval_gate` | “No beads until design URL reviewed” optional checkpoint |
| Subagent review | `flywheel_review` Task specs | Fresh-eyes reviewer opens mockup URL in report |

### Ergonomic wins

- **Agents write HTML** — plays to LLM strength; no canvas API.
- **User stays in browser for spatial tasks** — reduces miscommunication on layout.
- **Artifacts persist** under `.superpowers/brainstorm/` (or `.pi-flywheel/visual/`) — audit trail for plans.
- **Tests without browser automation** — WS unit tests + HTTP integration like upstream.

---

## Inversion: what to avoid copying blindly

1. **Token cost** — Visual Companion is explicitly “new and token-intensive”; flywheel should keep it **opt-in** per phase, not default for every `/start`.
2. **Second server process** — conflicts with MCP orchestrator, agent-mail, dev servers; document port ranges and `.gitignore` for session dirs.
3. **Platform process reaping** — Cursor background bash differs from Claude Code; need a **Cursor row** in the lifecycle table (like Gemini/Codex).
4. **Security** — binding `0.0.0.0` in remote dev boxes exposes mockups; default `127.0.0.1` only.
5. **Duplicating AskQuestion** — don’t replace clickable MCP gates with a browser for yes/no; use server only when visualization matters.

---

## Blunder hunt (integration risks)

| Risk | Mitigation |
|------|------------|
| Stale server after session end | Check `server-stopped` / missing `server-info` before each write |
| Filename reuse breaks “newest screen” | Enforce unique semantic filenames per screen |
| Agent uses `cat` heredoc for HTML | Skill rule: Write tool only (upstream explicit) |
| Events file grows unbounded | Truncate or rotate per screen; clear on `screen-added` (upstream clears on new screen) |
| User never opens URL | Fallback: paste text summary + optional screenshot skill |
| CI noise | Keep server tests in plugin `mcp-server` or `tests/brainstorm-server`, not default `npm test` unless gated |

---

## Other superpowers patterns (brief)

Worth knowing but secondary to your server interest:

- **Skill triggering tests** — prompt fixtures assert the right skill loads under pressure.
- **writing-skills = TDD for docs** — baseline agent without skill → write skill → re-test.
- **Subagent-driven-development** — implementer + spec reviewer + quality reviewer per task.
- **using-git-worktrees** — isolation before implementation (parallel to flywheel worktrees in cursor-swarm rules).

---

## Recommended next actions

1. **Shelve or spike?** If spike: copy `skills/brainstorming/scripts/*` + tests into `cursor-orchestrator` under a feature flag skill `start_visual_prototype`.
2. **Pilot phase:** Wire into `agent-flywheel:start_planning` only — offer companion when plan touches UI/IA.
3. **Integration mode:** If you want phases 8–12 (integration proposal + 5× blunder hunt + cross-model feedback), say so and we can extend this doc with `docs/research-superpowers-integration.md`.

---

## Phase 5 — Decision: **A** (implemented 2026-05-20)

You chose **A**: port the server + skill loop for **planning/brainstorm** only.

| Piece | Location |
|-------|----------|
| Skill | `plugins/cursor-orchestrator/skills/visual-prototype/` → `agent-flywheel:visual_prototype` |
| Planning hook | `skills/start/_planning.cursor.md` § 4.55; cross-ref `_planning.md` § 4.55 |
| Session dir | `.pi-flywheel/visual/<session>/` (gitignored) |
| Tests | `plugins/cursor-orchestrator/tests/visual-prototype/ws-protocol.test.js` |

**Not in scope:** B) bead/wave viz, C) MCP HTML wrappers, D) integration phases 8–12.

**During `/start`:** After Step 4.5, when mockups/layouts matter → `flywheel_get_skill({ name: "agent-flywheel:visual_prototype" })` → `start-server.sh --project-dir <cwd>` → write HTML under session `content/` → read `state/events` after user clicks → stop server before Step 5.
