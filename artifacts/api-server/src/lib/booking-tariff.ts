export const BOOKING_TARIFF_POLICY = {
  version: "nonrefundable-100-v1",
  prepaymentPercent: 100,
  nonRefundable: true,
  dateChangesAllowed: false,
  acknowledgementText: "Я ознайомився/-лася з правилами та погоджуюся з умовами неповоротного тарифу: оплата становить 100% вартості бронювання; повернення коштів і зміна дат не передбачені, крім випадків, установлених законодавством.",
} as const;

export function acceptsBookingTariff(body: any): boolean {
  return body?.agreeNonRefundable === true && body?.tariffPolicyVersion === BOOKING_TARIFF_POLICY.version;
}

export async function bookingMerchant(orgId: number, unitId: number, client: any, lock = false) {
  return (await client.query(`SELECT le.id,le.liqpay_public_key,le.liqpay_private_key
    FROM units u JOIN properties p ON p.id=u.property_id
    JOIN legal_entities le ON le.id=p.legal_entity_id AND le.organization_id=p.organization_id
    WHERE u.id=$1 AND p.organization_id=$2 AND le.is_active=true${lock ? " FOR SHARE OF p,le" : ""}`, [unitId, orgId])).rows[0] ?? null;
}
