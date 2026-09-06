'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export interface ResetActionState {
  error: string | null;
  info: string | null;
}

function siteOrigin(): string {
  const h = headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

/**
 * Sender e-post med lenke for å sette nytt passord.
 *
 * Svaret er bevisst likt uansett om e-posten finnes eller ikke – ellers
 * kunne skjemaet brukes til å kartlegge hvilke adresser som har konto.
 */
export async function requestPasswordReset(
  _prevState: ResetActionState,
  formData: FormData,
): Promise<ResetActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return { error: 'Skriv inn en gyldig e-postadresse.', info: null };
  }

  const supabase = createClient();
  const origin = siteOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: origin ? `${origin}/auth/callback?next=/nytt-passord` : undefined,
  });

  if (error) {
    // Rate limiting er den ene feilen brukeren faktisk må få vite om.
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { error: 'For mange forsøk. Vent noen minutter og prøv igjen.', info: null };
    }
    console.error('[glemt-passord] resetPasswordForEmail feilet:', error.message);
  }

  return {
    error: null,
    info: `Hvis det finnes en konto på ${email}, har vi sendt en e-post med lenke for å sette nytt passord. Sjekk også søppelpost.`,
  };
}
