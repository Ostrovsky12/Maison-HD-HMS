---
name: Workspace verification resource budget
description: Avoid losing the running app and browser verification to concurrent large TypeScript and test processes.
---

With the observed 8 GB workspace memory limit, run repository-wide verification serially with bounded worker counts and Node heap limits.

**Why:** A broad TypeScript process and, separately, parallel Vitest workers exhausted the shared budget alongside the app and language services, restarting the workspace and interrupting browser verification.

**How to apply:** Prefer targeted checks. For broader Vitest runs use one worker with file parallelism disabled. Bound a verification process's heap rather than spawning several large compilers. Check current resources before changing these limits; do not stop unrelated app workflows just to make a check run.
