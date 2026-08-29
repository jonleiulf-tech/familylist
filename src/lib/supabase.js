import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

if (!isConfigured) {
  console.warn(
    'Supabase er ikke konfigurert. Kopier .env.example til .env og fyll inn ' +
    'VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY.'
  );
}

// Klienten opprettes med tomme strenger hvis config mangler, slik at appen
// kan rendre oppsettskjermen i stedet for å krasje ved import.
export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 10 } },
});
