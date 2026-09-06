import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Mottar bekreftelses-/magic-link-lenker fra Supabase (PKCE-flyt):
 * `?code=...` byttes inn mot en sesjon, og brukeren sendes videre.
 *
 * Krever at Supabase → Authentication → URL Configuration har
 * Site URL = https://compro.no og https://compro.no/** i Redirect URLs.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/prosjekter';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/prosjekter';

  if (!code) {
    return NextResponse.redirect(`${origin}/logg-inn?feil=mangler_kode`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession feilet:', error.message);
    return NextResponse.redirect(`${origin}/logg-inn?feil=ugyldig_lenke`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
