---
name: Canonical public document links
description: Security rule for signed public links to invoices, acts, and other bearer documents.
---

Signed public document URLs must use a configured canonical application origin, never `Host` or forwarded-host request headers.

**Why:** A reflected host can send a valid bearer token to an attacker-controlled domain when the link is delivered through Telegram or another external channel.

**How to apply:** Build externally delivered links from `PUBLIC_APP_URL` or the platform-provided canonical domain, require HTTPS, and keep document ID, tenant ID, and expiry inside the signed token.