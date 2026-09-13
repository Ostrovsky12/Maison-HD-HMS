---
name: Ambiguous DPS outcomes
description: Safe retry and reconciliation rule for uncertain fiscal submissions.
---

An uncertain DPS transport result must block later fiscal documents and must not be retried as a new submission. Reconcile it against a CAdES-verified DPS response and require the verified document content to match the stored submitted XML. Retry only after DPS state proves the document was not accepted.

**Why:** A timeout can occur after DPS accepted a receipt. Blind retry can create duplicate fiscal receipts, while allowing the next local number can break the fiscal MAC sequence.

**How to apply:** Keep an explicit unknown-outcome state in every transport and UI flow. Include it, and any reconciled-safe retry state, in sequencing and shift-close guards until the original document reaches a definitive result.