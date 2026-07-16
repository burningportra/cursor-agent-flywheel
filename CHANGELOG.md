# Changelog

All notable changes to the **cursor-agent-flywheel** monorepo are documented here.  
Plugin semver details and day-to-day MCP bullets also live in [plugins/cursor-orchestrator/CHANGELOG.md](plugins/cursor-orchestrator/CHANGELOG.md).

## Scope and methodology

| Item | Value |
|------|--------|
| **Repository** | [burningportra/cursor-agent-flywheel](https://github.com/burningportra/cursor-agent-flywheel) |
| **Scope window:** | [Initial commit](https://github.com/burningportra/cursor-agent-flywheel/commit/70c625c) (2026-04-09) → present |
| **Evidence** | `git log`, `git show`, `.beads/issues.jsonl`, marketplace/plugin manifests, existing changelogs |
| **Research memo** | [CHANGELOG_RESEARCH.md](CHANGELOG_RESEARCH.md) |
| **Tags / GitHub Releases** | **None** at time of writing — version **3.18.1** is marketplace/plugin semver only |

Sections are grouped by **capability waves**. The **version timeline** keeps chronology visible; **representative commits** use live GitHub links.

---

## Version Timeline

| Label | Date (landed) | Summary |
|-------|---------------|---------|
| **[Unreleased]** | — | No open beads |
| **3.22.0** | 2026-06-02 | Combined fresh-eyes + thermo-nuclear review (hit-me collect, commit-batch thermo Task) |
| **3.21.0** | 2026-05-26 | Recover-gates, observe pending-gate hint, outcome grading Cursor grader |
| **3.20.0** | 2026-05-26 | Flywheel doc-vs-code audit: wave gate bead close, commit-batch fresh-eyes, compliance Cursor defer |
| **3.19.0** | 2026-05-20 | pi-prompt-suggester integration: coordinator epoch, profile staleness, next-action hints |
| **3.18.1+visual** | 2026-05-20 | Planning browser companion + changelog rebuild ([89397cc](https://github.com/burningportra/cursor-agent-flywheel/commit/89397cc)) |
| **3.18.1+gates** | 2026-05-20 | Upstream skills sync, native bead/impl gates, install + command parity |
| **3.18.1** | 2026-04-09 – 2026-04-14 | Cursor port of agent-flywheel-plugin, CI, publishing, VS Code UI, guided `/flywheel` |

There are **no git tags** and **no GitHub Releases** in this repository yet.

---

## [3.22.1] - 2026-07-16

### Added

- Port **grill-with-docs** goal framing from agent-flywheel-plugin into cursor-orchestrator.

## [Unreleased]

_No pending release items._

---

## 3.22.0 — combined fresh-eyes + thermo-nuclear review (2026-06-02)

Fresh-eyes wave review and commit-batch review share one combined rubric: thermo-nuclear structural quality alongside correctness/DX/goal checks; blocking findings auto-beadify via shared verdict collect. See [plugins/cursor-orchestrator/CHANGELOG.md](plugins/cursor-orchestrator/CHANGELOG.md).

---

## 3.21.0 — recover-gates and outcome grading (2026-05-26)

Recover-gates context resolution, compact gate payloads, Cursor Task outcome grader, and `readBeads` fix for closed beads in wave review. See [plugins/cursor-orchestrator/CHANGELOG.md](plugins/cursor-orchestrator/CHANGELOG.md).

---

## 3.20.0 — flywheel audit fixes (2026-05-26)

Coordinator/review reliability batch: wave gate closes beads on accept-all; commit-batch fresh-eyes wired end-to-end; compliance audit defers to Cursor Task; wave review confirm routes fresh-eyes/self-review/duel; `FW_MAX_OUTCOME_ITERATIONS` and profile `auto_refresh` honored. See [plugins/cursor-orchestrator/CHANGELOG.md](plugins/cursor-orchestrator/CHANGELOG.md).

---

## 3.19.0 — pi-prompt-suggester integration (2026-05-20)

Ports coordinator patterns from [pi-prompt-suggester](https://github.com/guwidoe/pi-prompt-suggester) into the Cursor orchestrator MCP: epoch guards on impl tick, profile intent staleness, and post-wave next-action hints.

### Delivered capability

- **`coordinator-epoch.ts`** — monotonic `coordinatorEpoch`; bump on wave review, wrap-up, and advance-wave steering paths.
- **`flywheel_impl_tick`** — tags every response with `data.epoch`; returns `kind: 'stale'` (no `implTasks`) when the coordinator steered mid-tick.
- **`profile-staleness.ts`** — sha256 watch registry for plan, rubric, AGENTS, README, and config; `profileStale` in observe, doctor, and impl tick.
- **`next-action-hint.ts`** — single-line `nextActionHint` on wave complete / advance; steering-event suppression for rejected hints.
- **Playbook** — `_implement.cursor.md` documents epoch verification before spawning Tasks.
- **Docs beads** — repo-root `AGENTS.md`, orchestrator Testing section, Gate 3 checklist clarity.

### Representative commits

| Date | Commit | Summary |
|------|--------|---------|
| 2026-05-20 | [af6ad38](https://github.com/burningportra/cursor-agent-flywheel/commit/af6ad38) | Implement playbook epoch + hint docs |
| 2026-05-20 | [a9a044c](https://github.com/burningportra/cursor-agent-flywheel/commit/a9a044c) | Coordinator epoch helpers + state types |
| 2026-05-20 | [02187db](https://github.com/burningportra/cursor-agent-flywheel/commit/02187db) | Profile staleness watch registry |

Plan: [docs/plans/2026-05-20-implement-pi-prompt-suggester-integration-synthesized.md](docs/plans/2026-05-20-implement-pi-prompt-suggester-integration-synthesized.md)

---

## 3.18.1+visual — Planning browser companion (2026-05-20)

Port of obra/superpowers **Visual Companion** for flywheel planning only: local zero-dep Node server, HTML mockups in the browser, click events via WebSocket → `state/events` JSONL.

### Delivered capability

- **Skill `visual_prototype`** — `plugins/cursor-orchestrator/skills/visual-prototype/` (`start-server.sh` / `stop-server.sh`, `server.cjs`, `visual-companion.md`, MIT `ATTRIBUTION.md`).
- **Planning hook §4.55** — `_planning.cursor.md` and `_planning.md` (offer companion after Step 4.5; stop before Step 5 / beads).
- **Session artifacts** — `.pi-flywheel/visual/<session>/` (gitignored); `.research/` for clone spikes.
- **Tests** — `plugins/cursor-orchestrator/tests/visual-prototype/ws-protocol.test.js`.
- **Research** — [docs/research-superpowers-2026-05-20.md](docs/research-superpowers-2026-05-20.md).
- **Changelog workmanship** — Rebuilt root [CHANGELOG.md](CHANGELOG.md) from git history; [CHANGELOG_RESEARCH.md](CHANGELOG_RESEARCH.md) memo; skills bundle includes `agent-flywheel:visual_prototype`.

### Representative commits

| Date | Commit | Summary |
|------|--------|---------|
| 2026-05-20 | [89397cc](https://github.com/burningportra/cursor-agent-flywheel/commit/89397cc) | Visual prototype + changelog rebuild |

### Notes for agents

After pull: `npm run build` in `mcp-server/` (or `./scripts/install-flywheel-cursor.sh`), reload Cursor, then `flywheel_get_skill({ name: "agent-flywheel:visual_prototype" })` during planning when UI mockups help.

---

## 3.18.1+gates — Native supervision and upstream sync (2026-05-20)

Large alignment with [agent-flywheel-plugin](https://github.com/burningportra/agent-flywheel-plugin) plus Cursor-native gate tools and install path hardening.

### Delivered capability

- **Bead approval gates** — MCP `flywheel_bead_approval_gate` (`review` → `coverage` / `dedup` → `launch`); slash **`/flywheel-beads-review`**; playbooks `_beads.cursor.md`.
- **Implement supervision** — MCP `flywheel_impl_tick` (~240s cadence): commit-batch fresh-eyes dispatch, wave advance on `closedBeadIds`; slash **`/flywheel-impl-tick`**; `_implement.cursor.md`.
- **Review / wrap-up gates** — `flywheel_wave_review_gate`, `flywheel_wrap_up_gate`, **`/flywheel-recover-gates`**.
- **Command parity** — Full **`flywheel-*`** slash set under `.cursor/commands/` (symlinks via `link-cursor-commands.mjs`); `orchestrate-*` back-compat retained.
- **Install path** — `scripts/install-flywheel-cursor.sh` rsyncs plugin to `~/.cursor/plugins/local/`, rebuilds MCP, copies global commands.
- **Upstream skills** — Broad skill import (brainstorming, beads, cass, flywheel-*, compound-engineering-adjacent tooling in bundle); `scripts/sync-agent-flywheel-upstream.mjs`.
- **Documentation** — Root README rebuild (TL;DR, quick example, design philosophy); this CHANGELOG refresh.

### Representative commits

| Date | Commit | Summary |
|------|--------|---------|
| 2026-05-20 | [`3e1ebbe`](https://github.com/burningportra/cursor-agent-flywheel/commit/3e1ebbe) | README/CHANGELOG; bead gates, impl tick, install, skills/MCP sync |

### Notes for agents

Confirm new MCP tools after install: `flywheel_bead_approval_gate`, `flywheel_impl_tick`, `flywheel_wave_review_gate`, `flywheel_wrap_up_gate`. Rebuild `mcp-server/dist/` whenever `src/` or skills change.

---

## 3.18.1 — Cursor orchestrator port (2026-04-09 – 2026-04-14)

First public shape of the monorepo: marketplace template, **cursor-orchestrator** plugin, CI guardrails, optional Activity Bar extension, beads tracker, guided Agent UX.

### Delivered capability

- **Monorepo bootstrap** — [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) bundles orchestrator + starter template plugins; root README and publishing docs.
- **Orchestrator port** — MCP server (`flywheel_*` + deprecated `orch_*`), skills bundle, `/start` workflow, hooks, `.pi-flywheel/` checkpoint, `flywheel.config.yaml`.
- **CI and verification** — [`.github/workflows/orchestrator-mcp.yml`](.github/workflows/orchestrator-mcp.yml); [`scripts/verify-cursor-orchestrator.mjs`](scripts/verify-cursor-orchestrator.mjs); [`scripts/publish-gate.mjs`](scripts/publish-gate.mjs).
- **Workspace wiring** — [`.cursor/mcp.json`](.cursor/mcp.json); [`.cursor/commands/`](.cursor/commands/) symlinks to plugin commands.
- **Publishing** — [docs/publishing/marketplace.md](docs/publishing/marketplace.md), [docs/publishing/team-marketplace.md](docs/publishing/team-marketplace.md).
- **VS Code extension** — [extensions/cursor-orchestrator-menu/](extensions/cursor-orchestrator-menu/) QuickPick menus → Activity Bar (checkpoint, beads, docs).
- **Beads tracker** — [.beads/issues.jsonl](.beads/issues.jsonl) and history snapshots.
- **Guided UX** — **`/flywheel`** numbered menu; [`.cursor/rules/flywheel-guided.mdc`](.cursor/rules/flywheel-guided.mdc); slash-first orchestration.
- **Planning artifacts (2026-04-14)** — `docs/plans/2026-04-09-*.md` (correctness, ergonomics, robustness, marketplace-ci, agents-md review).

### Closed workstreams (beads)

| ID | Title |
|----|--------|
| `cursor-agent-flywheel-2xc` | Add CHANGELOG and version bump policy |
| `cursor-agent-flywheel-23l` | Add publish-gate script |
| `cursor-agent-flywheel-3gm` | Add publishing runbook and README links |
| `cursor-agent-flywheel-1ro` | Implement .cursor/commands parity in verifier |
| `cursor-agent-flywheel-1os` | Harden orchestrator GitHub Actions workflow |

### Representative commits

| Date | Commit | Summary |
|------|--------|---------|
| 2026-04-09 | [`70c625c`](https://github.com/burningportra/cursor-agent-flywheel/commit/70c625c) | Initial marketplace monorepo + starter plugins |
| 2026-04-09 | [`87ffe71`](https://github.com/burningportra/cursor-agent-flywheel/commit/87ffe71) | Add cursor-orchestrator port from upstream |
| 2026-04-09 | [`b2bdaa6`](https://github.com/burningportra/cursor-agent-flywheel/commit/b2bdaa6) | Workspace `.cursor/mcp.json` for manual testing |
| 2026-04-09 | [`918de63`](https://github.com/burningportra/cursor-agent-flywheel/commit/918de63) | CI verify orchestrator artifacts; expand docs |
| 2026-04-09 | [`4b29761`](https://github.com/burningportra/cursor-agent-flywheel/commit/4b29761) | Harden MCP paths, hooks, command parity |
| 2026-04-09 | [`6e301fa`](https://github.com/burningportra/cursor-agent-flywheel/commit/6e301fa) | Expose slash commands via `.cursor/commands` |
| 2026-04-09 | [`519f19d`](https://github.com/burningportra/cursor-agent-flywheel/commit/519f19d) | Marketplace publishing runbook |
| 2026-04-09 | [`2074cb1`](https://github.com/burningportra/cursor-agent-flywheel/commit/2074cb1) | Plugin CHANGELOG, slash parity CI, publish-gate |
| 2026-04-09 | [`ae5e4b4`](https://github.com/burningportra/cursor-agent-flywheel/commit/ae5e4b4) | VS Code QuickPick extension |
| 2026-04-09 | [`9a10eee`](https://github.com/burningportra/cursor-agent-flywheel/commit/9a10eee) | Activity Bar sidebar (checkpoint, beads, docs) |
| 2026-04-09 | [`b4be2b8`](https://github.com/burningportra/cursor-agent-flywheel/commit/b4be2b8) | Beads issue tracker state |
| 2026-04-09 | [`6dc1ff8`](https://github.com/burningportra/cursor-agent-flywheel/commit/6dc1ff8) | Guided `/flywheel` menu, flywheel-guided rule |
| 2026-04-14 | [`666796c`](https://github.com/burningportra/cursor-agent-flywheel/commit/666796c) | Beads history, MCP config, 2026-04-09 plan docs |

---

## Thematic index (for navigation)

### MCP and orchestrator core

- **`flywheel_*`** MCP tools (+ deprecated **`orch_*`** aliases)
- Checkpoint **`.pi-flywheel/`** with one-time `.pi-orchestrator/` migration
- `flywheel_observe`, `flywheel_plan`, `flywheel_advance_wave`, `flywheel_verify_beads`, `flywheel_compliance_audit`, doctor/remediate/calibrate
- CI dist-drift check in orchestrator workflow

### Agent UX (slash + rules)

- Canonical loop: **`/start`** → `skills/start/SKILL.md`
- Menus: **`/flywheel`**, **`/flywheel-setup`**, gate recovery **`/flywheel-recover-gates`**
- Rules: `flywheel-guided.mdc`, `cursor-user-gates.mdc`, `orchestrator-cursor-models.mdc`, `context-budget.mdc`
- `scripts/link-cursor-commands.mjs`

### Publishing and packaging

- Team marketplace bundle; `install-flywheel-cursor.sh` (rsync, not symlink — [cursor/plugins#35](https://github.com/cursor/plugins/issues/35))
- `publish-gate.mjs`, `verify-cursor-orchestrator.mjs`

### Optional IDE extension

- `extensions/cursor-orchestrator-menu/` — Activity Bar over checkpoint and beads

### Planning visuals

- `skills/visual-prototype/` — local browser companion for Step 4.55 only (3.18.1+visual)

---

## Notes for agents

1. **Install path:** README.md → `./scripts/install-flywheel-cursor.sh` → Reload Window → MCP settings.
2. **What changed when:** version timeline → capability section → representative commit.
3. **Semver bumps:** edit `plugins/cursor-orchestrator/CHANGELOG.md` and marketplace `version` fields per [docs/publishing/marketplace.md](docs/publishing/marketplace.md).
4. **MCP edits:** `cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build && npm test` before expecting new tools in Cursor.
5. **No fake releases:** do not link a GitHub Release URL until one exists; plugin version ≠ git tag.
