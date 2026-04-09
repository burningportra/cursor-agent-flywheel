# Publishing to the Cursor Marketplace

This runbook is for **maintainers** shipping updates from this monorepo. For **adding a new plugin** to the template, see [add-a-plugin.md](../add-a-plugin.md).

## Version surfaces (do not conflate)

| Surface | File | What it means |
| --- | --- | --- |
| **Marketplace bundle** | [`.cursor-plugin/marketplace.json`](../../.cursor-plugin/marketplace.json) → `metadata.version` | Version label for the **multi-plugin package** / template distribution (e.g. `0.1.0`). Bump when the **bundle** identity or packaging story changes in a way you want to track separately. |
| **Per-plugin (Marketplace UI)** | `plugins/<plugin>/.cursor-plugin/plugin.json` → `version` | **Semver** users see for **that** plugin (e.g. orchestrator `2.2.0`). Bump on **user-facing** orchestrator releases. |

You may bump **only** `plugin.json` for an orchestrator fix, **only** `metadata.version` for a template-wide packaging change, or **both** when a release is coordinated—document the choice in the PR.

**Changelog:** Add and maintain `plugins/cursor-orchestrator/CHANGELOG.md` with an `[Unreleased]` section for user-visible orchestrator changes (see that file once it exists in the repo).

## Pre-publish validation (ordered)

Run from the **repository root**:

1. `node scripts/validate-template.mjs` — manifest structure, plugin JSON, frontmatter, paths.
2. `node scripts/verify-cursor-orchestrator.mjs` — orchestrator MCP artifacts, commands, hooks, and template validation delegate.
3. For orchestrator MCP changes:  
   `cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build && npm test`  
   and ensure `git diff --exit-code` is clean on `mcp-server/dist/` (matches CI).

Optional: use `scripts/publish-gate.mjs` when it exists—it wraps the same steps in one command.

## IDE smoke (manual)

- **Reload Window** after plugin or command changes.
- **Output → MCP**: orchestrator + agent-mail (if used) load without errors.
- Invoke a slash command from [`.cursor/commands/`](../../.cursor/commands/) (e.g. orchestrate-setup) if you changed commands.

## Submission

- Confirm [README checklist](../../README.md#submission-checklist) items still hold.
- Submit the repository link per Cursor’s process (see root README for contact options).

## FAQ

**Do I have to bump `metadata.version` every time I bump `plugin.json`?**  
No. They track different scopes. For a pure orchestrator bugfix, bump `plugins/cursor-orchestrator/.cursor-plugin/plugin.json` only unless you are also changing how the **bundle** is described or versioned.

**Where is the orchestrator-specific install / MCP detail?**  
[plugins/cursor-orchestrator/README.md](../../plugins/cursor-orchestrator/README.md).
