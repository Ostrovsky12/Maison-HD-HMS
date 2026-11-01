---
name: Sandbox network diagnostics
description: Avoid mistaking missing sandbox globals for upstream network failures.
---

Before diagnosing an external service as unavailable from an impure CodeExecution function, check for missing globals used by the request code. In this environment, `fetch` worked but `AbortSignal` was undefined.

**Why:** Three read-only Poster calls appeared to fail together because a broad catch hid the reference error from `AbortSignal.timeout`, not because Poster was unavailable. The same reads succeeded without that unsupported global.

**How to apply:** Check global availability or use supported runtime APIs. Preserve sanitized error types during diagnosis; do not return secret-bearing URLs or arbitrary provider error messages. Recheck this observation if the runtime changes.
