---
name: PRRO signing boundary
description: Security boundary for KEP ownership and fiscal document signing.
---

Private KEP material must remain in a dedicated signer or HSM service. The Maison HD API may persist only an opaque key identifier and public signature artifacts. Before a fiscal shift opens, the signer must positively authorize that key for the organization, legal entity, and register; every signing request must carry the same scope.

**Why:** Accepting a key identifier from a client without signer-side authorization could let one seller use another seller's KEP. Storing private key material in the application would unnecessarily expose legally sensitive credentials.

**How to apply:** New PRRO flows must use the scoped signer contract for both key authorization and CAdES operations. Never add endpoints or columns that accept raw private keys, passwords, or key containers.