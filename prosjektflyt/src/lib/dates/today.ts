import { format } from 'date-fns';

/**
 * Dagens dato som ISO-dato (YYYY-MM-DD) i LOKAL tidssone.
 * `new Date().toISOString().slice(0, 10)` gir UTC-dato og blir feil på
 * kvelden i Norge (UTC+1/+2) – bruk alltid denne i stedet.
 */
export function todayIsoDate(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}
