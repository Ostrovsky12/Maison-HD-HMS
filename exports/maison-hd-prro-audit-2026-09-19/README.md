# Maison HD — пакет ПРРО для аудиту

Дата формування: 19 вересня 2026 року.

Пакет містить вихідний код повного фіскального контуру Maison HD: каси, зміни, чеки, фіскальні документи та події, політики, XML/XSD, підписання, ДПС, Checkbox, інтеграцію з платежами й операційними модулями, схеми БД і тести.

## Основні точки входу

- `artifacts/api-server/src/services/prro-orchestrator.ts` — центральна оркестрація.
- `artifacts/api-server/src/routes/prro.ts` — спільний API ПРРО.
- `artifacts/api-server/src/routes/fb-prro.ts` — F&B API кас, змін і чеків.
- `artifacts/api-server/src/services/dps-prro.ts` — клієнт ДПС.
- `artifacts/api-server/src/services/prro-signer.ts` — межа підписання.
- `artifacts/api-server/src/services/prro-xml.ts` — формування XML.
- `artifacts/api-server/src/services/prro-xsd.ts` — XSD-перевірка.
- `artifacts/api-server/src/services/checkbox.ts` — адаптер Checkbox.
- `artifacts/maison-hd/src/pages/fb-prro.tsx` — головний екран ПРРО.
- `artifacts/maison-hd/src/pages/fb-registers.tsx` — каси.
- `artifacts/maison-hd/src/pages/fb-shifts.tsx` — зміни.

## Потік даних

```text
POS / бронювання / рахунок / ресторан / SPA / платіжний callback
  ↓
payment-layer та source route
  ↓
prro-orchestrator
  ├─ tenant + seller/legal entity
  ├─ policy: fiscalize / exempt / manual review
  ├─ нормалізація та поділ позицій за продавцем
  ├─ блокування каси й відкритої зміни
  ├─ idempotency/content hash
  ├─ immutable fiscal document + fiscal events
  └─ присвоєння локального номера
        ↓
XML → XSD validation → signer
        ↓
ДПС або Checkbox
        ↓
status / DPS id / fiscal number / QR / error / retry metadata
        ↓
ПРРО, каси, зміни, бухгалтерія, звіти, ручна перевірка
```

## Що перевіряти аудитору

1. Tenant isolation у кожному route/query/event.
2. Атомарний розподіл платежів і чеків між продавцями.
3. Ідемпотентність callback, повторних submit і retry.
4. Єдине блокування каси/зміни для всіх джерел чеків.
5. Неможливість повторної відправки після невизначеної відповіді ДПС без перевірки стану.
6. Незмінність fiscal events та payload snapshots.
7. Відсутність приватного КЕП у REST API, логах і БД у відкритому вигляді.
8. Валідацію XML проти актуальної XSD і правильне кодування/хеш-ланцюг.
9. Узгодженість runtime DDL у `src/index.ts` із SQL-міграціями.
10. Розмежування активного Maison HD і legacy-коду HMS.

## Legacy

`artifacts/hms/` включено лише для порівняльного аудиту. Чинною платформою є Maison HD; дублікати HMS не слід вважати другою активною реалізацією.

## Межі пакета

Не включено `.env`, секрети, КЕП, токени, дані БД, `node_modules` і build-артефакти. Для повного інтеграційного аудиту окремо потрібні sandbox/тестові доступи ДПС та провайдерів.

## Контрольні файли

- `FILE_MANIFEST.txt` — перелік файлів і розміри.
- `SHA256SUMS.txt` — SHA-256 для перевірки цілісності.
- `MISSING_FILES.txt` — очікувані, але відсутні файли, якщо такі є.
