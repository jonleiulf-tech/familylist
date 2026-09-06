import { getSupabaseEnv } from '@/lib/env';
import { ComProMark } from '@/components/brand/logo';

export const dynamic = 'force-dynamic';

/**
 * Vises når appen mangler Supabase-konfigurasjon (typisk: miljøvariabler
 * ikke satt i Vercel før bygget). Ingen hemmeligheter vises – kun hvilke
 * variabler som mangler.
 */
export default function KonfigurasjonPage() {
  const env = getSupabaseEnv();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <ComProMark className="h-12 w-12" />
      <div>
        <h1 className="text-xl font-semibold">Appen er ikke ferdig konfigurert</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ComPro trenger to miljøvariabler for å nå databasen. Dette er en driftsmelding – ikke noe brukere kan
          gjøre noe med.
        </p>
      </div>

      {env.ok ? (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          Konfigurasjonen ser riktig ut nå. Gå til <a className="underline" href="/logg-inn">innlogging</a>.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {env.problems.map((p) => (
            <li key={p} className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {p}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-border p-4 text-sm">
        <p className="font-medium">Slik rettes det (Vercel)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Project → Settings → Environment Variables</li>
          <li>
            Legg inn <code>NEXT_PUBLIC_SUPABASE_URL</code> og <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> for{' '}
            <strong>Production</strong> (og gjerne Preview/Development).
          </li>
          <li>
            Deployments → siste deploy → <strong>Redeploy</strong>. Variablene bakes inn ved bygg, så en ny deploy er
            nødvendig etter endring.
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Teknisk status: <a className="underline" href="/api/health">/api/health</a>
        </p>
      </div>
    </div>
  );
}
