# Cursor Orchestrator Menu

VS Code / **Cursor** extension: **QuickPick menus** for the Agentic Coding Flywheel so you rarely type long orchestration prompts.

## Features

- **Orchestrator: Open Menu** — pick verify, publish-gate, beads, publishing doc, checkpoint summary, or copy setup/status prompts.
- **Orchestrate Wizard** — multi-step: resume vs fresh (optional checkpoint delete), optional goal, **standard / deep / agent-decides** planning, then **copies a ready-to-paste Agent prompt** and mirrors it in **Output → Cursor Orchestrator**.
- One-click **terminal** runners for `verify-cursor-orchestrator.mjs`, `publish-gate.mjs`, and `br list`.
- Optional **Settings → Cursor Orchestrator Menu → agent chat command**: paste a Command ID to try to open Agent after copy (best-effort; Cursor updates IDs sometimes).

Default keybinding: **⌘⇧⌥O** (Mac) / **Ctrl+Shift+Alt+O** (Win/Linux) when a folder is open.

## Install (development)

1. `cd extensions/cursor-orchestrator-menu && npm install && npm run compile`
2. In Cursor: **Run → Open Workspace from File…** or open this repo.
3. **Run → Start Debugging** (F5) with launch config below, *or* use **Extensions: Install from Location…** and pick `extensions/cursor-orchestrator-menu` (after `vsce package` if you prefer a `.vsix`).

### Minimal launch config (repo `.vscode/launch.json`)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Extension: cursor-orchestrator-menu",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}/extensions/cursor-orchestrator-menu"]
    }
  ]
}
```

## Why not 100% like Plan mode?

Plan mode’s **clarifying-question UI** is built into Cursor Agent. This extension uses **standard VS Code QuickPick** (same UI family, different host feature). You still get structured steps + clipboard handoff—the same pattern many internal tools use before Agent runs MCP/`orch_*` tools.

## Packaging

```bash
npm install -g @vscode/vsce
cd extensions/cursor-orchestrator-menu && npm run compile && vsce package
```

Install the generated `.vsix` via **Extensions: Install from VSIX…**.
