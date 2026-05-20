# Changelog

All notable changes to the **cursor-agent-flywheel** monorepo are documented here.  
Plugin-specific release notes also live in [plugins/cursor-orchestrator/CHANGELOG.md](plugins/cursor-orchestrator/CHANGELOG.md).

## Scope and methodology

| Item | Value |
|------|--------|
| **Repository** | [burningportra/cursor-agent-flywheel](https://github.com/burningportra/cursor-agent-flywheel) |
| **History window** | 2026-04-09 (initial commit) → present |
| **Evidence** | `git log`, workspace files; **no git tags or GitHub Releases** at time of writing |
| **Version label** | Marketplace / plugin semver **3.18.1** (see `.cursor-plugin/marketplace.json`) |

Sections are grouped by **capability waves**, not raw commit order. Representative commits link to GitHub.

---

## Version timeline

| Label | Date (landed) | Notes |
|-------|---------------|--------|
| **3.18.1** (plugin) | 2026-04-09 – 2026-04-14 | Full Cursor port of agent-flywheel-plugin 3.18.x |
| **[Unreleased]** | — | Bead approval gates, impl tick, install/docs refresh |

There are **no annotated git tags** in this repository yet; treat **3.18.1** as the published plugin/marketplace version, not a git tag.

---

## [Unreleased]

### Delivered capability

- **Bead approval gates** — MCP `flywheel_bead_approval_gate` (`review` → `launch`) and slash `/flywheel-beads-review` for Step 5.5–6 (score, polish, coverage, dedup menus via AskQuestion).
- **Implement supervision** — MCP `flywheel_impl_tick` (~240s) for commit-batch fresh-eyes review and wave advance; `/flywheel-impl-tick` command.
- **Install reliability** — `install-flywheel-cursor.sh` rsyncs to `~/.cursor/plugins/local/`, rebuilds MCP, copies global slash commands (`flywheel-beads-review`, recover-gates).
- **Root documentation** — This README and monorepo CHANGELOG.

### Representative commits

*(Pending commit — includes staged MCP `dist/` and source overlays.)*

### Notes for agents

After pulling: run `./scripts/install-flywheel-cursor.sh`, **Reload Window**, then confirm **Settings → MCP** lists `flywheel_bead_approval_gate` and `flywheel_impl_tick`.

---

## 3.18.1 — Cursor orchestrator port (2026-04-09 – 2026-04-14)

### Delivered capability

Port of [agent-flywheel-plugin](https://github.com/burningportra/agent-flywheel-plugin) into a Cursor marketplace monorepo: MCP server, slash commands, skills bundle, hooks, beads workflow, optional VS Code Activity Bar UI, and publishing/CI guardrails.

### Closed workstreams

- Marketplace template + **cursor-orchestrator** as primary plugin
- Guided `/flywheel` menu and slash-first Agent UX
- Workspace MCP wiring and orchestrator verification scripts

### Representative commits

| Date | Commit | Summary |
|------|--------|---------|
| 2026-04-09 | [`70c625c`](https://github.com/burningportra/cursor-agent-flywheel/commit/70c625c) | Initial commit |
| 2026-04-09 | [`87ffe71`](https://github.com/burningportra/cursor-agent-flywheel/commit/87ffe71) | Add cursor-orchestrator port from upstream |
| 2026-04-09 | [`b2bdaa6`](https://github.com/burningportra/cursor-agent-flywheel/commit/b2bdaa6) | Workspace `.cursor/mcp.json` for manual testing |
| 2026-04-09 | [`918de63`](https://github.com/burningportra/cursor-agent-flywheel/commit/918de63) | CI verify orchestrator artifacts; expand docs |
| 2026-04-09 | [`4b29761`](https://github.com/burningportra/cursor-agent-flywheel/commit/4b29761) | Harden MCP paths, hooks, command parity |
| 2026-04-09 | [`6e301fa`](https://github.com/burningportra/cursor-agent-flywheel/commit/6e301fa) | Expose slash commands via `.cursor/commands` |
| 2026-04-09 | [`519f19d`](https://github.com/burningportra/cursor-agent-flywheel/commit/519f19d) | Marketplace publishing runbook |
| 2026-04-09 | [`2074cb1`](https://github.com/burningportra/cursor-agent-flywheel/commit/2074cb1) | Changelog, slash parity CI, publish-gate |
| 2026-04-09 | [`ae5e4b4`](https://github.com/burningportra/cursor-agent-flywheel/commit/ae5e4b4) | VS Code QuickPick extension |
| 2026-04-09 | [`9a10eee`](https://github.com/burningportra/cursor-agent-flywheel/commit/9a10eee) | Activity Bar sidebar (checkpoint, beads) |
| 2026-04-09 | [`b4be2b8`](https://github.com/burningportra/cursor-agent-flywheel/commit/b4be2b8) | Beads issue tracker state |
| 2026-04-09 | [`6dc1ff8`](https://github.com/burningportra/cursor-agent-flywheel/commit/6dc1ff8) | Guided `/flywheel` menu, flywheel-guided rule |
| 2026-04-14 | [`666796c`](https://github.com/burningportra/cursor-agent-flywheel/commit/666796c) | Beads history, MCP config, plan docs |

---

## Thematic history (for navigation)

### MCP and orchestrator core

- Full **`flywheel_*`** tool surface (+ deprecated `orch_*` aliases)
- Checkpoint **`.pi-flywheel/`** with legacy `.pi-orchestrator/` migration
- `flywheel.config.yaml`, hooks (sessionStart, agent-mail guard)
- CI: [`.github/workflows/orchestrator-mcp.yml`](.github/workflows/orchestrator-mcp.yml) — build, test, `dist/` drift check

### Agent UX (slash + rules)

- **`/start`** → `skills/start/SKILL.md` (canonical loop)
- **`/flywheel`** numbered menu; **`/flywheel-setup`**
- `scripts/link-cursor-commands.mjs` + `orchestrate-*` back-compat symlinks
- [`.cursor/rules/flywheel-guided.mdc`](.cursor/rules/flywheel-guided.mdc)

### Publishing and monorepo packaging

- [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) — team marketplace bundle
- [docs/publishing/marketplace.md](docs/publishing/marketplace.md), [team-marketplace.md](docs/publishing/team-marketplace.md)
- `scripts/publish-gate.mjs`, `scripts/verify-cursor-orchestrator.mjs`

### Optional IDE extension

- [extensions/cursor-orchestrator-menu/](extensions/cursor-orchestrator-menu/) — QuickPick + Activity Bar over checkpoint/beads

---

## Notes for agents

1. Start with **root README.md** for install; use **plugin README** for MCP/upstream merge policy.
2. For “what changed when”, use the **version timeline** table, then jump to **representative commits**.
3. Plugin semver bumps and `[Unreleased]` bullets: maintain **plugins/cursor-orchestrator/CHANGELOG.md** per [docs/publishing/marketplace.md](docs/publishing/marketplace.md).
4. After MCP source edits, rebuild `mcp-server` and run **`./scripts/install-flywheel-cursor.sh`** before expecting new tools in Cursor.
