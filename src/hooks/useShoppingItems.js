import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Handlelisten med sanntidssynk.
 *
 * Endringer fra den andre i husholdningen kommer inn via Realtime og flettes
 * inn i lokal state. Vi gjør en optimistisk oppdatering lokalt først, slik at
 * egen enhet føles rask, og lar serverraden vinne når den kommer tilbake.
 */
export function useShoppingItems(householdId, currentUserId, { onRemoteCheck } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Callbacken brukes inne i realtime-abonnementet. Den ligger i en ref slik at
  // vi ikke må rive og sette opp kanalen på nytt hver gang forelderen rendrer.
  const onRemoteCheckRef = useRef(onRemoteCheck);
  useEffect(() => { onRemoteCheckRef.current = onRemoteCheck; }, [onRemoteCheck]);

  // Siste kjente liste lagres lokalt, slik at handlelisten kan LESES uten
  // dekning (frysedisken innerst i butikken). Skriving krever fortsatt nett.
  const snapshotKey = `pl.items.${householdId}`;

  const load = useCallback(async () => {
    if (!householdId) { setItems([]); setLoading(false); return; }
    const { data, error: e } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true });
    if (e) {
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(snapshotKey) ?? 'null'); } catch { /* tomt */ }
      if (Array.isArray(cached)) {
        setItems(cached);
        setError('Uten nett — viser sist kjente liste.');
      } else {
        setError(e.message);
      }
    } else {
      setItems(data ?? []);
      setError(null);
      try { localStorage.setItem(snapshotKey, JSON.stringify(data ?? [])); } catch { /* fullt */ }
    }
    setLoading(false);
  }, [householdId, snapshotKey]);

  useEffect(() => { load(); }, [load]);

  // Hold øyeblikksbildet ferskt også når realtime-endringer kommer inn.
  useEffect(() => {
    if (loading || !householdId) return;
    try { localStorage.setItem(snapshotKey, JSON.stringify(items)); } catch { /* fullt */ }
  }, [items, loading, householdId, snapshotKey]);

  // Når nettet kommer tilbake: hent ferske data av seg selv.
  useEffect(() => {
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  // --- Realtime -------------------------------------------------------------
  useEffect(() => {
    if (!householdId) return undefined;

    const channel = supabase
      .channel(`shopping_items:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_items',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          const { eventType, new: next, old: prev } = payload;

          if (eventType === 'INSERT') {
            setItems((cur) => (cur.some((i) => i.id === next.id) ? cur : [...cur, next]));
          } else if (eventType === 'UPDATE') {
            setItems((cur) => cur.map((i) => (i.id === next.id ? next : i)));
            // «Marte plukket Melk» — kun når det faktisk var den andre som gjorde det.
            const becameChecked = next.checked && !prev?.checked;
            if (becameChecked && next.checked_by && next.checked_by !== currentUserId) {
              onRemoteCheckRef.current?.(next);
            }
          } else if (eventType === 'DELETE') {
            setItems((cur) => cur.filter((i) => i.id !== prev.id));
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [householdId, currentUserId]);

  // --- Skriveoperasjoner ----------------------------------------------------
  const addItem = useCallback(async (fields) => {
    const row = {
      household_id: householdId,
      created_by: currentUserId,
      qty: 1,
      unit: 'stk',
      ...fields,
    };
    const { data, error: e } = await supabase
      .from('shopping_items')
      .insert(row)
      .select()
      .single();
    if (e) { setError(e.message); return null; }
    // Realtime sender også denne raden; setItems nedenfor er idempotent på id.
    setItems((cur) => (cur.some((i) => i.id === data.id) ? cur : [...cur, data]));
    return data;
  }, [householdId, currentUserId]);

  const addMany = useCallback(async (rows) => {
    if (!rows.length) return [];
    const payload = rows.map((r) => ({
      household_id: householdId, created_by: currentUserId, qty: 1, unit: 'stk', ...r,
    }));
    const { data, error: e } = await supabase.from('shopping_items').insert(payload).select();
    if (e) { setError(e.message); return []; }
    setItems((cur) => {
      const known = new Set(cur.map((i) => i.id));
      return [...cur, ...data.filter((d) => !known.has(d.id))];
    });
    return data;
  }, [householdId, currentUserId]);

  const updateItem = useCallback(async (id, patch) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));  // optimistisk
    const { error: e } = await supabase.from('shopping_items').update(patch).eq('id', id);
    if (e) { setError(e.message); load(); }
  }, [load]);

  const toggleChecked = useCallback(async (item) => {
    const checked = !item.checked;
    await updateItem(item.id, {
      checked,
      checked_at: checked ? new Date().toISOString() : null,
      checked_by: checked ? currentUserId : null,
    });
  }, [updateItem, currentUserId]);

  const removeItem = useCallback(async (id) => {
    const snapshot = items.find((i) => i.id === id);
    setItems((cur) => cur.filter((i) => i.id !== id));
    const { error: e } = await supabase.from('shopping_items').delete().eq('id', id);
    if (e) { setError(e.message); load(); }
    return snapshot;
  }, [items, load]);

  /** Legger tilbake en slettet rad (angre-knappen i toasten). */
  const restoreItem = useCallback(async (row) => {
    if (!row) return;
    const { id, ...rest } = row;
    const { data, error: e } = await supabase
      .from('shopping_items').insert(rest).select().single();
    if (e) { setError(e.message); return; }
    setItems((cur) => [...cur, data]);
  }, []);

  /** Tømmer HELE listen — brukes når en handletur fullføres. */
  const clearAll = useCallback(async () => {
    const snapshot = items;
    setItems([]);
    const { error: e } = await supabase
      .from('shopping_items').delete().eq('household_id', householdId);
    if (e) { setError(e.message); load(); }
    return snapshot;
  }, [items, householdId, load]);

  return {
    items, loading, error, reload: load,
    addItem, addMany, updateItem, toggleChecked, removeItem, restoreItem, clearAll,
  };
}
