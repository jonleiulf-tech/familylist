import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/* Er noen logget inn? Brukes bare til å vise Admin-lenken i menyen, så
   den spør ikke om rettigheter. Det gjør useAdminAuth, og databasen
   avgjør uansett hva en innlogget bruker får lov til. */
export function useSession() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => alive && setSession(s));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return session;
}
