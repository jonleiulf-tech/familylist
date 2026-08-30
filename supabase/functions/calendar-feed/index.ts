// Edge Function: kalender-feed for middagsplanen (iCalendar/ICS).
//
// Google Kalender (og Apple/Outlook) abonnerer på en URL:
//   https://<ref>.supabase.co/functions/v1/calendar-feed?token=<calendar_token>
//
// Tokenet er en uuid per husholdning (umulig å gjette); ingen innlogging
// trengs — det er slik kalenderabonnement fungerer. Feeden inneholder KUN
// middagsnavn per dag som heldagshendelser, aldri noe annet fra listene.
// Google oppdaterer abonnementer med noen timers mellomrom.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const escapeIcs = (s: string) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const dateStamp = (d: string) => d.replaceAll('-', '');

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response('Ugyldig lenke.', { status: 400 });
  }

  const serviceKey = Deno.env.get('SB_SECRET_KEY')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);

  const { data: household } = await db
    .from('households').select('id, name')
    .eq('calendar_token', token).maybeSingle();
  if (!household) return new Response('Ukjent lenke.', { status: 404 });

  // Fra to uker tilbake (så nylige middager står i kalenderen) og fremover.
  const from = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const { data: days } = await db
    .from('meal_plan')
    .select('plan_date, meal_name, reason, guest_portions')
    .eq('household_id', household.id)
    .gte('plan_date', from)
    .not('meal_name', 'is', null)
    .order('plan_date');

  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const events = (days ?? []).map((d) => {
    const next = new Date(`${d.plan_date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const guests = Number(d.guest_portions) > 0
      ? ` (+${d.guest_portions} gjesteporsjoner)` : '';
    return [
      'BEGIN:VEVENT',
      `UID:${d.plan_date}-${household.id}@plukkelisten.no`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dateStamp(d.plan_date)}`,
      `DTEND;VALUE=DATE:${dateStamp(next.toISOString().slice(0, 10))}`,
      `SUMMARY:🍽 ${escapeIcs(d.meal_name)}${escapeIcs(guests)}`,
      d.reason ? `DESCRIPTION:${escapeIcs(d.reason)}\\nPlanlagt i Plukkelisten — plukkelisten.no` : 'DESCRIPTION:Planlagt i Plukkelisten — plukkelisten.no',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ].join('\r\n');
  });

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plukkelisten//Middagsplan//NO',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:Middager — ${escapeIcs(household.name)}`,
    'X-WR-TIMEZONE:Europe/Oslo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="plukkelisten-middager.ics"',
      'Cache-Control': 'max-age=900',
    },
  });
});
