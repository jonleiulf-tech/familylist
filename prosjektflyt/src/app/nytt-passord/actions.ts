'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface NewPasswordState {
  error: string | null;
}

/**
 * Setter nytt passord for brukeren som allerede har en gyldig sesjon fra
 * lenken i e-posten (byttet inn i /auth/callback).
 */
export async function setNewPassword(
  _prevState: NewPasswordState,
  formData: FormData,
): Promise<NewPasswordState> {
  const password = String(formData.get('password') ?? '');
  const repeat = String(formData.get('password_repeat') ?? '');

  if (password.length < 8) return { error: 'Passordet må ha minst 8 tegn.' };
  if (password !== repeat) return { error: 'De to passordene er ikke like.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Lenken er utløpt. Be om en ny lenke fra «Glemt passord».' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/same.*password/i.test(error.message)) {
      return { error: 'Det nye passordet må være forskjellig fra det gamle.' };
    }
    return { error: error.message };
  }

  redirect('/prosjekter');
}
