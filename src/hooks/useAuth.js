import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Appen bor på /app/ — forsiden på / har ingen Supabase-klient som kan
    // plukke opp innloggings-tokenet fra lenken.
    options: { emailRedirectTo: `${window.location.origin}/app/` },
  });
  return error?.message ?? null;
}

export const signOut = () => supabase.auth.signOut();
