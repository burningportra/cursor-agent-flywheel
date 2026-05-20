#!/usr/bin/env bash
# Cursor-local flywheel setup (no Claude Code launch). Run from repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$ROOT/plugins/cursor-orchestrator"
CURSOR_PLUGINS="${CURSOR_PLUGINS:-$HOME/.cursor/plugins/local}"
DEST="$CURSOR_PLUGINS/cursor-orchestrator"

echo "== Agent Flywheel (Cursor) =="
echo "Repo: $ROOT"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "MISSING: $1 — install and re-run"
    return 1
  fi
  echo "OK: $1"
}

fail=0
need node || fail=1
need git || fail=1
need rsync || fail=1
command -v br >/dev/null 2>&1 && echo "OK: br (beads)" || echo "WARN: br not found (beads workflow)"
command -v am >/dev/null 2>&1 && echo "OK: am (agent-mail)" || echo "WARN: am not found (coordination optional)"

if [[ -f "$PLUGIN/mcp-server/package-lock.json" ]]; then
  echo ""
  echo "Build MCP server (dist/) in repo..."
  (cd "$PLUGIN/mcp-server" && npm ci && npm run build)
fi

echo ""
echo "Install plugin into Cursor local plugins (real copy — symlinks are not loaded by Cursor):"
mkdir -p "$CURSOR_PLUGINS"
if [[ -L "$DEST" ]]; then
  rm "$DEST"
fi
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude cursor-orchestrator \
  "$PLUGIN/" "$DEST/"
echo "  $DEST"

echo ""
echo "Install MCP runtime deps in local plugin (dist imports @modelcontextprotocol/sdk):"
if [[ -f "$DEST/mcp-server/package-lock.json" ]]; then
  (cd "$DEST/mcp-server" && npm ci --omit=dev)
else
  echo "WARN: $DEST/mcp-server/package-lock.json missing — MCP will not start"
fi

echo ""
echo "Patch MCP config (absolute launcher path — Cursor does not use plugin cwd):"
node "$ROOT/scripts/write-plugin-mcp-config.mjs" "$PLUGIN"
node "$ROOT/scripts/write-plugin-mcp-config.mjs" "$DEST"

echo ""
echo "Copy plugin commands/rules → .cursor/ (real files — Cursor often skips symlinks in / menu):"
node "$ROOT/scripts/link-cursor-commands.mjs"

GLOBAL_CMD="${HOME}/.cursor/commands"
mkdir -p "$GLOBAL_CMD"
for short in recover-gates flywheel-recover-gates flywheel-beads-review; do
  if [[ -f "$ROOT/.cursor/commands/${short}.md" ]]; then
    cp -f "$ROOT/.cursor/commands/${short}.md" "$GLOBAL_CMD/${short}.md"
    echo "  global: $GLOBAL_CMD/${short}.md"
  fi
done

echo ""
echo "Where to look in Cursor (not the public Marketplace until published):"
echo "  1. Cmd/Ctrl+Shift+P → Developer: Reload Window"
echo "  2. Settings (Cmd/Ctrl+Shift+J) → Rules — orchestrator rules"
echo "  3. Settings → Features → MCP — orchestrator + agent-mail"
echo "  4. Agent chat: type / → flywheel-beads-review, recover-gates, flywheel, start"
echo "     (project + ~/.cursor/commands; Reload Window after install)"
echo ""
echo "Re-run this script after plugin changes to refresh the local copy."
echo "Parity checklist: docs/plans/agent-flywheel-cursor-parity.md"
exit "$fail"
