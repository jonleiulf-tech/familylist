import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export function useSavedTrips(householdId) {
  const [trips, setTrips] = useState([]);

  const load = useCallback(async () => {
    if (!householdId) return;
    const { data } = await supabase.from('saved_trips').select('*')
      .eq('household_id', householdId).order('trip_date', { ascending: false }).limit(20);
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

  return { trips, saveTrip, reload: load };
}
