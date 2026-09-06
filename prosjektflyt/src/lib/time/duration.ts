/**
 * All arbeidstid lagres og regnes internt som HELE MINUTTER (heltall).
 * Aldri lagre desimaltimer (f.eks. "4.15 timer" er en falsk lesning av
 * 4 timer 15 minutter). Desimaltimer brukes kun til visning i analyser.
 */

export interface HoursAndMinutes {
  hours: number;
  minutes: number;
}

export function minutesToHoursAndMinutes(totalMinutes: number): HoursAndMinutes {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new RangeError('totalMinutes må være et positivt tall');
  }
  const rounded = Math.round(totalMinutes);
  return {
    hours: Math.floor(rounded / 60),
    minutes: rounded % 60,
  };
}

/** Formaterer som "4 t 15 min" (norsk kortform). Utelater "0 t"/"0 min". */
export function formatHoursAndMinutes(totalMinutes: number): string {
  const { hours, minutes } = minutesToHoursAndMinutes(totalMinutes);
  if (hours === 0 && minutes === 0) return '0 min';
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} t`;
  return `${hours} t ${minutes} min`;
}

export function minutesToDecimalHours(totalMinutes: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((totalMinutes / 60) * factor) / factor;
}

export function hoursAndMinutesToMinutes(hours: number, minutes: number): number {
  if (hours < 0 || minutes < 0 || minutes >= 60) {
    throw new RangeError('Ugyldig timer/minutter-kombinasjon');
  }
  return Math.round(hours * 60 + minutes);
}

/**
 * Regner ut varighet i minutter fra start-/sluttidspunkt (HH:mm).
 * Håndterer vakter som krysser midnatt (slutt < start ⇒ neste dag).
 *
 * Eksempel: "08:00" → "12:15" gir 255 minutter (4 t 15 min).
 */
export function calculateDurationFromStartEnd(startTime: string, endTime: string): number {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const diff = end - start;
  return diff >= 0 ? diff : diff + 24 * 60;
}

function parseTimeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) throw new RangeError(`Ugyldig tidspunkt: "${time}" (forventet HH:mm)`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Ugyldig tidspunkt: "${time}"`);
  return hours * 60 + minutes;
}
