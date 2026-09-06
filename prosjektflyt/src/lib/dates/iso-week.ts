import {
  getISOWeek,
  getISOWeekYear,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  parseISO,
  isValid,
} from 'date-fns';

/**
 * ISO-8601 ukeberegning. Uken starter mandag, og uke 1 er uken som
 * inneholder årets første torsdag – dette er nettopp det som gjør
 * ISO-uker robuste rundt nyttår (i motsetning til Excel-malens rå 1–52).
 *
 * Vi lagrer alltid faktiske datoer og AVLEDER ukenummer/år fra dem, aldri
 * omvendt.
 */
export interface IsoWeek {
  isoYear: number;
  isoWeek: number;
}

export function toIsoWeek(date: string | Date): IsoWeek {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) throw new RangeError(`Ugyldig dato: ${String(date)}`);
  return { isoYear: getISOWeekYear(d), isoWeek: getISOWeek(d) };
}

/** Formaterer som "Uke 3, 2026". */
export function formatIsoWeek(date: string | Date): string {
  const { isoYear, isoWeek } = toIsoWeek(date);
  return `Uke ${isoWeek}, ${isoYear}`;
}

export function daysBetween(start: string | Date, end: string | Date): number {
  const s = typeof start === 'string' ? parseISO(start) : start;
  const e = typeof end === 'string' ? parseISO(end) : end;
  if (!isValid(s) || !isValid(e)) throw new RangeError('Ugyldig dato');
  return differenceInCalendarDays(e, s);
}

/** Antall hele/påbegynte ISO-uker mellom to datoer (minimum 1 hvis begge er satt). */
export function weeksBetween(start: string | Date, end: string | Date): number {
  const s = typeof start === 'string' ? parseISO(start) : start;
  const e = typeof end === 'string' ? parseISO(end) : end;
  if (!isValid(s) || !isValid(e)) throw new RangeError('Ugyldig dato');
  const weeks = differenceInCalendarWeeks(e, s, { weekStartsOn: 1 }) + 1;
  return Math.max(1, weeks);
}
