---
name: Unified PRRO scope
description: Defines the product-wide boundary for Maison HD fiscalization.
---

Maison HD must use one shared PRRO core for both hotel and F&B operations. The fiscal service accepts normalized transactions from each business module while retaining their source, legal entity, location, tax rules, payment allocation, and document relationships.

**Why:** Restricting PRRO to F&B would leave accommodation, deposits, folio settlement, additional hotel services, refunds, and mixed guest bills outside the fiscal workflow and would create incompatible duplicate cash systems.

**How to apply:** Keep fiscal registers, shifts, documents, signing, DPS transport, idempotency, reconciliation, and audit in a product-level domain. Hotel and F&B modules should provide source-specific adapters rather than owning separate PRRO implementations.