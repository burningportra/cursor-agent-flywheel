---
name: flywheel
description: "Guided hub — pick a phase by number; follow the matching project slash command."
---

# Flywheel (guided menu)

**Use this** when you want a **numbered menu** instead of remembering slash command names. Everything below delegates to the same `.md` files as typing `/orchestrate`, `/orchestrate-setup`, etc.

## If `$ARGUMENTS` is non-empty

Treat it as the user's **goal** for the main flywheel. **Read** `.cursor/commands/orchestrate.md` and follow it, using the argument as the initial goal / context for discovery and planning (skip this menu).

## Otherwise — show this menu first

Reply with this table (keep labels exact):

| Pick | Phase | Slash (same content) |
|------|--------|----------------------|
| **1** | First-time setup — `br`, `bv`, MCP, agent-mail | `/orchestrate-setup` |
| **2** | **Main flow** — full flywheel | `/orchestrate` |
| **3** | Status, checkpoint, beads, inbox | `/orchestrate-status` |
| **4** | Quick health check | `/orchestrate-healthcheck` |
| **5** | Session memory (`orch_memory`) | `/memory` |
| **6** | Research | `/orchestrate-research` |
| **7** | Repo scan | `/orchestrate-scan` |
| **8** | Fix / triage | `/orchestrate-fix` |
| **9** | Audit | `/orchestrate-audit` |
| **10** | Drift check | `/orchestrate-drift-check` |
| **11** | Swarm | `/orchestrate-swarm` |
| **12** | Swarm status | `/orchestrate-swarm-status` |
| **13** | Stop swarm | `/orchestrate-swarm-stop` |
| **14** | Stop orchestrator | `/orchestrate-stop` |
| **15** | Rollback | `/orchestrate-rollback` |
| **16** | Cleanup | `/orchestrate-cleanup` |
| **17** | Tool feedback | `/orchestrate-tool-feedback` |
| **18** | Refine one skill | `/orchestrate-refine-skill` |
| **19** | Refine skills bundle | `/orchestrate-refine-skills` |

Ask: **Reply with a number (1–19),** or type the slash command you want.

## After the user chooses

1. Map the pick to the **basename** (e.g. `2` → `orchestrate`, `1` → `orchestrate-setup`).
2. **Read** `.cursor/commands/<basename>.md` from the workspace (repo root).
3. **Execute that file’s instructions in order** — do not shorten unless that file allows it.
4. For large plans or multi-file edits, prefer **Plan mode** in Agent when Cursor offers it.

## Note

The **VS Code extension** (Activity Bar → Orchestrator) can build prompts and copy to clipboard; **slash commands avoid paste** because the instruction body loads directly into Agent.
