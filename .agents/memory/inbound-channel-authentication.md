---
name: Inbound channel authentication
description: Safety requirement for provider-originated webhooks that create tenant data or trigger automation.
---

# Authenticate inbound provider events

Every inbound provider webhook must be authenticated before it can create tenant data, call an AI model, or deliver an outbound response. Telegram uses its provider secret-token header; Meta/Instagram uses a raw-body HMAC with the Meta app secret. If a provider such as Binotel offers no request signature, require a tenant-specific high-entropy bearer token in its configured callback URL in addition to the provider IP allowlist.

**Why:** An unauthenticated inbound event can be forged to make a tenant bot message an attacker-controlled recipient, consume AI/provider resources, or fill manager queues with fabricated conversations.

**How to apply:** Register and persist provider secrets as part of channel setup. Preserve the raw request body where the provider signature requires it, compare signatures or bearer tokens in constant time, and fail closed—skip all data writes, AI, and delivery work when a signature, token, channel, or secret is missing or invalid. Never log bearer-token query parameters.