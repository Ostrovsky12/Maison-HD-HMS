/**
 * DOGODA DEMO GROUP — Comprehensive Demo Seed
 * Run: cd artifacts/api-server && DATABASE_URL="$DATABASE_URL" node_modules/.bin/tsx src/lib/demo-seed.ts
 * Idempotent: uses ON CONFLICT for unique constraints.
 */

import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = (s: string, p?: any[]) => pool.query(s, p);
const TODAY = "2026-04-02";
const hp = (pw: string) => bcrypt.hash(pw, 10);

// ──────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log("🌱  Starting DOGODA DEMO GROUP seed...");

  // ═══════════════════════════════════════════════════════════════════════════
  // 0. TENANT
  // ═══════════════════════════════════════════════════════════════════════════
  const { rows: [org] } = await sql(`
    INSERT INTO organizations
      (name, slug, plan, max_units, max_users, is_active, subscription_status,
       email, phone, address, website, timezone, currency, tax_rate)
    VALUES
      ('DOGODA DEMO GROUP','dogoda-demo','enterprise',9999,9999,true,'active',
       'info@dogoda-demo.ua','+380501234567',
       'Київ, вул. Хрещатик, 1','https://dogoda-demo.ua',
       'Europe/Kiev','UAH',20.00)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `);
  const orgId: number = org.id;
  console.log(`  ✓ Tenant: id=${orgId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. LEGAL ENTITY
  // ═══════════════════════════════════════════════════════════════════════════
  const { rows: [le] } = await sql(`
    INSERT INTO legal_entities
      (organization_id, name, type, edrpou, vat_number, iban, bank,
       address, director, is_default, is_active)
    VALUES ($1,'ТОВ «ДОГОДА ДЕМО»','tov','43219876','343219876',
       'UA123456780000026009213024600','Приватбанк',
       'м. Київ, вул. Хрещатик, 1','Бондаренко Олег Ігорович',true,true)
    ON CONFLICT DO NOTHING RETURNING id
  `, [orgId]);
  const leId: number | null = le?.id ?? null;

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════════════════════
  await sql(`
    INSERT INTO subscriptions
      (organization_id, tier, period, status,
       current_period_start, current_period_end, auto_renew)
    VALUES ($1,'enterprise','yearly','active','2026-01-01','2027-01-01',true)
    ON CONFLICT (organization_id) DO NOTHING
  `, [orgId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. USERS
  // ═══════════════════════════════════════════════════════════════════════════
  const hashes = await Promise.all([hp("demo123"),hp("demo123"),hp("demo123"),hp("demo123"),hp("demo123")]);
  const { rows: userRows } = await sql(`
    INSERT INTO users (email, name, role, organization_id, is_active, password_hash) VALUES
      ('owner@dogoda-demo.ua',     'Олег Бондаренко',   'owner',        $1,true,$2),
      ('manager@dogoda-demo.ua',   'Тетяна Романенко',  'manager',      $1,true,$3),
      ('reception@dogoda-demo.ua', 'Марія Ковальчук',   'reception',    $1,true,$4),
      ('hk@dogoda-demo.ua',        'Надія Петренко',    'housekeeping', $1,true,$5),
      ('spa@dogoda-demo.ua',       'Вікторія Мельник',  'reception',    $1,true,$6)
    ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id
    RETURNING id, email, role
  `, [orgId, ...hashes]);
  const [owner, manager, reception, hk] = userRows;
  console.log(`  ✓ Users: ${userRows.map((u:any)=>u.email).join(", ")}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════
  const propData = [
    { name:"DOGODA COTTAGES",   type:"house", addr:"с. Шевченківське, вул. Лісова, 1"  },
    { name:"DOGODA HOTEL",      type:"hotel", addr:"с. Шевченківське, вул. Паркова, 5" },
    { name:"DOGODA SPA",        type:"spa",   addr:"с. Шевченківське, вул. Паркова, 5А"},
    { name:"DOGODA RESTAURANT", type:"other", addr:"с. Шевченківське, вул. Паркова, 5Б"},
    { name:"DOGODA POOL",       type:"pool",  addr:"с. Шевченківське, вул. Паркова, 6" },
    { name:"DOGODA EVENTS",     type:"other", addr:"с. Шевченківське, вул. Паркова, 7" },
  ];

  const props: {id:number;name:string}[] = [];
  for (const p of propData) {
    const { rows:[row] } = await sql(`
      INSERT INTO properties (organization_id, name, type, address, is_active)
      VALUES ($1,$2,$3,$4,true) ON CONFLICT DO NOTHING RETURNING id,name
    `, [orgId, p.name, p.type, p.addr]);
    if (row) props.push(row);
  }
  if (props.length < 6) {
    const { rows } = await sql(`SELECT id,name FROM properties WHERE organization_id=$1 AND name LIKE 'DOGODA%' ORDER BY id`,[orgId]);
    props.splice(0,props.length,...rows);
  }
  const [pCottages, pHotel, pSpa, pRestaurant, pPool, pEvents] = props;
  console.log(`  ✓ Properties: ${props.map(p=>p.name).join(", ")}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. BUSINESS UNITS
  // ═══════════════════════════════════════════════════════════════════════════
  await sql(`
    INSERT INTO business_units (organization_id, property_id, name, type, code, is_active) VALUES
      ($1,$2,'Котеджі',    'accommodation','ACC-COT',true),
      ($1,$3,'Готель',     'accommodation','ACC-HTL',true),
      ($1,$4,'SPA-центр',  'spa',          'SPA',    true),
      ($1,$5,'Ресторан',   'fnb',          'FNB',    true),
      ($1,$6,'Басейн',     'other',        'POOL',   true),
      ($1,$7,'Івент-зали', 'events',       'EVT',    true)
    ON CONFLICT DO NOTHING
  `, [orgId, pCottages.id, pHotel.id, pSpa.id, pRestaurant.id, pPool.id, pEvents.id]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. UNIT TYPES
  // ═══════════════════════════════════════════════════════════════════════════
  async function insertUnitType(propertyId:number, name:string, code:string, cat:string, cap:number, sqm:number, price:number) {
    const { rows:[r] } = await sql(`
      INSERT INTO unit_types (property_id,name,short_code,category,default_capacity,square_meters,base_price,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT DO NOTHING RETURNING id
    `, [propertyId,name,code,cat,cap,sqm,price]);
    if (r) return r.id as number;
    const { rows:[e] } = await sql(`SELECT id FROM unit_types WHERE property_id=$1 AND name=$2`,[propertyId,name]);
    return e.id as number;
  }

  const utCot1 = await insertUnitType(pCottages.id,"Котедж 1 спальня","COT1","villa",4, 55, 3200);
  const utCot2 = await insertUnitType(pCottages.id,"Котедж 2 спальні","COT2","villa",6, 85, 4800);
  const utCot3 = await insertUnitType(pCottages.id,"Котедж 3 спальні","COT3","villa",8,120, 6500);
  const utStd  = await insertUnitType(pHotel.id,   "Стандарт",        "STD", "room", 2, 22, 1400);
  const utDbl  = await insertUnitType(pHotel.id,   "Покращений DBL",  "DBL", "room", 2, 28, 1800);
  const utSte  = await insertUnitType(pHotel.id,   "Люкс",            "STE", "suite",2, 48, 3500);

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. UNITS
  // ═══════════════════════════════════════════════════════════════════════════
  async function insertUnit(propertyId:number, name:string, cat:string, cap:number, price:number, utId:number, floor=1, sqm:number|null=null) {
    const { rows:[r] } = await sql(`
      INSERT INTO units (property_id,unit_type_id,name,category,capacity,base_price,status,housekeeping_status,floor,square_meters)
      VALUES ($1,$2,$3,$4,$5,$6,'active','clean',$7,$8) ON CONFLICT DO NOTHING RETURNING id
    `, [propertyId,utId,name,cat,cap,price,floor,sqm]);
    if (r) return r.id as number;
    const { rows:[e] } = await sql(`SELECT id FROM units WHERE property_id=$1 AND name=$2`,[propertyId,name]);
    return e?.id as number;
  }

  // Cottages: 6×1-bed, 6×2-bed, 3×3-bed
  const cot:number[] = [];
  for (let i=1;i<=6;i++)  cot.push(await insertUnit(pCottages.id,`Котедж №${i} (1 спальня)`, "house",4,3200,utCot1,1,55));
  for (let i=7;i<=12;i++) cot.push(await insertUnit(pCottages.id,`Котедж №${i} (2 спальні)`,"house",6,4800,utCot2,1,85));
  for (let i=13;i<=15;i++)cot.push(await insertUnit(pCottages.id,`Котедж №${i} (3 спальні)`,"house",8,6500,utCot3,1,120));

  // Hotel: 8×std fl1, 8×dbl fl2, 2×suite fl3
  const hotel:number[] = [];
  for (let i=101;i<=108;i++) hotel.push(await insertUnit(pHotel.id,`Кімната ${i}`,"room",2,1400,utStd,1,22));
  for (let i=201;i<=208;i++) hotel.push(await insertUnit(pHotel.id,`Кімната ${i}`,"room",2,1800,utDbl,2,28));
  hotel.push(await insertUnit(pHotel.id,"Люкс 301","room",2,3500,utSte,3,48));
  hotel.push(await insertUnit(pHotel.id,"Люкс 302","room",2,3500,utSte,3,48));

  // Spa resources (units for calendar blocking)
  const spa:number[] = [];
  for (let i=1;i<=4;i++) spa.push(await insertUnit(pSpa.id,`Кабінет масажу №${i}`,"spa",1,900,utStd));
  spa.push(await insertUnit(pSpa.id,"Паровий зал",     "spa",6, 500,utStd));
  spa.push(await insertUnit(pSpa.id,"Хамам",           "spa",4, 800,utStd));
  spa.push(await insertUnit(pSpa.id,"Фінська сауна",   "spa",8,1200,utStd));
  spa.push(await insertUnit(pSpa.id,"Гідромасажна ванна","spa",2,600,utStd));

  // Pool loungers
  for (let i=1;i<=20;i++) await insertUnit(pPool.id,`Шезлонг №${i}`,"pool",1,200,utStd);

  // Event spaces
  const evtUnits:number[] = [];
  evtUnits.push(await insertUnit(pEvents.id,"Банкетний зал «Резиденція»","other",150,15000,utStd,1,280));
  evtUnits.push(await insertUnit(pEvents.id,"Зал «Верхня тераса»",       "other",80, 8000, utStd,2,120));
  evtUnits.push(await insertUnit(pEvents.id,"Альтанка «Лісова»",         "other",30, 3500, utStd,1, 60));
  console.log("  ✓ Units created");

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. SPA SERVICES
  // ═══════════════════════════════════════════════════════════════════════════
  async function insertSpaSvc(name:string, cat:string, dur:number, price:number) {
    const { rows:[r] } = await sql(`
      INSERT INTO spa_services (organization_id,name,category,duration_minutes,price,is_active,sort_order)
      VALUES ($1,$2,$3,$4,$5,true,0) ON CONFLICT DO NOTHING RETURNING id
    `, [orgId,name,cat,dur,price]);
    if (r) return r.id as number;
    const { rows:[e] } = await sql(`SELECT id FROM spa_services WHERE organization_id=$1 AND name=$2`,[orgId,name]);
    return e?.id as number;
  }

  const svcRelax  = await insertSpaSvc("Релаксувальний масаж",       "massage",60, 900);
  const svcDeep   = await insertSpaSvc("Глибокий тканинний масаж",   "massage",90,1350);
  const svcFacial = await insertSpaSvc("Ліфтинг-догляд для обличчя", "face",   75,1200);
  const svcWrapp  = await insertSpaSvc("Шоколадне обгортання",       "body",   90,1500);
  const svcHamam  = await insertSpaSvc("Хамам + пілінг",             "sauna",  60, 800);

  // SPA RESOURCES
  for (const [name, rtype] of [
    ["Кабінет А","room"],["Кабінет Б","room"],["Кабінет В","room"],
    ["Тер. Вікторія","therapist"],["Тер. Олена","therapist"],
  ]) {
    await sql(`
      INSERT INTO spa_resources (organization_id,name,resource_type,capacity,is_active)
      VALUES ($1,$2,$3,1,true) ON CONFLICT DO NOTHING
    `, [orgId,name,rtype]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. RENTAL ITEMS
  // ═══════════════════════════════════════════════════════════════════════════
  async function insertRental(name:string, cat:string, stock:number, dayPrice:number, deposit:number) {
    const { rows:[r] } = await sql(`
      INSERT INTO rental_items (tenant_id,property_id,name,category,total_stock,price_per_day,deposit_amount,is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT DO NOTHING RETURNING id
    `, [orgId,pCottages.id,name,cat,stock,dayPrice,deposit]);
    if (r) return r.id as number;
    const { rows:[e] } = await sql(`SELECT id FROM rental_items WHERE tenant_id=$1 AND name=$2`,[orgId,name]);
    return e?.id as number;
  }

  const rBike  = await insertRental("Велосипед MTB",      "bike",      8,350,1000);
  const rKayak = await insertRental("Каяк двомісний",     "watercraft",3,600,2000);
  const rSUP   = await insertRental("SUP борд",           "watercraft",4,400,1500);
  const rBBQ   = await insertRental("BBQ мангал + вугілля","sports",   5,300, 500);
  const rFish  = await insertRental("Вудочка + набір",    "sports",   10,150, 300);

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. ADDONS
  // ═══════════════════════════════════════════════════════════════════════════
  async function insertAddon(name:string, unit:string, price:number) {
    const { rows:[r] } = await sql(`
      INSERT INTO addons (organization_id,name,unit,price,is_active)
      VALUES ($1,$2,$3,$4,true) ON CONFLICT DO NOTHING RETURNING id
    `, [orgId,name,unit,price]);
    if (r) return r.id as number;
    const { rows:[e] } = await sql(`SELECT id FROM addons WHERE organization_id=$1 AND name=$2`,[orgId,name]);
    return e?.id as number;
  }

  await insertAddon("Сніданок «Континентальний»",          "per person",180);
  await insertAddon("BBQ вечеря на терасі",                "per stay",  850);
  await insertAddon("Трансфер Київ ↔ Котедж",             "per stay", 1200);
  await insertAddon("Букет квітів та вітальна листівка",   "per stay",  650);
  await insertAddon("Шампанське та фрукти",                "per stay",  950);
  await insertAddon("Прокат велосипеда (1 день)",          "per person",350);

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. RATES (actual schema: property_id, name, price_per_night, unit_category)
  // ═══════════════════════════════════════════════════════════════════════════
  async function insertRate(propId:number, name:string, unitCat:string, price:number) {
    const { rows:[r] } = await sql(`
      INSERT INTO rates (property_id,name,unit_category,price_per_night)
      VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id
    `, [propId,name,unitCat,price]);
    if (r) return r.id as number;
    const { rows:[e] } = await sql(`SELECT id FROM rates WHERE property_id=$1 AND name=$2`,[propId,name]);
    return e?.id as number;
  }

  await insertRate(pCottages.id,"Котедж 1 спальня — BAR","house", 3200);
  await insertRate(pCottages.id,"Котедж 2 спальні — BAR","house", 4800);
  await insertRate(pCottages.id,"Котедж 3 спальні — BAR","house", 6500);
  await insertRate(pHotel.id,   "Стандарт — BAR",         "room",  1400);
  await insertRate(pHotel.id,   "Покращений — BAR",       "room",  1800);
  await insertRate(pHotel.id,   "Люкс — BAR",             "room",  3500);

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. RESERVATION SOURCES
  // ═══════════════════════════════════════════════════════════════════════════
  await sql(`
    INSERT INTO reservation_sources (tenant_id,name,code,type,commission_pct,color,is_active) VALUES
      ($1,'Прямий сайт','direct',  'direct', 0,  '#4F46E5',true),
      ($1,'Booking.com','booking', 'ota',    15, '#003580',true),
      ($1,'Airbnb',     'airbnb',  'ota',    3,  '#FF5A5F',true),
      ($1,'Телефон',    'phone',   'offline',0,  '#10B981',true),
      ($1,'Walk-in',    'walkin',  'offline',0,  '#F59E0B',true)
    ON CONFLICT DO NOTHING
  `, [orgId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. GUESTS
  // ═══════════════════════════════════════════════════════════════════════════
  const guestData: [string,string,string,string,string,number,number,number][] = [
    ["Олексій",  "Мартиненко","a.martynenko@gmail.com",   "+380671234501","platinum",38400,24,48],
    ["Юлія",     "Іваненко",  "y.ivanenko@ukr.net",       "+380931234502","gold",    24800,16,32],
    ["Дмитро",   "Сидоренко", "d.sydorenko@gmail.com",    "+380671234503","gold",    19200,12,24],
    ["Ольга",    "Бойко",     "o.boyko@gmail.com",         "+380931234504","silver",  12600, 8,16],
    ["Андрій",   "Кравченко", "a.kravchenko@ukr.net",     "+380671234505","silver",  11200, 7,14],
    ["Наталія",  "Поліщук",   "n.polishchuk@gmail.com",   "+380931234506","silver",   9600, 6,12],
    ["Василь",   "Романюк",   "v.romaniuk@ukr.net",       "+380671234507","bronze",   6400, 4, 8],
    ["Тетяна",   "Гончаренко","t.honcharenko@gmail.com",  "+380931234508","bronze",   4800, 3, 6],
    ["Микола",   "Шевченко",  "m.shevchenko@ukr.net",     "+380671234509","bronze",   3200, 2, 4],
    ["Ірина",    "Ткаченко",  "i.tkachenko@gmail.com",    "+380931234510","bronze",   3200, 2, 4],
    ["Сергій",   "Дяченко",   "s.diachenko@ukr.net",      "+380671234511","bronze",   1600, 1, 2],
    ["Алла",     "Власенко",  "a.vlasenko@gmail.com",     "+380931234512","bronze",   1600, 1, 2],
    ["Максим",   "Коваленко", "m.kovalenko@ukr.net",      "+380671234513","bronze",   1600, 1, 2],
    ["Галина",   "Федоренко", "h.fedorenko@gmail.com",    "+380931234514","bronze",   1600, 1, 2],
    ["Роман",    "Мельник",   "r.melnyk@ukr.net",         "+380671234515","bronze",   3200, 2, 4],
    ["Людмила",  "Савченко",  "l.savchenko@gmail.com",    "+380931234516","bronze",   3200, 2, 4],
    ["Богдан",   "Момот",     "b.momot@ukr.net",          "+380671234517","bronze",   4800, 3, 6],
    ["Вікторія", "Лисенко",   "v.lysenko@gmail.com",      "+380931234518","bronze",   1600, 1, 2],
    ["Павло",    "Гаврилюк",  "p.havryluk@ukr.net",       "+380671234519","bronze",   1600, 1, 2],
    ["Марина",   "Яременко",  "m.yaremenko@gmail.com",    "+380931234520","bronze",   1600, 1, 2],
  ];

  const guestIds:number[] = [];
  for (const [fn,ln,email,phone,loyalty,ltv,cnt,nights] of guestData) {
    const pts = loyalty==="platinum"?4800:loyalty==="gold"?2400:loyalty==="silver"?1200:600;
    const { rows:[g] } = await sql(`
      INSERT INTO guests (organization_id,first_name,last_name,email,phone,
        loyalty_level,loyalty_points,ltv,total_spent,booking_count,total_nights)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id
    `, [orgId,fn,ln,email,phone,loyalty,pts,ltv,cnt,nights]);
    if (g) guestIds.push(g.id);
  }
  if (guestIds.length < 20) {
    const { rows } = await sql(`SELECT id FROM guests WHERE organization_id=$1 ORDER BY id`,[orgId]);
    guestIds.splice(0,guestIds.length,...rows.map((r:any)=>r.id));
  }
  console.log(`  ✓ Guests: ${guestIds.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // 14. RESERVATIONS
  // Source enum: airbnb | booking | direct | other
  // ═══════════════════════════════════════════════════════════════════════════
  type BInput = {uid:number;gid:number;ci:string;co:string;status:string;payStatus:string;src:string;total:number;paid:number;confirmNo?:string;notes?:string};
  let bn=1;
  const cn = () => `DDG-2026-${String(bn++).padStart(4,"0")}`;

  async function insertBooking(b:BInput) {
    const { rows:[r] } = await sql(`
      INSERT INTO bookings
        (unit_id,guest_id,check_in,check_out,status,payment_status,
         source,adults,guests_count,total_amount,paid_amount,
         organization_id,notes,confirmation_no,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,2,2,$8,$9,$10,$11,$12,now(),now())
      RETURNING id
    `, [b.uid,b.gid,b.ci,b.co,b.status,b.payStatus,
        b.src,b.total,b.paid,orgId,b.notes??null,b.confirmNo??null]);
    return r?.id as number|undefined;
  }

  function addDays(base:string, n:number) {
    const d = new Date(base); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10);
  }

  const bookings:number[] = [];

  // A) CHECK-IN TODAY
  for (const [uid,gid,nights,total,paid,status,payStatus,src] of [
    [cot[0],  guestIds[0],  3,  9600, 9600, "confirmed","paid",    "direct" ],
    [cot[1],  guestIds[1],  5, 24000,12000, "confirmed","partial", "booking"],
    [hotel[0],guestIds[2],  2,  2800, 2800, "confirmed","paid",    "direct" ],
    [hotel[4],guestIds[3],  3,  5400, 5400, "confirmed","paid",    "airbnb" ],
    [hotel[8],guestIds[4],  7, 24500,24500, "confirmed","paid",    "booking"],
  ] as const) {
    const id = await insertBooking({uid:Number(uid),gid:Number(gid),ci:TODAY,co:addDays(TODAY,Number(nights)),
      status:String(status),payStatus:String(payStatus),src:String(src),
      total:Number(total),paid:Number(paid),confirmNo:cn()});
    if (id) bookings.push(id);
  }

  // B) CURRENTLY CHECKED IN (arrived before today)
  for (const [uid,gid,ciOff,nights,total] of [
    [cot[2],  guestIds[5], -2,7,33600],
    [cot[3],  guestIds[6], -1,4,19200],
    [cot[6],  guestIds[7], -3,5,24000],
    [hotel[1],guestIds[8], -1,4, 5600],
    [hotel[5],guestIds[9], -2,5, 9000],
    [hotel[9],guestIds[10],-1,3,10500],
    [cot[9],  guestIds[11],-4,8,38400],
  ] as const) {
    const ci = addDays(TODAY,Number(ciOff));
    const co = addDays(ci,Number(nights));
    const id = await insertBooking({uid:Number(uid),gid:Number(gid),ci,co,
      status:"checked_in",payStatus:"paid",src:"direct",
      total:Number(total),paid:Number(total),confirmNo:cn()});
    if (id) bookings.push(id);
  }

  // C) CHECKOUT TODAY (leaving now)
  for (const [uid,gid,ciOff,total] of [
    [cot[4],  guestIds[12],-4,19200],
    [hotel[2],guestIds[13],-3, 4200],
    [hotel[6],guestIds[14],-2, 3600],
  ] as const) {
    const ci = addDays(TODAY,Number(ciOff));
    const id = await insertBooking({uid:Number(uid),gid:Number(gid),ci,co:TODAY,
      status:"checked_in",payStatus:"paid",src:"direct",
      total:Number(total),paid:Number(total),confirmNo:cn()});
    if (id) bookings.push(id);
  }

  // D) UPCOMING CONFIRMED
  for (const [uid,gid,dAhead,nights,total,paid,src,payStatus] of [
    [cot[5],  guestIds[15], 3,5,24000,12000,"booking","partial"],
    [cot[7],  guestIds[16], 5,3,14400,14400,"direct", "paid"  ],
    [cot[8],  guestIds[17], 7,7,45500,45500,"direct", "paid"  ],
    [hotel[3],guestIds[18], 4,2, 2800, 2800,"booking","paid"  ],
    [hotel[7],guestIds[19], 6,4, 7200,    0,"airbnb", "unpaid"],
    [hotel[10],guestIds[0],10,3,10500,10500,"direct", "paid"  ],
    [cot[10], guestIds[1], 14,7,33600,    0,"direct", "unpaid"],
  ] as const) {
    const ci = addDays(TODAY,Number(dAhead));
    const co = addDays(ci,Number(nights));
    const id = await insertBooking({uid:Number(uid),gid:Number(gid),ci,co,
      status:"confirmed",payStatus:String(payStatus),src:String(src),
      total:Number(total),paid:Number(paid),confirmNo:cn()});
    if (id) bookings.push(id);
  }

  // E) PENDING / DRAFT (unpaid, no payment yet)
  for (const [uid,gid] of [[cot[11],guestIds[2]],[hotel[11],guestIds[3]]] as const) {
    const ci = addDays(TODAY,20);
    const id = await insertBooking({uid:Number(uid),gid:Number(gid),ci,co:addDays(ci,3),
      status:"pending",payStatus:"unpaid",src:"direct",
      total:14400,paid:0,confirmNo:cn()});
    if (id) bookings.push(id);
  }

  // F) HISTORICAL CHECKED_OUT
  for (const [uid,gid,dAgo,nights,total] of [
    [cot[0],  guestIds[4], 30,4,19200],
    [hotel[0],guestIds[5], 20,3, 4200],
    [hotel[4],guestIds[6], 15,2, 3600],
    [cot[3],  guestIds[7], 10,6,28800],
    [hotel[2],guestIds[8],  8,5, 7000],
  ] as const) {
    const co = addDays(TODAY,-Number(dAgo));
    const ci = addDays(co,-Number(nights));
    const id = await insertBooking({uid:Number(uid),gid:Number(gid),ci,co,
      status:"checked_out",payStatus:"paid",src:"direct",
      total:Number(total),paid:Number(total),confirmNo:cn()});
    if (id) bookings.push(id);
  }

  // G) CANCELLED
  for (const [uid,gid] of [[cot[5],guestIds[9]],[hotel[5],guestIds[10]]] as const) {
    const ci = addDays(TODAY,15);
    const id = await insertBooking({uid:Number(uid),gid:Number(gid),ci,co:addDays(ci,3),
      status:"cancelled",payStatus:"unpaid",src:"booking",
      total:14400,paid:0,confirmNo:cn(),notes:"Скасовано клієнтом"});
    if (id) bookings.push(id);
  }

  console.log(`  ✓ Reservations: ${bookings.length}`);

  // Reservation status history
  for (const bid of bookings.slice(0,8)) {
    await sql(`INSERT INTO reservation_status_history (reservation_id,from_status,to_status,changed_by,source)
      VALUES ($1,'pending','confirmed',$2,'manual') ON CONFLICT DO NOTHING`,[bid,reception.id]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 15. FOLIOS
  // ═══════════════════════════════════════════════════════════════════════════
  const folioIds:number[] = [];
  for (const [i,bid] of bookings.slice(0,8).entries()) {
    const { rows:[f] } = await sql(`
      INSERT INTO folios (tenant_id,reservation_id,folio_no,type,status,currency,total_charges,total_credits,balance)
      VALUES ($1,$2,$3,'main','open','UAH',0,0,0) ON CONFLICT DO NOTHING RETURNING id
    `, [orgId,bid,`F-2026-${String(i+1).padStart(4,"0")}`]);
    if (f) folioIds.push(f.id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 16. INVOICES (actual schema: booking_id, invoice_number, invoice_type, amount)
  // ═══════════════════════════════════════════════════════════════════════════
  let invSeq = 1;
  for (const [i,bid] of bookings.slice(0,8).entries()) {
    const total = (i%3===0)?4800:(i%3===1)?9600:14400;
    const sub   = +(total/1.2).toFixed(2);
    const vat   = +(total-sub).toFixed(2);
    await sql(`
      INSERT INTO invoices
        (invoice_number,booking_id,guest_id,invoice_type,status,
         amount,tax_amount,paid_amount,currency,subtotal,
         counterparty_name,legal_entity_id,organization_id,created_at,updated_at)
      VALUES ($1,$2,$3,'accommodation','pending',$4,$5,$4,'UAH',$6,'Гість',$7,$8,now(),now())
      ON CONFLICT DO NOTHING
    `, [`INV-2026-${String(invSeq++).padStart(4,"0")}`,bid,
        guestIds[i%guestIds.length],total,vat,sub,leId,orgId]);
  }
  console.log("  ✓ Folios + Invoices");

  // ═══════════════════════════════════════════════════════════════════════════
  // 17. PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  const methodMap = ["cash","card","liqpay","bank_transfer","card"] as const;
  for (const [i,bid] of bookings.filter((_,idx)=>idx<15).entries()) {
    const amount = 4800+(i*1200);
    const method = methodMap[i%methodMap.length];
    await sql(`
      INSERT INTO payments (booking_id,amount,method,status,payment_type,currency,
        legal_entity_id,description,processed_at)
      VALUES ($1,$2,$3,'completed','payment','UAH',$4,'Оплата бронювання',now())
      ON CONFLICT DO NOTHING
    `, [bid,amount,method,leId]);
  }
  console.log("  ✓ Payments");

  // ═══════════════════════════════════════════════════════════════════════════
  // 18. SPA BOOKINGS
  // ═══════════════════════════════════════════════════════════════════════════
  const spaData:[number,number,string,string,string,number][] = [
    [guestIds[0],svcRelax,  TODAY,       "10:00","11:00",900],
    [guestIds[1],svcDeep,   TODAY,       "11:30","13:00",1350],
    [guestIds[2],svcFacial, TODAY,       "14:00","15:15",1200],
    [guestIds[3],svcWrapp,  TODAY,       "15:30","17:00",1500],
    [guestIds[4],svcHamam,  addDays(TODAY,1),"10:00","11:00",800],
    [guestIds[5],svcRelax,  addDays(TODAY,1),"12:00","13:00",900],
    [guestIds[6],svcDeep,   addDays(TODAY,3),"11:00","12:30",1350],
    [guestIds[0],svcFacial, addDays(TODAY,6),"14:00","15:15",1200],
  ];
  for (const [gid,svcId,date,start,end,price] of spaData) {
    await sql(`
      INSERT INTO spa_bookings (tenant_id,guest_id,service_id,appointment_date,start_time,end_time,
        status,price,total_amount,is_paid,created_by,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'confirmed',$7,$7,false,$8,now(),now())
      ON CONFLICT DO NOTHING
    `, [orgId,gid,svcId,date,start,end,price,reception.id]);
  }
  console.log("  ✓ Spa bookings");

  // ═══════════════════════════════════════════════════════════════════════════
  // 19. RENTAL BOOKINGS
  // ═══════════════════════════════════════════════════════════════════════════
  const rentalData:[number,number,string,string,number,number,string][] = [
    [guestIds[5],rBike,  TODAY,              addDays(TODAY,2),2,350,"active" ],
    [guestIds[6],rKayak, TODAY,              addDays(TODAY,1),1,600,"active" ],
    [guestIds[7],rSUP,   addDays(TODAY,1),   addDays(TODAY,3),1,400,"pending"],
    [guestIds[0],rBBQ,   TODAY,              TODAY,            1,300,"returned"],
    [guestIds[8],rFish,  addDays(TODAY,3),   addDays(TODAY,5),2,150,"pending"],
  ];
  for (const [gid,itemId,start,end,qty,uprice,status] of rentalData) {
    const days = Math.max(1,Math.ceil((new Date(end).getTime()-new Date(start).getTime())/86400000));
    await sql(`
      INSERT INTO rental_bookings (tenant_id,guest_id,item_id,quantity,start_date,end_date,
        status,price_type,unit_price,total_amount,created_by,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'per_day',$8,$9,$10,now(),now())
      ON CONFLICT DO NOTHING
    `, [orgId,gid,itemId,qty,start,end,status,uprice,uprice*qty*days,reception.id]);
  }
  console.log("  ✓ Rental bookings");

  // ═══════════════════════════════════════════════════════════════════════════
  // 20. EVENT LEADS
  // ═══════════════════════════════════════════════════════════════════════════
  const leadData:[string,string,string,number,number,string,string,string][] = [
    ["Весілля Коваленко-Мельник", "wedding",   "2026-06-15",120,180000,"offer_sent",       "Олена","+380671111101","elena.kovalenko@gmail.com"],
    ["Корпоратив Kyivstar Q2",    "corporate", "2026-05-20", 80, 95000,"demo_scheduled",   "Петро","+380672222102","events@kyivstar.ua"       ],
    ["Конференція IT Leaders",    "conference","2026-07-10",200,250000,"new",              "Тарас","+380673333103","taras@itleaders.ua"       ],
    ["Ювілей 50 років Бондаренко","birthday",  "2026-04-25", 40, 35000,"contacted",       "Олег", "+380674444104","oleg.bond@ukr.net"        ],
    ["Тімбілдінг Nova Poshta",    "corporate", "2026-05-05", 60, 75000,"converted",       "Анна", "+380675555105","anna@nova-poshta.ua"      ],
  ] as any;

  for (const [_name, type,date,guests,budget,status,contact,phone,email] of leadData) {
    await sql(`
      INSERT INTO event_leads
        (tenant_id,property_id,contact_name,contact_phone,contact_email,
         event_type,event_date,guest_count,budget,status,assigned_to,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now()) ON CONFLICT DO NOTHING
    `, [orgId,pEvents.id,contact,phone,email,type,date,guests,budget,status,manager.id]);
  }

  await sql(`
    INSERT INTO event_bookings
      (tenant_id,property_id,name,event_type,event_date,start_time,end_time,
       guest_count,contact_name,contact_phone,contact_email,
       status,total_amount,deposit_amount,deposit_paid_at,assigned_to,created_at,updated_at)
    VALUES ($1,$2,'Тімбілдінг Nova Poshta','corporate','2026-05-05','10:00','20:00',
            60,'Анна','+380675555105','anna@nova-poshta.ua',
            'deposit_paid',75000,22500,now(),$3,now(),now()) ON CONFLICT DO NOTHING
  `, [orgId,pEvents.id,manager.id]);
  console.log("  ✓ Event leads + booking");

  // ═══════════════════════════════════════════════════════════════════════════
  // 21. MAINTENANCE TICKETS
  // ═══════════════════════════════════════════════════════════════════════════
  let tno=1;
  for (const [uid,title,cat,priority,status] of [
    [cot[2],  "Не працює посудомийна машина",   "appliance", "high",   "open"       ],
    [hotel[1],"Протікає кран у ванній",          "plumbing",  "urgent", "in_progress"],
    [hotel[7],"Перегоріла лампочка в коридорі",  "electrical","low",    "resolved"   ],
    [cot[8],  "Зламаний замок на вхідних дверях","structural","urgent", "in_progress"],
    [hotel[5],"Не охолоджує кондиціонер",        "hvac",      "high",   "open"       ],
  ] as const) {
    const hrs = priority==="urgent"?4:priority==="high"?24:72;
    const deadline = new Date(TODAY); deadline.setHours(deadline.getHours()+hrs);
    await sql(`
      INSERT INTO maintenance_tickets
        (tenant_id,unit_id,ticket_no,title,category,status,priority,
         reported_by,assigned_to,sla_deadline,guest_impact,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,now(),now()) ON CONFLICT DO NOTHING
    `, [orgId,Number(uid),`MNT-2026-${String(tno++).padStart(4,"0")}`,
        String(title),String(cat),String(status),String(priority),
        reception.id,hk.id,deadline.toISOString()]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 22. HOUSEKEEPING TASKS (actual schema: no org_id, task_type, task_status, task_priority)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [uid,title,ttype,status,priority] of [
    [cot[4],  "Генеральне прибирання котеджу №5",   "deep_cleaning","pending",    "high"  ],
    [hotel[2],"Прибирання кімнати 103",              "cleaning",     "in_progress","medium"],
    [hotel[6],"Прибирання кімнати 203",              "cleaning",     "completed",  "medium"],
    [cot[2],  "Зміна постільної білизни котеджу №3", "linen_change", "pending",    "medium"],
    [hotel[1],"Прибирання кімнати 102",              "cleaning",     "pending",    "medium"],
  ] as const) {
    const due = new Date(TODAY); due.setHours(18,0,0,0);
    await sql(`
      INSERT INTO housekeeping_tasks
        (unit_id,title,task_type,status,priority,due_date,assigned_to_id,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now()) ON CONFLICT DO NOTHING
    `, [Number(uid),String(title),String(ttype),String(status),String(priority),due.toISOString(),hk.id]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 23. TASKS (general)
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [title,type,priority,status,assignee] of [
    ["Підготувати пропозицію для весілля Коваленко","general","high","pending",    manager.id ],
    ["Перевірити запаси мінеральної води",          "general","normal","in_progress",reception.id],
    ["Замовити нові рушники для SPA",               "general","normal","pending",    manager.id ],
    ["Зв'язатись з гостем щодо пізнього виїзду",   "general","high","pending",    reception.id],
    ["Оновити меню ресторану на квітень",           "general","low", "completed",  manager.id ],
  ] as const) {
    const due = new Date(TODAY); due.setDate(due.getDate()+1);
    await sql(`
      INSERT INTO tasks (tenant_id,title,type,status,priority,assigned_to,assigned_by,due_date,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now()) ON CONFLICT DO NOTHING
    `, [orgId,String(title),String(type),String(status),String(priority),
        Number(assignee),manager.id,due.toISOString()]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 24. QUOTES
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [i,[gid,ci,co,total,status]] of [
    [guestIds[15],"2026-05-01","2026-05-05",19200,"sent" ],
    [guestIds[16],"2026-05-15","2026-05-20",24000,"draft"],
    [guestIds[17],"2026-06-01","2026-06-08",45500,"viewed"],
  ].entries() as any) {
    const validUntil = new Date(TODAY); validUntil.setDate(validUntil.getDate()+7);
    await sql(`
      INSERT INTO quotes (tenant_id,guest_id,property_id,quote_no,status,
        check_in,check_out,adults,subtotal,total_amount,currency,valid_until,created_by,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,2,$8,$8,'UAH',$9,$10,now(),now()) ON CONFLICT DO NOTHING
    `, [orgId,gid,pCottages.id,`Q-2026-${String(i+1).padStart(4,"0")}`,
        status,ci,co,total,validUntil.toISOString(),reception.id]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 25. INTEGRATION ACCOUNTS
  // ═══════════════════════════════════════════════════════════════════════════
  await sql(`
    INSERT INTO integration_accounts (tenant_id,name,type,category,status,sync_frequency,auto_sync,is_active,created_at,updated_at) VALUES
      ($1,'Booking.com — Котеджі', 'booking_com','ota',       'active','realtime',true,true,now(),now()),
      ($1,'Airbnb — Котеджі',      'airbnb',      'ota',       'active','realtime',true,true,now(),now()),
      ($1,'LiqPay',               'liqpay',      'payment',   'active','realtime',true,true,now(),now()),
      ($1,'Checkbox (РРО)',        'checkbox',    'pos',       'active','realtime',true,true,now(),now()),
      ($1,'VCHASNO.UA',           'vchasno',     'accounting','pending','daily',  true,true,now(),now())
    ON CONFLICT DO NOTHING
  `, [orgId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 26. PAYMENT PROVIDERS
  // ═══════════════════════════════════════════════════════════════════════════
  await sql(`
    INSERT INTO payment_providers (tenant_id,name,provider,display_name,is_active,is_default,test_mode,fee_pct,created_at,updated_at) VALUES
      ($1,'LiqPay',    'liqpay',  'LiqPay (Онлайн оплата)', true, true, true, 2.50,now(),now()),
      ($1,'Готівка',   'cash',    'Готівка на ресепції',     true, false,false,0,   now(),now()),
      ($1,'Термінал',  'terminal','Термінал на ресепції',    true, false,false,1.50,now(),now()),
      ($1,'Wayforpay', 'wayforpay','Wayforpay',              false,false,true, 2.00,now(),now())
    ON CONFLICT DO NOTHING
  `, [orgId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 27. COMMUNICATION CHANNELS
  // ═══════════════════════════════════════════════════════════════════════════
  await sql(`
    INSERT INTO communication_channels (tenant_id,name,type,provider,is_active,is_inbound,is_outbound,from_address,display_name,created_at,updated_at) VALUES
      ($1,'Email',   'email',   'sendgrid', true,true, true, 'hello@dogoda-demo.ua','DOGODA DEMO GROUP',now(),now()),
      ($1,'SMS',     'sms',     'twilio',   true,false,true, '+380501234567',       'DOGODA',           now(),now()),
      ($1,'WhatsApp','whatsapp','green_api',true,true, true, '+380501234567',       'DOGODA Concierge', now(),now()),
      ($1,'Viber',   'viber',   'viber',    true,true, true, '+380501234567',       'DOGODA Concierge', now(),now())
    ON CONFLICT DO NOTHING
  `, [orgId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 28. FEATURE FLAGS
  // ═══════════════════════════════════════════════════════════════════════════
  await sql(`
    INSERT INTO feature_flags (tenant_id,flag,enabled,rollout_pct,updated_at) VALUES
      ($1,'ai_concierge',    true, 100,now()),
      ($1,'guest_portal',    true, 100,now()),
      ($1,'channel_manager', true, 100,now()),
      ($1,'digital_checkin', true, 100,now()),
      ($1,'tv_system',       false,0,  now()),
      ($1,'dynamic_pricing', false,0,  now()),
      ($1,'revenue_optimizer',false,0, now())
    ON CONFLICT (tenant_id,flag) DO NOTHING
  `, [orgId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  const { rows:[s] } = await sql(`
    SELECT
      (SELECT count(*) FROM units WHERE property_id=ANY(SELECT id FROM properties WHERE organization_id=$1)) AS units,
      (SELECT count(*) FROM guests WHERE organization_id=$1) AS guests,
      (SELECT count(*) FROM bookings WHERE organization_id=$1) AS bookings,
      (SELECT count(*) FROM payments WHERE booking_id=ANY(SELECT id FROM bookings WHERE organization_id=$1)) AS payments,
      (SELECT count(*) FROM spa_bookings WHERE tenant_id=$1) AS spa,
      (SELECT count(*) FROM rental_bookings WHERE tenant_id=$1) AS rentals,
      (SELECT count(*) FROM event_leads WHERE tenant_id=$1) AS event_leads,
      (SELECT count(*) FROM invoices WHERE booking_id=ANY(SELECT id FROM bookings WHERE organization_id=$1)) AS invoices,
      (SELECT count(*) FROM maintenance_tickets WHERE tenant_id=$1) AS tickets,
      (SELECT count(*) FROM tasks WHERE tenant_id=$1) AS tasks,
      (SELECT count(*) FROM quotes WHERE tenant_id=$1) AS quotes
  `, [orgId]);

  console.log("\n  ✅  DOGODA DEMO GROUP complete!");
  console.log(`     Tenant ID:        ${orgId}`);
  console.log(`     Units:            ${s.units}`);
  console.log(`     Guests:           ${s.guests}`);
  console.log(`     Reservations:     ${s.bookings}  (check-in today, checked_in, checkout today, upcoming, historical, cancelled)`);
  console.log(`     Payments:         ${s.payments}`);
  console.log(`     Spa bookings:     ${s.spa}`);
  console.log(`     Rental bookings:  ${s.rentals}`);
  console.log(`     Event leads:      ${s.event_leads}`);
  console.log(`     Invoices:         ${s.invoices}`);
  console.log(`     Maint. tickets:   ${s.tickets}`);
  console.log(`     Tasks:            ${s.tasks}`);
  console.log(`     Quotes:           ${s.quotes}`);
  console.log(`\n  🔐  owner@dogoda-demo.ua / demo123`);
  console.log(`     manager@dogoda-demo.ua / demo123`);
  console.log(`     reception@dogoda-demo.ua / demo123`);
  console.log(`     hk@dogoda-demo.ua / demo123`);

  await pool.end();
}

run().catch(e => { console.error("❌  Seed failed:", e.message ?? e); process.exit(1); });
