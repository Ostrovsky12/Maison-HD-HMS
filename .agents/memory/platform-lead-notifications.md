---
name: Platform landing lead notifications
description: Scope boundary for Maison HD's connected Gmail mailbox and public contact form
---

The connected Gmail mailbox is for Maison HD's own public landing enquiries, not any hotel tenant's guest communications.

**Why:** The user connected their mailbox specifically to receive landing enquiries. Sharing it with tenants would mix unrelated businesses' data.

**How to apply:** Keep platform lead notifications separate from tenant-scoped SMTP/Telegram settings. Obtain tenant-owned credentials for tenant communications. Save a lead independently of notification delivery; do not retry uncertain send outcomes blindly.

Successful Telegram bot/profile/chat lookups do not prove the bot can deliver to the configured destination. The destination must be a human chat or an eligible group/channel, not another bot.

**Why:** Telegram returned successful chat and membership lookups for a bot destination but rejected message delivery.

**How to apply:** Verify delivery with a clearly labelled, authorized test message; report success only after the send API confirms it.
