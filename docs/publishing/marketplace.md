# Publishing to the Cursor Marketplace

This runbook is for **maintainers** shipping updates from this monorepo. For **adding a new plugin** to the template, see [add-a-plugin.md](../add-a-plugin.md).

## Version surfaces (do not conflate)

| Surface | File | What it means |
| --- | --- | --- |
| **Marketplace bundle** | [`.cursor-plugin/marketplace.json`](../../.cursor-plugin/marketplace.json) → `metadata.version` | Version label for the **multi-plugin package** / template distribution (e.g. `0.1.0`). Bump when the **bundle** identity or packaging story changes in a way you want to track separately. |
| **Per-plugin (Marketplace UI)** | `plugins/<plugin>/.cursor-plugin/plugin.json` → `version` | **Semver** users see for **that** plugin (e.g. orchestrator `2.2.0`). Bump on **user-facing** orchestrator releases. |

You may bump **only** `plugin.json` for an orchestrator fix, **only** `metadata.version` for a template-wide packaging change, or **both** when a release is coordinated—document the choice in the PR.

### When to bump what (quick reference)

| Change | Bump `plugin.json` `version` | Bump `metadata.version` | Update CHANGELOG |
| --- | --- | --- | --- |
| User-visible orchestrator behavior (commands, MCP, hooks) | Yes (semver) | If you also re-cut the bundle story | Under `[Unreleased]` → release section |
| Docs-only under `plugins/cursor-orchestrator/` with no user-facing behavior | Patch or skip per team policy | Usually no | Optional note |
| Template / monorepo packaging only (e.g. marketplace.json structure) | No | Often yes | Root or bundle notes in PR |
| chore: CI, scripts outside plugin UX | Usually no | Rarely | Optional |

**Changelog:** Maintain [plugins/cursor-orchestrator/CHANGELOG.md](../../plugins/cursor-orchestrator/CHANGELOG.md). Add bullets under **`[Unreleased]`** as you merge work; when you cut a release, rename `[Unreleased]` to **`[x.y.z] — YYYY-MM-DD`**, then add a fresh empty `[Unreleased]` section at the top.

## Pre-publish validation (ordered)

Run from the **repository root**:

1. `node scripts/validate-template.mjs` — manifest structure, plugin JSON, frontmatter, paths.
2. `node scripts/verify-cursor-orchestrator.mjs` — orchestrator MCP artifacts, commands, hooks, and template validation delegate.
3. For orchestrator MCP changes:  
   `cd plugins/cursor-orchestrator/mcp-server && npm ci && npm run build && npm test`  
   and ensure `git diff --exit-code` is clean on `mcp-server/dist/` (matches CI).

Optional: run `node scripts/publish-gate.mjs` for steps 1–2 in one shot; add `--with-mcp` to mirror the full CI job (MCP `npm ci` / build / test / `dist` drift check).

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
