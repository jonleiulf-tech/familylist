import { format, parseISO } from 'date-fns';
import { nb } from 'date-fns/locale';

/** Norsk datoformat dd.MM.yyyy. */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'dd.MM.yyyy', { locale: nb });
}

/** Norsk klokkeslettformat HH:mm. */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm', { locale: nb });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, "dd.MM.yyyy 'kl.' HH:mm", { locale: nb });
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}
