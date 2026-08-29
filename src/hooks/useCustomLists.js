import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { copyList } from '../lib/customLists.js';

/**
 * Egne lister med sanntidssynk — samme mønster som handlelisten, så begge
 * ser avhukinger med én gang.
 */
export function useCustomLists(householdId, currentUserId, { onRemoteChange } = {}) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);

  const onRemoteChangeRef = useRef(onRemoteChange);
  useEffect(() => { onRemoteChangeRef.current = onRemoteChange; }, [onRemoteChange]);

  const load = useCallback(async () => {
    if (!householdId) { setLists([]); setLoading(false); return; }
    const { data } = await supabase
      .from('custom_lists').select('*')
      .eq('household_id', householdId).order('created_at');
    setLists(data ?? []);
    setLoading(false);
  }, [householdId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!householdId) return undefined;
    const channel = supabase
      .channel(`custom_lists:${householdId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'custom_lists',
        filter: `household_id=eq.${householdId}`,
      }, (payload) => {
        const { eventType, new: next, old: prev } = payload;
        if (eventType === 'INSERT') {
          setLists((cur) => (cur.some((l) => l.id === next.id) ? cur : [...cur, next]));
        } else if (eventType === 'UPDATE') {
          setLists((cur) => cur.map((l) => (l.id === next.id ? next : l)));
          if (next.created_by !== currentUserId) onRemoteChangeRef.current?.(next);
        } else if (eventType === 'DELETE') {
          setLists((cur) => cur.filter((l) => l.id !== prev.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [householdId, currentUserId]);

  const create = useCallback(async ({ name, type, items = [], shared = true }) => {
    const { data, error } = await supabase.from('custom_lists').insert({
      household_id: householdId, created_by: currentUserId, name, type, items, shared,
    }).select().single();
    if (error) return null;
    setLists((cur) => (cur.some((l) => l.id === data.id) ? cur : [...cur, data]));
    return data;
  }, [householdId, currentUserId]);

  /** Optimistisk oppdatering — avhuking skal føles umiddelbar. */
  const update = useCallback(async (id, patch) => {
    setLists((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const { error } = await supabase.from('custom_lists').update(patch).eq('id', id);
    if (error) load();
  }, [load]);

  const remove = useCallback(async (id) => {
    const snapshot = lists.find((l) => l.id === id);
    setLists((cur) => cur.filter((l) => l.id !== id));
    const { error } = await supabase.from('custom_lists').delete().eq('id', id);
    if (error) load();
    return snapshot;
  }, [lists, load]);

  /** Legger tilbake en slettet liste (angre-knappen). */
  const restore = useCallback(async (row) => {
    if (!row) return;
    const { id, created_at, updated_at, ...rest } = row;
    const { data } = await supabase.from('custom_lists').insert(rest).select().single();
    if (data) setLists((cur) => [...cur, data]);
  }, []);

  const duplicate = useCallback(async (list) => create(copyList(list)), [create]);

  return { lists, loading, create, update, remove, restore, duplicate, reload: load };
}
