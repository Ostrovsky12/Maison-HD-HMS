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

const UA_LAST_NAMES = ["Іванченко", "Петренко", "Коваленко", "Бондаренко", "Шевченко", "Ткаченко", "Кравченко", "Олійник", "Мороз", "Лисенко", "Хоменко", "Білоус", "Данченко", "Гончар", "Захарченко"];
const UA_FIRST_NAMES_M = ["Олексій", "Михайло", "Дмитро", "Сергій", "Андрій", "Василь", "Ігор", "Олег", "Павло", "Роман"];
const UA_FIRST_NAMES_F = ["Олена", "Наталія", "Тетяна", "Ірина", "Марія", "Юлія", "Оксана", "Людмила", "Вікторія", "Анна"];
const SOURCES = ["Booking.com", "Телефон", "Сайт", "Instagram", "Прямий", "Telegram", "Expedia", "Airbnb"];
const RATE_PLANS = ["Стандартний", "Ранній заїзд", "Пізній виїзд", "Сніданок включено", "Повний пансіон", "Без повернення", "Корпоративний"];
const ROOM_TYPES = ["Стандарт", "Комфорт", "Делюкс", "Люкс", "Сімейний", "Будинок", "Бунгало", "Студія"];
const SERVICE_CATS = ["Харчування", "SPA", "Трансфер", "Оренда", "Розваги", "Інше"];
const SERVICES = ["Сніданок", "Обід", "Вечеря", "Масаж класичний", "Масаж спортивний", "Велосипед", "Вудки", "Трансфер зі Львова", "Трансфер до Києва", "SPA-процедура", "Дитячий стілець", "Барбекю"];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone(): string {
  return `+380${randomInt(50, 99)}${randomInt(1000000, 9999999)}`;
}

function randomDate(daysAgo: number, daysRange: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo + randomInt(0, daysRange));
  return d.toISOString().split("T")[0];
}

function generateGuests(count: number): ServioGuest[] {
  return Array.from({ length: count }, (_, i) => {
    const isMale = Math.random() > 0.5;
    const lastName = randomItem(UA_LAST_NAMES);
    const firstName = isMale ? randomItem(UA_FIRST_NAMES_M) : randomItem(UA_FIRST_NAMES_F);
    const totalStays = randomInt(1, 20);
    return {
      id: `SRV-G-${String(i + 1).padStart(5, "0")}`,
      lastName,
      firstName,
      middleName: isMale ? "Олексійович" : "Олексіївна",
      phone: randomPhone(),
      email: `${lastName.toLowerCase().replace(/[іїє]/g, "i")}${i + 1}@gmail.com`,
      birthDate: `${randomInt(1960, 2000)}-${String(randomInt(1, 12)).padStart(2, "0")}-${String(randomInt(1, 28)).padStart(2, "0")}`,
      nationality: "UA",
      category: randomItem(["Regular", "Regular", "Regular", "VIP", "Corporate"]),
      totalStays,
      firstStayDate: randomDate(totalStays * 180, 30),
      lastStayDate: randomDate(30, 25),
      totalRevenue: randomInt(1500, 120000),
      tags: Math.random() > 0.7 ? [randomItem(["VIP", "Постійний", "Корпоратив", "Повторний"])] : [],
      notes: Math.random() > 0.8 ? "Алергія на горіхи" : undefined,
      createdAt: new Date(Date.now() - randomInt(100, 1000) * 86400000).toISOString(),
    } as ServioGuest;
  });
}

function generateRooms(count: number): ServioRoom[] {
  return Array.from({ length: count }, (_, i) => {
    const type = randomItem(ROOM_TYPES);
    return {
      id: `SRV-R-${String(i + 1).padStart(3, "0")}`,
      number: `${randomInt(1, 3)}${String(i + 1).padStart(2, "0")}`,
      type,
      category: type,
      floor: randomInt(1, 3),
      capacity: type.includes("Сімейний") || type.includes("Будинок") ? randomInt(3, 6) : randomInt(1, 3),
      baseRate: randomInt(800, 5000),
      status: randomItem(["Available", "Available", "Available", "Occupied", "Maintenance"]),
    } as ServioRoom;
  });
}

function generateRatePlans(): ServioRatePlan[] {
  return RATE_PLANS.map((name, i) => ({
    id: `SRV-RATE-${i + 1}`,
    name,
    code: name.toUpperCase().replace(/\s+/g, "_").substring(0, 8),
    type: i === 0 ? "BAR" : i < 4 ? "Package" : "Corporate",
    amount: randomInt(700, 4500),
    currency: "UAH",
    minNights: randomInt(1, 3),
    isActive: true,
  }));
}

function generateBookings(guests: ServioGuest[], rooms: ServioRoom[], count: number): ServioBooking[] {
  return Array.from({ length: count }, (_, i) => {
    const guest = guests[randomInt(0, guests.length - 1)];
    const room = rooms[randomInt(0, rooms.length - 1)];
    const checkInDays = randomInt(-200, 60); // mix of past/future
    const nights = randomInt(1, 7);
    const checkIn = randomDate(0, 0);
    const checkInDate = new Date();
    checkInDate.setDate(checkInDate.getDate() + checkInDays);
    const checkOutDate = new Date(checkInDate);
    checkOutDate.setDate(checkOutDate.getDate() + nights);
    const totalAmount = room.baseRate! * nights * randomInt(85, 115) / 100;
    const isPaid = Math.random() > 0.3;
    const paidAmount = isPaid ? totalAmount : totalAmount * randomInt(0, 8) / 10;
    const isPast = checkInDays < -nights;
    const isFuture = checkInDays > 0;
    const status = isPast
      ? randomItem(["CheckedOut", "CheckedOut", "CheckedOut", "Cancelled", "NoShow"])
      : isFuture
        ? randomItem(["Confirmed", "Confirmed", "Confirmed"])
        : randomItem(["CheckedIn", "CheckedIn"]);

    const services: ServioService[] = Math.random() > 0.5
      ? Array.from({ length: randomInt(1, 4) }, (_, si) => ({
          id: `SRV-SVC-${i}-${si}`,
          bookingId: `SRV-B-${i + 1}`,
          name: randomItem(SERVICES),
          category: randomItem(SERVICE_CATS),
          quantity: randomInt(1, 3),
          amount: randomInt(50, 800),
          date: checkInDate.toISOString().split("T")[0],
        }))
      : [];

    return {
      id: `SRV-B-${String(i + 1).padStart(5, "0")}`,
      confirmationNumber: `HB${String(randomInt(10000, 99999))}`,
      guestId: guest.id,
      guestName: `${guest.lastName} ${guest.firstName}`,
      roomNumber: room.number,
      roomType: room.type,
      checkIn: checkInDate.toISOString().split("T")[0],
      checkOut: checkOutDate.toISOString().split("T")[0],
      status,
      adults: randomInt(1, room.capacity),
      children: Math.random() > 0.7 ? randomInt(1, 2) : 0,
      totalAmount: Math.round(totalAmount),
      paidAmount: Math.round(paidAmount),
      balance: Math.round(totalAmount - paidAmount),
      source: randomItem(SOURCES),
      ratePlan: randomItem(RATE_PLANS),
      notes: Math.random() > 0.7 ? "Алергія на пил" : undefined,
      services,
      payments: isPaid ? [{
        id: `SRV-PAY-${i}`,
        bookingId: `SRV-B-${i + 1}`,
        amount: Math.round(paidAmount),
        type: randomItem(["LiqPay", "Готівка", "Термінал"]),
        status: "Paid",
        date: checkInDate.toISOString().split("T")[0],
      }] : [],
      createdAt: new Date(checkInDate.getTime() - randomInt(1, 30) * 86400000).toISOString(),
    } as ServioBooking;
  });
}

function generateCompanies(count: number): ServioCompany[] {
  const companies = ["ТОВ «Альфа Буд»", "ДП «Укртранс»", "ПП Мороз В.І.", "ТОВ «Зеленець»", "ФОП Петренко О.М.", "АТ «Карпатські мінводи»", "ТОВ «Медіагруп»", "ПП «Сонячний край»"];
  return companies.slice(0, count).map((name, i) => ({
    id: `SRV-COMP-${i + 1}`,
    name,
    taxId: String(randomInt(10000000, 99999999)),
    address: `м. Київ, вул. ${randomItem(["Хрещатик", "Лесі Українки", "Шевченка"])} ${randomInt(1, 100)}`,
    contactName: `${randomItem(UA_FIRST_NAMES_M)} ${randomItem(UA_LAST_NAMES)}`,
    phone: randomPhone(),
    email: `contracts@company${i + 1}.ua`,
    discount: randomItem([5, 10, 15, 0, 0]),
    creditLimit: randomInt(5000, 50000),
  }));
}

// ── SERVIO ADAPTER CLASS ─────────────────────────────────────────

export class ServioAdapter {
  private creds: ServioCredentials;
  private isDemoMode: boolean;

  constructor(creds: ServioCredentials) {
    this.creds = creds;
    // Demo mode if no real credentials provided, or URL contains "demo"
    this.isDemoMode = !creds.baseUrl || creds.baseUrl.includes("demo") || creds.baseUrl === "demo";
  }

  /** Test connection to Servio and return basic info */
  async testConnection(): Promise<ServioConnectionStatus> {
    const start = Date.now();

    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 800)); // simulate latency
      return {
        success: true,
        servioVersion: "Servio HMS v14.2.1",
        hotelName: this.creds.hotelCode ? `Готель ${this.creds.hotelCode}` : "Demo Hotel",
        hotelCode: this.creds.hotelCode || "DEMO001",
        totalGuests: randomInt(450, 2000),
        totalBookings: randomInt(1200, 5000),
        totalRooms: randomInt(20, 150),
        latencyMs: Date.now() - start,
      };
    }

    // Real mode: attempt HTTP connection
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${this.creds.baseUrl}/api/v1/hotel/info`, {
        headers: {
          "X-Api-Key": this.creds.apiKey || "",
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}`, latencyMs: Date.now() - start };
      }

      const data = await res.json();
      return {
        success: true,
        servioVersion: data.version,
        hotelName: data.name,
        hotelCode: data.code,
        totalGuests: data.stats?.guests,
        totalBookings: data.stats?.bookings,
        totalRooms: data.stats?.rooms,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.name === "AbortError" ? "Connection timeout (5s)" : err.message,
        latencyMs: Date.now() - start,
      };
    }
  }

  /** Fetch a preview of available data (counts + small samples) */
  async previewData(): Promise<ServioPreviewData> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 1200));
      const guestCount = randomInt(450, 1800);
      const roomCount = randomInt(30, 120);
      const bookingCount = randomInt(1200, 5000);
      const guests = generateGuests(Math.min(guestCount, 8));
      const rooms = generateRooms(Math.min(roomCount, 6));
      const bookings = generateBookings(guests, rooms, Math.min(bookingCount, 10));
      const ratePlans = generateRatePlans();
      const companies = generateCompanies(5);
      const activeBookings = Math.round(bookingCount * 0.05);
      const futureBookings = Math.round(bookingCount * 0.15);

      return {
        hotel: {
          name: this.creds.hotelCode ? `Готель ${this.creds.hotelCode}` : "Demo Resort",
          code: this.creds.hotelCode || "DEMO001",
          rooms: roomCount,
        },
        counts: {
          guests: guestCount,
          bookings: bookingCount,
          activeBookings,
          futureBookings,
          historicalBookings: bookingCount - activeBookings - futureBookings,
          rooms: roomCount,
          ratePlans: ratePlans.length,
          companies: companies.length,
          services: randomInt(500, 3000),
          payments: randomInt(900, 4000),
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
      const total = randomInt(450, 1800);
      const items = generateGuests(Math.min(pageSize, total - page * pageSize));
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
      const rooms = generateRooms(40);
      const guests = generateGuests(50);
      const total = randomInt(500, 3000);
      const items = generateBookings(guests, rooms, Math.min(pageSize, total - page * pageSize));
      return { items, total };
    }
    throw new Error("Not implemented for live mode");
  }

  /** Fetch all rooms from Servio */
  async fetchRooms(): Promise<ServioRoom[]> {
    if (this.isDemoMode) {
      await new Promise(r => setTimeout(r, 200));
      return generateRooms(randomInt(30, 80));
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
      return generateCompanies(randomInt(5, 30));
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
