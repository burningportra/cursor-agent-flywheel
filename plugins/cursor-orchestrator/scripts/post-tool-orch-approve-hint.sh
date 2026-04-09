#!/bin/sh
# postToolUse hook: stdout/stderr may appear in Cursor logs; keep output minimal.
# Matcher in hooks.json keys off tool identifiers that include orch_approve (MCP-prefixed names included).
echo "Bead approval processed. Run the Orchestrate Status command to check progress."
