import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { billingState } from '../lib/billing.js';

/**
 * Abonnementet for den aktive listen.
 *
 * Mens raden hentes later vi som alt er i orden. Å blokkere handlelista i
 * det halve sekundet en spørring tar, for så å slippe den fri igjen, er
 * verre enn å slippe gjennom ett klikk for mye.
 */
export function useSubscription(household) {
  const [sub, setSub] = useState(undefined);

  const reload = useCallback(async () => {
    if (!household?.id) { setSub(null); return; }
    const { data } = await supabase
      .from('subscriptions').select('*').eq('household_id', household.id).maybeSingle();
    setSub(data ?? null);
  }, [household?.id]);

  useEffect(() => { reload(); }, [reload]);

  // Kommer man tilbake fra Stripe, har webhooken gjerne ikke rukket å
  // skrive ennå. Vi ser etter et par ganger før vi gir oss — da slipper
  // brukeren å laste siden på nytt for å se at det gikk bra.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('abonnement') !== 'takk') return undefined;
    let n = 0;
    const timer = setInterval(() => { reload(); if (++n >= 5) clearInterval(timer); }, 1500);
    return () => clearInterval(timer);
  }, [reload]);

  // Betaler man på telefonen mens fanen på pc-en står åpen, skal den ta
  // det inn når man kommer tilbake til den.
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [reload]);

  // Nytt objekt ved hver render ville revet ned memoiseringen i App —
  // sperren og alle knappene under den ble regnet på nytt hele tiden.
  const state = useMemo(() => billingState(sub), [sub]);

  return { sub, state, loading: sub === undefined, reload };
}
