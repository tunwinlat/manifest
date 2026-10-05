---
"manifest": minor
---

Add a Reconnect action to Anthropic subscription connections. Re-signing in replaces the credential on the existing connection in place, so routing pinned to it keeps working instead of having to remove routing, disconnect, connect again, and reconfigure.
