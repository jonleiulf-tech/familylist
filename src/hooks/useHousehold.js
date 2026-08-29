import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Invitasjonskoden må overleve magic-link-runden: brukeren klikker lenken,
// får e-post, og kommer tilbake på en ny sidelast. Derfor mellomlagres den.
const PENDING_INVITE_KEY = 'fl-pending-invite';

/** Plukker ?invite=… (eller #invite=…) ut av URL-en og husker koden. */
export function capturePendingInvite() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('invite');
    const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('invite');
    const code = fromQuery || fromHash;
    if (code) {
      localStorage.setItem(PENDING_INVITE_KEY, code);
      // Rydd URL-en så koden ikke blir liggende i historikk eller deles videre.
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
    return code || localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export const clearPendingInvite = () => {
  try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignorer */ }
};

export const readPendingInvite = () => {
  try { return localStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
};

/**
 * Husholdningen brukeren tilhører.
 *
 * Hver bruker havner i sin egen husholdning ved registrering. En ventende
 * invitasjonskode løses inn først, slik at den inviterte havner i riktig
 * husholdning i stedet for å få opprettet en ny.
 */
export function useHousehold(user) {
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // 'ready' | 'needs-name' — sistnevnte betyr at brukeren mangler husholdning
  // og må oppgi visningsnavn før vi kan opprette den.
  const [stage, setStage] = useState('ready');

  const refresh = useCallback(async () => {
    if (!user) {
      setHousehold(null); setMembers([]); setProfile(null); setLoading(false);
      return;
    }
    setLoading(true);

    const { data: membership, error: mErr } = await supabase
      .from('members')
      .select('household_id, display_name, households(id, name, adults, children, default_store)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (mErr) { setError(mErr.message); setLoading(false); return; }

    if (!membership) {
      setHousehold(null);
      setMembers([]);
      setStage('needs-name');
      setLoading(false);
      return;
    }

    setHousehold(membership.households);
    setStage('ready');

    const [{ data: all }, { data: prof }] = await Promise.all([
      supabase.from('members').select('user_id, display_name, initials').eq('household_id', membership.household_id),
      supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle(),
    ]);
    setMembers(all ?? []);
    setProfile(prof ?? null);
    setError(null);
    setLoading(false);
  }, [user]);

  // Ved innlogging: løs inn ventende invitasjon før vi vurderer husholdning.
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true;

    (async () => {
      const pending = readPendingInvite();
      if (pending) {
        const { error: aErr } = await supabase.rpc('accept_invite', {
          code: pending,
          display_name: null,
        });
        // Uansett utfall skal koden ikke prøves om igjen i det uendelige.
        clearPendingInvite();
        if (aErr && active) setError(aErr.message);
      }
      if (active) await refresh();
    })();

    return () => { active = false; };
  }, [user, refresh]);

  /** Førstegangsoppsett: oppretter husholdning, profil og seeder middager. */
  const bootstrap = useCallback(async (displayName, householdName) => {
    const { error: bErr } = await supabase.rpc('bootstrap_household', {
      display_name: displayName,
      household_name: householdName || null,
    });
    if (bErr) return bErr.message;
    await refresh();
    return null;
  }, [refresh]);

  /** Lager invitasjonslenke: engangskode, gyldig 7 dager. */
  const createInvite = useCallback(async () => {
    const { data, error: iErr } = await supabase.rpc('create_invite');
    if (iErr) return { link: null, expiresAt: null, error: iErr.message };
    const row = Array.isArray(data) ? data[0] : data;
    const link = `${window.location.origin}/?invite=${row.code}`;
    return { link, expiresAt: row.expires_at, error: null };
  }, []);

  return {
    household, members, profile, loading, error, stage,
    refresh, bootstrap, createInvite,
  };
}
