function fmt(dateStr: string) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const DEFAULT_RULES = [
  "Заїзд з {checkinTime}, виїзд до {checkoutTime}. Пізній виїзд за домовленістю та за додаткову плату.",
  "Тихий час з 23:00 до 08:00. Прохання дотримуватися тиші та поважати відпочинок інших гостей.",
  "Паління дозволено лише у спеціально відведених місцях. Паління у приміщеннях заборонено та тягне за собою штраф.",
  "Тварини допускаються за попереднім погодженням з адміністрацією.",
  "Забороняється самовільно переставляти або виносити меблі та інвентар з номера/будинку.",
  "Гість несе матеріальну відповідальність за збитки, завдані майну комплексу.",
  "У разі виявлення несправностей або поломок просимо негайно повідомити адміністрацію.",
  "Адміністрація не несе відповідальності за речі, залишені без нагляду на території комплексу.",
];

export function openGuestCard(b: any, orgRules?: string | null) {
  const fullName =
    [b.lastName, b.firstName, b.middleName].filter(Boolean).join(" ") ||
    b.guestName ||
    "—";

  const totalGuests =
    b.guestsCount ??
    (b.adults || 1) + (b.childrenUnder6 || 0) + (b.childrenOver6 || 0);

  const checkinDate  = fmt(b.checkIn);
  const checkoutDate = fmt(b.checkOut);
  const checkinTime  = b.checkinTime  || "14:00";
  const checkoutTime = b.checkoutTime || "12:00";
  const unitName     = b.unitName || (b.unitId ? `Юніт #${b.unitId}` : "—");
  const propertyName = b.propertyName || b.unit?.propertyName || "";

  // Build rules list from org custom rules or defaults
  let ruleLines: string[] = [];
  if (orgRules && orgRules.trim()) {
    ruleLines = orgRules
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);
  } else {
    ruleLines = DEFAULT_RULES.map(r =>
      r.replace("{checkinTime}", checkinTime).replace("{checkoutTime}", checkoutTime)
    );
  }

  const rulesHtml = ruleLines
    .map((rule, i) => `<li data-n="${i + 1}">${rule}</li>`)
    .join("\n    ");

  const extraRows = Array.from({ length: 5 }, (_, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td></td>
      <td></td>
      <td></td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8" />
<title>Анкета гостя — ${fullName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    size: A4 portrait;
    margin: 18mm 15mm 18mm 15mm;
  }

  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    color: #111;
    background: #fff;
  }

  /* ── Header ── */
  .header {
    text-align: center;
    border-bottom: 2.5pt solid #111;
    padding-bottom: 8pt;
    margin-bottom: 12pt;
  }
  .header .org {
    font-size: 10pt;
    letter-spacing: .05em;
    color: #555;
    text-transform: uppercase;
    margin-bottom: 4pt;
  }
  .header h1 {
    font-size: 18pt;
    font-weight: bold;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .header .sub {
    font-size: 10pt;
    color: #444;
    margin-top: 3pt;
  }

  /* ── Sections ── */
  .section {
    margin-bottom: 14pt;
  }
  .section-title {
    font-size: 10pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #555;
    border-bottom: .75pt solid #bbb;
    padding-bottom: 3pt;
    margin-bottom: 8pt;
  }

  /* ── Info grid ── */
  .info-grid {
    display: grid;
    grid-template-columns: 140pt 1fr;
    row-gap: 7pt;
  }
  .info-label {
    font-size: 11pt;
    color: #555;
  }
  .info-value {
    font-size: 11pt;
    font-weight: bold;
    border-bottom: .5pt solid #999;
    padding-bottom: 1pt;
  }

  /* ── Additional guests table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5pt;
  }
  thead tr {
    background: #f0f0f0;
  }
  th, td {
    border: .75pt solid #aaa;
    padding: 5pt 6pt;
    vertical-align: middle;
    text-align: left;
  }
  th {
    font-size: 9.5pt;
    font-weight: bold;
    color: #444;
  }
  td.num {
    text-align: center;
    width: 18pt;
    color: #888;
  }
  tbody tr {
    height: 22pt;
  }

  /* ── Rules ── */
  .rules-list {
    list-style: none;
    padding: 0;
  }
  .rules-list li {
    font-size: 10.5pt;
    line-height: 1.55;
    padding-left: 18pt;
    position: relative;
    margin-bottom: 3pt;
  }
  .rules-list li::before {
    content: attr(data-n) ".";
    position: absolute;
    left: 0;
    color: #555;
  }

  /* ── Signature block ── */
  .signature-block {
    margin-top: 18pt;
    display: flex;
    gap: 0;
    justify-content: space-between;
    align-items: flex-end;
  }
  .sig-field {
    display: flex;
    flex-direction: column;
    gap: 4pt;
    width: 48%;
  }
  .sig-line {
    border-bottom: 1pt solid #111;
    height: 22pt;
  }
  .sig-caption {
    font-size: 9pt;
    color: #666;
    text-align: center;
  }

  /* ── Booking ref footer ── */
  .footer-ref {
    margin-top: 10pt;
    text-align: center;
    font-size: 8pt;
    color: #aaa;
    letter-spacing: .04em;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- ════ HEADER ════ -->
<div class="header">
  ${propertyName ? `<div class="org">${propertyName}</div>` : ""}
  <h1>Анкета гостя</h1>
  <div class="sub">Реєстраційна картка · Бронювання&nbsp;#${b.id}</div>
</div>

<!-- ════ ОСНОВНА ІНФОРМАЦІЯ ════ -->
<div class="section">
  <div class="section-title">Відповідальний гість</div>
  <div class="info-grid">
    <span class="info-label">ПІБ гостя:</span>
    <span class="info-value">${fullName}</span>

    <span class="info-label">Заїзд:</span>
    <span class="info-value">${checkinDate} о ${checkinTime}</span>

    <span class="info-label">Виїзд:</span>
    <span class="info-value">${checkoutDate} о ${checkoutTime}</span>

    <span class="info-label">Номер / Будинок:</span>
    <span class="info-value">${unitName}</span>

    <span class="info-label">Кількість гостей:</span>
    <span class="info-value">${totalGuests}&nbsp;ос.</span>
  </div>
</div>

<!-- ════ ДОДАТКОВІ ГОСТІ ════ -->
<div class="section">
  <div class="section-title">Дані додаткових гостей</div>
  <table>
    <thead>
      <tr>
        <th style="width:18pt">№</th>
        <th>ПІБ</th>
        <th style="width:130pt">Серія та № документа</th>
        <th style="width:90pt">Дата народження</th>
      </tr>
    </thead>
    <tbody>
      ${extraRows}
    </tbody>
  </table>
</div>

<!-- ════ ПРАВИЛА КОМПЛЕКСУ ════ -->
<div class="section">
  <div class="section-title">Правила комплексу</div>
  <ul class="rules-list">
    ${rulesHtml}
  </ul>
</div>

<!-- ════ ПІДПИС ════ -->
<div class="signature-block">
  <div class="sig-field">
    <div class="sig-line"></div>
    <div class="sig-caption">Дата: ${checkinDate}</div>
  </div>
  <div class="sig-field">
    <div class="sig-line"></div>
    <div class="sig-caption">Підпис гостя / Signature</div>
  </div>
</div>

<div class="footer-ref">
  Maison HD · Бронювання #${b.id} · Сформовано: ${new Date().toLocaleString("uk-UA")}
</div>

<script>
  window.onload = function () { window.print(); };
</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=1100");
  if (!win) {
    alert("Дозвольте спливаючі вікна для друку анкети");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
