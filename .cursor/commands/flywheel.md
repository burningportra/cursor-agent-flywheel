---
name: flywheel
description: "Guided hub — pick a phase by number; routes to flywheel / start commands."
---

# Flywheel (guided menu)

**Use this** when you want a **numbered menu** instead of remembering slash command names.

## If `$ARGUMENTS` is non-empty

Treat as the user's **goal**. **Read** `.cursor/commands/start.md` and follow it, passing the argument as initial goal/context (skip this menu).

## Otherwise — show this menu first

| Pick | Phase | Slash |
|------|--------|-------|
| **1** | First-time setup | `/flywheel-setup` |
| **2** | **Main flow** (canonical start skill) | `/start` |
| **3** | Status / checkpoint / beads | `/flywheel-status` |
| **4** | Doctor (23-check triage) | `/flywheel-doctor` |
| **5** | Healthcheck | `/flywheel-healthcheck` |
| **6** | Session memory | `/memory` |
| **7** | Research | `/flywheel-research` |
| **8** | Repo scan | `/flywheel-scan` |
| **9** | Fix / triage | `/flywheel-fix` |
| **10** | Audit | `/flywheel-audit` |
| **11** | Drift check | `/flywheel-drift-check` |
| **12** | Swarm (Task + worktree) | `/flywheel-swarm` |
| **13** | Swarm status | `/flywheel-swarm-status` |
| **14** | Stop swarm | `/flywheel-swarm-stop` |
| **15** | Stop flywheel | `/flywheel-stop` |
| **16** | Rollback | `/flywheel-rollback` |
| **17** | Cleanup | `/flywheel-cleanup` |
| **18** | Tool feedback | `/flywheel-tool-feedback` |
| **19** | Refine one skill | `/flywheel-refine-skill` |
| **20** | Refine skills bundle | `/flywheel-refine-skills` |
| **21** | Bead graph viewer | `/flywheel-bead-viewer` |
| **22** | Duel (2-agent ideation) | `/flywheel-duel` |
| **23** | Reality check | `/flywheel-reality-check` |
| **24** | Compound refresh learnings | `/flywheel-compound-refresh` |
| **25** | **Recover review / wrap-up gates** | `/recover-gates` or `/flywheel-recover-gates` |
| **26** | **Bead review / score / launch gates** | `/flywheel-beads-review` |

Ask: **Reply with a number (1–26),** or type the slash command.

## After the user chooses

1. Map the pick to the command basename (e.g. `2` → `start`, `1` → `flywheel-setup`).
2. **Read** `.cursor/commands/<basename>.md` from the workspace root.
3. **Execute that file in order** — do not skip confirmation gates.
4. Prefer **Plan mode** in Agent for large plans when offered.

## Back-compat

`/orchestrate`, `/orchestrate-setup`, etc. are symlinks to the same files as `/flywheel-*` where applicable.
