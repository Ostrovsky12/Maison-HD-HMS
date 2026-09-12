---
name: Unified PRRO scope
description: Defines the product-wide boundary for Maison HD fiscalization.
---

Maison HD must use one shared PRRO core for both hotel and F&B operations. The fiscal service accepts normalized transactions from each business module while retaining their source, legal entity, location, tax rules, payment allocation, and document relationships.

The current operating model contains several independent sellers: the restaurant kitchen is operated by one sole proprietor, the bar by an LLC, hotel operations by several other LLCs and sole proprietors, and SPA by another sole proprietor. Shared software must never imply a shared fiscal register, shift, signer, receipt, or settlement ledger across these sellers.

Fiscalization is a policy decision per transaction, not a universal consequence of receiving payment. The engine must support documented non-fiscal outcomes with a reason and evidence, including service-payment exemptions where legally applicable.

**Why:** Restricting PRRO to F&B would leave accommodation, deposits, folio settlement, additional hotel services, refunds, and mixed guest bills outside the fiscal workflow and would create incompatible duplicate cash systems. Multiple independent sellers and payment-specific exemptions make a single undifferentiated cash flow legally and operationally unsafe.

**How to apply:** Keep fiscal registers, shifts, documents, signing, DPS transport, idempotency, reconciliation, and audit in a product-level domain. Hotel, kitchen, bar, and SPA modules should provide source-specific adapters. Resolve the seller and fiscalization policy before allocating payment or creating a fiscal document; split mixed bills by seller and record why any transaction was not fiscalized.