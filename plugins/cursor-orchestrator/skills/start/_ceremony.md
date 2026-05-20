---
name: start_ceremony
description: "Flywheel Step 0: banner, flywheel_observe, welcome menu (0d/0e). Load first on /start."
---

> **CURSOR PORT:** Use **`AskQuestion`** with `data.askQuestion` from gate MCP tools. Never embed `AskUserQuestion(...)` JSON in this file. Extra entry points: slash commands in the table below — not a printed mega-menu.

## Step 0: Opening Ceremony

### 0.banner — SHOW THIS FIRST, ALWAYS

Print the banner before any tool calls. Version from `plugins/cursor-orchestrator/mcp-server/package.json` (or `CURSOR_PLUGIN_ROOT` / `$CLAUDE_PLUGIN_ROOT`); default `unknown` if unreadable.

```
░▒▓ CLAUDE // AGENT-FLYWHEEL v<VERSION> ▓▒░
```

### 0.preflight — Captured user input

If the prompt contains more than `/start` (goal, plan path, directive), capture as `USER_INPUT`. **Do not act yet** — run 0a–0d so the operator sees state first.

| Shape | Heuristic | Override routing |
|-------|-----------|------------------|
| Plan | `##` headers, `docs/plans/*.md` path | AskQuestion: Use as plan / Treat as goal / Discard |
| Goal | ≤300 chars, no headers | AskQuestion: Yes full flywheel / Refine first / Plan only / Discard |
| Ambiguous | long prose | `/brainstorming` then goal-shaped |

Hard rule: banner + explicit choice before acting on `USER_INPUT`.

### 0a. Detect version

```bash
{ [ -n "$CURSOR_PLUGIN_ROOT" ] && cat "$CURSOR_PLUGIN_ROOT/mcp-server/package.json"; } \
  || { [ -n "$CLAUDE_PLUGIN_ROOT" ] && cat "$CLAUDE_PLUGIN_ROOT/mcp-server/package.json"; } \
  || ls -t ~/.cursor/plugins/cache/*/cursor-orchestrator/*/mcp-server/package.json 2>/dev/null | head -1 | xargs cat 2>/dev/null
```

### 0b. Detect state (`flywheel_observe`)

`/start` should already have called `flywheel_observe({ cwd })`. Use `structuredContent` only; if missing, call once.

| Variable | From `observe` |
|----------|----------------|
| `MCP_DEGRADED` | `true` if observe failed |
| Session / goal | `checkpoint.phase`, `checkpoint.selectedGoal` |
| Bead counts | `beads.counts` |
| `DOCTOR_REPORT` | `doctor` when available |
| `AGENT_MAIL_DOWN` | `agentMail.reachable === false` |
| `IS_FIRST_RUN` | no checkpoint, `beads.total === 0`, no plan artifacts |

Defer `flywheel_profile` to `start_discover`. Defer `flywheel_memory` unless hints require CASS. Step 0b smoke-check: when `DOCTOR_REPORT.overall === "red"` OR `DOCTOR_REPORT.overall === "yellow"`, surface checks with `severity` in `{ "yellow", "red" }` (same as 0c).

### 0c. Welcome banner + doctor

Show project name, branch, bead counts, doctor line (`green` / `yellow` / `red`).

If `DOCTOR_REPORT.overall === "red"` OR `DOCTOR_REPORT.overall === "yellow"`, under the banner list every check with `severity` in `{ "yellow", "red" }` — one line each: `⚠ <check_name>` for yellow, `✗ <check_name>` for red. Yellow checks are non-blocking (advisory); red checks indicate degradation. Pointer: `/flywheel-doctor`.

**Pre-flight (T4.1):** `renderPreflightBanner(DOCTOR_REPORT)` — if non-null, print block then **AskQuestion** (Run setup / Continue degraded / Show degraded). Route: setup → `/flywheel-setup` and re-enter Step 0; degraded → menu; show → print checks and re-ask.

**CASS / telemetry / reality-check suggestion:** advisory only; skip if unavailable.

**Orphaned worktrees:** if doctor flags stale worktrees, **AskQuestion** (Inspect / Clean up / Skip) then continue.

### 0d. Present the main menu

Glob `docs/plans/*.md` mtime desc → `RECENT_PLAN_PATHS` (top 3).

**Preferred:** `flywheel_start_menu({ cwd, variant?, recentPlanPaths, isFirstRun, goal, phase, openBeadCount })` — returns `askQuestion`, `routeHints`, `primaryEntryPointsMarkdown`. Present **AskQuestion** from `askQuestion`; map `id` → `routeHints` → Step 0e.

**Fallback (offline MCP):** build **4-option AskQuestion** from the tables below. Map selected `id` → Step 0e row. Extra entry points: slash commands only (no mega-menu print).

#### **If a previous session exists** (checkpoint, non-idle phase)

```
Primary entry points (active session: '<goal>' @ <phase>):
  • Resume swarm          — Cursor Task swarm via /flywheel-resume (Recommended)
  • Resume session      — continue manually (no swarm)
  • Set a goal          — type a fresh goal in Other; appends after drift confirm
  • Pick up existing plan — type docs/plans/<file>.md in Other; Step 5.45 then beads

Recent plans (copy-paste into Other when picking "Pick up existing plan"):
  • <RECENT_PLAN_PATHS[0]>   (or "(no docs/plans/*.md found)")
  • <RECENT_PLAN_PATHS[1]>
  • <RECENT_PLAN_PATHS[2]>

More entry points (slash command or type label in Other):
  • Work on beads · New goal · Reality check · Duel · Simplify pass · Research repo · Audit · Setup
```

| AskQuestion id | label | description (short) |
|----------------|-------|------------------------|
| resume-swarm | Resume swarm (Recommended) | `/flywheel-resume` — Task + worktrees + Agent Mail |
| resume-session | Resume session | Continue `<goal>` @ `<phase>` manually |
| set-goal | Set a goal | Type goal in Other; append-mode |
| pick-plan | Pick up existing plan | Path in Other; `flywheel_plan` → Step 5.45 |

#### **If open/in-progress beads exist** (no active session)

```
Primary entry points (<N> open beads):
  • Resume swarm          — /flywheel-resume (Recommended)
  • Work on beads       — refine / implement / inspect manually
  • Set a goal          — append new beads
  • Pick up existing plan — path in Other; merges via Step 5.45

Recent plans:
  • <RECENT_PLAN_PATHS[0]> …

More entry points:
  • Reality check · Duel · New goal · Simplify pass · Research repo · Audit · Setup
```

| AskQuestion id | label | route hint |
|----------------|-------|------------|
| resume-swarm | Resume swarm (Recommended) | /flywheel-resume |
| work-beads | Work on beads | manual |
| set-goal | Set a goal | append beads |
| pick-plan | Pick up existing plan | Step 5.45 validate |

#### **If no beads and no session** (fresh start)

When `IS_FIRST_RUN`, swap one slot for **Take the 5-min tour**. Recommendation priority: first-run → tour; else `RECENT_PLAN_PATHS.length > 0` → pick-plan; else `HAS_VISION_DOCS` → reality-check; else scan-discover.

```
Primary entry points:
  • Take the 5-min tour   [IS_FIRST_RUN only]
  • Set a goal
  • Pick up existing plan
  • Scan & discover
  • Reality check

Recent plans: …

More entry points:
  • Research repo · Simplify pass · Duel · Audit · Setup · Quick fix · Resume swarm (if beads appear mid-session)
```

| AskQuestion id | label (non-first-run) |
|----------------|------------------------|
| set-goal | Set a goal |
| pick-plan | Pick up existing plan | Step 5.45 validate before beads |
| scan-discover | Scan & discover |
| reality-check | Reality check |

Glossary: see `rules/context-budget.mdc` (bead, plan, flywheel, MCP).

### 0e. Route the user's choice

> If `USER_INPUT` non-empty, use 0.preflight override instead of this table.

| Choice | Action |
|--------|--------|
| **Resume swarm** | Follow [`commands/flywheel-resume.md`](../../commands/flywheel-resume.md). NTM: `FW_IMPL_BACKEND=ntm` + `skills/legacy/ntm/inflight-prompt.md` on disk only. |
| **Take the 5-min tour** | `skills/start/_tutorial_bead.md` when `IS_FIRST_RUN`. |
| **Other** | Match label to row below; path-like (`docs/plans/`, `.md`, `RECENT_PLAN_PATHS`) → **Pick up existing plan**; else free-text → **Set a goal**. |
| **Simplify pass** | `skills/start/_deslop.md` — mode gate via **AskQuestion**; engine `/simplify-and-refactor-code-isomorphically`. |
| **Duel** | `flywheel_duel` or `/flywheel-duel`; Cursor: `duelModelsGate` + Task wizards; NTM: `FW_DUEL_BACKEND=ntm`. |
| **Reality check** | `skills/start/_reality_check.md` — depth via **AskQuestion**; `/reality-check-for-project`. |
| **Resume session** | Drift check below, then saved phase. |
| **Work on beads** | Sub-menu below — bootstrap `selectedGoal` first. |
| **New goal** | Delete checkpoint → `start_discover` Step 2. |
| **Scan & discover** | `start_discover` Step 2. |
| **Set a goal** | `/brainstorming` if needed → `flywheel_select` → `_planning.cursor.md` or `_planning.md` → Step 5 gates. |
| **Pick up existing plan** | Valid `.md` path → `flywheel_select` + `flywheel_plan({ planFile, source: "picked-up-existing-plan" })` → **Step 5.45** (not 5.5). Skip profile/discover. |
| **Research repo** | AskQuestion URL + mode → `/flywheel-research`. |
| **Quick fix** | `/flywheel-fix` |
| **Audit** | `/flywheel-audit` |
| **Setup** | `/flywheel-setup` |

#### Work on beads — bootstrap

On `missing_prerequisite` from `flywheel_approve_beads`: synthesize goal from top 3 bead titles → **AskQuestion** (Use default / Custom) → `flywheel_select` → **AskQuestion** (Implement / Refine / Inspect) → Step 6 `_beads.md`.

#### Resume session — drift check

Compare `checkpoint.gitHead` to `HEAD` and bead IDs to reality. On drift: **AskQuestion** (Start fresh / Inspect / Force resume).

#### Research repo

**AskQuestion**: Research only / Research + integrate; URL in follow-up or Other field.

### 0f. Degraded modes

**MCP missing:** banner `MCP: not configured` — run `/flywheel-doctor` then `/flywheel-setup`. `MCP_DEGRADED=true`: Explore fallbacks for profile/discover/plan; manual beads; reduced review. **Do not** silently continue without telling the user.

**Agent Mail offline:** banner note; skip reservations in agent prompts; coordinator uses Task output.

Triage order: `/flywheel-doctor` → `/flywheel-setup` → `/flywheel-healthcheck` (cadence).
