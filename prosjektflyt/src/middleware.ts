import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/supabase';
import { getSupabaseEnv } from '@/lib/env';

const PUBLIC_PATHS = ['/logg-inn', '/konfigurasjon', '/api/health', '/auth/callback'];

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

/**
 * Fornyer Supabase-sesjonscookien på hver request slik at Server Components
 * alltid ser en gyldig (evt. nylig refreshet) auth-tilstand, og sender
 * uinnloggede brukere til /logg-inn.
 *
 * Feiler aldri med 500: mangler konfigurasjon vises /konfigurasjon, og
 * uventede feil logges og sender brukeren til innlogging.
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isLanding = pathname === '/';
  const isPublic = isLanding || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Supabase sender bekreftelseslenker til Site URL (roten) med ?code=…
  // Send dem til callback-endepunktet før auth-sjekken kaster dem ut.
  if (searchParams.has('code') && !pathname.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }

  const env = getSupabaseEnv();
  if (!env.ok) {
    console.error('[middleware] Supabase-miljøvariabler mangler/ugyldige:', env.problems.join(' '));
    if (pathname.startsWith('/konfigurasjon') || pathname.startsWith('/api/health')) return NextResponse.next();
    return redirectTo(request, '/konfigurasjon');
  }

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient<Database>(env.url!, env.anonKey!, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    });

    // Viktig: ikke legg logikk mellom createServerClient og getUser – det kan
    // gi tilfeldige utlogginger (se @supabase/ssr-dokumentasjonen).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && !isPublic) return redirectTo(request, '/logg-inn');
    if (user && (isLanding || pathname.startsWith('/logg-inn') || pathname.startsWith('/konfigurasjon'))) {
      return redirectTo(request, '/prosjekter');
    }
    return response;
  } catch (err) {
    console.error('[middleware] Uventet feil i auth-sjekk:', err);
    if (isPublic) return NextResponse.next();
    return redirectTo(request, '/logg-inn');
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)'],
};
