# Changelog Research — cursor-agent-flywheel

## Scope

| Item | Value |
|------|--------|
| **Repo** | [burningportra/cursor-agent-flywheel](https://github.com/burningportra/cursor-agent-flywheel) |
| **Requested window** | Full history (initial commit → present) |
| **Output target** | Root `CHANGELOG.md` (+ plugin `plugins/cursor-orchestrator/CHANGELOG.md` for semver bullets) |
| **Rebuild date** | 2026-05-20 |

## Version spine

| Source | Result |
|--------|--------|
| `git for-each-ref refs/tags` | **None** — no annotated tags |
| `gh release list` | **None** — no GitHub Releases |
| Marketplace / plugin semver | **3.18.1** (`.cursor-plugin/marketplace.json`, plugin `plugin.json`) |

**Rule:** 3.18.1 is a **published plugin/marketplace label**, not a git tag or GitHub Release.

## Coverage ledger

| Chunk | Range | Status | Major themes |
|-------|-------|--------|----------------|
| 01 | `70c625c` → `6dc1ff8` (2026-04-09) | distilled | Monorepo bootstrap, orchestrator port, CI/verify, publishing, VS Code UI, guided `/flywheel` |
| 02 | `666796c` (2026-04-14) | distilled | Beads history, MCP config, 2026-04-09 plan docs |
| 03 | `3e1ebbe` (2026-05-20) | distilled | Upstream skills sync, `flywheel_*` command parity, bead gates, impl tick, install script, README/CHANGELOG |
| WT | Uncommitted working tree | noted | Visual prototype server (superpowers port), planning §4.55, research doc |

## Evidence sources

1. `git log --no-merges` (14 commits)
2. `git show --stat` per commit
3. `.beads/issues.jsonl` (9 issues, 5 closed / 4 open at research time)
4. Existing `CHANGELOG.md`, `plugins/cursor-orchestrator/CHANGELOG.md`
5. `README.md`, `AGENTS.md`, `docs/publishing/marketplace.md`
6. **Not used:** GitHub Issues API (tracker is beads in-repo)

## Chunk 01 — 2026-04-09 (monorepo + port)

**Representative commits:** `70c625c`, `87ffe71`, `b2bdaa6`, `918de63`, `4b29761`, `6e301fa`, `519f19d`, `2074cb1`, `ae5e4b4`, `9a10eee`, `b4be2b8`, `6dc1ff8`

**Themes:**

- Cursor marketplace template + **cursor-orchestrator** plugin (upstream agent-flywheel 3.18.x port)
- MCP server, hooks, `flywheel_*` tools, skills bundle, `/start` workflow
- CI: `orchestrator-mcp.yml`, `verify-cursor-orchestrator.mjs`
- Publishing: `publish-gate.mjs`, marketplace runbook
- Workspace `.cursor/commands` symlinks + `orchestrate-*` back-compat
- VS Code extension: QuickPick → Activity Bar (checkpoint, beads, docs)
- Guided UX: `/flywheel` menu, `flywheel-guided.mdc`

**Closed beads (chunk 01):**

| ID | Title |
|----|--------|
| `cursor-agent-flywheel-2xc` | Add CHANGELOG and version bump policy |
| `cursor-agent-flywheel-23l` | Add publish-gate script |
| `cursor-agent-flywheel-3gm` | Add publishing runbook and README links |
| `cursor-agent-flywheel-1ro` | Implement .cursor/commands parity in verifier |
| `cursor-agent-flywheel-1os` | Harden orchestrator GitHub Actions workflow |

## Chunk 02 — 2026-04-14

**Commit:** [`666796c`](https://github.com/burningportra/cursor-agent-flywheel/commit/666796c)

- Beads `.br_history` + `issues.jsonl` updates
- `.cursor/mcp.json` adjustments
- Plan docs under `docs/plans/2026-04-09-*.md` (correctness, ergonomics, robustness, marketplace-ci, agents-md review)

## Chunk 03 — 2026-05-20

**Commit:** [`3e1ebbe`](https://github.com/burningportra/cursor-agent-flywheel/commit/3e1ebbe) — large upstream alignment + Cursor gates

**Themes:**

- Massive plugin sync: skills, MCP `dist/`, start workflow overlays, install script
- **`flywheel_bead_approval_gate`**, **`flywheel_impl_tick`**, **`flywheel_wave_review_gate`**, **`flywheel_wrap_up_gate`**
- Slash: `/flywheel-beads-review`, `/flywheel-impl-tick`, `/flywheel-recover-gates`, full `flywheel-*` command set in `.cursor/commands`
- `scripts/install-flywheel-cursor.sh`, `link-cursor-commands.mjs`, `sync-agent-flywheel-upstream.mjs`
- Root README + CHANGELOG rebuild

## Working tree (not in git yet)

- `plugins/cursor-orchestrator/skills/visual-prototype/` — planning-only browser companion (obra/superpowers)
- `docs/research-superpowers-2026-05-20.md`
- Planning hooks §4.55, ws-protocol tests, `.gitignore` for `.pi-flywheel/`

## Open questions

- None for committed history; tag/release policy still undefined for this repo.
