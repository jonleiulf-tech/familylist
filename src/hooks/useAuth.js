import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Appen bor på /app/ — forsiden har ingen Supabase-klient som kan plukke
// opp tokener, så alle e-postlenker skal lande her.
const appUrl = () => `${window.location.origin}/app/`;

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // Satt når brukeren kommer inn via «glemt passordet»-lenken — da skal
  // appen be om et nytt passord før noe annet.
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const clearRecovery = useCallback(() => setRecovery(false), []);

  return { session, user: session?.user ?? null, loading, recovery, clearRecovery };
}

/** Supabase sine feilmeldinger er engelske — oversett de vanlige. */
function friendly(message) {
  if (/invalid login credentials/i.test(message)) {
    return 'Feil e-post eller passord. Har du bare logget inn med lenke før, '
      + 'har du ikke noe passord ennå — bruk «Glemt passordet?» for å sette et.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'E-posten er ikke bekreftet ennå — sjekk innboksen.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'For mange forsøk på kort tid. Vent et minutt og prøv igjen.';
  }
  if (/at least 6|password should/i.test(message)) {
    return 'Passordet er for kort.';
  }
  return message;
}

export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? friendly(error.message) : null;
}

/**
 * Ny konto med passord. Er e-postbekreftelse skrudd av (som i oppsettet
 * vårt), er brukeren innlogget umiddelbart; ellers må lenken i e-posten
 * klikkes først — needsConfirm sier hvilket av de to som skjedde.
 */
export async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appUrl() },
  });
  if (error) {
    if (/already registered/i.test(error.message)) {
      return { error: 'Denne e-posten har allerede en konto — logg inn i stedet.' };
    }
    return { error: friendly(error.message) };
  }
  return { error: null, needsConfirm: !data.session };
}

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: appUrl() },
  });
  return error ? friendly(error.message) : null;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appUrl(),
  });
  return error ? friendly(error.message) : null;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  return error ? friendly(error.message) : null;
}

export const signOut = () => supabase.auth.signOut();
