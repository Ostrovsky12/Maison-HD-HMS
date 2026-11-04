---
name: Canvas action runtime contract
description: Use the live validator when local canvas examples disagree with accepted action fields.
---

The live canvas callback requires `type` as the action discriminator, with new iframe properties nested under `shape`. Automatic placement requires **both** `names` and `shapeIds` arrays.

**Why:** Local skill examples used `op` and flat shape properties, but the live validator rejected that format; supplying only names also failed.

**How to apply:** Prefer the runtime validation contract over stale local examples. Inspect validation errors rather than repeatedly resending the flat format. This is a tool contract, not application source behavior.
