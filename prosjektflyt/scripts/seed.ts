/**
 * Seed-script: oppretter demobruker + eksempelprosjektet «Nytt kontor i
 * Skien» (samme data som «Utforsk eksempelprosjektet»-knappen i appen).
 *
 * Kjøres med: npm run seed
 * Krever SUPABASE_SERVICE_ROLE_KEY i .env.local (service-rollen omgår RLS
 * og skal ALDRI brukes i klientkode – kun her og i andre server-only
 * administrasjonsskript).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import type { Database } from '../src/types/supabase';
import { insertDemoProject } from '../src/features/demo/demo-project';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Mangler NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local');
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const demoEmail = process.env.SEED_EMAIL ?? 'demo@compro.no';
  const demoPassword = process.env.SEED_PASSWORD ?? 'ComPro-demo-2026!';

  console.log(`Oppretter/finner demobruker ${demoEmail}...`);
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let ownerUserId = existing.users.find((u) => u.email?.toLowerCase() === demoEmail.toLowerCase())?.id;

  if (!ownerUserId) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: demoEmail,
      password: demoPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Demo Prosjektleder' },
    });
    if (error) throw error;
    ownerUserId = created.user.id;
  }

  console.log('Oppretter eksempelprosjekt...');
  const projectId = await insertDemoProject(supabase, ownerUserId);

  console.log(`\nFerdig! Eksempelprosjekt opprettet: ${projectId}`);
  console.log(`Logg inn med: ${demoEmail} / ${demoPassword}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
