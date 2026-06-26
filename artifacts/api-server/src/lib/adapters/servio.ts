/**
 * Servio HMS Adapter
 * 
 * Implements the integration layer for importing data from Servio PMS.
 * In demo/test mode (no real credentials), generates realistic Ukrainian
 * hotel data for preview and testing.
 */

export interface ServioCredentials {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  hotelCode?: string;
}

export interface ServioConnectionStatus {
  success: boolean;
  servioVersion?: string;
  hotelName?: string;
  hotelCode?: string;
  totalGuests?: number;
  totalBookings?: number;
  totalRooms?: number;
  error?: string;
  latencyMs?: number;
}

export interface ServioGuest {
  id: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  passportNumber?: string;
  nationality?: string;
  address?: string;
  notes?: string;
  category?: string; // VIP, Corporate, Regular
  company?: string;
  totalStays?: number;
  firstStayDate?: string;
  lastStayDate?: string;
  totalRevenue?: number;
  tags?: string[];
  createdAt: string;
}

export interface ServioBooking {
  id: string;
  confirmationNumber: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  roomType?: string;
  checkIn: string;
  checkOut: string;
  status: string; // Confirmed, CheckedIn, CheckedOut, Cancelled, NoShow
  adults: number;
  children?: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  source?: string; // Booking.com, Phone, Walk-in, etc.
  ratePlan?: string;
  notes?: string;
  services?: ServioService[];
  payments?: ServioPayment[];
  createdAt: string;
}

export interface ServioRoom {
  id: string;
  number: string;
  type: string;       // Standard, Deluxe, Suite, etc.
  category: string;
  floor?: number;
  capacity: number;
  description?: string;
  amenities?: string[];
  baseRate?: number;
  status: string;     // Available, Occupied, Maintenance, Dirty
}

export interface ServioRatePlan {
  id: string;
  name: string;
  code: string;
  type: string; // BAR, Corporate, Package, etc.
  amount: number;
  currency: string;
  minNights?: number;
  conditions?: string;
  isActive: boolean;
}

export interface ServioService {
  id: string;
  bookingId: string;
  name: string;
  category: string;  // Food, Spa, Rental, Transfer, etc.
  quantity: number;
  amount: number;
  date?: string;
  notes?: string;
}

export interface ServioPayment {
  id: string;
  bookingId: string;
  amount: number;
  type: string; // Cash, Card, LiqPay, Transfer
  status: string; // Paid, Partial, Refunded
  reference?: string;
  date: string;
  notes?: string;
}

export interface ServioCompany {
  id: string;
  name: string;
  taxId?: string;
  address?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  discount?: number;
  creditLimit?: number;
  notes?: string;
}

export interface ServioPreviewData {
  hotel: { name: string; code: string; rooms: number };
  counts: {
    guests: number;
    bookings: number;
    activeBookings: number;
    futureBookings: number;
    historicalBookings: number;
    rooms: number;
    ratePlans: number;
    companies: number;
    services: number;
    payments: number;
  };
  samples: {
    guests: ServioGuest[];
    bookings: ServioBooking[];
    rooms: ServioRoom[];
    ratePlans: ServioRatePlan[];
    companies: ServioCompany[];
  };
}

// ── MOCK DATA GENERATOR ──────────────────────────────────────────
// Generates realistic Ukrainian hotel data for demo/testing
// Uses a seeded deterministic RNG so the same call always returns the same data.

// Fixed demo dataset size — never changes between calls
const DEMO_GUEST_COUNT   = 1043;
const DEMO_ROOM_COUNT    = 86;
const DEMO_BOOKING_COUNT = 3210;

const UA_LAST_NAMES = ["Іванченко", "Петренко", "Коваленко", "Бондаренко", "Шевченко", "Ткаченко", "Кравченко", "Олійник", "Мороз", "Лисенко", "Хоменко", "Білоус", "Данченко", "Гончар", "Захарченко"];
const UA_FIRST_NAMES_M = ["Олексій", "Михайло", "Дмитро", "Сергій", "Андрій", "Василь", "Ігор", "Олег", "Павло", "Роман"];
const UA_FIRST_NAMES_F = ["Олена", "Наталія", "Тетяна", "Ірина", "Марія", "Юлія", "Оксана", "Людмила", "Вікторія", "Анна"];
const SOURCES = ["Booking.com", "Телефон", "Сайт", "Instagram", "Прямий", "Telegram", "Expedia", "Airbnb"];
const RATE_PLANS = ["Стандартний", "Ранній заїзд", "Пізній виїзд", "Сніданок включено", "Повний пансіон", "Без повернення", "Корпоративний"];
const ROOM_TYPES = ["Стандарт", "Комфорт", "Делюкс", "Люкс", "Сімейний", "Будинок", "Бунгало", "Студія"];
const SERVICE_CATS = ["Харчування", "SPA", "Трансфер", "Оренда", "Розваги", "Інше"];
const SERVICES = ["Сніданок", "Обід", "Вечеря", "Масаж класичний", "Масаж спортивний", "Велосипед", "Вудки", "Трансфер зі Львова", "Трансфер до Києва", "SPA-процедура", "Дитячий стілець", "Барбекю"];

/** Mulberry32 — fast, good-quality seeded PRNG returning [0, 1) */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return {
    next(): number {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    },
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    item<T>(arr: T[]): T {
      return arr[Math.floor(this.next() * arr.length)];
    },
    bool(p = 0.5): boolean {
      return this.next() < p;
    },
  };
}

/** Generate guest at absolute index i (stable across calls) */
function generateGuest(i: number): ServioGuest {
  const rng = makeRng(0xABCD_0000 + i);
  const isMale = rng.bool();
  const lastName = rng.item(UA_LAST_NAMES);
  const firstName = isMale ? rng.item(UA_FIRST_NAMES_M) : rng.item(UA_FIRST_NAMES_F);
  const totalStays = rng.int(1, 20);
  const bornYear = rng.int(1960, 2000);
  const bornMonth = String(rng.int(1, 12)).padStart(2, "0");
  const bornDay   = String(rng.int(1, 28)).padStart(2, "0");
  const prefix = rng.int(50, 99);
  const suffix = rng.int(1000000, 9999999);
  return {
    id: `SRV-G-${String(i + 1).padStart(5, "0")}`,
    lastName,
    firstName,
    middleName: isMale ? "Олексійович" : "Олексіївна",
    phone: `+380${prefix}${suffix}`,
    email: `${lastName.toLowerCase().replace(/[іїє]/g, "i")}${i + 1}@gmail.com`,
    birthDate: `${bornYear}-${bornMonth}-${bornDay}`,
    nationality: "UA",
    category: rng.item(["Regular", "Regular", "Regular", "VIP", "Corporate"]),
    totalStays,
    firstStayDate: dateOffset(-(totalStays * 180 + rng.int(0, 30))),
    lastStayDate: dateOffset(-rng.int(0, 55)),
    totalRevenue: rng.int(1500, 120000),
    tags: rng.bool(0.3) ? [rng.item(["VIP", "Постійний", "Корпоратив", "Повторний"])] : [],
    notes: rng.bool(0.2) ? "Алергія на горіхи" : undefined,
    createdAt: new Date(Date.now() - rng.int(100, 1000) * 86400000).toISOString(),
  } as ServioGuest;
}

/** Generate room at absolute index i (stable across calls) */
function generateRoom(i: number): ServioRoom {
  const rng = makeRng(0xBEEF_0000 + i);
  const type = rng.item(ROOM_TYPES);
  const floor = rng.int(1, 3);
  return {
    id: `SRV-R-${String(i + 1).padStart(3, "0")}`,
    number: `${floor}${String(i + 1).padStart(2, "0")}`,
    type,
    category: type,
    floor,
    capacity: type.includes("Сімейний") || type.includes("Будинок") ? rng.int(3, 6) : rng.int(1, 3),
    baseRate: rng.int(800, 5000),
    status: rng.item(["Available", "Available", "Available", "Occupied", "Maintenance"]),
  } as ServioRoom;
}

/** Generate booking at absolute index i (stable across calls) */
function generateBooking(i: number): ServioBooking {
  const rng = makeRng(0xCAFE_0000 + i);
  const guestIdx = rng.int(0, DEMO_GUEST_COUNT - 1);
  const roomIdx  = rng.int(0, DEMO_ROOM_COUNT - 1);
  const guest = generateGuest(guestIdx);
  const room  = generateRoom(roomIdx);
  const checkInDays = rng.int(-200, 60);
  const nights = rng.int(1, 7);
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + checkInDays);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + nights);
  const rate = rng.int(800, 5000);
  return {
    id: `SRV-B-${String(i + 1).padStart(6, "0")}`,
    guestId: guest.id,
    guestName: `${guest.lastName} ${guest.firstName}`,
    roomNumber: room.number,
    roomType: room.type,
    checkIn: checkIn.toISOString().split("T")[0],
    checkOut: checkOut.toISOString().split("T")[0],
    status: rng.item(["Confirmed", "CheckedIn", "CheckedOut", "CheckedOut", "CheckedOut"]),
    adults: rng.int(1, room.capacity),
    children: rng.bool(0.2) ? rng.int(1, 2) : 0,
    totalAmount: rate * nights,
    paidAmount: rng.bool(0.8) ? rate * nights : 0,
    source: rng.item(SOURCES),
    ratePlan: rng.item(RATE_PLANS),
    notes: rng.bool(0.15) ? "Прохання — тихий номер" : undefined,
    createdAt: new Date(checkIn.getTime() - rng.int(1, 30) * 86400000).toISOString(),
  } as ServioBooking;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function generateRatePlans(): ServioRatePlan[] {
  return RATE_PLANS.map((name, i) => {
    const rng = makeRng(0xDADA_0000 + i);
    return {
      id: `SRV-RATE-${i + 1}`,
      name,
      code: name.toUpperCase().replace(/\s+/g, "_").substring(0, 8),
      type: i === 0 ? "BAR" : i < 4 ? "Package" : "Corporate",
      amount: rng.int(700, 4500),
      currency: "UAH",
      minNights: rng.int(1, 3),
      isActive: true,
    };
  });
}

function generateCompanies(count: number): ServioCompany[] {
  const names = ["ТОВ «Альфа Буд»", "ДП «Укртранс»", "ПП Мороз В.І.", "ТОВ «Зеленець»", "ФОП Петренко О.М.", "АТ «Карпатські мінводи»", "ТОВ «Медіагруп»", "ПП «Сонячний край»"];
  return names.slice(0, count).map((name, i) => {
    const rng = makeRng(0xC0DE_0000 + i);
    return {
      id: `SRV-COMP-${i + 1}`,
      name,
      taxId: String(rng.int(10000000, 99999999)),
      address: `м. Київ, вул. ${rng.item(["Хрещатик", "Лесі Українки", "Шевченка"])} ${rng.int(1, 100)}`,
      contactName: `${rng.item(UA_FIRST_NAMES_M)} ${rng.item(UA_LAST_NAMES)}`,
      phone: `+380${rng.int(50, 99)}${rng.int(1000000, 9999999)}`,
      email: `contracts@company${i + 1}.ua`,
      discount: rng.item([5, 10, 15, 0, 0]),
      creditLimit: rng.int(5000, 50000),
    };
  });
}

// ── SERVIO ADAPTER CLASS ─────────────────────────────────────────

export class ServioAdapter {
  private creds: ServioCredentials;
  private isDemoMode: boolean;

  constructor(creds: ServioCredentials) {
    this.creds = creds;
    // Demo mode only when explicitly set to "demo" or empty
    this.isDemoMode = !creds.baseUrl || creds.baseUrl.trim().toLowerCase() === "demo";
  }

  /** Build the test URL for Servio, injecting auth credentials as query params */
  private buildTestUrl(username?: string, password?: string): string {
    const raw = this.creds.baseUrl.trim();

    // Determine the base ASPX endpoint
    let endpoint: string;
    if (raw.toLowerCase().includes(".aspx")) {
      endpoint = raw;
    } else {
      const base = raw.replace(/\/$/, "");
      endpoint = base.toLowerCase().includes("/base")
        ? `${base}/LivingGuests.aspx?Action=1&hotelid=0&valuteid=1&cpw=true`
        : `${base}/Base/LivingGuests.aspx?Action=1&hotelid=0&valuteid=1&cpw=true`;
    }

    // Append credentials as query params (Servio uses login/pass, not Basic Auth)
    if (username || password) {
      const sep = endpoint.includes("?") ? "&" : "?";
      const params = new URLSearchParams();
      if (username) params.set("login", username);
      if (password) params.set("pass", password);
      return `${endpoint}${sep}${params.toString()}`;
    }

    return endpoint;
  }

  /** Test connection to Servio and return basic info */
  async testConnection(): Promise<ServioConnectionStatus> {
    const start = Date.now();

    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 800));
      return {
        success: true,
        servioVersion: "Servio HMS v14.2.1 (Demo)",
        hotelName: this.creds.hotelCode ? `Готель ${this.creds.hotelCode}` : "Demo Hotel",
        hotelCode: this.creds.hotelCode || "DEMO001",
        totalGuests: DEMO_GUEST_COUNT,
        totalBookings: DEMO_BOOKING_COUNT,
        totalRooms: DEMO_ROOM_COUNT,
        latencyMs: Date.now() - start,
      };
    }

    // Real mode: connect to Servio server
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const password = this.creds.apiKey;
      const testUrl = this.buildTestUrl(this.creds.username, password);

      const headers: Record<string, string> = {
        "Accept": "*/*",
        "User-Agent": "Maison-HD/1.0",
      };

      const res = await fetch(testUrl, { headers, signal: controller.signal });
      clearTimeout(timeout);

      const responseText = await res.text();
      const trimmed = responseText.trimStart();
      const isHtml = trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html");
      const isXml  = !isHtml && (trimmed.startsWith("<?xml") || (trimmed.startsWith("<") && !isHtml));

      // HTML response = login page or error page
      if (isHtml) {
        const statusNote = res.status === 401 || res.status === 403
          ? `Помилка авторизації (HTTP ${res.status})`
          : `Сервер повернув HTML-сторінку (HTTP ${res.status})`;
        return {
          success: false,
          error: `${statusNote} — перевірте URL, логін та пароль`,
          latencyMs: Date.now() - start,
        };
      }

      // XML response — Servio native format
      if (isXml) {
        // Count records in XML (guests/rows)
        const rowMatches = responseText.match(/<(?:Guest|Row|Record|Booking|Item)\b[^>]*>/gi) || [];
        return {
          success: true,
          servioVersion: "Servio HMS",
          hotelName: this.creds.hotelCode ? `Готель ${this.creds.hotelCode}` : "Підключено",
          hotelCode: this.creds.hotelCode,
          totalGuests: rowMatches.length || undefined,
          latencyMs: Date.now() - start,
        };
      }

      // Try JSON fallback
      try {
        const data = JSON.parse(responseText);
        return {
          success: true,
          servioVersion: data.version || "Servio HMS",
          hotelName: data.name || this.creds.hotelCode || "Підключено",
          hotelCode: data.code || this.creds.hotelCode,
          totalGuests: data.stats?.guests,
          totalBookings: data.stats?.bookings,
          totalRooms: data.stats?.rooms,
          latencyMs: Date.now() - start,
        };
      } catch {
        // Got some response but can't parse it — still treat as connected
        return {
          success: true,
          servioVersion: "Servio HMS",
          hotelName: this.creds.hotelCode || "Підключено",
          hotelCode: this.creds.hotelCode,
          latencyMs: Date.now() - start,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.name === "AbortError"
          ? "Timeout (10с) — сервер не відповів. Перевірте URL та мережу."
          : `Помилка з'єднання: ${err.message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  /** Fetch a preview of available data (counts + small samples) */
  async previewData(): Promise<ServioPreviewData> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 1200));
      const activeBookings = Math.round(DEMO_BOOKING_COUNT * 0.05);
      const futureBookings = Math.round(DEMO_BOOKING_COUNT * 0.15);
      const ratePlans = generateRatePlans();
      const companies = generateCompanies(5);
      const guests  = Array.from({ length: 8 }, (_, i) => generateGuest(i));
      const rooms   = Array.from({ length: 6 }, (_, i) => generateRoom(i));
      const bookings = Array.from({ length: 10 }, (_, i) => generateBooking(i));

      return {
        hotel: {
          name: this.creds.hotelCode ? `Готель ${this.creds.hotelCode}` : "Demo Resort",
          code: this.creds.hotelCode || "DEMO001",
          rooms: DEMO_ROOM_COUNT,
        },
        counts: {
          guests: DEMO_GUEST_COUNT,
          bookings: DEMO_BOOKING_COUNT,
          activeBookings,
          futureBookings,
          historicalBookings: DEMO_BOOKING_COUNT - activeBookings - futureBookings,
          rooms: DEMO_ROOM_COUNT,
          ratePlans: ratePlans.length,
          companies: companies.length,
          services: 1870,
          payments: 2940,
        },
        samples: { guests, bookings, rooms, ratePlans, companies },
      };
    }

    // Real Servio API calls would go here
    throw new Error("Real Servio connection not yet implemented. Use demo mode.");
  }

  /** Fetch all guests from Servio (paginated) */
  async fetchGuests(page = 0, pageSize = 100): Promise<{ items: ServioGuest[]; total: number }> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 300));
      const total = DEMO_GUEST_COUNT;
      const start = page * pageSize;
      const count = Math.max(0, Math.min(pageSize, total - start));
      const items = Array.from({ length: count }, (_, k) => generateGuest(start + k));
      return { items, total };
    }
    throw new Error("Not implemented for live mode");
  }

  /** Fetch all bookings from Servio */
  async fetchBookings(
    page = 0,
    pageSize = 100,
    dateFrom?: string,
    dateTo?: string
  ): Promise<{ items: ServioBooking[]; total: number }> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 400));
      const total = DEMO_BOOKING_COUNT;
      const start = page * pageSize;
      const count = Math.max(0, Math.min(pageSize, total - start));
      const items = Array.from({ length: count }, (_, k) => generateBooking(start + k));
      return { items, total };
    }
    throw new Error("Not implemented for live mode");
  }

  /** Fetch all rooms from Servio */
  async fetchRooms(): Promise<ServioRoom[]> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 200));
      return Array.from({ length: DEMO_ROOM_COUNT }, (_, i) => generateRoom(i));
    }
    throw new Error("Not implemented for live mode");
  }

  /** Fetch all rate plans */
  async fetchRatePlans(): Promise<ServioRatePlan[]> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 150));
      return generateRatePlans();
    }
    throw new Error("Not implemented for live mode");
  }

  /** Fetch all companies/corporate clients */
  async fetchCompanies(): Promise<ServioCompany[]> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 200));
      return generateCompanies(8);
    }
    throw new Error("Not implemented for live mode");
  }
}

// ── MAPPING FUNCTIONS ────────────────────────────────────────────
// Transform Servio data to internal HMS format

export function mapServioGuestToInternal(g: ServioGuest) {
  return {
    firstName: g.firstName,
    lastName: g.lastName,
    phone: g.phone,
    email: g.email,
    notes: [g.notes, g.tags?.join(", ")].filter(Boolean).join(" | ") || null,
    // Deduplication keys
    _dedup: {
      phone: g.phone,
      email: g.email,
      name: `${g.lastName}${g.firstName}`.toLowerCase().replace(/\s/g, ""),
    },
    _external: {
      system: "servio",
      id: g.id,
      data: g,
    },
  };
}

export function mapServioBookingToInternal(b: ServioBooking, unitIdMap: Record<string, number>, guestIdMap: Record<string, number>) {
  const statusMap: Record<string, string> = {
    "Confirmed": "confirmed",
    "CheckedIn": "checked_in",
    "CheckedOut": "checked_out",
    "Cancelled": "cancelled",
    "NoShow": "cancelled",
  };
  return {
    unitId: unitIdMap[b.roomNumber || ""] || null,
    guestId: guestIdMap[b.guestId] || null,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: statusMap[b.status] || "pending",
    adults: b.adults,
    totalAmount: b.totalAmount,
    paidAmount: b.paidAmount,
    source: b.source?.toLowerCase().includes("booking") ? "booking" : b.source?.toLowerCase().includes("airbnb") ? "airbnb" : "direct",
    notes: b.notes,
    _external: {
      system: "servio",
      id: b.id,
      data: b,
    },
  };
}

export function mapServioRoomToUnit(r: ServioRoom, propertyId: number) {
  return {
    name: `Кімната ${r.number}`,
    description: r.type,
    category: r.type,
    propertyId,
    maxCapacity: r.capacity,
    isActive: r.status !== "Maintenance",
    _external: {
      system: "servio",
      id: r.id,
      data: r,
    },
  };
}
