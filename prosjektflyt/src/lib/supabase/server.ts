import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

/**
 * Supabase-klient for Server Components, Server Actions og Route Handlers.
 * Bruker getAll/setAll-API-et (anbefalt av @supabase/ssr) – de gamle
 * get/set/remove-metodene er fjernet i nyere versjoner.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Kalles fra en Server Component uten skrivetilgang til cookies –
            // trygt å ignorere så lenge middleware fornyer sesjonen.
          }
        },
      },
    },
  );
}
