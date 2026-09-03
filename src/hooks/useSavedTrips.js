import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export function useSavedTrips(householdId) {
  const [trips, setTrips] = useState([]);
  // Bare siste henting får skrive — et sent svar for forrige husholdning
  // skal ikke overskrive den nye.
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const my = ++reqRef.current;
    if (!householdId) return;
    const { data } = await supabase.from('saved_trips').select('*')
      .eq('household_id', householdId).order('trip_date', { ascending: false }).limit(20);
    if (my !== reqRef.current) return;
    setTrips(data ?? []);
  }, [householdId]);

  useEffect(() => { load(); }, [load]);

  const saveTrip = useCallback(async (name, items) => {
    const payload = items.map((i) => ({
      name: i.name, qty: i.qty, unit: i.unit, category: i.category,
      store: i.store, price: i.price, price_source: i.price_source, pack_size: i.pack_size,
    }));
    await supabase.from('saved_trips').insert({ household_id: householdId, name, items: payload });
    await load();
  }, [householdId, load]);

  /** Slett en lagret liste — med angre via restoreTrip. */
  const removeTrip = useCallback(async (id) => {
    const snapshot = trips.find((t) => t.id === id);
    setTrips((cur) => cur.filter((t) => t.id !== id));
    const { error } = await supabase.from('saved_trips').delete().eq('id', id);
    if (error) load();
    return snapshot;
  }, [trips, load]);

  const restoreTrip = useCallback(async (row) => {
    if (!row) return;
    const { id, created_at, ...rest } = row;
    const { data } = await supabase.from('saved_trips').insert(rest).select().single();
    if (data) setTrips((cur) => [data, ...cur]);
  }, []);

  return { trips, saveTrip, removeTrip, restoreTrip, reload: load };
}
