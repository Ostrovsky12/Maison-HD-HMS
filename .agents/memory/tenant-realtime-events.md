---
name: Tenant-scoped realtime events
description: Realtime telephony and portal events must stay inside the authenticated connection's organization.
---

# Scope realtime events by authenticated tenant

Authenticate WebSocket registration with the signed user token, bind the connection to its organization on the server, and scope peer discovery, signaling, and provider broadcasts to that organization.

**Why:** Trusting a browser-supplied user or organization ID, or broadcasting provider events globally, can expose guest names, phone numbers, and operational activity across tenants.

**How to apply:** Derive user and organization IDs only from a verified token. Any new broadcast helper or realtime event must accept an organization ID and select only connections bound to that same organization.