---
name: GitHub updates
description: The user's requirement to record project updates in GitHub and the distinction between native Git access and connector access.
---

Користувач попросив: «Обовʼязково всі наші оновлення зафіксуй в GitHub мій».

**Why:** Користувач явно вимагає зберігати оновлення цього проєкту у своєму GitHub.

**How to apply:** Після змін у межах запиту перевіряти склад коміту, фіксувати код і надсилати в узгоджений GitHub-репозиторій. Не включати секрети, приватні вкладення чи дані гостей. Не перезаписувати історію примусово. Підтверджувати відправлення збігом локального коміту та віддаленого посилання. GitHub не замінює окремої публікації застосунку.

An unavailable GitHub connector credential does not prove native Git cannot authenticate. This workspace's native Git succeeded through Replit's secure GitHub proxy even when the connector returned no usable connection.

**Why:** Treating connector access as the only GitHub path would have incorrectly blocked the authorized backup.

**How to apply:** Use normal Git against the user-confirmed repository without extracting credentials. Keep the workspace branch intact; when workspace and remote branch names differ, use an explicit destination rather than renaming or force-pushing.
