import { useEffect, useState } from 'react';
import { supabase, lenketype } from '../lib/supabase.js';

/* Innlogging for styret. To veier inn, samme konto:

   1. Passord. Praktisk når du sitter på en PC uten e-posten din.
   2. Innloggingslenke på e-post. Krever ikke at du husker noe, og er
      redningen når passordet er glemt.

   Om du er admin avgjøres av tabellen admins, via RPC-en is_admin som
   RLS bruker. Å klare å logge inn gir altså ingen tilgang i seg selv. */
export function useAdminAuth() {
  const [state, setState] = useState({ loading: true, session: null, isAdmin: false, måSettePassord: false });

  useEffect(() => {
    if (!supabase) { setState({ loading: false, session: null, isAdmin: false, måSettePassord: false }); return; }
    let alive = true;
    // Lest fra adressen før klienten rakk å rydde den bort. Hendelsen
    // under er belte og bukseseler: den kan ha rukket å gå før vi lyttet.
    let iGjenoppretting = lenketype === 'recovery';

    async function resolve(session) {
      if (!session) {
        alive && setState({ loading: false, session: null, isAdmin: false, måSettePassord: false });
        return;
      }
      const { data, error } = await supabase.rpc('is_admin');
      alive && setState({
        loading: false,
        session,
        isAdmin: !error && data === true,
        måSettePassord: iGjenoppretting,
      });
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((hendelse, session) => {
      // Klikk på «glemt passord»-lenken lander her. Da skal skjemaet for
      // nytt passord vises i stedet for admin.
      if (hendelse === 'PASSWORD_RECOVERY') iGjenoppretting = true;
      if (hendelse === 'SIGNED_OUT') iGjenoppretting = false;
      resolve(session);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const tilbake = () => `${window.location.origin}/admin`;

  return {
    ...state,
    signInMedPassord: (email, passord) =>
      supabase.auth.signInWithPassword({ email: email.trim(), password: passord }),
    signInMedLenke: (email) =>
      supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: tilbake() } }),
    glemtPassord: (email) =>
      supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: tilbake() }),
    settPassord: (passord) => supabase.auth.updateUser({ password: passord }),
    ferdigMedPassord: () => setState((s) => ({ ...s, måSettePassord: false })),
    signOut: () => supabase.auth.signOut(),
  };
}

/* Krav til passord. Ti tegn er nok når kontoen bare styrer treningstider,
   og lavere terskel gjør at folk faktisk bruker passordbehandler i stedet
   for å finne på noe kort de husker. */
export const MIN_PASSORD = 10;
export function passordFeil(passord, gjentatt) {
  if (!passord || passord.length < MIN_PASSORD) return `Passordet må være minst ${MIN_PASSORD} tegn.`;
  if (gjentatt !== undefined && passord !== gjentatt) return 'De to passordene er ikke like.';
  return null;
}
