# Cursor plugin template

Build and publish Cursor Marketplace plugins from a single repo.

Plugins included:

- **starter-simple**: rules and skills only
- **starter-advanced**: rules, skills, agents, commands, hooks, MCP, and scripts
- **cursor-orchestrator**: multi-agent orchestrator (beads, dual MCP, hooks, full command set) — see [plugins/cursor-orchestrator/README.md](plugins/cursor-orchestrator/README.md)

## Getting started

[Use this template](https://github.com/cursor/plugin-template/generate) to create a new repository, then customize:

1. `.cursor-plugin/marketplace.json`: set marketplace `name`, `owner`, and `metadata`.
2. `plugins/*/.cursor-plugin/plugin.json`: set `name` (lowercase kebab-case), `displayName`, `author`, `description`, `keywords`, `license`, and `version`.
3. Replace placeholder rules, skills, agents, commands, hooks, scripts, and logos.

To add more plugins, see `docs/add-a-plugin.md`.

**Publishing & releases:** See [docs/publishing/marketplace.md](docs/publishing/marketplace.md) for versioning, validation order, and submission notes.

## Single plugin vs multi-plugin

This template defaults to **multi-plugin** (multiple plugins in one repo).

For a **single plugin**, move your plugin folder contents to the repository root, keep one `.cursor-plugin/plugin.json`, and remove `.cursor-plugin/marketplace.json`.

## Submission checklist

Use [docs/publishing/marketplace.md](docs/publishing/marketplace.md) for the full **pre-publish** flow. In short:

- Valid `plugin.json` per plugin; unique kebab-case names; `marketplace.json` entries match real folders.
- Frontmatter complete on rules, skills, agents, commands; logos committed.
- `node scripts/validate-template.mjs` passes (and orchestrator checks if you ship `cursor-orchestrator`).
- Repository link ready for Cursor submission (see marketplace doc for contact options).
