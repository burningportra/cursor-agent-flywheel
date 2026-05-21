# pi-prompt-suggester → cursor-agent-flywheel: Ergonomics Ideas

**Source:** https://github.com/guwidoe/pi-prompt-suggester @ c21bea2

## What pi gets right (UX principles)

1. **Suggest, never auto-send** — aligns with flywheel user-gate rules; any Cursor equivalent must require explicit accept.
2. **High-signal, low-token runtime** — heavy analysis at seed time; turn-time inference uses compact artifacts. Flywheel should not re-read full repo every impl tick.
3. **One primary settings surface** — `/suggesterSettings` TUI consolidates model/thinking/instruction/ghost keys. Flywheel equivalent: extend `flywheel.config.yaml` + doctor, not a second command tree.
4. **Fast-path recovery on errors** — pi uses literal `"continue"` (weak). Flywheel should offer structured recovery: "show failing test", "revert bead X", "spawn fresh-eyes" — tied to bead/plan context.
5. **Keyboard accept workflow** — Space/Right/F2 for widget. Cursor needs Tab/Cmd+→ or inline chip click; never Space-as-default (conflicts with typing).

## Ergonomic improvements for flywheel

### Coordinator hint compression

Instead of echoing full wave prompts in chat, show a compact one-line "ghost" hint:

> Next: implement bead `abc-123` — "Add epoch guard to impl tick"

Expand-on-demand links to full Task spec. Mirrors pi's ghost vs widget split without TUI ghost text.

### Progressive gate disclosure

Current flywheel gates use AskQuestion (good). Add optional pre-fill text in the question description derived from seed + last wave outcome — user edits before clicking, not a separate suggestion surface.

### Post-impl idle suggestions

Trigger suggestions at natural pauses (queue empty, user idle in composer) rather than every agent_end — reduces cost and annoyance.

### Steering from explicit actions, not inference

| pi approach | flywheel improvement |
|-------------|---------------------|
| Compare typed text vs ghost via Jaccard | Log gate option id directly |
| `changed_course` suppresses repeat | Map `skip` / defer bead → don't re-suggest same action |
| Steering history in session JSON | Store in checkpoint under `steeringEvents[]` |

### Model tier discipline

pi inherits session model (expensive). Flywheel should document in config:

```yaml
suggester:
  model: composer-2.5-fast  # Tier C — never session default
seeder:
  model: opus-4.6           # Tier A — profile refresh only
```

Matches `orchestrator-cursor-models.mdc`.

### Discoverability

Avoid pi's command explosion (`/suggester`, `/suggesterSettings`, model/thinking/config/instruction/variant/ab). Flywheel already has:

- `/start`, `/flywheel`, MCP gates
- Add at most: `flywheel_suggest_next` MCP tool + one config block

### Confidence and visibility

pi lacks confidence scores despite vision doc promise. Flywheel should:

- Only show suggestions when context is sufficient (open beads, known phase)
- Hide when user is mid-gate or AskQuestion pending
- Surface "profile stale" in doctor yellow, not silent degradation

### Multiline vs single-line policy

pi hides multiline ghost unless editor empty. Flywheel composer handles multiline natively — use widget/panel for multiline suggestions (Activity Bar or gate description), single-line for inline hints only.

## Anti-patterns to avoid (from pi UX failures)

1. **Dual display modes** — ghost + widget exist because ghost breaks with other extensions. Pick one Cursor-native surface.
2. **Space to accept** — breaks normal typing; documented in blunder hunt.
3. **Silent reseed failure** — user gets stale suggestions with no warning. Flywheel doctor should show profile/seed age.
4. **Generic "continue" after errors** — low value; offer recovery actions from rubric/bead AC.
5. **Config knob theater** — `transcriptMaxMessages` exposed but not enforced. Only expose settings that actually gate behavior.

## Quick wins for next session

1. Add `steeringEvents` to checkpoint when user picks wave review options.
2. Suppress duplicate coordinator nudges when same gate option rejected twice.
3. Document suggester model tier in `flywheel.config.yaml` template.
4. Add doctor yellow check: "profile cache age > 7 days".
