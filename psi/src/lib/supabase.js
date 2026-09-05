import { createClient } from '@supabase/supabase-js';

/* Valgfritt. Uten disse to miljøvariablene kjører siden på src/data/psi.js
   og /admin er slått av. Med dem leses innholdet fra databasen, og styret
   redigerer i /admin. anon-nøkkelen er trygg i frontend: RLS styrer alt. */
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const hasBackend = Boolean(supabase);
