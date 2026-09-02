import { useCallback, useEffect, useState } from 'react';
import { observedRoute } from '../lib/storeRoutes.js';
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
    // Er butikken kartlagt (observert rute), er den et mye bedre
    // utgangspunkt enn gjennomsnittsbutikken: i Coop Extra går man inn i
    // drikke og ender i frys, mens standarden starter med frukt og grønt.
    const observed = observedRoute(store)?.[category];
    if (observed != null) return observed;
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
      // Første tur i en kartlagt butikk starter fra den OBSERVERTE ruta,
      // ikke fra ingenting. Da flyttes bare det man faktisk gikk, og
      // resten av ruta står — og etter noen turer er observasjonen
      // fortynnet av din egen oppførsel (75/25 per tur).
      const prior = observedRoute(store);

      // Turen sier bare noe om rekkefølgen MELLOM de kategoriene den
      // faktisk innom. Før ble posisjonene strukket over hele 0–1 uansett
      // hvor få de var, så en topptur med frossenpizza og brus påsto
      // «frysevarene ligger først i butikken» — og etter fire slike turer
      // lå frysedisken en tredjedel inn i en butikk der den står helt
      // bakerst. Nå brukes bunnen og toppen av det de LIGGER på i dag.
      const known = unique
        .map((c) => next[store][c] ?? prior?.[c])
        .filter((v) => Number.isFinite(v));
      const lo = known.length ? Math.min(...known) : 0;
      const hi = known.length ? Math.max(...known) : 1;
      const span = hi - lo > 0.05 ? hi - lo : 1;
      const base = hi - lo > 0.05 ? lo : 0;

      // Og en liten handlekurv skal dulte, ikke undervise. Full vekt
      // først ved seks kategorier eller mer.
      const weight = NEW_WEIGHT * Math.min(1, unique.length / 6);

      unique.forEach((category, i) => {
        const pos = base + (i / (unique.length - 1)) * span;
        const prev = next[store][category] ?? prior?.[category];
        const blended = prev == null ? pos : prev * (1 - weight) + pos * weight;
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

  /** Har lista lært noe om denne butikken ennå? Styrer hintet i UI-et. */
  const hasLearnedFor = useCallback(
    (store) => Object.keys(order[store] ?? {}).length > 0,
    [order],
  );

  return { order, positionOf, hasLearnedFor, learnFromTrip, reload: load };
}
