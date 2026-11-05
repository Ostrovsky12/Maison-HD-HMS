import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import type { BookingServioReservationInput, BookingServioSearchResult } from "@workspace/api-zod";
import { servioBaseUrl, servioReadRequest, type ServioReadRequest } from "./servio-connection.js";
import type { Attempt, ReservationConnection } from "./servio-reservations.js";

export class ServioInventoryConflict extends Error {
  constructor(readonly code: "SOLD_OUT" | "INVENTORY_BUSY" | "INVENTORY_UNCERTAIN") { super(code); }
}
export const servioInventoryKey = (connection: Pick<ReservationConnection, "base" | "hotelId">, categoryId: number) =>
  createHash("sha256").update(JSON.stringify([servioBaseUrl(connection.base), connection.hotelId, categoryId])).digest("hex");

export function stayNights(checkIn: string, checkOut: string): string[] {
  const start = Date.parse(checkIn), end = Date.parse(checkOut), count = (end - start) / 86_400_000;
  if (!Number.isInteger(count) || count < 1 || count > 31
    || new Date(start).toISOString().slice(0, 10) !== checkIn || new Date(end).toISOString().slice(0, 10) !== checkOut)
    throw new ServioInventoryConflict("INVENTORY_UNCERTAIN");
  return Array.from({ length: count }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

/** Only reads stock, not prices. A missing/ambiguous count must never mean a spare room. */
export async function readNightStock(connection: ReservationConnection, input: BookingServioReservationInput,
  read: ServioReadRequest = servioReadRequest): Promise<Map<string, number>> {
  const nights = stayNights(input.checkIn, input.checkOut), stock = new Map<string, number>();
  // Bounded parallelism: long stays must not flood the PMS or consume DB pool connections.
  for (let index = 0; index < nights.length; index += 4) {
    await Promise.all(nights.slice(index, index + 4).map(async day => {
      const departure = new Date(Date.parse(day) + 86_400_000).toISOString().slice(0, 10);
      const raw: any = await read(connection.base, connection.token, "GetRooms", {
        HotelID: connection.hotelId, DateArrival: day, DateDeparture: departure,
        TimeArrival: connection.checkInTime, TimeDeparture: connection.checkOutTime,
        Adults: input.adults, Childs: input.childAges.length, ChildAges: input.childAges,
        IsExtraBedUsed: input.useExtraBed, CompanyCodeID: input.companyCodeId, IsoLanguage: "uk",
      });
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.Result !== 0 || !Array.isArray(raw.RoomTypes))
        throw new ServioInventoryConflict("INVENTORY_UNCERTAIN");
      const matching = raw.RoomTypes.filter((row: any) => row?.ID === input.categoryId);
      if (matching.length !== 1 || !Number.isSafeInteger(matching[0].FreeRoom) || matching[0].FreeRoom < 0)
        throw new ServioInventoryConflict("INVENTORY_UNCERTAIN");
      stock.set(day, matching[0].FreeRoom);
    }));
  }
  return stock;
}

type Database = Pick<typeof pool, "connect">;
/** Session lock + autocommitted attempts: an ambiguous provider write survives a crash.
 * All writes use this SAME connection, avoiding pool starvation while a lock is held.
 * The per-night quota is deliberately conservative: never infer that an increase
 * in provider stock proves all our holds have become visible there.
 */
export async function withServioInventory(
  orgId: number, input: BookingServioReservationInput, connection: ReservationConnection, requestHash: string,
  create: (client: any) => Promise<Attempt>, db: Database = pool, read: ServioReadRequest = servioReadRequest,
): Promise<Attempt> {
  const key = servioInventoryKey(connection, input.categoryId);
  const lockId = Buffer.from(key.slice(0, 16), "hex").readBigInt64BE().toString();
  const client = await db.connect();
  let locked = false;
  let destroy = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock($1::bigint) AS locked", [lockId])).rows[0]?.locked === true;
    // Retrying an existing attempt does not consume another place, even if sold out.
    const prior = (await client.query("SELECT * FROM servio_booking_attempts WHERE organization_id=$1 AND request_id=$2",
      [orgId, input.requestId])).rows[0];
    if (prior) {
      if (prior.request_hash !== requestHash) throw new Error("request_conflict");
      return prior;
    }
    if (!locked) throw new ServioInventoryConflict("INVENTORY_BUSY");
    const nights = stayNights(input.checkIn, input.checkOut);
    // Old attempts have no quota snapshot. Do not silently assume their provider writes are already visible.
    const legacy = (await client.query(`SELECT id FROM servio_booking_attempts WHERE organization_id=$1
      AND inventory_key IS NULL AND state NOT IN ('failed','cancelled')
      AND (payload->'input'->>'categoryId')::int=$2
      AND payload->'input'->>'checkIn'<$4 AND payload->'input'->>'checkOut'>$3 LIMIT 1`,
      [orgId, input.categoryId, input.checkIn, input.checkOut])).rows;
    if (legacy.length) throw new ServioInventoryConflict("INVENTORY_UNCERTAIN");
    const active = (await client.query(`SELECT payload->'input'->>'checkIn' AS arrival,
      payload->'input'->>'checkOut' AS departure FROM servio_booking_attempts
      WHERE inventory_key=$1 AND state NOT IN ('failed','cancelled')
        AND payload->'input'->>'checkIn'<$3 AND payload->'input'->>'checkOut'>$2`,
      [key, input.checkIn, input.checkOut])).rows;
    const used = new Map(nights.map(day => [day, active.filter(row => row.arrival <= day && day < row.departure).length]));
    const capacities = (await client.query(`SELECT to_char(stay_date,'YYYY-MM-DD') AS day,capacity
      FROM servio_inventory_days WHERE inventory_key=$1 AND stay_date>=$2::date AND stay_date<$3::date`,
      [key, input.checkIn, input.checkOut])).rows;
    const limits = new Map(capacities.map(row => [row.day, row.capacity as number]));
    let stock: Map<string, number>;
    try { stock = await readNightStock(connection, input, read); }
    catch { throw new ServioInventoryConflict("INVENTORY_UNCERTAIN"); }
    for (const day of nights) {
      const occupied = used.get(day)!, available = stock.get(day)!;
      let capacity = limits.get(day);
      if (!occupied) {
        // With no active local holds a fresh epoch can follow cancellations/new PMS inventory.
        capacity = available;
        await client.query(`INSERT INTO servio_inventory_days(inventory_key,stay_date,capacity) VALUES($1,$2::date,$3)
          ON CONFLICT(inventory_key,stay_date) DO UPDATE SET capacity=excluded.capacity`, [key, day, capacity]);
      }
      if (capacity == null || !Number.isSafeInteger(capacity)) throw new ServioInventoryConflict("INVENTORY_UNCERTAIN");
      if (available < 1 || occupied >= capacity) throw new ServioInventoryConflict("SOLD_OUT");
    }
    return await create(client);
  } finally {
    if (locked) {
      try {
        const result = await client.query("SELECT pg_advisory_unlock($1::bigint) AS unlocked", [lockId]);
        if (result.rows[0]?.unlocked !== true) destroy = true;
      } catch { destroy = true; }
    }
    client.release(destroy);
  }
}

export function servioInventoryError(error: unknown) {
  if (!(error instanceof ServioInventoryConflict)) return null;
  return { code: error.code, error: error.code === "SOLD_OUT"
    ? "На ці дати вже немає вільного місця в обраній категорії. Оновіть пошук і оберіть інший варіант. Бронювання й оплату не створено."
    : error.code === "INVENTORY_BUSY"
      ? "Інший гість зараз бронює цю категорію. Зачекайте кілька секунд і повторіть той самий запит; оплату не починайте."
      : "Наявність місця потребує звірки із Servio. Нове бронювання й оплату не створено. Спробуйте пізніше або зверніться до готелю." };
}

/** Search is advisory; final admission is locked. Do not offer known local holds
 * as free stock, and do not subtract a hold twice when Servio already reflects it.
 */
export async function applyServioLocalCapacity(snapshot: BookingServioSearchResult,
  connection: Pick<ReservationConnection, "base" | "hotelId">, client: Pick<typeof pool, "query"> = pool) {
  if (!snapshot.categories.length) return snapshot;
  const keys = snapshot.categories.map(category => servioInventoryKey(connection, category.id));
  const rows = (await client.query(`SELECT d.inventory_key,d.capacity,
    (SELECT count(*)::int FROM servio_booking_attempts a WHERE a.inventory_key=d.inventory_key
      AND a.state NOT IN ('failed','cancelled') AND a.payload->'input'->>'checkIn'<=to_char(d.stay_date,'YYYY-MM-DD')
      AND a.payload->'input'->>'checkOut'>to_char(d.stay_date,'YYYY-MM-DD')) AS used
    FROM servio_inventory_days d WHERE d.inventory_key=ANY($1::text[])
      AND d.stay_date>=$2::date AND d.stay_date<$3::date`,
    [keys, snapshot.query.checkIn, snapshot.query.checkOut])).rows;
  for (let i = 0; i < snapshot.categories.length; i++) {
    const category = snapshot.categories[i];
    for (const row of rows) {
      if (row.inventory_key === keys[i] && row.used > 0)
        category.freeRooms = Math.min(category.freeRooms, Math.max(0, row.capacity - row.used));
    }
  }
  return snapshot;
}
