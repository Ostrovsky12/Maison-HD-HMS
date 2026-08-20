---
name: Accommodation availability invariants
description: The booking lock and conflict rules that every accommodation writer must share.
---

Every operation that creates, moves, or retimes an active accommodation booking must lock the target `units` row in its transaction, then check both active booking overlap and active accommodation-block overlap before writing.

**Why:** Different lock domains let concurrent online and staff actions both pass availability checks before either commits, producing an overbooking. Consistent row locking serializes the decision for each unit.

**How to apply:** Use half-open date overlap (`existing start < requested end` and `existing end > requested start`) for active booking states. Apply the same rule to accommodation blocks. Do not add a booking import, OTA writer, or edit flow that bypasses the unit-row transaction lock.