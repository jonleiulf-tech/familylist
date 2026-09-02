/**
 * «Hvilken dag skal denne middagen på?»
 *
 * Før la appen middagen på første ledige dag uten å spørre. Det er riktig
 * gjetning omtrent halvparten av gangene, og i den andre halvparten må man
 * finne fram til dagen etterpå og rette opp. Her er hele planen synlig i
 * stedet: ledige dager står som ledige, og de opptatte står med retten som
 * ligger der, slik at et bytte er et valg og ikke en overraskelse.
 */

import { isoDate, weekdayName } from './format.js';

/** Hvor mange dager fram vi tilbyr, også de som ikke finnes i planen ennå. */
export const HORIZON_DAYS = 28;

const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

const parse = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`);

/** Mandagen i uken datoen hører til. ISO-uker starter på mandag. */
export function weekStart(iso) {
  const d = parse(iso);
  const dow = (d.getDay() + 6) % 7;          // man=0 … søn=6
  d.setDate(d.getDate() - dow);
  return isoDate(d);
}

/** ISO-ukenummer — det folk mener når de sier «uke 36». */
export function isoWeek(iso) {
  const d = parse(iso);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dow + 3);        // torsdagen i uken
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const fdow = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdow + 3);
  return 1 + Math.round((target - firstThursday) / (7 * 86400000));
}

/**
 * Én rad per dag, med det som står der i dag.
 *
 * Dager som ennå ikke finnes i planen tas med som ledige: databasen
 * oppretter raden når middagen settes, så det finnes ingen grunn til å
 * nekte noen å planlegge to uker fram.
 */
export function pickerDays(plan = [], { today = isoDate(new Date()), days = HORIZON_DAYS } = {}) {
  const byDate = new Map(plan.map((d) => [String(d.plan_date).slice(0, 10), d]));
  const out = [];
  const cursor = parse(today);

  for (let i = 0; i < days; i += 1) {
    const date = isoDate(cursor);
    const row = byDate.get(date) ?? null;
    const mealName = row?.skipped ? null : (row?.meal_name ?? null);
    const locked = Boolean(row?.locked);
    const d = parse(date);

    out.push({
      date,
      inPlan: Boolean(row),
      mealName,
      locked,
      skipped: Boolean(row?.skipped),
      done: Boolean(row?.done),
      sent: Boolean(row?.sent_to_list_at),
      isToday: date === today,
      weekday: weekdayName(d.getDay()),
      dayNum: d.getDate(),
      month: MONTHS_SHORT[d.getMonth()],
      weekStart: weekStart(date),
      week: isoWeek(date),
      // Låste dager er låst med vilje — de skal ikke kunne overskrives i
      // farten. Låsen tas av på dagskortet.
      status: locked ? 'låst' : mealName ? 'opptatt' : row?.skipped ? 'hoppet' : 'ledig',
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Grupper dagene i uker, med en overskrift folk kjenner igjen. */
export function weekGroups(days = []) {
  const groups = [];
  for (const day of days) {
    const last = groups[groups.length - 1];
    if (last && last.weekStart === day.weekStart) last.days.push(day);
    else groups.push({ weekStart: day.weekStart, week: day.week, days: [day] });
  }
  return groups.map((g, i) => ({
    ...g,
    label: i === 0 ? 'Denne uken' : i === 1 ? 'Neste uke' : `Uke ${g.week}`,
    free: g.days.filter((d) => d.status === 'ledig').length,
  }));
}

/**
 * Teksten som skal stå på dagen.
 * «Ledig» er et tilbud; et navn er en advarsel om at noe vil bli byttet.
 */
export function dayNote(day) {
  if (!day) return '';
  if (day.status === 'låst') return day.mealName ? `Låst · ${day.mealName}` : 'Låst';
  if (day.status === 'opptatt') return day.mealName;
  if (day.status === 'hoppet') return 'Ingen middag denne dagen';
  return 'Ledig';
}

/**
 * De to radene en flytting består av.
 *
 * Skrives i ETT kall: en halvveis flytting ville lagt samme middag på to
 * dager, og det er verre enn å ikke flytte i det hele tatt.
 *
 * Ligger det en middag på måldagen, bytter de plass. Det er nesten alltid
 * det man mener med å flytte pannekakene fra tirsdag til torsdag — fisken
 * skal til tirsdag, ikke i søpla.
 *
 * «Sendt til handlelisten» og gjesteporsjoner følger MIDDAGEN, ikke dagen:
 * varene ligger på listen uansett hvilken dag retten spises, og gjestene
 * kommer til retten, ikke til datoen.
 */
export function moveRows({ householdId, fromDate, toDate, from, to }) {
  if (!householdId || !fromDate || !toDate || fromDate === toDate) return null;
  if (!from?.meal_name) return null;

  const carry = (src) => ({
    meal_id: src?.meal_id ?? null,
    meal_name: src?.meal_name ?? null,
    guest_portions: src?.guest_portions ?? 0,
    sent_to_list_at: src?.sent_to_list_at ?? null,
    // Begrunnelsen MÅ følge med, også når den er tom. En upsert skriver
    // bare kolonnene som står i nyttelasten, så uten denne beholdt dagen
    // den FORRIGE rettens begrunnelse: flytt tacoen bort fra fredag, legg
    // fiskegratengen inn, og fredag sto med «Fiskegrateng · Regel: Taco
    // på denne ukedagen» — i appen og i kalenderen.
    reason: src?.reason ?? null,
    skipped: false,
  });

  return [
    { household_id: householdId, plan_date: toDate, ...carry(from) },
    { household_id: householdId, plan_date: fromDate, ...carry(to?.meal_name ? to : null) },
  ];
}
