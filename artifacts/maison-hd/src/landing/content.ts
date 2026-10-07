export type Lang = "ua" | "en";
export type Product = { id: string; name: string; tag: string; desc: string; points: string[]; url: string; host: string };
export type Platform = { id: string; name: string; tag: string; desc: string; points: string[] };

const urls = {
  marketing: "https://marketing.maison-hd.com/",
  eudr: "https://eudr.maison-hd.com/",
  paynow: "https://paynow.maison-hd.com/",
  finance: "https://finance.maison-hd.com/",
  metrik: "https://metrik.maison-hd.com/",
};
const host = (u: string) => u.replace("https://", "").replace(/\/$/, "");
const P = (id: keyof typeof urls, name: string, tag: string, desc: string, points: string[]): Product => ({
  id, name, tag, desc, points, url: urls[id], host: host(urls[id]),
});

export const content = {
  ua: {
    nav: { solutions: "Платформи", products: "Продукти", approach: "Підхід", contact: "Контакт", login: "Увійти", cta: "Розповісти про біль", menu: "Меню", langLabel: "Мова" },
    hero: {
      kicker: "Технологічний партнер",
      title: "MAISON HD",
      sub: "сучасні рішення для бізнесу",
      body: "Технологічний партнер, що створює сучасні AI-продукти для власників бізнесу: практичне програмне забезпечення замість ручних операцій. Проєктуємо й будуємо продукти для конкретних операційних задач: від готелів і ресторанів до експортної документації, платежів і маркетингу. Не універсальний комбайн, а набір точних інструментів.",
      cta1: "Дайте нам ваш біль",
      cta2: "Дивитися продукти",
      index: ["2 платформи", "5 продуктів", "AI для операцій"],
    },
    about: {
      title: "Ми беремося за задачі, які зараз вирішуються таблицями, месенджерами та ручною працею.",
      body: "Maison HD починався з керування готелями й закладами харчування. Сьогодні це родина продуктів для різних галузей, об'єднана одним підходом: спершу розібратися, де саме болить, і лише потім будувати.",
      items: [
        { t: "Діагностика", d: "Слухаємо задачу, дивимося на ваші документи й процеси." },
        { t: "Рішення під задачу", d: "Пропонуємо готовий продукт із нашої родини або будуємо відповідний інструмент." },
        { t: "Ваш бізнес — у фокусі", d: "Починаємо з ваших потреб, а не з переліку функцій. Допомагаємо визначити наступний крок." },
      ],
    },
    platforms: {
      title: "Дві платформи для гостинності",
      sub: "Основа Maison HD: готельне та ресторанне керування. Доступ до робочих кабінетів надається клієнтам; нижче коротко, що всередині.",
      cta: "Обговорити впровадження",
      items: [
        { id: "hms", name: "HMS", tag: "Hotel Management System", desc: "Система керування готелем, глемпінгом чи апартаментами: від запиту гостя до виїзду та обслуговування номерів.", points: ["Бронювання та календар номерного фонду", "Номери, їхні статуси та сервісні задачі", "Картки гостей і історія проживань", "Сервіс: прибирання, запити, обслуговування"] },
        { id: "pos", name: "POS", tag: "Point of Sale", desc: "Каса та операційна система для ресторану, кафе чи бару: від відкриття столу до розрахунку.", points: ["Замовлення та облік столів", "Передача замовлень на кухню", "Розрахунок і закриття рахунку", "Може працювати разом із HMS або окремо"] },
      ] as Platform[],
    },
    products: {
      title: "П'ять продуктів. П'ять різних болів.",
      sub: "Кожен продукт живе на власному сайті. Натисніть, щоб побачити його наживо.",
      open: "Відкрити",
      items: [
        P("marketing", "Marketing", "Маркетинговий відділ", "Маркетинговий відділ з повним штатом спеціалістів в одному місці.", ["Увесь маркетинг бізнесу в одному місці", "Повний штат спеціалістів замість розрізнених підрядників"]),
        P("eudr", "EUDR Ready", "Експорт і відстежуваність", "Підготовка до вимог EUDR для експортерів сої та деревини: перевірка готовності та впорядкування даних.", ["Постачальники, походження, геолокація, документи", "Аудит готовності: досьє, прогалини, ризики", "Інструмент підготовки, а не сертифікація й не подання DDS"]),
        P("paynow", "PayNow", "Рахунки та надходження", "Виставлення рахунків за IBAN і контроль вхідних платежів для кількох юридичних осіб.", ["Юридичні особи в одному місці", "Рахунки на оплату за IBAN", "Відстеження вхідних платежів"]),
        P("finance", "Finance", "Облікова платформа", "Платформа для документів, банків і подвійного запису з ПРРО та архівом. Наразі пілотний етап.", ["Документи, банки, подвійний запис", "ПРРО, архів, режим аудитора", "Платформа в пілоті: без заяв про сертифікацію"]),
        P("metrik", "Métrik", "Аналітика для ресторанів", "Аналіз CSV продажів і витрат для ресторанів і кафе: собівартість інгредієнтів, постачальники, слабка маржа.", ["Собівартість і постачальники", "Низька маржа та витрати, що повторюються", "Пріоритетні дії за результатами аналізу"]),
      ] as Product[],
    },
    pain: {
      kicker: "Ваш запит",
      title: "Дайте нам ВАШ БІЛЬ — і ми знайдемо рішення.",
      body: "Опишіть, що забирає час, гроші чи нерви. Ми відповімо, чи підходить один із наших продуктів, чи варто будувати щось своє.",
      cta: "Описати задачу",
    },
    form: {
      title: "Розкажіть про задачу",
      sub: "Поля з зірочкою обов'язкові. Контакти ми використаємо лише щоб відповісти вам.",
      name: "Ім'я", email: "Email", phone: "Телефон (за бажанням)", company: "Компанія", message: "Ваш біль або задача",
      submit: "Надіслати", sending: "Надсилаємо...",
      okTitle: "Запит отримано", okBody: "Дякуємо. Ми вивчимо опис і зв'яжемося з вами.", again: "Надіслати ще один",
      err: "Не вдалося надіслати. Перевірте з'єднання й спробуйте ще раз.",
      req: "Заповніть ім'я, email, компанію та опис задачі.",
      badEmail: "Перевірте адресу email.",
    },
    footer: { desc: "Maison HD: сучасні рішення для бізнесу.", products: "Продукти", access: "Доступ", login: "Вхід для клієнтів", copy: "Maison HD" },
  },
  en: {
    nav: { solutions: "Platforms", products: "Products", approach: "Approach", contact: "Contact", login: "Sign in", cta: "Tell us your pain", menu: "Menu", langLabel: "Language" },
    hero: {
      kicker: "Technology partner",
      title: "MAISON HD",
      sub: "modern solutions for business",
      body: "A technology partner building modern AI products for business owners: practical software in place of manual operations. We design and build software for specific operational problems: from hotels and restaurants to export documentation, payments and marketing. Not one catch-all suite, but a set of precise tools.",
      cta1: "Give us your pain",
      cta2: "See the products",
      index: ["2 platforms", "5 products", "AI for operations"],
    },
    about: {
      title: "We take on the work that is still done in spreadsheets, chat threads and by hand.",
      body: "Maison HD began with hotel and restaurant management. Today it is a family of products for different industries, held together by one habit: find out exactly where it hurts first, build second.",
      items: [
        { t: "Diagnosis", d: "We listen to the task and look at your documents and processes." },
        { t: "Fit to the problem", d: "We suggest a product from our family or build the right tool." },
        { t: "Your business comes first", d: "We start with your needs, not a feature list. We help identify the next step." },
      ],
    },
    platforms: {
      title: "Two platforms for hospitality",
      sub: "The core of Maison HD: hotel and restaurant operations. Workspaces are provided to clients; here is what is inside.",
      cta: "Discuss rollout",
      items: [
        { id: "hms", name: "HMS", tag: "Hotel Management System", desc: "A management system for a hotel, glamping site or apartments: from the guest request to check-out and room service.", points: ["Bookings and room inventory calendar", "Rooms, their statuses and service tasks", "Guest records and stay history", "Service: housekeeping, requests, upkeep"] },
        { id: "pos", name: "POS", tag: "Point of Sale", desc: "A till and operations system for a restaurant, cafe or bar: from opening a table to settling the bill.", points: ["Orders and table tracking", "Sending orders to the kitchen", "Payment and closing the check", "Works alongside HMS or on its own"] },
      ] as Platform[],
    },
    products: {
      title: "Five products. Five different pains.",
      sub: "Each product lives on its own site. Open one to see it live.",
      open: "Open",
      items: [
        P("marketing", "Marketing", "Marketing department", "A marketing department with a full staff of specialists in one place.", ["All of a business's marketing in one place", "A full staff of specialists instead of scattered contractors"]),
        P("eudr", "EUDR Ready", "Export and traceability", "EUDR preparation for soy and timber exporters: readiness checks and organised data.", ["Suppliers, origin, geolocation, documents", "Readiness audit: dossiers, gaps, risks", "A preparation tool, not certification or DDS filing"]),
        P("paynow", "PayNow", "Invoices and receipts", "IBAN invoicing and incoming-payment tracking across several legal entities.", ["Legal entities in one place", "IBAN invoices", "Incoming payment tracking"]),
        P("finance", "Finance", "Accounting platform", "A platform for documents, banks and double entry, with PRRO and an archive. Currently at pilot stage.", ["Documents, banks, double entry", "PRRO, archive, auditor view", "Pilot platform: no certification claims"]),
        P("metrik", "Métrik", "Restaurant analytics", "Analysis of sales and expense CSVs for restaurants and cafes: ingredient cost, suppliers, thin margins.", ["Ingredient cost and suppliers", "Low margins and recurring expenses", "Priority actions from the analysis"]),
      ] as Product[],
    },
    pain: {
      kicker: "Your brief",
      title: "Give us YOUR PAIN, and we will find the solution.",
      body: "Describe what eats your time, money or nerves. We will tell you whether one of our products fits, or whether something custom is worth building.",
      cta: "Describe the problem",
    },
    form: {
      title: "Tell us about the problem",
      sub: "Fields marked with an asterisk are required. We use your details only to reply.",
      name: "Name", email: "Email", phone: "Phone (optional)", company: "Company", message: "Your pain or task",
      submit: "Send", sending: "Sending...",
      okTitle: "Request received", okBody: "Thank you. We will review your description and get back to you.", again: "Send another",
      err: "Could not send. Check your connection and try again.",
      req: "Please fill in name, email, company and a description.",
      badEmail: "Check the email address.",
    },
    footer: { desc: "Maison HD: modern solutions for business.", products: "Products", access: "Access", login: "Client sign-in", copy: "Maison HD" },
  },
};
