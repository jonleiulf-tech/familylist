import { NextResponse } from 'next/server';
import { getSupabaseEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Driftsstatus uten hemmeligheter: er miljøvariablene satt, og svarer
 * Supabase? Brukes til å feilsøke deploy (f.eks. MIDDLEWARE_INVOCATION_FAILED).
 */
export async function GET() {
  const env = getSupabaseEnv();
  let supabaseReachable: boolean | null = null;
  let supabaseStatus: number | null = null;

  if (env.ok && env.url) {
    try {
      const res = await fetch(`${env.url}/auth/v1/health`, {
        headers: { apikey: env.anonKey! },
        signal: AbortSignal.timeout(5000),
      });
      supabaseStatus = res.status;
      supabaseReachable = res.ok;
    } catch {
      supabaseReachable = false;
    }
  }

  return NextResponse.json(
    {
      ok: env.ok && supabaseReachable === true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: env.url ? `${env.url.slice(0, 12)}…${env.url.slice(-12)}` : null,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.anonKey ? `satt (${env.anonKey.length} tegn)` : null,
        problems: env.problems,
      },
      supabase: { reachable: supabaseReachable, status: supabaseStatus },
      runtime: { node: process.version, vercelEnv: process.env.VERCEL_ENV ?? null },
      timestamp: new Date().toISOString(),
    },
    { status: env.ok && supabaseReachable ? 200 : 503 },
  );
}
