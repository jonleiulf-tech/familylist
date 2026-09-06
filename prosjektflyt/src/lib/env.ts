/**
 * Sentral lesing/validering av miljøvariabler. NEXT_PUBLIC_*-variabler bakes
 * inn ved byggetidspunkt – mangler de i Vercel når bygget kjører, er de
 * `undefined` i produksjon selv om de legges til etterpå (krever redeploy).
 */
export interface SupabaseEnvStatus {
  ok: boolean;
  url: string | null;
  anonKey: string | null;
  problems: string[];
}

export function getSupabaseEnv(): SupabaseEnvStatus {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
  const problems: string[] = [];

  if (!url) {
    problems.push('NEXT_PUBLIC_SUPABASE_URL mangler.');
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
    problems.push(
      `NEXT_PUBLIC_SUPABASE_URL ser ikke ut som en Supabase-URL (forventet https://<ref>.supabase.co, fikk «${url}»).`,
    );
  }

  if (!anonKey) {
    problems.push('NEXT_PUBLIC_SUPABASE_ANON_KEY mangler.');
  } else if (!anonKey.startsWith('eyJ') && !anonKey.startsWith('sb_publishable_')) {
    problems.push('NEXT_PUBLIC_SUPABASE_ANON_KEY ser ikke ut som en gyldig anon/publishable-nøkkel.');
  }

  return { ok: problems.length === 0, url, anonKey, problems };
}
