---
name: Binotel delivery fallback
description: Binotel REST synchronization is the durable fallback when configured webhooks are delayed or never delivered.
---

# Keep webhook delivery and REST recovery independent

Use Binotel webhooks for immediate call notifications, but recover completed calls through tenant-scoped REST synchronization with external-call deduplication.

**Why:** Binotel confirmed webhook installation and accepted the tenant's API credentials, yet a real test call produced no callback request at the public Maison HD endpoint. REST remained available.

**How to apply:** Treat successful REST authentication as separate from webhook health. Import a bounded recent window, deduplicate by organization plus external call ID, and never let webhook failure hide completed calls from the journal.