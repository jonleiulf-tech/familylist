import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Lært plukk-rekkefølge per butikk.
 *
 * Hver fullført handletur lagrer rekkefølgen kategoriene ble plukket i, og
 * vekter mot den gamle rekkefølgen 75/25 (gammel teller mest, så én uvanlig
 * tur ikke velter en innarbeidet rute).
 */
const OLD_WEIGHT = 0.75;
const NEW_WEIGHT = 0.25;

// Statisk fallback-rekkefølge før noe er lært.
export const DEFAULT_ORDER = [
  'Frukt og grønt', 'Brød og korn', 'Meieri', 'Ost og pålegg', 'Kjøtt', 'Fisk',
  'Tørrvarer', 'Krydder og saus', 'Frysevarer', 'Snacks', 'Drikke', 'Hus og hjem', 'Annet',
];

export function usePickOrder(householdId) {
  const [order, setOrder] = useState({});   // { [store]: { [category]: position } }

  const load = useCallback(async () => {
    if (!householdId) return;
    const { data } = await supabase
      .from('picked_order')
      .select('store, category, position')
      .eq('household_id', householdId);
    const next = {};
    (data ?? []).forEach((r) => {
      next[r.store] = next[r.store] || {};
      next[r.store][r.category] = Number(r.position);
    });
    setOrder(next);
  }, [householdId]);

  useEffect(() => { load(); }, [load]);

  /** Posisjon 0..1 for en kategori i en butikk. Lavere = tidligere i butikken. */
  const positionOf = useCallback((store, category) => {
    const learned = order[store]?.[category];
    if (learned != null) return learned;
    const idx = DEFAULT_ORDER.indexOf(category);
    // +2 holder ulærte kategorier bak de lærte (som ligger i 0..1)
    return 2 + (idx < 0 ? DEFAULT_ORDER.length : idx) / DEFAULT_ORDER.length;
  }, [order]);

  /**
   * Lagrer rekkefølgen kategoriene faktisk ble plukket i.
   * sequenceByStore: { [store]: [kategori, kategori, ...] } i plukkerekkefølge.
   */
  const learnFromTrip = useCallback(async (sequenceByStore) => {
    const rows = [];
    const next = { ...order };

    Object.entries(sequenceByStore).forEach(([store, categories]) => {
      const unique = [...new Set(categories)];
      if (unique.length < 2) return;   // for lite signal til å lære noe
      next[store] = { ...(next[store] || {}) };
      unique.forEach((category, i) => {
        const pos = i / (unique.length - 1);
        const prev = next[store][category];
        const blended = prev == null ? pos : prev * OLD_WEIGHT + pos * NEW_WEIGHT;
        next[store][category] = blended;
        rows.push({
          household_id: householdId,
          store,
          category,
          position: Number(blended.toFixed(4)),
          updated_at: new Date().toISOString(),
        });
      });
    });

    if (!rows.length) return;
    setOrder(next);
    await supabase.from('picked_order').upsert(rows, { onConflict: 'household_id,store,category' });
  }, [order, householdId]);

  return { order, positionOf, learnFromTrip, reload: load };
}
