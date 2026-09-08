---
name: Hotel TV content integrity
description: Rules for configurable Hotel TV content and safe behavior when operational data is missing.
---

Hotel TV content is configured per screen. Saved branding, hotel information, enabled slides, activities, and offers are the source of truth; operational SPA, F&B, booking, and event data remains organization-scoped and dynamic.

**Why:** Demonstration fallbacks can expose the wrong property name, location, Wi-Fi credentials, contacts, prices, or guest offers on a real room television.

**How to apply:** New TV surfaces must show an honest empty state when content is unavailable. Never add fabricated property data as a fallback, and keep slide visibility controlled by the saved screen configuration.