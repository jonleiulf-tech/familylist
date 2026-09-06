import { ZodError } from 'zod';

/**
 * Felles resultattype for server actions som kalles fra skjemaer.
 * Actions skal RETURNERE feil (ikke kaste) slik at dialogen kan vise en
 * forståelig norsk melding i stedet for at hele siden går i error boundary.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
}

function isPostgrestError(err: unknown): err is PostgrestLikeError {
  return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

export function toUserMessage(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues[0]?.message ?? 'Ugyldige verdier i skjemaet.';
  }
  if (err instanceof RangeError) {
    return err.message;
  }
  if (isPostgrestError(err)) {
    switch (err.code) {
      case '23505':
        return 'Dette finnes allerede (duplikat).';
      case '23514':
        return 'Ugyldig verdi – sjekk at datoer og tall henger sammen (f.eks. slutt etter start, varighet over 0).';
      case '23503':
        return 'Refererer til noe som ikke finnes lenger. Last siden på nytt og prøv igjen.';
      case '42501':
        return 'Du har ikke tilgang til å gjøre dette i prosjektet.';
      case 'PGRST301':
        return 'Sesjonen er utløpt. Logg inn igjen.';
      default:
        return err.message ? `Databasefeil: ${err.message}` : 'Ukjent databasefeil.';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Noe gikk galt. Prøv igjen.';
}

export async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toUserMessage(err) };
  }
}

/**
 * Kaster feilen fra et Supabase-svar hvis den finnes, og garanterer at data
 * ikke er null (Supabase typer data som T | null selv ved .single()).
 */
export function unwrap<R extends { data: unknown; error: unknown }>(res: R): NonNullable<R['data']> {
  if (res.error) throw res.error;
  if (res.data == null) throw new Error('Fant ikke raden – den kan være slettet, eller du mangler tilgang.');
  return res.data as NonNullable<R['data']>;
}
