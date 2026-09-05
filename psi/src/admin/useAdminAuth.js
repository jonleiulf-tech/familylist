import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/* Innlogging for styret: magic link. Om brukeren er admin avgjøres av
   tabellen admins (RPC is_admin, samme som RLS bruker). */
export function useAdminAuth() {
  const [state, setState] = useState({ loading: true, session: null, isAdmin: false });

  useEffect(() => {
    if (!supabase) { setState({ loading: false, session: null, isAdmin: false }); return; }
    let alive = true;
    async function resolve(session) {
      if (!session) { alive && setState({ loading: false, session: null, isAdmin: false }); return; }
      const { data, error } = await supabase.rpc('is_admin');
      alive && setState({ loading: false, session, isAdmin: !error && data === true });
    }
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => resolve(session));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return {
    ...state,
    signIn: (email) => supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/admin` } }),
    signOut: () => supabase.auth.signOut(),
  };
}
