---
"manifest": minor
---

Disconnecting a provider that routing still uses now asks instead of failing: a dialog lists every harness and route that uses the connection, and "Remove and disconnect" removes those routes (promoting the next fallback where a primary goes) and disconnects in one step. Deleting one account while others remain only touches routes pinned to that account, and OpenAI, Gemini and xAI no longer revoke their tokens when a disconnect is refused or cancelled.
