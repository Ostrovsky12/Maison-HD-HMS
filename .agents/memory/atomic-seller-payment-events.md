---
name: Atomic seller payment events
description: Defines the durable allocation and retry boundary for payments spanning independent sellers.
---

Every completed payment must first become an immutable, tenant-scoped payment event. Allocate that event to exact positive line amounts and legal sellers atomically before submitting any PRRO document. Split-payment events must retain their own seller and item snapshot rather than being reconstructed from aggregate invoice totals.

**Why:** External fiscal submission can fail or return an uncertain result after the financial payment is already committed. Mutable cumulative totals or aggregate reconstruction can over-receipt, charge an unpaid seller, or create duplicate ledger and fiscal records during retries.

**How to apply:** Lock the source payment state, create or replay one deterministic event, conserve amounts in kopecks, validate every seller and fiscal resource in the organization, then create one idempotent document per seller. Retry only safe document states; reconcile uncertain DPS outcomes before resubmission.