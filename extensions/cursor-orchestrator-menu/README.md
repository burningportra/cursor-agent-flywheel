# Cursor Orchestrator Menu

VS Code / **Cursor** extension: **QuickPick wizards** + an **Activity Bar** sidebar for the Agentic Coding Flywheel.

**Most guided path (no paste):** In **Cursor Agent**, type **`/`** → **`flywheel`** (numbered menu) or **`orchestrate`**. This extension is optional visibility + clipboard helpers.

## Features

### Sidebar (**Activity Bar → Orchestrator**)

- **Session** — reads `.pi-orchestrator/checkpoint.json` (phase, goal, plan file, updated time).
- **Beads** — `br list --json` (status icons; needs `br` on `PATH`).
- **Wizards & scripts** — Orchestrate wizard, full command menu, verify, publish-gate, `br list` in terminal.
- **Docs** — publishing runbook, add-a-plugin guide.
- **Refresh** icon in the view title (or command **Orchestrator: Refresh**).
- Optional **auto-refresh**: setting `cursorOrchestratorMenu.sidebarAutoRefreshSeconds` (default `0` = off).

### Commands

- **Orchestrator: Open Menu** — verify, publish-gate, beads, docs, checkpoint summary, setup/status prompts.
- **Orchestrate Wizard** — **(1/3) Session** → **(2/3) Goal** → **(3/3) Planning**, then copies an Agent prompt to the clipboard and **Output → Cursor Orchestrator**.
- Optional **agent chat command** setting to try to open Agent after copy.

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

Plan mode’s **clarifying-question UI** is built into Cursor Agent. **Slash commands** (`/flywheel`, `/orchestrate`, …) load instructions directly into chat. This extension adds **standard VS Code QuickPick** for the same prompts when you want UI outside Agent, plus **clipboard** when you still need a handoff.

## Packaging

```bash
npm install -g @vscode/vsce
cd extensions/cursor-orchestrator-menu && npm run compile && vsce package
```

Install the generated `.vsix` via **Extensions: Install from VSIX…**.
