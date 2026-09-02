import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Hvilken liste brukeren så på sist. Per enhet, ikke per konto — står du i
// butikken med hyttelista oppe, skal telefonen huske det.
const ACTIVE_KEY = 'fl-active-list-v1';
const PENDING_INVITE_KEY = 'fl-pending-invite';

export function capturePendingInvite() {
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('invite');
    const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('invite');
    const code = fromQuery || fromHash;
    if (code) {
      localStorage.setItem(PENDING_INVITE_KEY, code);
      // Rydd URL-en så koden ikke blir liggende i historikken.
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
    return code || localStorage.getItem(PENDING_INVITE_KEY);
  } catch { return null; }
}

const readPending = () => {
  try { return localStorage.getItem(PENDING_INVITE_KEY); } catch { return null; }
};
/**
 * Glem en fanget invitasjonskode.
 *
 * Eksportert fordi den også må kjøre ved UTLOGGING. Koden lå igjen i
 * localStorage over en utlogging, og capturePendingInvite() returnerer
 * den lagrede verdien selv når URL-en ikke har noen kode. På en delt
 * nettbrett betydde det at neste person som logget inn — med sin egen
 * konto — ble meldt inn i husholdningen invitasjonen var ment for, uten
 * å bli spurt, og den engangskoden var brukt opp.
 */
export const clearPendingInvite = () => {
  try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignorer */ }
};

const clearPending = clearPendingInvite;

/**
 * Alle delte lister brukeren er med i, og hvilken som er aktiv.
 *
 * Tidligere antok appen én liste per bruker. Nå kan samme person ha
 * familien, hytteturen og kontorkassa side om side — adskilte data,
 * ulike medlemmer.
 */
// Statusene fra redeem_invite() oversatt til noe som kan stå på skjermen.
// Funksjonen kaster ikke: et unntak ruller tilbake forsøksloggen som
// bremser gjetting av de korte kodene.
const INVITE_MESSAGES = {
  not_found: 'Fant ingen invitasjon med den koden. Sjekk at den er skrevet riktig.',
  used: 'Invitasjonen er allerede brukt. Be om en ny.',
  expired: 'Invitasjonen er utløpt. Be om en ny.',
  full: 'Listen er full (maks 10 medlemmer).',
  rate_limited: 'For mange forsøk. Prøv igjen om en time.',
  not_signed_in: 'Du må være innlogget for å bli med i en liste.',
};

/**
 * Løser inn en invitasjonskode. Prøver redeem_invite() først, og faller
 * tilbake til den gamle accept_invite() hvis databasen ikke har fått
 * migrasjonen ennå.
 * @returns {{error: string|null, householdId: string|null}}
 */
async function redeemCode(code, displayName) {
  const { data, error } = await supabase.rpc('redeem_invite', {
    code, display_name: displayName || null,
  });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    const status = row?.status ?? 'not_found';
    if (status === 'ok' || status === 'already_member') {
      return { error: null, householdId: row?.household_id ?? null };
    }
    return { error: INVITE_MESSAGES[status] ?? 'Kunne ikke bli med i listen.', householdId: null };
  }
  // PGRST202: funksjonen finnes ikke (migrasjonen er ikke kjørt).
  if (error.code !== 'PGRST202' && !/does not exist/i.test(error.message ?? '')) {
    return { error: error.message || 'Kunne ikke bli med i listen.', householdId: null };
  }
  const { data: legacy, error: legacyErr } = await supabase.rpc('accept_invite', {
    code, display_name: displayName || null,
  });
  if (legacyErr) return { error: legacyErr.message, householdId: null };
  if (!legacy) return { error: INVITE_MESSAGES.not_found, householdId: null };
  return { error: null, householdId: legacy };
}

export function useSharedLists(user) {
  const [lists, setLists] = useState([]);
  const [members, setMembers] = useState([]);
  const [activeId, setActiveId] = useState(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('ready');

  const activeList = useMemo(
    () => lists.find((l) => l.id === activeId) ?? lists[0] ?? null,
    [lists, activeId],
  );

  const setActive = useCallback((id) => {
    setActiveId(id);
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignorer */ }
  }, []);

  const loadLists = useCallback(async () => {
    if (!user) { setLists([]); setMembers([]); setLoading(false); return; }
    setLoading(true);

    const { data, error: e } = await supabase
      .from('members')
      // households(*): nye kolonner (hidden_meals, …) følger med automatisk,
      // og en frontend-deploy før migrasjonen er kjørt knekker ingenting.
      .select('household_id, role, display_name, households(*)')
      .eq('user_id', user.id);

    if (e) { setError(e.message); setLoading(false); return; }

    const rows = (data ?? [])
      .filter((r) => r.households)
      .map((r) => ({ ...r.households, myRole: r.role }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'));

    setLists(rows);
    setStage(rows.length ? 'ready' : 'needs-name');
    setError(null);
    setLoading(false);
  }, [user]);

  // Medlemmer i den aktive listen.
  const loadMembers = useCallback(async () => {
    if (!activeList) { setMembers([]); return; }
    const { data } = await supabase
      .from('members')
      .select('user_id, display_name, initials, role, avatar, created_at')
      .eq('household_id', activeList.id)
      .order('created_at');
    setMembers(data ?? []);
  }, [activeList]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true;
    (async () => {
      const pending = readPending();
      if (pending) {
        const { error: aErr } = await redeemCode(pending, null);
        clearPending();
        if (aErr && active) setError(aErr);
      }
      if (active) await loadLists();
    })();
    return () => { active = false; };
  }, [user, loadLists]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // --- Handlinger ------------------------------------------------------------
  const bootstrap = useCallback(async (displayName, listName) => {
    const { error: e } = await supabase.rpc('bootstrap_household', {
      display_name: displayName, household_name: listName || null,
    });
    if (e) return e.message;
    await loadLists();
    return null;
  }, [loadLists]);

  const createList = useCallback(async (name, kind) => {
    const { data, error: e } = await supabase.rpc('create_shared_list', {
      list_name: name, list_kind: kind,
    });
    if (e) return { id: null, error: e.message };
    await loadLists();
    if (data) setActive(data);
    return { id: data, error: null };
  }, [loadLists, setActive]);

  const createInvite = useCallback(async (listId) => {
    const fail = (m) => ({ link: null, code: null, expiresAt: null, error: m });
    try {
      const { data, error: e } = await supabase.rpc('create_invite', {
        list_id: listId ?? activeList?.id ?? null,
      });
      if (e) {
        if (e.code === 'PGRST202') {
          return fail('Invitasjonsfunksjonen er ikke tilgjengelig ennå. Vent et minutt og prøv igjen.');
        }
        return fail(e.message || 'Kunne ikke lage invitasjonslenke.');
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.code) return fail('Fikk ingen invitasjonskode tilbake. Prøv igjen.');
      return {
        link: `${window.location.origin}/app/?invite=${row.code}`,
        code: row.code,
        expiresAt: row.expires_at ?? null,
        error: null,
      };
    } catch (e) {
      return fail(e?.message || 'Uventet feil ved oppretting av invitasjon.');
    }
  }, [activeList]);

  /** Send invitasjonen rett på e-post. Faller tilbake med NO_MAILER hvis
      Resend-nøkkelen ikke er satt, så UI-et kan vise lenken i stedet. */
  const sendInvite = useCallback(async (email, listId) => {
    const { data, error: e } = await supabase.functions.invoke('send-invite', {
      body: { email, list_id: listId ?? activeList?.id ?? null },
    });
    if (e) {
      // supabase-js legger funksjonens svar i e.context ved ikke-2xx.
      try {
        const body = await e.context?.json?.();
        if (body?.code === 'NO_MAILER') return { ok: false, noMailer: true, error: body.error };
        if (body?.error) return { ok: false, error: body.error };
      } catch { /* fall gjennom */ }
      return { ok: false, error: 'Kunne ikke sende invitasjonen.' };
    }
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true };
  }, [activeList]);

  const redeemInvite = useCallback(async (code, displayName) => {
    // Mellomrom og bindestrek skal ikke avgjøre noe — databasen vasker
    // koden på samme måte, dette er bare for tomt-feltet-sjekken.
    const cleaned = String(code || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!cleaned) return 'Skriv inn invitasjonskoden.';
    const { error: e, householdId } = await redeemCode(cleaned, displayName);
    if (e) return e;
    await loadLists();
    if (householdId) setActive(householdId);
    return null;
  }, [loadLists, setActive]);

  /** Bare eier kan fjerne andre — RLS håndhever det uansett hva UI-et gjør. */
  const removeMember = useCallback(async (userId) => {
    if (!activeList) return 'Ingen liste valgt.';
    const { error: e } = await supabase
      .from('members').delete()
      .eq('household_id', activeList.id).eq('user_id', userId);
    if (e) return e.message;
    await loadMembers();
    return null;
  }, [activeList, loadMembers]);

  const leaveList = useCallback(async (listId) => {
    const { error: e } = await supabase.rpc('leave_shared_list', { list_id: listId });
    if (e) return e.message;
    try { localStorage.removeItem(ACTIVE_KEY); } catch { /* ignorer */ }
    setActiveId(null);
    await loadLists();
    return null;
  }, [loadLists]);

  /** Endre navn, type eller familiestørrelse. RLS slipper bare eier til. */
  const updateList = useCallback(async (listId, patch) => {
    // .select() gjør at vi ser HVA som ble endret. RLS lar bare eieren
    // skrive, og en oppdatering som treffer null rader er ikke en feil i
    // PostgREST — den er bare tom. Uten dette sa appen «lagret», lastet
    // de gamle verdiene tilbake, og ingen forsto hvorfor.
    const { data, error: e } = await supabase
      .from('households').update(patch).eq('id', listId).select('id');
    if (e) return e.message;
    if (!data?.length) return 'Bare den som eier listen kan endre dette.';
    await loadLists();
    return null;
  }, [loadLists]);

  const isOwner = activeList?.myRole === 'owner';

  return {
    lists, activeList, activeId: activeList?.id ?? null, members, isOwner,
    loading, error, stage,
    setActive, bootstrap, createList, createInvite, sendInvite, redeemInvite,
    removeMember, leaveList, updateList, reload: loadLists,
  };
}
