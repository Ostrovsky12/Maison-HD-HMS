---
name: Generated contract validation
description: Runtime contract generation can succeed while TypeScript still reads stale declarations from a failed upstream build.
---

Do not treat passing contract generation, Vitest, or an esbuild bundle as evidence that the monorepo's TypeScript checks pass.

**Why:** Existing duplicate exports in the shared API validation library blocked its declaration build. Newly generated schemas worked at runtime, while downstream TypeScript still reported their exports as missing. The broader library check also had unrelated dependency/type failures.

**How to apply:** When a generated export exists in source and works in runtime tests but TypeScript cannot resolve it, check the upstream declaration build before changing valid imports or adding dependencies. Keep scoped runtime/build verification separate from the project-wide type-check result, and disclose an upstream blocker rather than claiming a clean type check.

For duplicate runtime-schema/interface exports, explicitly re-export the runtime
schema at the library barrel, following its existing convention, then rebuild
declarations. Do not rename generated files or cast callers to bypass a stale
contract.

**Why:** Explicit schema precedence resolved the declaration ambiguity without
changing the API wire contract; remaining unrelated application errors must
still be reported separately.
