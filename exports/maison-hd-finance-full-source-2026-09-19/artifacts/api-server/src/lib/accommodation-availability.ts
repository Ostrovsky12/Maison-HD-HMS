type AvailabilityFailure = {
  ok: false;
  status: 404 | 409;
  message: string;
};

export async function lockAndAssertUnitAvailability(
  client: any,
  unitId: number,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: number,
): Promise<{ ok: true } | AvailabilityFailure> {
  const lockedUnit = await client.query("SELECT id FROM units WHERE id = $1 FOR UPDATE", [unitId]);
  if (!lockedUnit.rows.length) {
    return { ok: false, status: 404, message: "Номер не знайдено" };
  }

  const overlap = await client.query(
    `SELECT id FROM bookings
     WHERE unit_id = $1
       AND status IN ('pending', 'confirmed', 'checked_in')
       AND ($4::int IS NULL OR id <> $4)
       AND check_in < $3::date
       AND check_out > $2::date
     LIMIT 1`,
    [unitId, checkIn, checkOut, excludeBookingId ?? null],
  );
  if (overlap.rows.length) {
    return { ok: false, status: 409, message: "Номер вже зайнятий на вибрані дати" };
  }

  const block = await client.query(
    `SELECT id FROM accommodation_blocks
     WHERE is_active = true
       AND $1 = ANY(ARRAY(SELECT jsonb_array_elements_text(unit_ids))::int[])
       AND start_date < $3::date
       AND end_date > $2::date
     LIMIT 1`,
    [unitId, checkIn, checkOut],
  );
  if (block.rows.length) {
    return { ok: false, status: 409, message: "Номер заблокований на вибрані дати" };
  }

  return { ok: true };
}

export async function lockUnitsAndAssertNoActiveBookings(
  client: any,
  unitIds: number[],
  startDate: string,
  endDate: string,
): Promise<{ ok: true } | AvailabilityFailure> {
  for (const unitId of [...unitIds].sort((a, b) => a - b)) {
    const lockedUnit = await client.query("SELECT id FROM units WHERE id = $1 FOR UPDATE", [unitId]);
    if (!lockedUnit.rows.length) {
      return { ok: false, status: 404, message: "Номер не знайдено" };
    }
    const activeBooking = await client.query(
      `SELECT id FROM bookings
       WHERE unit_id = $1
         AND status IN ('pending', 'confirmed', 'checked_in')
         AND check_in < $3::date
         AND check_out > $2::date
       LIMIT 1`,
      [unitId, startDate, endDate],
    );
    if (activeBooking.rows.length) {
      return { ok: false, status: 409, message: "Неможливо заблокувати номер з активним бронюванням на ці дати" };
    }
  }
  return { ok: true };
}