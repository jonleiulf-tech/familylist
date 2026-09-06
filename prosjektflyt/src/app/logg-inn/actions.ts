'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface AuthActionState {
  error: string | null;
  /** Informasjonsmelding (f.eks. «sjekk e-posten din») – ikke en feil. */
  info: string | null;
}

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes('email not confirmed')) {
      return { error: null, info: 'E-postadressen er ikke bekreftet ennå. Sjekk innboksen din for bekreftelseslenken.' };
    }
    return { error: 'Feil e-post eller passord.', info: null };
  }

  redirect('/prosjekter');
}

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();
  const supabase = createClient();

  if (password.length < 8) {
    return { error: 'Passordet må ha minst 8 tegn.', info: null };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { error: 'Det finnes allerede en konto med denne e-posten. Logg inn i stedet.', info: null };
    }
    return { error: error.message, info: null };
  }

  // Med e-postbekreftelse påslått finnes det ingen sesjon ennå – da må vi
  // fortelle brukeren hva som skjer, ikke sende dem rett tilbake til /logg-inn.
  if (!data.session) {
    return {
      error: null,
      info: `Vi har sendt en bekreftelseslenke til ${email}. Klikk på den, og logg deretter inn her.`,
    };
  }

  redirect('/prosjekter');
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect('/logg-inn');
}
