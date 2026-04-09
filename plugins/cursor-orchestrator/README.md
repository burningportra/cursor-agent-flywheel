# Cursor Orchestrator

Multi-agent coding orchestrator for **Cursor**. Implements the **Agentic Coding Flywheel**: scan → discover → plan → implement → review — using Cursor’s **Agent**, **Task** (subagents), **Shell**, plugin **commands**, **skills**, **hooks**, and **MCP** servers.

This plugin is a **Cursor port** of [claude-orchestrator](https://github.com/burningportra/claude-orchestrator). All **LLM** steps use **only models available in Cursor** (see **Cursor model policy** below). Infrastructure CLIs (`br`, `bv`, `git`, **agent-mail**) are unchanged from upstream.

## Upstream baseline

| Field | Value |
|-------|--------|
| **Pinned ref** | `66a85a59010ea9348696b280e1442ecae752806a` (`master`) |
| **Merge policy** | When updating from upstream, diff `commands/`, `mcp-server/src/`, and `hooks/` deliberately; do not drop command files or MCP tools without an explicit decision. |

## Prerequisites

- **Cursor** (latest recommended)
- [**br**](https://github.com/burningportra/br) — bead tracker CLI
- [**bv**](https://github.com/burningportra/bv) — bead visualizer
- [**agent-mail**](https://github.com/burningportra/agent-mail) — coordination MCP (HTTP), e.g.  
  `uv run python -m mcp_agent_mail.cli serve-http` on `http://127.0.0.1:8765`

## Install (this monorepo)

Add or enable the plugin from this repository per [Cursor Plugins](https://cursor.com/docs/reference/plugins.md). This marketplace entry is `cursor-orchestrator` → `./plugins/cursor-orchestrator`.

## Build the MCP server

```bash
cd plugins/cursor-orchestrator/mcp-server && npm install && npm run build
```

Committed `mcp-server/dist/` should be present after build; rebuild after changing `mcp-server/src/`.

## Quick start

1. Start **agent-mail** and run **`orchestrate-setup`** (slash command / command palette).
2. Run **`orchestrate`** for the full flywheel.
3. Use **`orchestrate-status`** for progress.

Exact slash names depend on Cursor’s UI; see **Command parity** once you verify in-app.

## Command parity (upstream → this plugin)

| Upstream (Claude Code) | Command file |
|------------------------|--------------|
| `…:orchestrate` | `orchestrate.md` |
| `…:orchestrate-stop` | `orchestrate-stop.md` |
| `…:orchestrate-status` | `orchestrate-status.md` |
| `…:orchestrate-setup` | `orchestrate-setup.md` |
| `…:orchestrate-cleanup` | `orchestrate-cleanup.md` |
| `…:orchestrate-swarm` | `orchestrate-swarm.md` |
| `…:orchestrate-swarm-status` | `orchestrate-swarm-status.md` |
| `…:orchestrate-swarm-stop` | `orchestrate-swarm-stop.md` |
| `…:orchestrate-research` | `orchestrate-research.md` |
| `…:orchestrate-drift-check` | `orchestrate-drift-check.md` |
| `…:orchestrate-rollback` | `orchestrate-rollback.md` |
| `…:orchestrate-fix` | `orchestrate-fix.md` |
| `…:orchestrate-audit` | `orchestrate-audit.md` |
| `…:orchestrate-scan` | `orchestrate-scan.md` |
| `…:orchestrate-refine-skills` | `orchestrate-refine-skills.md` |
| `…:orchestrate-refine-skill` | `orchestrate-refine-skill.md` |
| `…:orchestrate-tool-feedback` | `orchestrate-tool-feedback.md` |
| `…:orchestrate-healthcheck` | `orchestrate-healthcheck.md` |
| `…:memory` | `memory.md` |

Fill the **Cursor-discovered name** column in your fork after you confirm labels in the IDE.

## Cursor model policy

| Tier | Typical use |
|------|-------------|
| **A — Strongest** | Correctness-heavy planning, synthesis, hard review |
| **B — Balanced** | Default implementation, most audits |
| **C — Fast** | Third planning angle, lightweight swarm |

Configure available models under **Cursor → Settings → Models**. **Do not** use external LLM CLIs (`codex`, etc.) for orchestration steps.

## Architecture

```
commands/*.md          ← Agent-executable workflows
skills/*/SKILL.md      ← Optional prompt injections
hooks/hooks.json       ← sessionStart resume hint; postToolUse after bead approval
mcp.json               ← agent-mail (url) + orchestrator (stdio → scripts/start-orchestrator-mcp.cjs)
mcp-server/dist/       ← orch_* MCP tools, state via .pi-orchestrator/checkpoint.json
```

## State

Orchestrator state lives under **`.pi-orchestrator/`** in the **project workspace** (e.g. `checkpoint.json`). Do not hand-edit; use `orch_*` MCP tools.

## Troubleshooting

- **MCP**: Cursor **Output → MCP Logs** if servers fail to start.
- **agent-mail**: Ensure `http://127.0.0.1:8765` is reachable; health check in `orchestrate-setup`.
- **Orchestrator stdio**: Confirm `mcp-server/dist/server.js` exists; run `npm run build` in `mcp-server/`.
- **Hooks**: Plugin ships `hooks/hooks.json` with `version: 1`. Hook commands are relative to the plugin directory.

## Known limitations vs Claude Code

- Parallel work uses Cursor **Task** subagents and explicit **`git worktree`** paths instead of Claude’s `Agent(isolation: "worktree")`.
- `macro_start_session(..., program: "cursor")` replaces the upstream `"claude-code"` label for Agent Mail registration.

## License

MIT (same as upstream unless otherwise noted in `plugin.json`).
