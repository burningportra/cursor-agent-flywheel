---
name: start_bootstrap
description: "Alias — load start_ceremony then start_discover on demand. Avoid loading this file directly."
---

> **Split for context budget.** Steps 0–4 no longer live in one blob.

1. `flywheel_observe({ cwd })` — session snapshot (see `/start` command)
2. `flywheel_get_skill({ name: "agent-flywheel:start_ceremony" })` — Step 0 only
3. After menu routes past ceremony → `flywheel_get_skill({ name: "agent-flywheel:start_discover" })` — Steps 2–4, 5.45

Do **not** fetch `start_bootstrap` as a single body unless you are on legacy tooling.
