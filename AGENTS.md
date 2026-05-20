# Agent orientation (cursor-agent-flywheel monorepo)

Marketplace template + **cursor-orchestrator** plugin (Agent Flywheel v3.18 for Cursor).

## Where to work

| Path | Purpose |
|------|---------|
| `plugins/cursor-orchestrator/` | Flywheel plugin — commands, skills, MCP server, hooks |
| `plugins/cursor-orchestrator/mcp-server/` | TypeScript MCP (`flywheel_*` tools) — see `AGENTS.md` there |
| `plugins/cursor-orchestrator/skills/start/` | Canonical `/start` workflow (SSOT) |
| `.cursor/commands/` | Workspace slash-command symlinks into the plugin |
| `extensions/cursor-orchestrator-menu/` | Optional Activity Bar UI |
| `scripts/sync-agent-flywheel-upstream.mjs` | Re-sync from agent-flywheel-plugin |
| `scripts/link-cursor-commands.mjs` | Refresh `.cursor/commands` symlinks |

## Common commands (repo root)

```bash
node scripts/link-cursor-commands.mjs
node scripts/verify-cursor-orchestrator.mjs
node scripts/publish-gate.mjs --with-mcp
cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build && npm test
```

## Cursor Agent entry

1. `/flywheel-setup` — prerequisites
2. `/start` or `/flywheel` menu — full loop
3. MCP tools: `flywheel_observe`, `flywheel_profile`, … (`orch_*` aliases OK)

State on disk: **`.pi-flywheel/checkpoint.json`** (legacy `.pi-orchestrator/` migrated once).
