import { createClient } from '@/lib/supabase/server';

/** Henter innlogget bruker eller kaster en forståelig feil. */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Du er ikke innlogget. Last siden på nytt og logg inn.');
  return { supabase, user };
}

/** Tom streng / null fra FormData → undefined, ellers trimmet streng. */
export function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

export function requiredString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}
