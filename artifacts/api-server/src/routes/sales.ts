/**
 * Sales & Communication API
 * Leads CRM · Channels · Campaigns · Upsells · Booking Widget · Repeat Sales
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { bookingsTable, guestsTable, conversationsTable, unitsTable } from "@workspace/db";
import { eq, sql, desc, and, or, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// ─── SUMMARY / FUNNEL KPIs ────────────────────────────────────────────────────
router.get("/summary", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;

    const [leads, funnel, sourceRevenue, campaigns, upsells, topLeads, channelStats] = await Promise.all([
      // Lead totals by status
      db.execute(sql`
        SELECT status::text, COUNT(*) as cnt,
          SUM(estimated_value) as total_value,
          SUM(quoted_amount) as total_quoted
        FROM leads WHERE organization_id = ${orgId}
        GROUP BY status
      `),
      // Funnel conversion
      db.execute(sql`
        SELECT
          COUNT(*) as total_leads,
          SUM(CASE WHEN status::text != 'lost' AND status::text != 'spam' THEN 1 ELSE 0 END) as active_leads,
          SUM(CASE WHEN status::text = 'booked' THEN 1 ELSE 0 END) as converted,
          SUM(CASE WHEN status::text = 'booked' THEN COALESCE(estimated_value,0) ELSE 0 END) as converted_value,
          SUM(CASE WHEN status::text = 'lost' THEN 1 ELSE 0 END) as lost,
          AVG(CASE WHEN status::text = 'booked'
            THEN EXTRACT(EPOCH FROM (booked_at - created_at))/3600 END) as avg_hours_to_book
        FROM leads WHERE organization_id = ${orgId}
      `),
      // Revenue by booking source
      db.execute(sql`
        SELECT b.source::text as source, COUNT(*) as bookings,
          SUM(b.total_amount) as revenue,
          AVG(b.total_amount) as avg_value
        FROM bookings b
        JOIN units u ON u.id = b.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = ${orgId}
        GROUP BY b.source ORDER BY revenue DESC
      `),
      // Campaign stats
      db.execute(sql`
        SELECT COUNT(*) as total, SUM(sent_count) as total_sent,
          SUM(booked_count) as total_booked,
          SUM(revenue_generated) as total_revenue
        FROM sales_campaigns WHERE organization_id = ${orgId}
      `),
      // Upsell stats
      db.execute(sql`
        SELECT status, COUNT(*) as cnt, SUM(price) as total_price
        FROM upsell_offers WHERE organization_id = ${orgId}
        GROUP BY status
      `),
      // Top leads by value
      db.execute(sql`
        SELECT id, source::text, status::text, first_name, last_name, phone, email,
          subject, estimated_value, quoted_amount, priority, ai_score,
          check_in_date, check_out_date, guests_count, follow_up_at, created_at
        FROM leads WHERE organization_id = ${orgId}
          AND status::text NOT IN ('booked','lost','spam')
        ORDER BY COALESCE(estimated_value,0) DESC, ai_score DESC LIMIT 5
      `),
      // Conversations by channel
      db.execute(sql`
        SELECT channel::text, COUNT(*) as cnt,
          SUM(CASE WHEN status::text = 'open' THEN 1 ELSE 0 END) as open_cnt,
          SUM(unread_count) as unread
        FROM conversations WHERE organization_id = ${orgId}
        GROUP BY channel
      `),
    ]);

    res.json({
      leadsByStatus: leads.rows,
      funnel: funnel.rows[0] || {},
      sourceRevenue: sourceRevenue.rows,
      campaigns: campaigns.rows[0] || {},
      upsells: upsells.rows,
      topLeads: topLeads.rows,
      channelStats: channelStats.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── LEADS LIST ───────────────────────────────────────────────────────────────
router.get("/leads", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { status, source, search, priority, limit: lim } = req.query as any;

    const conds: ReturnType<typeof sql>[] = [sql`l.organization_id = ${orgId}`];
    const validStatuses = ['new','contacted','qualified','quote_sent','negotiating','booked','lost','spam'];
    const validSources = ['phone','telegram','instagram','website','booking_com','airbnb','expedia','direct','referral','repeat','other'];
    if (status && validStatuses.includes(status)) conds.push(sql`l.status::text = ${status}`);
    if (source && validSources.includes(source)) conds.push(sql`l.source::text = ${source}`);
    if (priority && ['high','medium','low'].includes(priority)) conds.push(sql`l.priority = ${priority}`);
    if (search) conds.push(sql`(l.first_name ILIKE ${"%" + search + "%"} OR l.last_name ILIKE ${"%" + search + "%"} OR l.email ILIKE ${"%" + search + "%"} OR l.phone ILIKE ${"%" + search + "%"} OR l.subject ILIKE ${"%" + search + "%"})`);

    const whereSql = conds.reduce((acc, s, i) => i === 0 ? sql`WHERE ${s}` : sql`${acc} AND ${s}`, sql``);

    const leads = await db.execute(sql`
      SELECT l.*,
        u.name as assigned_name,
        c.unread_count as conv_unread
      FROM leads l
      LEFT JOIN users u ON u.id = l.assigned_to_id
      LEFT JOIN conversations c ON c.id = l.conversation_id
      ${whereSql}
      ORDER BY
        CASE l.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        l.created_at DESC
      LIMIT ${parseInt(lim) || 100}
    `);

    res.json({ leads: leads.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── CREATE LEAD ──────────────────────────────────────────────────────────────
router.post("/leads", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const userId: number = req.user?.id;
    const {
      source = "other", firstName, lastName, email, phone,
      subject, notes, checkIn, checkOut, guestsCount = 1,
      estimatedValue, priority = "medium",
    } = req.body;

    // Auto-compute AI score (heuristic)
    let aiScore = 50;
    if (email) aiScore += 10;
    if (phone) aiScore += 10;
    if (checkIn && checkOut) aiScore += 15;
    if (estimatedValue && estimatedValue > 10000) aiScore += 10;
    if (source === 'repeat') aiScore += 15;
    aiScore = Math.min(100, aiScore);

    const assignedId = userId ? userId : null;
    const insertResult = await db.execute(sql`
      INSERT INTO leads (organization_id, source, status, first_name, last_name, email, phone, subject, notes, check_in_date, check_out_date, guests_count, estimated_value, priority, ai_score, assigned_to_id, created_at, updated_at)
      VALUES (${orgId}, ${source}::lead_source, 'new', ${firstName ?? null}, ${lastName ?? null}, ${email ?? null}, ${phone ?? null}, ${subject ?? null}, ${notes ?? null}, ${checkIn ?? null}, ${checkOut ?? null}, ${guestsCount}, ${estimatedValue ?? null}, ${priority}, ${aiScore}, ${assignedId}, NOW(), NOW())
      RETURNING *
    `);
    const lead = insertResult.rows[0];

    res.status(201).json({ lead });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── UPDATE LEAD ──────────────────────────────────────────────────────────────
router.patch("/leads/:id", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId: number = req.user?.organizationId;
    const { status, quotedAmount, notes, followUpAt, assignedToId, lostReason, priority, estimatedValue } = req.body;

    const updates: string[] = ["updated_at = NOW()"];
    if (status) {
      updates.push(`status = '${status}'::lead_status`);
      if (status === 'contacted') updates.push(`contacted_at = NOW()`);
      if (status === 'quote_sent') updates.push(`quoted_at = NOW()`);
      if (status === 'booked') updates.push(`booked_at = NOW()`);
    }
    if (quotedAmount !== undefined) updates.push(`quoted_amount = ${quotedAmount}`);
    if (estimatedValue !== undefined) updates.push(`estimated_value = ${estimatedValue}`);
    if (notes !== undefined) updates.push(`notes = '${(notes || "").replace(/'/g, "''")}'`);
    if (lostReason) updates.push(`lost_reason = '${lostReason.replace(/'/g, "''")}'`);
    if (followUpAt) updates.push(`follow_up_at = '${followUpAt}'`);
    if (assignedToId !== undefined) updates.push(`assigned_to_id = ${assignedToId || "NULL"}`);
    if (priority) updates.push(`priority = '${priority}'`);

    const updResult = await db.execute(sql.raw(`UPDATE leads SET ${updates.join(", ")} WHERE id = ${id} AND organization_id = ${orgId} RETURNING *`));
    res.json({ lead: updResult.rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── CONVERT LEAD TO BOOKING ──────────────────────────────────────────────────
router.post("/leads/:id/convert", async (req: any, res) => {
  try {
    const leadId = parseInt(req.params.id);
    const { unitId, totalAmount, notes: bookingNotes } = req.body;

    const leadRes = await db.execute(sql`SELECT * FROM leads WHERE id = ${leadId}`);
    const lead = leadRes.rows[0] as any;
    if (!lead) return res.status(404).json({ error: "Лід не знайдено" });

    const ref = `L${leadId}-${Date.now().toString(36).toUpperCase()}`;
    const [booking] = await db.insert(bookingsTable).values({
      unitId: unitId || 1,
      bookingRef: ref,
      source: "direct" as any,
      status: "confirmed" as any,
      firstName: lead.first_name || "Guest",
      lastName: lead.last_name || "",
      email: lead.email || null,
      checkIn: lead.check_in_date ? new Date(lead.check_in_date) : new Date(),
      checkOut: lead.check_out_date ? new Date(lead.check_out_date) : new Date(Date.now() + 86400000),
      guestsCount: lead.guests_count || 1,
      totalAmount: (totalAmount || lead.quoted_amount || lead.estimated_value || 0).toString(),
      paidAmount: "0",
      paymentStatus: "unpaid" as any,
      notes: bookingNotes || lead.notes || "",
    } as any).returning();

    // Update lead
    await db.execute(sql`UPDATE leads SET status = 'booked', booking_id = ${booking.id}, booked_at = NOW(), updated_at = NOW() WHERE id = ${leadId}`);

    res.json({ booking, leadId });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── UPSELLS ─────────────────────────────────────────────────────────────────
router.get("/upsells", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, status } = req.query as any;

    const conds: ReturnType<typeof sql>[] = [sql`u.organization_id = ${orgId}`];
    if (bookingId) conds.push(sql`u.booking_id = ${parseInt(bookingId)}`);
    if (status) conds.push(sql`u.status = ${status}`);
    const whereSql = conds.reduce((acc, s, i) => i === 0 ? sql`WHERE ${s}` : sql`${acc} AND ${s}`, sql``);

    const upsells = await db.execute(sql`
      SELECT u.*, b.booking_ref,
        TRIM(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')) as guest_name,
        b.check_in
      FROM upsell_offers u
      LEFT JOIN bookings b ON b.id = u.booking_id
      ${whereSql}
      ORDER BY u.created_at DESC LIMIT 100
    `);

    const stats = await db.execute(sql`
      SELECT status, COUNT(*) as cnt, SUM(price) as total
      FROM upsell_offers WHERE organization_id = ${orgId}
      GROUP BY status
    `);

    res.json({ upsells: upsells.rows, stats: stats.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/upsells", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { bookingId, offerType, title, description, price, channel = "portal", validUntil } = req.body;

    const upsellRes = await db.execute(sql`
      INSERT INTO upsell_offers (organization_id, booking_id, offer_type, title, description, price, status, channel, valid_until, shown_at, created_at)
      VALUES (${orgId}, ${bookingId ?? null}, ${offerType || 'other'}, ${title}, ${description ?? null}, ${price ?? null}, 'pending', ${channel}, ${validUntil ?? null}, NOW(), NOW())
      RETURNING *
    `);
    res.status(201).json({ upsell: upsellRes.rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/upsells/:id/accept", async (req: any, res) => {
  try {
    await db.execute(sql`UPDATE upsell_offers SET status = 'accepted', accepted_at = NOW(), responded_at = NOW() WHERE id = ${parseInt(req.params.id)}`);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/upsells/:id/decline", async (req: any, res) => {
  try {
    await db.execute(sql`UPDATE upsell_offers SET status = 'declined', declined_at = NOW(), responded_at = NOW() WHERE id = ${parseInt(req.params.id)}`);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────
router.get("/campaigns", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const campaigns = await db.execute(sql`
      SELECT c.*, u.name as created_by_name
      FROM sales_campaigns c
      LEFT JOIN users u ON u.id = c.created_by_id
      WHERE c.organization_id = ${orgId}
      ORDER BY c.created_at DESC
    `);
    res.json({ campaigns: campaigns.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/campaigns", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const userId: number = req.user?.id;
    const { name, description, type = "email", targetSegment = "all", subject, messageTemplate, offerCode, discountPct, scheduledAt } = req.body;

    const creatorId = userId ? userId : null;
    const campaignRes = await db.execute(sql`
      INSERT INTO sales_campaigns (organization_id, name, description, type, status, target_segment, subject, message_template, offer_code, discount_pct, scheduled_at, created_by_id, created_at, updated_at)
      VALUES (${orgId}, ${name}, ${description ?? null}, ${type}, 'draft', ${targetSegment}, ${subject ?? null}, ${messageTemplate}, ${offerCode ?? null}, ${discountPct ?? null}, ${scheduledAt ?? null}, ${creatorId}, NOW(), NOW())
      RETURNING *
    `);
    res.status(201).json({ campaign: campaignRes.rows[0] });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/campaigns/:id/send", async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const orgId: number = req.user?.organizationId;

    // Simulate sending (calculate recipient count based on target_segment)
    const campRes = await db.execute(sql`SELECT * FROM sales_campaigns WHERE id = ${id} AND organization_id = ${orgId}`);
    const camp = campRes.rows[0] as any;
    if (!camp) return res.status(404).json({ error: "Кампанію не знайдено" });

    // Get recipient count based on segment
    const countRes = await db.execute(sql`
      SELECT COUNT(DISTINCT g.id) as cnt
      FROM guests g
      JOIN bookings b ON b.guest_id = g.id
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE p.organization_id = ${orgId}
        AND (g.email IS NOT NULL OR g.phone IS NOT NULL)
        ${camp.target_segment === 'repeat_guests' ? sql`AND (SELECT COUNT(*) FROM bookings b2 WHERE b2.guest_id = g.id) > 1` : sql``}
    `);
    const count = parseInt((countRes.rows[0] as any)?.cnt || "0");
    const simulatedOpened = Math.round(count * 0.72);
    const simulatedClicked = Math.round(simulatedOpened * 0.46);

    await db.execute(sql`
      UPDATE sales_campaigns
      SET status = 'sent', sent_at = NOW(), sent_count = ${count},
          opened_count = ${simulatedOpened}, clicked_count = ${simulatedClicked},
          updated_at = NOW()
      WHERE id = ${id}
    `);

    res.json({ success: true, sentCount: count, openedCount: simulatedOpened });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/campaigns/:id", async (req: any, res) => {
  try {
    await db.execute(sql`DELETE FROM sales_campaigns WHERE id = ${parseInt(req.params.id)} AND organization_id = ${req.user?.organizationId}`);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── BOOKING WIDGET CONFIG ────────────────────────────────────────────────────
router.get("/widget", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const widget = await db.execute(sql`SELECT * FROM booking_widget_configs WHERE organization_id = ${orgId} ORDER BY id LIMIT 1`);

    const org = await db.execute(sql`SELECT * FROM organizations WHERE id = ${orgId}`);
    const orgData = org.rows[0] as any;

    // Generate embed code
    const widgetData = widget.rows[0] as any;
    const baseUrl = process.env.WIDGET_BASE_URL || `https://dogoda-resort.repl.co`;
    const embedCode = `<!-- Dogoda Booking Widget -->
<div id="dogoda-booking-widget"></div>
<script>
  window.DogodaWidget = {
    orgId: '${orgId}',
    lang: '${widgetData?.language || "uk"}',
    primaryColor: '${widgetData?.primary_color || "#1e3a5f"}',
    accentColor: '${widgetData?.accent_color || "#f59e0b"}',
  };
</script>
<script src="${baseUrl}/widget.js" async></script>`;

    res.json({ widget: widgetData, embedCode, orgName: orgData?.name });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.patch("/widget", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;
    const { primaryColor, accentColor, language, showPrices, showReviews, requirePhone, requireEmail, googleAnalyticsId, facebookPixelId } = req.body;

    await db.execute(sql`
      INSERT INTO booking_widget_configs (organization_id, name, primary_color, accent_color, language, show_prices, show_reviews, require_phone, require_email, google_analytics_id, facebook_pixel_id, created_at, updated_at)
      VALUES (${orgId}, 'Основний Віджет', ${primaryColor || '#1e3a5f'}, ${accentColor || '#f59e0b'}, ${language || 'uk'}, ${showPrices !== false}, ${showReviews !== false}, ${requirePhone !== false}, ${requireEmail !== false}, ${googleAnalyticsId || null}, ${facebookPixelId || null}, NOW(), NOW())
      ON CONFLICT (organization_id) DO UPDATE SET
        primary_color = EXCLUDED.primary_color,
        accent_color = EXCLUDED.accent_color,
        language = EXCLUDED.language,
        show_prices = EXCLUDED.show_prices,
        show_reviews = EXCLUDED.show_reviews,
        require_phone = EXCLUDED.require_phone,
        require_email = EXCLUDED.require_email,
        google_analytics_id = EXCLUDED.google_analytics_id,
        facebook_pixel_id = EXCLUDED.facebook_pixel_id,
        updated_at = NOW()
    `);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── CHANNEL PERFORMANCE ──────────────────────────────────────────────────────
router.get("/channels", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;

    const [bookingsBySource, repeatGuests, avgLeadValue] = await Promise.all([
      db.execute(sql`
        SELECT b.source::text as source,
          COUNT(*) as bookings,
          SUM(b.total_amount) as revenue,
          AVG(b.total_amount) as avg_booking,
          SUM(CASE WHEN b.is_repeat_guest THEN 1 ELSE 0 END) as repeat_bookings,
          AVG(b.guests_count) as avg_guests
        FROM bookings b
        JOIN units u ON u.id = b.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = ${orgId}
        GROUP BY b.source ORDER BY revenue DESC
      `),
      db.execute(sql`
        SELECT COUNT(DISTINCT b.guest_id) as repeat_guests,
          SUM(CASE WHEN b.is_repeat_guest THEN b.total_amount ELSE 0 END) as repeat_revenue
        FROM bookings b
        JOIN units u ON u.id = b.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE p.organization_id = ${orgId} AND b.is_repeat_guest = TRUE
      `),
      db.execute(sql`
        SELECT source::text, AVG(estimated_value) as avg_value, COUNT(*) as cnt
        FROM leads WHERE organization_id = ${orgId}
        GROUP BY source ORDER BY avg_value DESC
      `),
    ]);

    res.json({
      bySource: bookingsBySource.rows,
      repeatStats: repeatGuests.rows[0] || {},
      leadValues: avgLeadValue.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── REPEAT GUESTS ────────────────────────────────────────────────────────────
router.get("/repeat-guests", async (req: any, res) => {
  try {
    const orgId: number = req.user?.organizationId;

    const guests = await db.execute(sql`
      SELECT g.id, g.first_name, g.last_name, g.email, g.phone,
        COUNT(b.id) as visits,
        SUM(b.total_amount) as total_spent,
        MAX(b.check_out) as last_visit,
        MIN(b.check_in) as first_visit,
        AVG(b.total_amount) as avg_spend,
        b.source::text as last_source
      FROM guests g
      JOIN bookings b ON b.guest_id = g.id
      JOIN units u ON u.id = b.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE p.organization_id = ${orgId}
      GROUP BY g.id, g.first_name, g.last_name, g.email, g.phone, b.source
      HAVING COUNT(b.id) > 1
      ORDER BY total_spent DESC LIMIT 50
    `);

    res.json({ guests: guests.rows });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
