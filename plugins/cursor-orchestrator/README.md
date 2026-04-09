# Cursor Orchestrator

Multi-agent coding orchestrator for **Cursor**. Implements the **Agentic Coding Flywheel**: scan → discover → plan → implement → review — using Cursor’s **Agent**, **Task** (subagents), **Shell**, plugin **commands**, **skills**, **hooks**, and **MCP** servers.

This plugin is a **Cursor port** of [claude-orchestrator](https://github.com/burningportra/claude-orchestrator). All **LLM** steps use **only models available in Cursor** (see **Cursor model policy** below). Infrastructure CLIs (`br`, `bv`, `git`, **agent-mail**) are unchanged from upstream.

## Upstream baseline


| Field            | Value                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pinned ref**   | `66a85a59010ea9348696b280e1442ecae752806a` (`master`)                                                                                                             |
| **Merge policy** | When updating from upstream, diff `commands/`, `mcp-server/src/`, and `hooks/` deliberately; do not drop command files or MCP tools without an explicit decision. |


## Prerequisites

- **Cursor** (latest recommended)
- **[br](https://github.com/burningportra/br)** — bead tracker CLI
- **[bv](https://github.com/burningportra/bv)** — bead visualizer
- **[agent-mail](https://github.com/burningportra/agent-mail)** — coordination MCP (HTTP), e.g.  
`uv run python -m mcp_agent_mail.cli serve-http` on `http://127.0.0.1:8765`

## Publishing & releases

Before tagging or submitting Marketplace updates from this monorepo, follow **[docs/publishing/marketplace.md](../../docs/publishing/marketplace.md)** — versioning (`metadata.version` vs per-plugin `plugin.json`), ordered validation commands, and submission notes.

Release notes for this plugin: **[CHANGELOG.md](CHANGELOG.md)** (`[Unreleased]` during development).

## Install (this monorepo)

The repo’s [`.cursor-plugin/marketplace.json`](../../.cursor-plugin/marketplace.json) lists `cursor-orchestrator` for packaging and [publishing](https://cursor.com/marketplace/publish). It does **not** make the plugin appear in the **public Marketplace panel** until you submit and Cursor approves it ([how the marketplace works](https://cursor.com/docs/plugins.md#the-marketplace)).

### Load the plugin locally (rules, commands, hooks, plugin `mcp.json`)

To test the full plugin (what you’d get after publish), use Cursor’s **local plugins** directory ([official docs](https://cursor.com/docs/plugins.md#test-plugins-locally)):

```bash
ln -sf /absolute/path/to/cursor-agent-flywheel/plugins/cursor-orchestrator ~/.cursor/plugins/local/cursor-orchestrator
```

Then **Cmd/Ctrl+Shift+P → Developer: Reload Window**. Adjust the first path to your clone.

**Teams / Enterprise:** Import this GitHub repo as a **team marketplace** under **Dashboard → Settings → Plugins → Team Marketplaces → Import** so members see it in the Marketplace panel ([docs](https://cursor.com/docs/plugins.md#add-a-team-marketplace)).

### Workspace only — MCP without installing the plugin bundle

If you only open this repo (no symlink), you still get **workspace MCP** from the root [`.cursor/mcp.json`](../../.cursor/mcp.json) (orchestrator + agent-mail). That does **not** automatically load the plugin’s **commands, rules, skills, and hooks** from `plugins/cursor-orchestrator/`; use the **local** symlink above (or a published Marketplace install) for the full bundle.

### Slash commands (`/orchestrate-setup`, etc.)

Cursor’s **`/`** menu in **Agent** loads **project** commands from **[`.cursor/commands/`](../../.cursor/commands/)** at the repo root. This repository adds **symlinks** there pointing at `plugins/cursor-orchestrator/commands/*.md` so names like **`/orchestrate-setup`** and **`/orchestrate`** appear without relying on Marketplace UI. Reload the window after a fresh clone. If a command is missing, confirm the symlinks exist under `.cursor/commands/`.

### Manual test in this workspace (MCP-focused)

This repository includes `[.cursor/mcp.json](../../.cursor/mcp.json)` at the **repo root** so that when you **open the repository as the workspace folder** in Cursor, **MCP** loads:

- **agent-mail** — remote MCP via top-level `**url`** (see [Cursor MCP docs](https://cursor.com/docs/context/mcp)); default `http://127.0.0.1:8765/mcp` (start agent-mail first, or this entry errors until it is up).
- **orchestrator** — `**type`: `"stdio"`**, `node` → `plugins/cursor-orchestrator/scripts/start-orchestrator-mcp.cjs` (path **relative to the workspace folder**, not `${workspaceFolder}`—see **MCP path resolution**).

Then: **Cmd/Ctrl+Shift+P → Developer: Reload Window** (or restart Cursor), open **Output → MCP**, confirm both servers. Run the `**orchestrate-setup`** command in Agent chat when ready.

CLI checks from repo root (no IDE):

```bash
node scripts/verify-cursor-orchestrator.mjs
node scripts/validate-template.mjs
cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build && npm test
```

`verify-cursor-orchestrator.mjs` asserts `**mcp-server/dist/server.js**`, the **MCP launcher**, valid `**mcp.json`** and `**hooks/hooks.json`**, all **19** `commands/*.md` files, and runs `**validate-template.mjs`**.

Hook smoke (optional): with a fake `.pi-orchestrator/checkpoint.json` under the workspace root, `node plugins/cursor-orchestrator/scripts/session-start-orchestrator-notice.cjs` should print a resume line (delete the folder afterward).

## Build the MCP server

Use the **lockfile** for reproducible installs (same as CI):

```bash
cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build
```

**Committed `mcp-server/package-lock.json` and `mcp-server/dist/`** ship in-repo so the plugin is **one-click** without a local build. CI runs `**npm ci`**, `**npm run build`**, `**npm test**`, then `**git diff --exit-code` on `mcp-server/dist**`—if `src/` changes but committed `**dist/**` is not updated, the workflow fails.

**When you must rebuild and commit:** after any change under `mcp-server/src/` or `mcp-server/package.json` / lockfile. After pulling updates that touch the MCP server, rebuild if tools fail to load or if your branch shows dist drift locally (`npm ci && npm run build` then `git status` on `dist/`).

For ad-hoc dev you may use `**npm install`** instead of `**npm ci`**; use `**npm ci**` to match CI exactly.

## Quick start

1. Start **agent-mail** and run `**orchestrate-setup`** (slash command / command palette).
2. Run `**orchestrate`** for the full flywheel.
3. Use `**orchestrate-status**` for progress.

Exact slash / palette names depend on Cursor’s build; use **Command parity** and confirm in **Cmd/Ctrl+Shift+P** after install.

## Command parity (upstream → this plugin)


| Upstream (Claude Code)        | Cursor (expected palette)                        | Command file                   |
| ----------------------------- | ------------------------------------------------ | ------------------------------ |
| `…:orchestrate`               | `/cursor-orchestrator:orchestrate`               | `orchestrate.md`               |
| `…:orchestrate-stop`          | `/cursor-orchestrator:orchestrate-stop`          | `orchestrate-stop.md`          |
| `…:orchestrate-status`        | `/cursor-orchestrator:orchestrate-status`        | `orchestrate-status.md`        |
| `…:orchestrate-setup`         | `/cursor-orchestrator:orchestrate-setup`         | `orchestrate-setup.md`         |
| `…:orchestrate-cleanup`       | `/cursor-orchestrator:orchestrate-cleanup`       | `orchestrate-cleanup.md`       |
| `…:orchestrate-swarm`         | `/cursor-orchestrator:orchestrate-swarm`         | `orchestrate-swarm.md`         |
| `…:orchestrate-swarm-status`  | `/cursor-orchestrator:orchestrate-swarm-status`  | `orchestrate-swarm-status.md`  |
| `…:orchestrate-swarm-stop`    | `/cursor-orchestrator:orchestrate-swarm-stop`    | `orchestrate-swarm-stop.md`    |
| `…:orchestrate-research`      | `/cursor-orchestrator:orchestrate-research`      | `orchestrate-research.md`      |
| `…:orchestrate-drift-check`   | `/cursor-orchestrator:orchestrate-drift-check`   | `orchestrate-drift-check.md`   |
| `…:orchestrate-rollback`      | `/cursor-orchestrator:orchestrate-rollback`      | `orchestrate-rollback.md`      |
| `…:orchestrate-fix`           | `/cursor-orchestrator:orchestrate-fix`           | `orchestrate-fix.md`           |
| `…:orchestrate-audit`         | `/cursor-orchestrator:orchestrate-audit`         | `orchestrate-audit.md`         |
| `…:orchestrate-scan`          | `/cursor-orchestrator:orchestrate-scan`          | `orchestrate-scan.md`          |
| `…:orchestrate-refine-skills` | `/cursor-orchestrator:orchestrate-refine-skills` | `orchestrate-refine-skills.md` |
| `…:orchestrate-refine-skill`  | `/cursor-orchestrator:orchestrate-refine-skill`  | `orchestrate-refine-skill.md`  |
| `…:orchestrate-tool-feedback` | `/cursor-orchestrator:orchestrate-tool-feedback` | `orchestrate-tool-feedback.md` |
| `…:orchestrate-healthcheck`   | `/cursor-orchestrator:orchestrate-healthcheck`   | `orchestrate-healthcheck.md`   |
| `…:memory`                    | `/cursor-orchestrator:memory`                    | `memory.md`                    |


If a label differs in your Cursor version, treat the **command file** name as the source of truth.

## Cursor model policy


| Tier              | Typical use                                        |
| ----------------- | -------------------------------------------------- |
| **A — Strongest** | Correctness-heavy planning, synthesis, hard review |
| **B — Balanced**  | Default implementation, most audits                |
| **C — Fast**      | Third planning angle, lightweight swarm            |


Configure available models under **Cursor → Settings → Models**. **Do not** use external LLM CLIs (`codex`, etc.) for orchestration steps.

### Roles → tiers (suggested)

Use when assigning **Task** subagents or planner personas (see `**agents/planning-trinity.md`** for three parallel planners).


| Role                                       | Tier           |
| ------------------------------------------ | -------------- |
| Correctness planner                        | **A**          |
| Ergonomics planner                         | **B**          |
| Robustness planner                         | **C** or **B** |
| Primary implementer                        | **B**          |
| Parallel reviewer #1 — correctness         | **A**          |
| Parallel reviewer #2 — security            | **A** or **B** |
| Parallel reviewer #3 — maintainability     | **B**          |
| Parallel reviewer #4 — tests               | **B**          |
| Parallel reviewer #5 — agent-native parity | **B** or **C** |


## Vendored tree (upstream parity)

From the pinned ref, this plugin includes at least: `**mcp-server/`** (TypeScript MCP + committed `dist/`), `**skills/`**, `**docs/**`, `**AGENTS.md**`, plugin `**commands/**`, `**hooks/**`, `**rules/**`, `**agents/**`, `**scripts/**` (MCP launcher + hook scripts), `**mcp.json**`, and `**.cursor-plugin/plugin.json**`. Treat `**README.md**` (this file) as the canonical **Cursor** policy; older copies under `**docs/`** may still mention other hosts—prefer commands and rules here.

## MCP path resolution

**Config shape (Cursor):** Plugin-root `**mcp.json`** (not `.mcp.json`) defines `mcpServers`:

- **agent-mail** — `{ "url": "http://127.0.0.1:8765/mcp" }` only (HTTP remote MCP per Cursor docs; no alternate `type`/`url` blob).
- **orchestrator** — `{ "type": "stdio", "command": "node", "args": ["./scripts/start-orchestrator-mcp.cjs"] }` paths relative to the **plugin directory** when Cursor loads plugin MCP.

**Spawn cwd (spike / strategy):** Cursor’s exact **process cwd** for plugin MCP is not documented here; behavior may vary by version. The launcher `**scripts/start-orchestrator-mcp.cjs`** therefore:

1. Resolves the plugin root from `**__dirname`** (`…/scripts` → parent) or from `**ORCHESTRATOR_PLUGIN_ROOT**` (absolute path override if your IDE resolves `./scripts/...` from the wrong cwd).
2. Spawns `**mcp-server/dist/server.js**` with `**cwd**` = that plugin root so `**dist/**` loads regardless of where the parent `node` was started from—**once this file is found and executed**, paths are stable.
3. Optional: set `**ORCHESTRATOR_MCP_DEBUG=1`** to print `**process.cwd()`**, resolved plugin root, and `**server.js**` path to **stderr** when debugging startup.

**Workspace** `[.cursor/mcp.json](../../.cursor/mcp.json)` in this repo uses a **repo-relative** launcher path (`plugins/cursor-orchestrator/scripts/start-orchestrator-mcp.cjs`) and **does not** use `${workspaceFolder}`. That assumes the **workspace folder is the repository root** (typical for this monorepo). If you open only a subfolder as the workspace, point `**args`** at an **absolute** path to `start-orchestrator-mcp.cjs`, or open the repo root as the workspace. `**ORCHESTRATOR_PLUGIN_ROOT`** is read **after** Node loads the launcher (useful if the resolved plugin tree is nonstandard); it does not fix a bad path to the launcher script in `**args`**.

**Project-scoped state:** Checkpoint dirs `**.pi-orchestrator/`** are created per `**cwd`** passed into each `**orch_***` tool (the target repo), **not** the MCP server’s process cwd. The server process cwd only affects loading `**dist/server.js`**.

## UX: install order and worktrees

1. Install **br** / **bv** / **agent-mail** (or confirm `8765` is free).
2. Enable the plugin (or rely on root `.cursor/mcp.json` for local dev).
3. **Reload Window**, confirm MCP in **Output**.
4. Run `**orchestrate-setup`** before heavy orchestration.

**Git worktrees**: use **real paths** on the same filesystem; **symlinked** worktrees can confuse tools that resolve paths differently—prefer plain `git worktree add` paths.

**Permissions**: if Cursor prompts for network or shell access for MCP or hooks, approve for this workspace so `**orch_*`** and bead flows can run.

## Verification (automated vs IDE)

**Automated** (no Cursor UI): run from repo root — `node scripts/verify-cursor-orchestrator.mjs` — covers committed MCP `**dist`**, launcher, `**mcp.json`**, `**hooks/hooks.json**`, 19 commands, and marketplace/template validation.

**IDE-only smoke** (after `**orchestrate-setup`**, optional throwaway branch): confirm in Cursor — Output → MCP lists agent-mail and orchestrator; invoke an `**orch_*`** tool from the Agent; watch `**.pi-orchestrator/**` when orchestration runs; exercise **sessionStart** / **postToolUse** if you use checkpoints and bead approval; open the command palette for `**/cursor-orchestrator:`***. These steps cannot be asserted from CI because they need a live Cursor session and **agent-mail** on `8765`.

## Hooks

Shipped: **sessionStart** (resume notice) and **postToolUse** (matcher covers `orch_approve_beads` and MCP-prefixed tool ids). **subagentStart** / **subagentStop** are **not** included (optional extension; add only if you need lifecycle telemetry without extra noise).

## Architecture

```
commands/*.md          ← Agent-executable workflows
skills/*/SKILL.md      ← Optional prompt injections
hooks/hooks.json       ← sessionStart resume hint; postToolUse after bead approval
mcp.json               ← agent-mail { url } + orchestrator { type: stdio, node → scripts/start-orchestrator-mcp.cjs }
mcp-server/dist/       ← orch_* MCP tools, state via .pi-orchestrator/checkpoint.json
```

## State

Orchestrator state lives under `**.pi-orchestrator/**` in the **project workspace** (e.g. `checkpoint.json`). Do not hand-edit; use `orch_`* MCP tools.

## Troubleshooting

- **MCP**: Cursor **Output → MCP Logs** if servers fail to start.
- **agent-mail**: Ensure `http://127.0.0.1:8765` is reachable; health check in `orchestrate-setup`.
- **Orchestrator stdio**: Confirm `mcp-server/dist/server.js` exists; run `npm run build` in `mcp-server/`.
- **Hooks**: Plugin ships `hooks/hooks.json` with `version: 1`. Hook commands are relative to the plugin directory.

## Known limitations vs Claude Code

- Parallel work uses Cursor **Task** subagents and explicit `**git worktree`** paths instead of Claude’s `Agent(isolation: "worktree")`.
- `macro_start_session(..., program: "cursor")` replaces the upstream `"claude-code"` label for Agent Mail registration.

## License

MIT (same as upstream unless otherwise noted in `plugin.json`).