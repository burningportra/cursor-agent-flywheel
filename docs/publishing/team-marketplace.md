# Team marketplace setup (Agent Flywheel)

Use this when your org has **Cursor Teams** or **Enterprise** and you want everyone to install **cursor-orchestrator** from the in-IDE **Marketplace** panel (not a manual `~/.cursor/plugins/local` copy).

**Repository to import:** `https://github.com/burningportra/cursor-agent-flywheel`

**Manifest:** `.cursor-plugin/marketplace.json` at the repo root — marketplace id `agent-flywheel`, primary plugin `cursor-orchestrator`.

## Prerequisites

| Requirement | Notes |
| --- | --- |
| **Cursor Teams or Enterprise** | Team marketplaces are not on individual Pro plans. |
| **Admin access** | On Enterprise, only admins can import team marketplaces (Dashboard → Settings → Plugins). |
| **GitHub access** | Cursor must read the repo (public, or grant access to a private repo). |
| **Repo validation** | Maintainers run `node scripts/publish-gate.mjs --with-mcp` before tagging a release the team imports. |

**Limits:** Teams plan — up to **1** team marketplace; Enterprise — unlimited.

## Admin: import the marketplace (one time)

1. Open **Cursor Dashboard** → **Settings** → **Plugins**.
2. Under **Team Marketplaces**, click **Import**.
3. Paste the Git repository URL:

   `https://github.com/burningportra/cursor-agent-flywheel`

4. Continue through the wizard:
   - **Review parsed plugins** — you should see **cursor-orchestrator** (and optional starter plugins).
   - **Team access** (optional) — restrict which directory groups see this marketplace.
   - **Name / description** — defaults come from `marketplace.json` (**Agent Flywheel**).
5. **Save** the marketplace.

### Required vs optional (distribution groups)

When assigning the marketplace to a **distribution group**:

| Mode | Behavior |
| --- | --- |
| **Required** | Plugin installs automatically for everyone in that group after you click Save. |
| **Optional** | Plugin appears in the Marketplace panel; each developer chooses **Install**. |

For a pilot, use **Optional** for `cursor-orchestrator` first; switch to **Required** once MCP and agent-mail prerequisites are documented.

## Developer: install from the team marketplace

1. Open **Cursor** (logged into the team).
2. Open the **Marketplace** panel in the sidebar.
3. Find plugins from your team marketplace **Agent Flywheel**.
4. Click **Install** on **cursor-orchestrator** (display name: **Cursor Orchestrator**).
5. **Reload Window** (Cmd/Ctrl+Shift+P → Developer: Reload Window).
6. **Settings → Features → MCP** — enable **orchestrator** (and **agent-mail** if your team runs it).
7. In Agent chat, type `/` → `flywheel-setup`, then `/start`.

You do **not** need `~/.cursor/plugins/local` when installing from the team marketplace.

## What each plugin in this repo is for

| Plugin | Install for production flywheel? |
| --- | --- |
| **cursor-orchestrator** | **Yes** — full flywheel (commands, skills, hooks, MCP). |
| starter-advanced | No — template sample only. |
| starter-simple | No — template sample only. |

## Updating the team after a release

1. Merge changes to `main` on GitHub (with `publish-gate` green in CI).
2. Bump `plugins/cursor-orchestrator/.cursor-plugin/plugin.json` `version` and `metadata.version` in `marketplace.json` when cutting a release.
3. Team members may need to **update** the plugin from the Marketplace panel or reload Cursor.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No **Team Marketplaces** in Dashboard | Plan is not Teams/Enterprise, or you are not an admin. |
| Import fails / zero plugins parsed | Run `node scripts/validate-template.mjs` on `main`; ensure manifest and plugin.json exist. |
| Plugin installs but MCP red | Start agent-mail if used; check Settings → MCP. |
| Slash commands missing in monorepo | Also run `node scripts/link-cursor-commands.mjs` for `.cursor/commands/`. |

## Related docs

- [marketplace.md](./marketplace.md) — versioning, validation, public submission
- [plugins/cursor-orchestrator/README.md](../../plugins/cursor-orchestrator/README.md) — prerequisites
- [agent-flywheel-cursor-parity.md](../plans/agent-flywheel-cursor-parity.md) — acceptance checklist
