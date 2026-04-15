import { useLocation } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield, Database, BookOpen, HardDrive, ChevronRight } from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────────────────
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const DOCS = [
  { slug: "offer",       icon: FileText,  label: "Публічна оферта",        sub: "SaaS Agreement" },
  { slug: "privacy",     icon: Shield,    label: "Політика конфіденційності", sub: "Privacy Policy" },
  { slug: "dpa",         icon: Database,  label: "Обробка персональних даних", sub: "DPA" },
  { slug: "terms",       icon: BookOpen,  label: "Правила користування",    sub: "Terms of Service" },
  { slug: "data-policy", icon: HardDrive, label: "Зберігання та доступ",    sub: "Data Policy" },
];

const EFFECTIVE_DATE = "14 квітня 2026 року";
const COMPANY = "Maison HD";
const COMPANY_FULL = "ФОП Головко Дмитро Олександрович, ІПН 3212211638 (надалі — «Оператор»)";
const EMAIL = "golovkocbc@gmail.com";
const SITE = "https://maisonhd.com";

// ── Offer ────────────────────────────────────────────────────────────────────
function OfferDoc() {
  return (
    <div className="prose prose-sm max-w-none space-y-6 text-gray-700 leading-relaxed">
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">1. Загальні положення</h2>
        <p>
          Цей документ є публічною офертою (пропозицією) {COMPANY_FULL} про укладання договору
          про надання доступу до програмного забезпечення як послуги (SaaS) «{COMPANY}»
          (надалі — «Договір») на умовах, викладених нижче.
        </p>
        <p className="mt-2">
          Акцептом цієї оферти вважається реєстрація акаунту в системі, натискання кнопки
          «Погоджуюсь з умовами» або фактичне використання сервісу. З моменту акцепту
          Договір вважається укладеним без підписання паперового примірника.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">2. Предмет договору</h2>
        <p>
          Оператор надає Клієнту доступ до хмарного програмного забезпечення
          «{COMPANY} Hospitality OS» — системи управління готелем/рестораном (PMS/POS),
          що включає модулі: резервування, шахматка, F&B, склад, аналітика, Rate Intelligence,
          AI-функціональність та інші, перелік яких визначається тарифним планом Клієнта.
        </p>
        <p className="mt-2">
          Доступ надається на умовах підписки (SaaS). Оператор не передає програмне
          забезпечення у власність Клієнта.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">3. Тарифи та оплата</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Вартість підписки визначається відповідно до обраного тарифного плану, розміщеного на сайті {SITE}.</li>
          <li>Оплата здійснюється щомісяця або щорічно наперед у гривнях (UAH).</li>
          <li>Оператор залишає за собою право змінювати тарифи з попередженням Клієнта не менше ніж за 30 (тридцять) календарних днів.</li>
          <li>У разі несплати Оператор має право призупинити доступ після 7 днів прострочення.</li>
          <li>Повернення коштів за невикористаний період можливе протягом 14 днів з моменту оплати, якщо послугою не користувались.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">4. Права та обов'язки Оператора</h2>
        <p className="font-medium mb-1">Оператор зобов'язується:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Забезпечувати доступність сервісу не менше 99% часу на місяць (SLA).</li>
          <li>Зберігати резервні копії даних Клієнта щоденно.</li>
          <li>Повідомляти про планові технічні роботи не менше ніж за 24 години.</li>
          <li>Не передавати дані Клієнта третім особам без його згоди, крім випадків, передбачених законодавством.</li>
          <li>Надавати технічну підтримку відповідно до умов тарифного плану.</li>
        </ul>
        <p className="font-medium mt-3 mb-1">Оператор має право:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Оновлювати та вдосконалювати сервіс без додаткового погодження.</li>
          <li>Призупинити доступ у разі порушення цих умов або несплати.</li>
          <li>Припинити надання послуг з попередженням за 30 днів.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">5. Права та обов'язки Клієнта</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Використовувати сервіс виключно в законних цілях.</li>
          <li>Не передавати доступ третім особам поза межами ліцензованої кількості користувачів.</li>
          <li>Не намагатися зламати, декомпілювати або скопіювати програмне забезпечення.</li>
          <li>Надавати актуальні та достовірні дані при реєстрації.</li>
          <li>Самостійно забезпечувати безпеку своїх облікових записів.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">6. Відповідальність</h2>
        <p>
          Загальна відповідальність Оператора за цим Договором обмежена сумою, сплаченою
          Клієнтом за останні 3 місяці. Оператор не несе відповідальності за непрямі збитки,
          втрату прибутку або даних, що виникли не з вини Оператора.
        </p>
        <p className="mt-2">
          Оператор не несе відповідальності за збої, спричинені форс-мажорними обставинами
          (воєнний стан, стихійні лиха, дії третіх осіб, збої постачальників хмарної
          інфраструктури тощо).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">7. Конфіденційність</h2>
        <p>
          Сторони зобов'язуються зберігати конфіденційність будь-якої інформації, отриманої
          в рамках виконання цього Договору. Детальні умови обробки персональних даних
          викладені в Політиці конфіденційності та Угоді про обробку даних.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">8. Розірвання договору</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Клієнт може розірвати Договір у будь-який час через особистий кабінет або письмово на {EMAIL}.</li>
          <li>Оператор може розірвати Договір у разі систематичного порушення умов Клієнтом.</li>
          <li>Після розірвання дані Клієнта зберігаються 30 днів, після чого видаляються.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">9. Вирішення спорів</h2>
        <p>
          Усі спори вирішуються шляхом переговорів. У разі неможливості досягти згоди —
          у судовому порядку за місцезнаходженням Оператора відповідно до законодавства України.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">10. Контакти</h2>
        <p>Питання щодо Договору: <a href={`mailto:${EMAIL}`} className="text-blue-600 underline">{EMAIL}</a></p>
      </section>
    </div>
  );
}

// ── Privacy Policy ────────────────────────────────────────────────────────────
function PrivacyDoc() {
  return (
    <div className="prose prose-sm max-w-none space-y-6 text-gray-700 leading-relaxed">
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">1. Хто ми і які дані обробляємо</h2>
        <p>
          {COMPANY} ({COMPANY_FULL}) є оператором хмарної платформи для управління
          закладами гостинності. Ця Політика конфіденційності пояснює, як ми збираємо,
          використовуємо та захищаємо персональні дані.
        </p>
        <p className="mt-2">Ми обробляємо два типи суб'єктів даних:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Клієнти (B2B)</strong> — власники та співробітники готелів/ресторанів, що використовують платформу.</li>
          <li><strong>Гості</strong> — фізичні особи, дані яких вносяться клієнтами при бронюванні та обслуговуванні.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">2. Які дані ми збираємо</h2>
        <p className="font-medium mb-1">Від клієнтів (B2B акаунти):</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ім'я, прізвище, email, номер телефону</li>
          <li>Назва та адреса підприємства, ІПН/ЄДРПОУ</li>
          <li>Платіжна інформація (обробляється через платіжний провайдер, не зберігається у нас)</li>
          <li>Журнали дій в системі (логи)</li>
          <li>IP-адреси та дані браузера</li>
        </ul>
        <p className="font-medium mt-3 mb-1">Від гостей (через клієнтів платформи):</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>ПІБ, дата народження, стать</li>
          <li>Номер документа (паспорт, ID-карта)</li>
          <li>Контактні дані (email, телефон)</li>
          <li>Дані про бронювання та проживання</li>
          <li>Харчові вподобання та особливі потреби (за умови надання)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">3. Мета та правова підстава обробки</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 p-2 text-left">Мета</th>
                <th className="border border-gray-200 p-2 text-left">Правова підстава</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Надання доступу до платформи", "Виконання договору"],
                ["Виставлення рахунків та облік", "Законний обов'язок"],
                ["Технічна підтримка", "Виконання договору"],
                ["Покращення сервісу, аналітика", "Законний інтерес"],
                ["Маркетингові комунікації", "Згода"],
                ["Дотримання вимог законодавства", "Законний обов'язок"],
                ["Реєстрація гостей (для клієнтів)", "Виконання договору / законний обов'язок"],
              ].map(([m, p], i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="border border-gray-200 p-2">{m}</td>
                  <td className="border border-gray-200 p-2 text-muted-foreground">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">4. Передача даних третім особам</h2>
        <p>Ми можемо передавати дані лише таким категоріям отримувачів:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Хмарна інфраструктура</strong> — провайдери серверів (ЄС/США із забезпеченням відповідного рівня захисту)</li>
          <li><strong>Платіжні провайдери</strong> — для обробки платежів за підписку</li>
          <li><strong>AI-провайдери</strong> — OpenAI для обробки запитів (дані знеособлюються або мінімізуються)</li>
          <li><strong>Державні органи</strong> — у випадках, передбачених законодавством України</li>
        </ul>
        <p className="mt-2">Ми ніколи не продаємо ваші дані третім особам.</p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">5. Строки зберігання</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Дані B2B акаунтів — протягом дії договору + 3 роки після розірвання</li>
          <li>Фінансові документи — 7 років (відповідно до вимог законодавства)</li>
          <li>Журнали дій — 12 місяців</li>
          <li>Дані гостей — визначаються клієнтом платформи, але не більше 5 років</li>
          <li>Резервні копії — 30 днів</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">6. Ваші права</h2>
        <p>Відповідно до Закону України «Про захист персональних даних» та GDPR (для громадян ЄС) ви маєте право:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Доступу</strong> — отримати копію своїх даних</li>
          <li><strong>Виправлення</strong> — виправити неточні дані</li>
          <li><strong>Видалення</strong> («право на забуття») — запросити видалення даних</li>
          <li><strong>Обмеження обробки</strong> — тимчасово обмежити обробку</li>
          <li><strong>Переносимості</strong> — отримати дані у машинозчитуваному форматі</li>
          <li><strong>Заперечення</strong> — заперечити проти обробки на основі законного інтересу</li>
          <li><strong>Відкликання згоди</strong> — у будь-який час для обробки на підставі згоди</li>
        </ul>
        <p className="mt-2">Для реалізації прав звертайтесь: <a href={`mailto:${EMAIL}`} className="text-blue-600 underline">{EMAIL}</a></p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">7. Cookies</h2>
        <p>
          Ми використовуємо необхідні технічні cookies для функціонування платформи
          (автентифікація, налаштування сесії). Аналітичні cookies використовуємо лише
          за вашою згодою. Відмовитись від cookies можна в налаштуваннях браузера.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">8. Зміни до Політики</h2>
        <p>
          Ми можемо оновлювати цю Політику. Про суттєві зміни повідомляємо електронною
          поштою або через сповіщення в системі не пізніше ніж за 30 днів до набрання
          чинності.
        </p>
      </section>
    </div>
  );
}

// ── DPA ──────────────────────────────────────────────────────────────────────
function DpaDoc() {
  return (
    <div className="prose prose-sm max-w-none space-y-6 text-gray-700 leading-relaxed">
      <section>
        <p className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
          Ця Угода про обробку персональних даних (DPA) є невід'ємною частиною Публічної оферти
          між Оператором ({COMPANY}) та Клієнтом і регулює умови обробки персональних даних
          третіх осіб (гостей, відвідувачів) в рамках використання платформи.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">1. Ролі сторін</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Клієнт</strong> є <strong>контролером</strong> (Розпорядником) персональних даних своїх гостей та персоналу.</li>
          <li><strong>{COMPANY} (Оператор)</strong> є <strong>обробником</strong> (Оператором даних) — обробляє дані виключно за інструкціями Клієнта.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">2. Категорії персональних даних</h2>
        <p>В рамках надання послуг Оператор обробляє такі категорії даних:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Ідентифікаційні дані гостей (ПІБ, дата народження, стать)</li>
          <li>Контактні дані (email, телефон)</li>
          <li>Документальні дані (серія/номер паспорту, ІПН — за потреби)</li>
          <li>Дані про бронювання та транзакції</li>
          <li>Харчові вподобання та особливі запити</li>
          <li>Дані персоналу Клієнта (в системі управління)</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">3. Мета та обсяг обробки</h2>
        <p>Оператор обробляє персональні дані виключно для:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Забезпечення функціонування програмного забезпечення для Клієнта</li>
          <li>Зберігання та відображення даних у системі управління</li>
          <li>Формування звітності та документів на вимогу Клієнта</li>
          <li>Технічної підтримки (доступ до даних — виключно за погодженням з Клієнтом)</li>
        </ul>
        <p className="mt-2">Оператор <strong>не має права</strong> використовувати дані гостей для власних маркетингових цілей.</p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">4. Зобов'язання Оператора (обробника)</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Обробляти дані лише відповідно до задокументованих інструкцій Клієнта</li>
          <li>Забезпечити, що персонал має доступ до даних лише за принципом необхідності (need-to-know)</li>
          <li>Вжити належних технічних і організаційних заходів безпеки</li>
          <li>Повідомляти Клієнта про будь-яке порушення захисту даних протягом 72 годин</li>
          <li>Надавати Клієнту необхідну допомогу у виконанні запитів суб'єктів даних</li>
          <li>Після завершення надання послуг видалити або повернути всі персональні дані</li>
          <li>Надавати необхідну інформацію для проведення аудитів</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">5. Субобробники</h2>
        <p>Оператор може залучати субобробників для надання окремих технічних послуг:</p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border-collapse border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 p-2 text-left">Субобробник</th>
                <th className="border border-gray-200 p-2 text-left">Мета</th>
                <th className="border border-gray-200 p-2 text-left">Локація</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Хмарний хостинг провайдер", "Зберігання даних, обчислення", "ЄС / США (SCCs)"],
                ["OpenAI", "AI-функції (голосовий ввід, аналіз)", "США (SCCs, DPA)"],
                ["Поштовий провайдер", "Транзакційні email-сповіщення", "ЄС"],
                ["Платіжний провайдер", "Обробка платежів за підписку", "Україна / ЄС"],
              ].map(([s, m, l], i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="border border-gray-200 p-2 font-medium">{s}</td>
                  <td className="border border-gray-200 p-2">{m}</td>
                  <td className="border border-gray-200 p-2 text-muted-foreground">{l}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Актуальний перелік субобробників доступний за запитом на {EMAIL}.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">6. Заходи безпеки</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Шифрування даних у транзиті (TLS 1.3) та у стані спокою (AES-256)</li>
          <li>Розмежування доступу між тенантами (multi-tenancy isolation)</li>
          <li>Двофакторна автентифікація для адміністративного доступу</li>
          <li>Щоденне резервне копіювання з перевіркою цілісності</li>
          <li>Моніторинг безпеки та журналювання доступу</li>
          <li>Регулярні оцінки вразливостей</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">7. Права клієнта</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Право на отримання повного експорту даних у будь-який момент</li>
          <li>Право на аудит або перевірку через незалежного аудитора (раз на рік)</li>
          <li>Право на видалення всіх даних після розірвання договору</li>
          <li>Право на отримання звіту про інциденти безпеки</li>
        </ul>
      </section>
    </div>
  );
}

// ── Terms of Service ──────────────────────────────────────────────────────────
function TermsDoc() {
  return (
    <div className="prose prose-sm max-w-none space-y-6 text-gray-700 leading-relaxed">
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">1. Прийняття правил</h2>
        <p>
          Ці Правила користування регулюють використання платформи {COMPANY}.
          Використовуючи платформу, ви підтверджуєте, що ознайомились з цими Правилами
          та погоджуєтесь їх дотримуватись. Якщо ви не погоджуєтесь — припиніть використання сервісу.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">2. Акаунти та безпека</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Кожен користувач повинен мати окремий обліковий запис. Забороняється ділитися обліковими даними.</li>
          <li>Ви несете відповідальність за всі дії, вчинені під вашим акаунтом.</li>
          <li>У разі підозри на компрометацію акаунту — негайно змініть пароль та повідомте нас.</li>
          <li>Паролі повинні бути не менше 8 символів, містити великі та малі літери, цифри.</li>
          <li>Оператор може заблокувати акаунт у разі підозрілої активності.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">3. Дозволене використання</h2>
        <p>Платформа призначена виключно для:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Управління готелями, котеджними комплексами, апартаментами, ресторанами</li>
          <li>Обробки бронювань, гостьових даних та оперативного управління</li>
          <li>Аналізу доходів, тарифів та роботи з партнерами</li>
          <li>Комунікації з гостями в рамках наданих інструментів</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">4. Заборонені дії</h2>
        <p>При використанні платформи забороняється:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Завантажувати, зберігати або обробляти незаконний контент</li>
          <li>Намагатися отримати несанкціонований доступ до даних інших клієнтів</li>
          <li>Використовувати автоматизовані засоби для надмірного навантаження на систему (DDoS, scraping)</li>
          <li>Зламувати, декомпілювати, реверс-інжинірити програмне забезпечення</li>
          <li>Перепродавати доступ до платформи без письмового дозволу Оператора</li>
          <li>Використовувати платформу для відмивання коштів або незаконної діяльності</li>
          <li>Поширювати спам або шкідливе програмне забезпечення через інструменти платформи</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">5. Інтелектуальна власність</h2>
        <p>
          Уся інтелектуальна власність на платформу {COMPANY} (код, дизайн, торгові марки,
          алгоритми) належить Оператору або його ліцензіарам. Клієнту надається
          <strong> невиключна, непередавана</strong> ліцензія на використання платформи
          в рамках підписки.
        </p>
        <p className="mt-2">
          Дані, що вносить Клієнт у систему, залишаються власністю Клієнта.
          Оператор не претендує на права власності щодо даних Клієнта.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">6. Обмеження відповідальності</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Сервіс надається «як є» (as-is). Оператор не гарантує безперервну роботу без помилок.</li>
          <li>Оператор не відповідає за рішення, прийняті на підставі даних платформи.</li>
          <li>Оператор не відповідає за дії третіх осіб, інтегрованих партнерів або постачальників.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">7. Зміни правил</h2>
        <p>
          Оператор може оновлювати ці Правила. Продовження використання платформи після
          набрання чинності нових правил означає їх прийняття. Про суттєві зміни
          повідомляємо за 30 днів.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">8. Застосовне право</h2>
        <p>
          Ці Правила регулюються законодавством України. Усі спори підлягають вирішенню
          у відповідних судових органах України.
        </p>
      </section>
    </div>
  );
}

// ── Data Policy ───────────────────────────────────────────────────────────────
function DataPolicyDoc() {
  return (
    <div className="prose prose-sm max-w-none space-y-6 text-gray-700 leading-relaxed">
      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">1. Де зберігаються дані</h2>
        <p>
          Усі дані платформи {COMPANY} зберігаються на захищених серверах у хмарній
          інфраструктурі з дотриманням вимог безпеки міжнародного рівня.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li><strong>Основна база даних</strong> — PostgreSQL на захищеному хмарному сервері (шифрування AES-256 у стані спокою)</li>
          <li><strong>Файлові вкладення</strong> (фото документів, фіскальні квитанції, зображення товарів) — Object Storage з приватним доступом</li>
          <li><strong>Резервні копії</strong> — шифровані snapshot'и бази даних, щоденно, зберігаються 30 днів</li>
          <li><strong>Журнали (логи)</strong> — зберігаються на окремому захищеному сховищі, 12 місяців</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">2. Строки зберігання даних</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 p-2 text-left">Тип даних</th>
                <th className="border border-gray-200 p-2 text-left">Строк зберігання</th>
                <th className="border border-gray-200 p-2 text-left">Підстава</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Дані акаунту клієнта", "Термін дії договору + 3 роки", "Договір, законний інтерес"],
                ["Бронювання та транзакції", "5 років після операції", "Законний обов'язок (ПКУ)"],
                ["Фіскальні квитанції (ПРРО)", "7 років", "Законодавство про фіскалізацію"],
                ["Персональні дані гостей", "До 3 років або за вимогою клієнта", "Угода з клієнтом"],
                ["Журнали дій (логи)", "12 місяців", "Безпека, аудит"],
                ["Резервні копії", "30 днів (rolling)", "Технічна необхідність"],
                ["Дані після видалення акаунту", "30 днів, потім знищення", "Договір"],
              ].map(([t, s, p], i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="border border-gray-200 p-2 font-medium">{t}</td>
                  <td className="border border-gray-200 p-2">{s}</td>
                  <td className="border border-gray-200 p-2 text-muted-foreground text-xs">{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">3. Доступ до даних</h2>
        <p className="font-medium mb-1">Хто має доступ до ваших даних:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Ви (клієнт)</strong> — повний доступ до своїх даних через інтерфейс та API</li>
          <li><strong>Ваші співробітники</strong> — відповідно до наданих ролей (owner / manager / reception)</li>
          <li><strong>Технічна команда {COMPANY}</strong> — виключно при вирішенні інцидентів, з вашого дозволу або при критичних збоях, зі збереженням журналу доступу</li>
          <li><strong>Автоматизовані системи</strong> — AI-функції, резервне копіювання, моніторинг (без перегляду людиною)</li>
        </ul>
        <p className="mt-3 font-medium mb-1">Ізоляція між тенантами:</p>
        <p>
          Дані кожного клієнта повністю ізольовані на рівні бази даних через поле
          <code className="bg-gray-100 px-1 rounded text-xs">organization_id</code>.
          Жоден клієнт не має доступу до даних іншого клієнта. Ізоляція перевіряється
          на рівні всіх API-запитів.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">4. Шифрування</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>У транзиті</strong> — всі з'єднання захищені TLS 1.3. HTTP-запити автоматично переспрямовуються на HTTPS.</li>
          <li><strong>У стані спокою</strong> — база даних і файлове сховище шифруються AES-256.</li>
          <li><strong>Паролі</strong> — зберігаються виключно у вигляді хешу (bcrypt, salt factor 12). Ніхто, включаючи команду {COMPANY}, не має доступу до вашого пароля у відкритому вигляді.</li>
          <li><strong>JWT-токени</strong> — автентифікаційні токени підписані секретним ключем та мають строк дії 24 години.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">5. Резервне копіювання</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Автоматичне резервне копіювання бази даних — <strong>щодня о 03:00 UTC</strong></li>
          <li>Строк зберігання резервних копій — <strong>30 днів</strong></li>
          <li>Резервні копії зберігаються географічно відокремлено від основного сервера</li>
          <li>Тестове відновлення з резервної копії — раз на квартал</li>
          <li>Відновлення даних з резервної копії за запитом Клієнта — у робочий час, протягом 24 годин</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">6. Видалення та експорт даних</h2>
        <p className="font-medium mb-1">Експорт:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Ви можете експортувати свої дані у форматах CSV, JSON у будь-який момент через налаштування</li>
          <li>Повний дамп бази даних надається за письмовим запитом протягом 5 робочих днів</li>
        </ul>
        <p className="font-medium mt-3 mb-1">Видалення:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Після розірвання договору дані зберігаються 30 днів (можливість відновлення)</li>
          <li>Після 30 днів — незворотне видалення з основної бази та сховища</li>
          <li>Видалення з резервних копій завершується протягом 30 днів після кінцевого видалення</li>
          <li>Фінансові дані, що підлягають обов'язковому зберіганню за законом, можуть зберігатися довше у знеособленому вигляді</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">7. Інциденти безпеки</h2>
        <p>
          У разі виявлення порушення захисту даних, що може вплинути на ваші дані, ми зобов'язуємось:
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Повідомити вас протягом <strong>72 годин</strong> після виявлення інциденту</li>
          <li>Надати детальний звіт про характер інциденту, потенційний вплив та вжиті заходи</li>
          <li>Надати рекомендації щодо зменшення ризиків для ваших гостей та клієнтів</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-gray-900 mb-2">8. Контакти з питань даних</h2>
        <p>З усіх питань, пов'язаних із зберіганням та доступом до даних:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Email: <a href={`mailto:${EMAIL}`} className="text-blue-600 underline">{EMAIL}</a></li>
          <li>Відповідь протягом 5 робочих днів</li>
          <li>Для термінових запитів (інциденти безпеки) — протягом 4 годин у робочий час</li>
        </ul>
      </section>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────
const DOC_COMPONENTS: Record<string, () => JSX.Element> = {
  offer: OfferDoc,
  privacy: PrivacyDoc,
  dpa: DpaDoc,
  terms: TermsDoc,
  "data-policy": DataPolicyDoc,
};

const DOC_TITLES: Record<string, string> = {
  offer: "Публічна оферта / SaaS Agreement",
  privacy: "Політика конфіденційності",
  dpa: "Угода про обробку персональних даних",
  terms: "Правила користування сервісом",
  "data-policy": "Політика зберігання та доступу до даних",
};

export default function LegalPage() {
  const [location, navigate] = useLocation();

  // Extract doc slug from URL path
  const pathParts = location.replace(BASE, "").split("/").filter(Boolean);
  const currentDoc = pathParts[1] || "offer";

  const DocComponent = DOC_COMPONENTS[currentDoc] || OfferDoc;
  const docTitle = DOC_TITLES[currentDoc] || "Документи";

  const navTo = (slug: string) => navigate(`${BASE}/legal/${slug}`);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top bar ── */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <span className="font-semibold text-gray-900">{COMPANY}</span>
          <ChevronRight size={14} className="text-gray-400" />
          <span className="text-sm text-muted-foreground">Правові документи</span>
        </div>
        <Badge variant="outline" className="text-xs">
          Актуально з {EFFECTIVE_DATE}
        </Badge>
      </header>

      <div className="flex flex-1 max-w-6xl mx-auto w-full px-4 py-8 gap-6">
        {/* ── Sidebar ── */}
        <aside className="w-64 shrink-0">
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden sticky top-24">
            <div className="px-4 py-3 border-b bg-gray-50/50">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Документи</p>
            </div>
            <nav className="p-2 space-y-0.5">
              {DOCS.map(doc => {
                const Icon = doc.icon;
                const isActive = currentDoc === doc.slug;
                return (
                  <button
                    key={doc.slug}
                    onClick={() => navTo(doc.slug)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2.5 ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <Icon size={15} className={`mt-0.5 shrink-0 ${isActive ? "text-indigo-600" : "text-gray-400"}`} />
                    <div>
                      <div className={`text-sm font-medium leading-tight ${isActive ? "text-indigo-700" : ""}`}>
                        {doc.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{doc.sub}</div>
                    </div>
                  </button>
                );
              })}
            </nav>
            <div className="px-4 py-3 border-t bg-gray-50/50">
              <p className="text-[10px] text-muted-foreground">
                Питання? <a href={`mailto:${EMAIL}`} className="text-blue-600 hover:underline">{EMAIL}</a>
              </p>
            </div>
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border shadow-sm p-8">
            <div className="mb-6 pb-5 border-b">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <FileText size={12} />
                <span>Редакція від {EFFECTIVE_DATE}</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{docTitle}</h1>
            </div>
            <ScrollArea className="pr-2">
              <DocComponent />
            </ScrollArea>
          </div>
        </main>
      </div>

      {/* ── Footer ── */}
      <footer className="text-center py-4 text-xs text-muted-foreground border-t bg-white">
        © {new Date().getFullYear()} {COMPANY}. Всі права захищені.
        {" · "}
        <a href={`mailto:${EMAIL}`} className="hover:underline">{EMAIL}</a>
      </footer>
    </div>
  );
}
