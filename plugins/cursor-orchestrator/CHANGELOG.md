# Changelog

All notable changes to **cursor-orchestrator** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for `plugins/cursor-orchestrator/.cursor-plugin/plugin.json` → `version`.

## [Unreleased]

### Added

- Slash command **`flywheel`** — numbered menu in Agent; routes to the same `.md` runbooks as `/orchestrate`, `/orchestrate-setup`, etc.
- **`.cursor/rules/flywheel-guided.mdc`** — always-on Agent guidance for slash-first flow and `orch_*` MCP usage.
- Repo-root **`.cursor/commands/*.md`** symlinks to `plugins/cursor-orchestrator/commands/` so `/` commands work after clone (reload window once).
- This changelog file and publishing guidance in the monorepo runbook.
- `scripts/verify-cursor-orchestrator.mjs` now asserts repo-root `.cursor/commands` matches plugin commands (including symlink resolution).
- `scripts/publish-gate.mjs` for a single local command that runs template + orchestrator checks (optional `--with-mcp`).

### Changed

- **`orchestrate`** / **`orchestrate-setup`** — short “guided” pointers at the top pointing to `/flywheel` where helpful.

<!-- On release: rename [Unreleased] to [X.Y.Z] — YYYY-MM-DD, then add a new empty [Unreleased] above. -->
