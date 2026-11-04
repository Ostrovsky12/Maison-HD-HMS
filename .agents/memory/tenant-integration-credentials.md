---
name: Tenant-owned integration credentials
description: External-service credentials are configured independently by each Maison HD tenant.
---

# Keep integration credentials tenant-owned

Each tenant enters and manages its own Company ID, API Key, and API Secret in that tenant's settings. Do not use one shared project secret for tenant-owned integrations such as Binotel.

**Why:** The user confirmed that every tenant must connect its own provider account. Shared credentials would break tenant isolation and prevent independent rotation or disconnection.

**How to apply:** Store credentials against the authenticated organization, encrypt secret fields at rest, never return plaintext secrets, preserve existing secrets when masked or blank form values are submitted, and run connection tests only with that organization's credentials.

LiqPay Public key and Secret key belong in the hotel's booking cabinet alongside its other setup, with a safe connection check.

**Why:** The user explicitly requested entering both keys directly in the cabinet and checking the connection, rather than configuring a shared platform merchant.

**How to apply:** Keep credentials with the actual legal seller of the selected property. Distinguish accepted API authentication, test mode, bank acquiring activation, and payment-webhook delivery; one does not prove the others.

Do not rotate a merchant's effective credentials while signed checkout attempts remain financially unreconciled.

**Why:** Expiry or cancellation of a local reservation does not prove that LiqPay cannot send a later successful payment. Replacing the secret can make that legitimate callback unverifiable.

**How to apply:** Serialize credential changes with checkout creation and require reconciliation first. Future rotation support needs credential-version retention or equivalent verified reconciliation, not merely removal of the safety guard.