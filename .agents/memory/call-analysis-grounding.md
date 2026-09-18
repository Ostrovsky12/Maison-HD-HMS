---
name: Call analysis grounding
description: AI call summaries require conversational content, not duration, direction, or provider metadata alone.
---

# Ground call analysis in actual conversation content

Generate AI summaries and sentiment only from a transcript or meaningful operator notes. Provider metadata such as direction, duration, status, caller identity, and routing is not evidence of what was discussed.

**Why:** A metadata-only Binotel prompt produced a tautological “summary” that looked like conversation analysis despite containing no conversation content.

**How to apply:** Reject analysis when only generated provider notes are available, show an honest unavailable state, and never infer sentiment, intent, category, urgency, or action items from call metadata alone.