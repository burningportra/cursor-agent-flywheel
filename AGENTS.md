# Agent orientation (cursor-agent-flywheel monorepo)

Marketplace template + **cursor-orchestrator** plugin (Agent Flywheel v3.18 for Cursor).

This file orients agents at the **repository root**. For MCP server constraints, bead lifecycle, and Cursor coordination rules, see **[plugins/cursor-orchestrator/AGENTS.md](plugins/cursor-orchestrator/AGENTS.md)**.

## Monorepo layout

| Path | Purpose |
|------|---------|
| [`plugins/cursor-orchestrator/`](plugins/cursor-orchestrator/) | Production flywheel plugin — commands, skills, MCP server, hooks, rules |
| [`plugins/cursor-orchestrator/mcp-server/`](plugins/cursor-orchestrator/mcp-server/) | TypeScript MCP (`flywheel_*` tools); edit `src/`, never `dist/` — see [plugin AGENTS.md](plugins/cursor-orchestrator/AGENTS.md) |
| [`plugins/cursor-orchestrator/skills/start/`](plugins/cursor-orchestrator/skills/start/) | Canonical `/start` workflow (SSOT) |
| [`plugins/starter-advanced/`](plugins/starter-advanced/) | Sample marketplace plugin (template only) |
| [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json) | Team marketplace manifest |
| [`.cursor/commands/`](.cursor/commands/) | Workspace slash-command symlinks into the plugin |
| [`.cursor/rules/`](.cursor/rules/) | Always-on Cursor rules (models, gates, context budget) |
| [`extensions/cursor-orchestrator-menu/`](extensions/cursor-orchestrator-menu/) | Optional Activity Bar UI (reads checkpoint + beads) |
| [`scripts/`](scripts/) | Repo-root install, validation, and publish helpers (see below) |
| [`.pi-flywheel/`](.pi-flywheel/) | Runtime flywheel state (`checkpoint.json`; do not hand-edit) |
| [`.beads/`](.beads/) | Beads issue tracker data (`br` / `bv`) |
| [`docs/plans/`](docs/plans/) | Plan artifacts from flywheel planning phases |
| [`docs/publishing/`](docs/publishing/) | Marketplace and release runbooks |

## Scripts (repo root)

| Script | Purpose |
|--------|---------|
| [`scripts/install-flywheel-cursor.sh`](scripts/install-flywheel-cursor.sh) | One-shot local Cursor install (`rsync` into `~/.cursor/plugins/local/`) |
| [`scripts/link-cursor-commands.mjs`](scripts/link-cursor-commands.mjs) | Refresh `.cursor/commands` symlinks |
| [`scripts/write-plugin-mcp-config.mjs`](scripts/write-plugin-mcp-config.mjs) | Write plugin MCP config for local install |
| [`scripts/sync-agent-flywheel-upstream.mjs`](scripts/sync-agent-flywheel-upstream.mjs) | Re-sync from [agent-flywheel-plugin](https://github.com/burningportra/agent-flywheel-plugin) |
| [`scripts/validate-template.mjs`](scripts/validate-template.mjs) | Marketplace template structure + plugin manifest checks |
| [`scripts/verify-cursor-orchestrator.mjs`](scripts/verify-cursor-orchestrator.mjs) | Plugin parity: commands, artifacts, runs `validate-template` |
| [`scripts/publish-gate.mjs`](scripts/publish-gate.mjs) | Pre-publish gate (`--with-mcp` includes MCP build/test) |

## Validation commands

Run from repository root unless noted.

```bash
# Template + plugin manifest structure
node scripts/validate-template.mjs

# Command symlinks, required artifacts, validate-template
node scripts/verify-cursor-orchestrator.mjs

# Full publish gate (includes MCP when --with-mcp)
node scripts/publish-gate.mjs --with-mcp

# Refresh workspace slash commands after plugin command changes
node scripts/link-cursor-commands.mjs

# MCP server (from plugin subdirectory)
cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build && npm test
```

After changing `mcp-server/src/`, rebuild and commit `dist/` in the same change — CI `dist-drift` fails otherwise.

## Cursor Agent entry

1. **`/flywheel-setup`** — prerequisites and MCP wiring
2. **`/start`** or **`/flywheel`** menu — full flywheel loop
3. **MCP tools:** `flywheel_observe`, `flywheel_profile`, … (`orch_*` aliases OK)

State on disk: **`.pi-flywheel/checkpoint.json`** (legacy `.pi-orchestrator/` migrates once). Use `flywheel_*` MCP tools for checkpoint updates — never edit checkpoint JSON by hand.

## Where to work (quick map)

| Task | Go here |
|------|---------|
| Slash commands, skills, rules, hooks | `plugins/cursor-orchestrator/` |
| MCP tool implementation | `plugins/cursor-orchestrator/mcp-server/src/` |
| Activity Bar extension | `extensions/cursor-orchestrator-menu/` |
| Install / CI validation | `scripts/` |
| Human docs | `README.md`, `docs/` |

Deep agent guidance (hard constraints, bead lifecycle, Agent Mail, testing): **[plugins/cursor-orchestrator/AGENTS.md](plugins/cursor-orchestrator/AGENTS.md)**.
