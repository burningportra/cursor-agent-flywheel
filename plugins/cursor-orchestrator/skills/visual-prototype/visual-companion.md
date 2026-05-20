# Visual companion guide (flywheel planning)

Browser companion for mockups and diagrams during **planning only**. Upstream: obra/superpowers — see `ATTRIBUTION.md`.

## When to use

Per question: **would the user understand this better by seeing it than reading it?**

- **Browser:** mockups, layouts, side-by-side designs, architecture diagrams
- **Terminal:** scope, tradeoffs, plan mode, rubric — use **AskQuestion**

## How it works

Agent writes HTML to `content/`. Server serves the newest file at `/`. Clicks append JSON lines to `state/events`. Agent reads events on the next turn.

Write **fragments** (no `<html>` wrapper) unless you need full document control — see CSS classes below.

## Starting a session

```bash
# From workspace root — persist mockups under .pi-flywheel/visual/
plugins/cursor-orchestrator/skills/visual-prototype/scripts/start-server.sh \
  --project-dir /path/to/project
```

Returns JSON with `url`, `screen_dir`, `state_dir`. Save those paths. Tell the user to open the URL.

**Recovery:** `state/server-info` holds startup JSON if stdout was missed.

**Gitignore:** ensure `.pi-flywheel/` is ignored (mockups are local artifacts).

### Cursor Agent

Detached background processes are often reaped. Prefer:

```bash
plugins/cursor-orchestrator/skills/visual-prototype/scripts/start-server.sh \
  --project-dir "$(pwd)" \
  --foreground
```

Run in a **background shell** (or long `block_until_ms`), then read `state/server-info` on the next turn for `url` and `port`.

Remote/container: add `--host 0.0.0.0 --url-host localhost` if needed.

## The loop

1. Verify `state/server-info` exists (restart if `server-stopped`). Server idles out after 30 minutes.
2. **Write** a new file in `screen_dir` — unique semantic name each time.
3. Summarize in chat; remind user of URL; ask them to reply in terminal after looking.
4. Next turn: read `state/events` + terminal message.
5. Iterate with `layout-v2.html` etc., or push `waiting.html` when returning to text-only steps.
6. When planning ends: `scripts/stop-server.sh <session_dir>`.

## Minimal fragment example

```html
<h2>Which layout works better?</h2>
<p class="subtitle">Readability vs density</p>
<div class="options">
  <div class="option" data-choice="a" onclick="toggleSelect(this)">
    <div class="letter">A</div>
    <div class="content"><h3>Single column</h3></div>
  </div>
  <div class="option" data-choice="b" onclick="toggleSelect(this)">
    <div class="letter">B</div>
    <div class="content"><h3>Sidebar</h3></div>
  </div>
</div>
```

## CSS helpers

See `scripts/frame-template.html` for full theme. Common: `.options`, `.option`, `.cards`, `.mockup`, `.split`, `.pros-cons`, `.mock-nav`, `.subtitle`.

## Events format (`state/events`)

```jsonl
{"type":"click","choice":"a","text":"Option A","timestamp":1706000101}
```

## Cleanup

```bash
plugins/cursor-orchestrator/skills/visual-prototype/scripts/stop-server.sh "$SESSION_DIR"
```

Persistent sessions under `.pi-flywheel/visual/` are kept for plan references.
