---
name: Inbound channel authentication
description: Safety requirement for provider-originated inbox events that can trigger AI or outbound actions.
---

# Authenticate inbound events before automation

Every inbound messaging webhook must be authenticated before it can create inbox data, call an AI model, or deliver an outbound response. Telegram uses its provider secret-token header; Meta/Instagram uses a raw-body HMAC with the Meta app secret.

**Why:** An unauthenticated inbound event can be forged to make a tenant bot message an attacker-controlled recipient, consume AI/provider resources, or fill manager queues with fabricated conversations.

**How to apply:** Register and persist provider secrets as part of channel setup. Preserve the raw request body where the provider signature requires it, compare signatures in constant time, and fail closed—skip all message, AI, and delivery work when a signature, channel, or secret is missing or invalid.