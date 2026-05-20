# Agent Flywheel — Cursor full parity checklist

Upstream: [burningportra/agent-flywheel-plugin](https://github.com/burningportra/agent-flywheel-plugin) — see `plugins/cursor-orchestrator/SYNC_MANIFEST.json`.

## Maintenance

```bash
node scripts/sync-agent-flywheel-upstream.mjs --ref v3.18.1
node scripts/link-cursor-commands.mjs
cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build
node scripts/verify-cursor-orchestrator.mjs
node scripts/publish-gate.mjs --with-mcp
```

## Acceptance

- [x] 20 primary MCP tools + `orch_*` aliases
- [x] Structured error envelope + `flywheel_capabilities` / `flywheel_robot_docs`
- [x] `flywheel_get_skill` bundle + phase sub-skills
- [x] 24+ upstream commands (+ `orchestrate-*` back-compat)
- [x] `.pi-flywheel` state + legacy migration
- [x] Doctor / remediate / observe / verify / advance / compliance chain
- [x] Hooks: sessionStart + preToolUse guard + postToolUse
- [x] Cursor swarm substitute documented (`cursor-swarm.mdc`, `flywheel-swarm.md`)
- [x] Vitest suite green in CI

## IDE smoke (manual)

1. `ln -sf $(pwd)/plugins/cursor-orchestrator ~/.cursor/plugins/local/cursor-orchestrator`
2. Reload Window — MCP: agent-mail + orchestrator green
3. `/flywheel-setup` then `/start`
4. `flywheel_observe` → `.pi-flywheel/checkpoint.json`
5. Mini loop: profile → discover → select → plan → approve → review → verify → advance
6. `/flywheel-swarm` (Task + worktree, no NTM)
