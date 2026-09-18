---
name: Tenant-owned integration credentials
description: External-service credentials are configured independently by each Maison HD tenant.
---

# Keep integration credentials tenant-owned

Each tenant enters and manages its own Company ID, API Key, and API Secret in that tenant's settings. Do not use one shared project secret for tenant-owned integrations such as Binotel.

**Why:** The user confirmed that every tenant must connect its own provider account. Shared credentials would break tenant isolation and prevent independent rotation or disconnection.

**How to apply:** Store credentials against the authenticated organization, encrypt secret fields at rest, never return plaintext secrets, preserve existing secrets when masked or blank form values are submitted, and run connection tests only with that organization's credentials.