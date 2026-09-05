/* Kalender: én ren modul uten React og uten nettverk, så den kan brukes
   både i nettleseren (/kalender) og i api/kalender (ICS-abonnement).

   To kilder:
   - treninger: sports[].schedule, ukentlige økter (grunnskjemaet)
   - arrangementer: events-tabellen (kamper, sosialt, møter)

   Tider tolkes i Europe/Oslo. Spond har alltid siste ord om den enkelte
   uka, og det står i hver kalenderpost. */

export const TZ = 'Europe/Oslo';
export const KINDS = ['training', 'match', 'event', 'social', 'meeting'];

const pad = (n) => String(n).padStart(2, '0');

/* Oslo-tid for et Date-objekt: { y, m, d, h, mi, weekday(1-7) } */
export function osloParts(date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, weekday: wd };
}

/* Oslo-lokal tid → Date (UTC). Prøver seg fram med offset, som er nok for
   Norge (én eller to timer). */
export function fromOslo(y, m, d, h = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  for (const offsetH of [1, 2]) {
    const candidate = new Date(guess - offsetH * 3600e3);
    const p = osloParts(candidate);
    if (p.y === y && p.m === m && p.d === d && p.h === h && p.mi === mi) return candidate;
  }
  return new Date(guess - 3600e3);
}

export const isoDay = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;
export const dayOf = (date) => isoDay(osloParts(date));
export const parseDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const addDays = ({ y, m, d }, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const weekdayOf = ({ y, m, d }) => { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w === 0 ? 7 : w; };
const hhmm = (s) => { const [h, mi] = String(s || '00:00').split(':').map(Number); return [h || 0, mi || 0]; };

/* Første dato ≥ from som faller på weekday (1 = mandag). */
export function firstOnOrAfter(fromIso, weekday) {
  let d = parseDay(fromIso);
  const diff = (weekday - weekdayOf(d) + 7) % 7;
  return isoDay(addDays(d, diff));
}

/* Dager der Spond har sagt sitt for en gruppe: { slug: Set('YYYY-MM-DD') }.

   Spond er alltid fasiten. Har gruppa et synket Spond-arrangement en dag,
   skal ikke grunnskjemaet legge en generert trening oppå den samme dagen;
   da ville uka vist to økter der det er én. Uten synk er kartet tomt og
   alt er som før. */
export function spondDays(events = []) {
  const map = new Map();
  for (const e of events) {
    if (e.source !== 'spond' || !e.sport_slug || e.hidden_by_admin) continue;
    if (!map.has(e.sport_slug)) map.set(e.sport_slug, new Set());
    map.get(e.sport_slug).add(dayOf(new Date(e.starts_at)));
  }
  return map;
}

/* Treninger som konkrete forekomster mellom to datoer (inkl.). */
export function expandTrainings(sports, fromIso, toIso, skip = new Map()) {
  const out = [];
  for (const sport of sports) {
    if (sport.active === false) continue;
    for (const [i, slot] of (sport.schedule || []).entries()) {
      const start = slot.from_date && slot.from_date > fromIso ? slot.from_date : fromIso;
      let day = firstOnOrAfter(start, slot.day);
      while (day <= toIso) {
        if ((!slot.until_date || day <= slot.until_date) && !skip.get(sport.slug)?.has(day)) {
          const [fh, fm] = hhmm(slot.from); const [th, tm] = hhmm(slot.to);
          const p = parseDay(day);
          out.push({
            id: `training-${sport.slug}-${i}-${day}`,
            kind: 'training',
            sportSlug: sport.slug,
            sport,
            title: sport.name,
            start: fromOslo(p.y, p.m, p.d, fh, fm),
            end: fromOslo(p.y, p.m, p.d, th, tm),
            venue: slot.venue || sport.venue,
            note: slot.note,
            url: sport.spondInviteUrl || null,
          });
        }
        day = isoDay(addDays(parseDay(day), 7));
      }
    }
  }
  return out;
}

/* Arrangementer fra databasen til samme form. */
export function normalizeEvents(events, sports = []) {
  return (events || [])
    .filter((e) => e.status !== 'draft' && !e.hidden_by_admin)
    .map((e) => {
      const sport = sports.find((s) => s.slug === e.sport_slug) || null;
      const start = new Date(e.starts_at);
      return {
        id: `event-${e.id}`,
        eventId: e.id,
        kind: e.kind || 'event',
        sportSlug: e.sport_slug || null,
        sport,
        title: e.title,
        description: e.description,
        start,
        end: e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + 2 * 3600e3),
        allDay: Boolean(e.all_day),
        venue: e.venue || sport?.venue || null,
        url: e.link_url || null,
        cancelled: e.status === 'cancelled',
        fromSpond: e.source === 'spond',
      };
    });
}

/* Alt som skjer i perioden, sortert. filter: { slugs, kinds } */
export function agenda({ sports = [], events = [], fromIso, toIso, slugs, kinds, includeTrainings = true }) {
  const skip = spondDays(events);
  const inSlugs = (x) => !slugs || slugs.length === 0 || (x.sportSlug ? slugs.includes(x.sportSlug) : true);
  const inKinds = (x) => !kinds || kinds.length === 0 || kinds.includes(x.kind);
  const from = fromOslo(...Object.values(parseDay(fromIso)));
  const to = fromOslo(...Object.values(parseDay(toIso)), 23, 59);
  const items = [
    ...(includeTrainings ? expandTrainings(sports, fromIso, toIso, skip) : []),
    ...normalizeEvents(events, sports).filter((e) => e.start >= from && e.start <= to),
  ];
  return items.filter(inSlugs).filter(inKinds).sort((a, b) => a.start - b.start);
}

/* Grupper agenda per dag: [{ day: 'YYYY-MM-DD', items }] */
export function byDay(items) {
  const map = new Map();
  for (const it of items) {
    const key = dayOf(it.start);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  return [...map.entries()].map(([day, list]) => ({ day, items: list }));
}

/* ---------- ICS ---------- */
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line) => {
  // RFC 5545: maks 75 oktetter per linje, fortsettelse innledes med mellomrom.
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer_len(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
};
function Buffer_len(s) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length; }
const stampUtc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const stampLocal = (d) => { const p = osloParts(d); return `${p.y}${pad(p.m)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}00`; };
const BYDAY = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const pick = (x, lang = 'nb') => (x && typeof x === 'object' ? x[lang] || x.nb || x.en || '' : x || '');

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${TZ}`,
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE',
];

/* ICS med treninger som ukentlige regler og arrangementer som enkeltposter.
   `today` er dagen abonnementet ses fra (treninger trenger en startdato). */
export function buildIcs({ sports = [], events = [], slugs, kinds, name = 'PSI', domain = 'https://psiusn.no', today = dayOf(new Date()), lang = 'nb', includeTrainings = true }) {
  const skip = spondDays(events);
  const inSlugs = (slug) => !slugs || slugs.length === 0 || !slug || slugs.includes(slug);
  const inKinds = (k) => !kinds || kinds.length === 0 || kinds.includes(k);
  const now = stampUtc(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PSI Porsgrunn Studentidrettslag//psiusn.no//NO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`, `X-WR-TIMEZONE:${TZ}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H', ...VTIMEZONE];
  const truth = lang === 'en' ? 'Spond always has the final say for the current week.' : 'Spond har alltid siste ord om den aktuelle uka.';

  if (includeTrainings && inKinds('training')) {
    for (const sport of sports) {
      if (sport.active === false || !inSlugs(sport.slug)) continue;
      (sport.schedule || []).forEach((slot, i) => {
        const startDay = firstOnOrAfter(slot.from_date && slot.from_date > today ? slot.from_date : today, slot.day);
        const [fh, fm] = hhmm(slot.from); const [th, tm] = hhmm(slot.to);
        const p = parseDay(startDay);
        const s = fromOslo(p.y, p.m, p.d, fh, fm); const e = fromOslo(p.y, p.m, p.d, th, tm);
        const rrule = `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[slot.day]}` + (slot.until_date ? `;UNTIL=${slot.until_date.replace(/-/g, '')}T235959Z` : '');
        // Dager Spond har overtatt: tas ut av den ukentlige regelen, så
        // abonnenten ikke får både grunnskjemaet og Spond-posten.
        const exdates = [...(skip.get(sport.slug) || [])]
          .filter((d) => d >= startDay && weekdayOf(parseDay(d)) === slot.day)
          .sort()
          .map((d) => { const q = parseDay(d); return stampLocal(fromOslo(q.y, q.m, q.d, fh, fm)); });
        const desc = [pick(slot.note, lang), truth, sport.spondInviteUrl ? `Spond: ${sport.spondInviteUrl}` : `Spond-kode: ${sport.spondCode}`].filter(Boolean).join('\n');
        lines.push('BEGIN:VEVENT', `UID:training-${sport.slug}-${i}@psiusn.no`, `DTSTAMP:${now}`,
          `DTSTART;TZID=${TZ}:${stampLocal(s)}`, `DTEND;TZID=${TZ}:${stampLocal(e)}`, rrule,
          ...(exdates.length ? [`EXDATE;TZID=${TZ}:${exdates.join(',')}`] : []),
          `SUMMARY:${esc(`${sport.name} – ${lang === 'en' ? 'training' : 'trening'}`)}`,
          `LOCATION:${esc(pick(slot.venue || sport.venue, lang))}`,
          `DESCRIPTION:${esc(desc)}`, `URL:${domain}/idretter/${sport.slug}`, 'CATEGORIES:PSI,Trening', 'END:VEVENT');
      });
    }
  }
  for (const ev of normalizeEvents(events, sports)) {
    if (!inSlugs(ev.sportSlug) || !inKinds(ev.kind)) continue;
    const summary = `${ev.sport ? ev.sport.name + ': ' : 'PSI: '}${pick(ev.title, lang)}${ev.cancelled ? (lang === 'en' ? ' (cancelled)' : ' (avlyst)') : ''}`;
    const desc = [pick(ev.description, lang), truth, ev.url ? `Lenke: ${ev.url}` : ''].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:event-${ev.eventId}@psiusn.no`, `DTSTAMP:${now}`);
    if (ev.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dayOf(ev.start).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${isoDay(addDays(parseDay(dayOf(ev.end)), 1)).replace(/-/g, '')}`);
    } else {
      lines.push(`DTSTART;TZID=${TZ}:${stampLocal(ev.start)}`, `DTEND;TZID=${TZ}:${stampLocal(ev.end)}`);
    }
    lines.push(`SUMMARY:${esc(summary)}`, `LOCATION:${esc(pick(ev.venue, lang))}`, `DESCRIPTION:${esc(desc)}`,
      `URL:${domain}/kalender`, `STATUS:${ev.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, `CATEGORIES:PSI,${ev.kind}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* Abonnementsadresser. `alle` = hele PSI, ellers slugs skilt med +. */
export function feedPath(slugs, { kinds } = {}) {
  const base = `/api/kalender/${slugs && slugs.length ? slugs.join('+') : 'psi'}.ics`;
  const q = kinds && kinds.length ? `?type=${kinds.join(',')}` : '';
  return base + q;
}
export function parseFeedSlug(raw) {
  const s = String(raw || '').replace(/\.ics$/i, '');
  if (!s || s === 'psi' || s === 'alle' || s === 'all') return [];
  return s.split(/[+,\s]+/).map((x) => x.toLowerCase()).filter((x) => /^[a-z0-9-]+$/.test(x));
}
export const webcal = (absoluteUrl) => absoluteUrl.replace(/^https?:\/\//, 'webcal://');
