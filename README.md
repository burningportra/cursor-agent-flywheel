# Agent Flywheel for Cursor

[![Orchestrator MCP CI](https://github.com/burningportra/cursor-agent-flywheel/actions/workflows/orchestrator-mcp.yml/badge.svg)](https://github.com/burningportra/cursor-agent-flywheel/actions/workflows/orchestrator-mcp.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](plugins/cursor-orchestrator/.cursor-plugin/plugin.json)

**Team marketplace + local install for the Agentic Coding Flywheel in Cursor** — scan, discover, plan, beads, review gates, parallel implement, and swarm ops without leaving Agent.

```bash
git clone https://github.com/burningportra/cursor-agent-flywheel.git
cd cursor-agent-flywheel
./scripts/install-flywheel-cursor.sh
# Cmd/Ctrl+Shift+P → Developer: Reload Window
```

---

## TL;DR

### The problem

Multi-step agent workflows in Cursor are easy to start and hard to **finish**: plans drift, beads never get reviewed, MCP tools go stale after local edits, and slash commands disappear when the plugin path points at an old copy.

### The solution

This monorepo ships **cursor-orchestrator** — a Cursor plugin port of [agent-flywheel-plugin](https://github.com/burningportra/agent-flywheel-plugin) v3.18.x — with:

- **30+ slash commands** (`/start`, `/flywheel`, `/flywheel-beads-review`, …)
- **MCP tools** (`flywheel_observe`, `flywheel_plan`, `flywheel_bead_approval_gate`, `flywheel_impl_tick`, …)
- **Beads** (`br` / `bv`) for task graphs and **Agent Mail** for multi-agent coordination
- **One-shot install** that rsyncs a real plugin copy into `~/.cursor/plugins/local/` (symlinks are not enough)

### Why use this repo?

| Capability | What you get |
|------------|----------------|
| Guided Agent UX | `/flywheel` numbered menu + always-on rule [`.cursor/rules/flywheel-guided.mdc`](.cursor/rules/flywheel-guided.mdc) |
| Bead lifecycle | Plan → approve → **review / score / launch gates** → implement → verify |
| Native supervision | `flywheel_impl_tick` (~4 min) for commit-batch review + wave advance |
| Marketplace-ready | [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) for team import |
| Optional UI | VS Code extension [Activity Bar sidebar](extensions/cursor-orchestrator-menu/) |

---

## Quick example (5 minutes)

Open this repo in Cursor, then in **Agent**:

```
/flywheel-setup          # prerequisites + MCP
/start                   # full flywheel (canonical skill)
```

After beads exist:

```
/flywheel-beads-review   # review → score → launch gates (AskQuestion + MCP)
```

During implement:

```
/flywheel_impl_tick({ cwd: "<workspace>" })   # poll every ~240s (see flywheel.config.yaml)
```

CLI from repo root:

```bash
node scripts/link-cursor-commands.mjs
node scripts/verify-cursor-orchestrator.mjs
node scripts/publish-gate.mjs --with-mcp
```

---

## Design philosophy

1. **Slash-first, MCP-backed** — Humans pick phases in `/flywheel`; agents call `flywheel_*` tools for state, gates, and beads.
2. **Cursor-only models** — No external model CLIs for orchestration; Task subagents use Cursor model IDs from `flywheel.config.yaml`.
3. **Real copies, not symlinks** — Local plugin install uses `rsync` because Cursor often ignores symlinked plugins ([cursor/plugins#35](https://github.com/cursor/plugins/issues/35)).
4. **Checkpoint on disk** — `.pi-flywheel/checkpoint.json` survives reloads; legacy `.pi-orchestrator/` migrates once.
5. **Upstream merge lane** — Re-sync from agent-flywheel-plugin, then re-apply Cursor overlays (`cursor-adapters.ts`, hooks, rules).

---

## Comparison

| Approach | Best for | Tradeoff |
|----------|----------|----------|
| **This repo (cursor-orchestrator)** | Full flywheel in Cursor with beads + gates + MCP | Requires `br`, optional agent-mail; install + reload |
| **Raw Cursor Agent** | Ad-hoc edits | No bead graph, no checkpointed phases |
| **Claude Code + agent-flywheel-plugin** | Same flywheel upstream | Different IDE; not this MCP bundle |
| **starter-simple / starter-advanced** (in repo) | Plugin template samples | Not the production orchestrator |

---

## Installation

### One-liner (recommended)

```bash
./scripts/install-flywheel-cursor.sh
```

Then **Developer: Reload Window**. Check **Settings → MCP → orchestrator** and type **`/`** → `flywheel` or `flywheel-beads-review`.

### Team marketplace (Teams / Enterprise)

Admins: **Dashboard → Settings → Plugins → Team Marketplaces → Import**  
`https://github.com/burningportra/cursor-agent-flywheel`  
Members install **cursor-orchestrator** from the panel.  
Details: [docs/publishing/team-marketplace.md](docs/publishing/team-marketplace.md).

### Workspace-only (MCP without full plugin)

Root [`.cursor/mcp.json`](.cursor/mcp.json) loads orchestrator + agent-mail when this folder is the workspace. For **commands, rules, skills, hooks**, still run `install-flywheel-cursor.sh` or link commands:

```bash
node scripts/link-cursor-commands.mjs
```

### From source (maintainers)

```bash
cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build && npm test
node scripts/link-cursor-commands.mjs
```

After **any** `mcp-server/src/` change: rebuild **and** re-run install so `~/.cursor/plugins/local/cursor-orchestrator/` stays current.

---

## Quick start

1. Clone and `./scripts/install-flywheel-cursor.sh`
2. Start **agent-mail** (optional but recommended): `http://127.0.0.1:8765/mcp`
3. Reload Window → **`/flywheel-setup`**
4. **`/start`** or **`/flywheel`** → pick phase **2** (main flow)
5. After planning creates beads → **`/flywheel-beads-review`** before `flywheel_approve_beads({ action: "start" })`

Plugin deep-dive: [plugins/cursor-orchestrator/README.md](plugins/cursor-orchestrator/README.md)

---

## Command reference (high-signal)

| Slash | Purpose |
|-------|---------|
| `/flywheel` | Numbered hub (26 phases) |
| `/start` | Canonical flywheel skill |
| `/flywheel-setup` | Prerequisites + MCP smoke |
| `/flywheel-status` | Checkpoint + beads |
| `/flywheel-beads-review` | Bead review / score / launch gates |
| `/flywheel-impl-tick` | Implement supervision loop |
| `/recover-gates` | Stuck review / wrap-up gates |
| `/flywheel-swarm` | Task + worktree swarm |

Full list: [`.cursor/commands/`](.cursor/commands/) (symlinks into `plugins/cursor-orchestrator/commands/`).  
`/orchestrate-*` names are back-compat aliases.

---

## MCP tools (orchestrator server)

Primary names use the **`flywheel_`** prefix (`orch_*` aliases are deprecated).

| Tool | When to use |
|------|-------------|
| `flywheel_observe` | Session start — variant + route hints |
| `flywheel_profile` / `flywheel_discover` / `flywheel_select` / `flywheel_plan` | Scan → ideas → plan → beads |
| `flywheel_bead_approval_gate` | **Mandatory** after beads — `step: "review"` then `"launch"` |
| `flywheel_approve_beads` | Start implementation **after** launch gate |
| `flywheel_impl_tick` | Poll during implement (~240s default) |
| `flywheel_review` / `flywheel_advance_wave` | Review + wave progression |
| `flywheel_wave_review_gate` / `flywheel_wrap_up_gate` | Post-implement menus (`/recover-gates`) |
| `flywheel_grade_outcome` | Rubric verdict before wrap-up (Step 9.5.0) |
| `flywheel_doctor` | 23-check triage |

Machine-readable catalog: `flywheel_capabilities` / `flywheel_robot_docs`.

---

## Configuration

Project file (read at MCP runtime):

```yaml
# flywheel.config.yaml (excerpt)
impl_tick:
  interval_seconds: 240   # ~4 min supervision cadence
implement:
  simple: composer-2.5
  medium: composer-2.5
  complex: opus-4.6
```

State: **`.pi-flywheel/checkpoint.json`**.  
Config schema is additive — unknown keys are ignored.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Cursor Agent (slash commands + AskQuestion gates)          │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
        .cursor/commands/*.md          flywheel_* MCP (stdio)
                │                             │
                ▼                             ▼
┌───────────────────────────┐     ┌────────────────────────────┐
│ plugins/cursor-orchestrator│     │ mcp-server (TypeScript)    │
│ skills / rules / hooks     │     │ checkpoint, beads, gates   │
└───────────────────────────┘     └───────────┬────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────┐
                    ▼                         ▼                 ▼
              .pi-flywheel/              br / bv            agent-mail
              checkpoint.json          beads graph         (HTTP MCP)
```

Optional: [extensions/cursor-orchestrator-menu](extensions/cursor-orchestrator-menu/) reads the same checkpoint for Activity Bar status.

---

## Monorepo layout

| Path | Purpose |
|------|---------|
| `plugins/cursor-orchestrator/` | Production flywheel plugin |
| `plugins/starter-*` | Template sample plugins |
| `.cursor/commands/` | Workspace slash-command links |
| `scripts/install-flywheel-cursor.sh` | Local Cursor install |
| `scripts/link-cursor-commands.mjs` | Refresh command symlinks |
| `docs/publishing/` | Marketplace + release runbooks |

Agent orientation: [AGENTS.md](AGENTS.md)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| MCP tool missing after code change | `./scripts/install-flywheel-cursor.sh` then **Reload Window** |
| `/flywheel-beads-review` not in `/` menu | `node scripts/link-cursor-commands.mjs` + reload; check `~/.cursor/commands/` |
| orchestrator MCP red in Settings | `cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build`; reinstall plugin |
| Bead gates skipped | Call `flywheel_bead_approval_gate` before `flywheel_approve_beads` start |
| agent-mail errors | Start mail server on `127.0.0.1:8765` or remove from `.cursor/mcp.json` |

More: [plugins/cursor-orchestrator/README.md](plugins/cursor-orchestrator/README.md)

---

## Limitations

- **Not** in the public Cursor Marketplace until submitted and approved — use local install or team marketplace import.
- **Cursor models only** for orchestration LLM steps (no Codex/Claude CLI routing from this plugin).
- **Beads CLI (`br`)** required for full bead workflow; doctor will warn if missing.
- **Large histories** — upstream sync can overwrite Cursor overlays; follow merge policy in plugin README.

---

## FAQ

**Is this the same as agent-flywheel-plugin?**  
Same flywheel semantics; this is the **Cursor port** with Task swarms, Cursor gates, and `flywheel_*` MCP in a marketplace monorepo.

**Why two READMEs?**  
Root README = monorepo + install. [plugins/cursor-orchestrator/README.md](plugins/cursor-orchestrator/README.md) = plugin MCP, hooks, upstream pin.

**Do I need the VS Code extension?**  
No — optional sidebar. Agent + slash commands are sufficient.

**Where is the changelog?**  
Root [CHANGELOG.md](CHANGELOG.md) (monorepo timeline) and [plugins/cursor-orchestrator/CHANGELOG.md](plugins/cursor-orchestrator/CHANGELOG.md) (plugin releases).

**How do I publish?**  
[docs/publishing/marketplace.md](docs/publishing/marketplace.md)

---

## About Contributions

*About Contributions:* Please don't take this the wrong way, but I do not accept outside contributions for any of my projects. I simply don't have the mental bandwidth to review anything, and it's my name on the thing, so I'm responsible for any problems it causes; thus, the risk-reward is highly asymmetric from my perspective. I'd also have to worry about other "stakeholders," which seems unwise for tools I mostly make for myself for free. Feel free to submit issues, and even PRs if you want to illustrate a proposed fix, but know I won't merge them directly. Instead, I'll have Claude or Codex review submissions via `gh` and independently decide whether and how to address them. Bug reports in particular are welcome. Sorry if this offends, but I want to avoid wasted time and hurt feelings. I understand this isn't in sync with the prevailing open-source ethos that seeks community contributions, but it's the only way I can move at this velocity and keep my sanity.

---

## License

MIT — see per-plugin `plugin.json` / upstream licenses.
