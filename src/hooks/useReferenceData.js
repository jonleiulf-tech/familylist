import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Referansedata: varekatalog, normaliseringsregler, butikker og
 * middagsbibliotek. Endrer seg praktisk talt aldri, så det hentes én gang
 * per økt og mellomlagres i localStorage som offline-cache.
 */
const CACHE_KEY = 'fl-reference-v1';
const CACHE_TTL = 24 * 60 * 60 * 1000;   // ett døgn

export function useReferenceData(enabled) {
  const [data, setData] = useState({ catalog: [], normRules: new Map(), stores: [], mealLibrary: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;

    const hydrate = (raw) => ({
      catalog: raw.catalog ?? [],
      normRules: new Map((raw.normRules ?? []).map(([f, t]) => [f.toLowerCase(), t])),
      stores: raw.stores ?? [],
      mealLibrary: raw.mealLibrary ?? [],
    });

    // 1) Vis cache umiddelbart hvis den er fersk.
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < CACHE_TTL) {
        setData(hydrate(cached));
        setLoading(false);
      }
    } catch { /* ignorer korrupt cache */ }

    // 2) Hent ferske data i bakgrunnen.
    (async () => {
      const [cat, norm, st, lib] = await Promise.all([
        supabase.from('item_catalog')
          .select('id, name, category, major_category, avg_price, price_low, price_high, frequency_sig, primary_store, score, brand')
          .order('score', { ascending: false }),
        supabase.from('norm_rules').select('from_text, to_text'),
        supabase.from('stores').select('code, name, is_default, sort_order').order('sort_order'),
        supabase.from('meal_library').select('name, category, ingredients').order('name'),
      ]);
      if (!active) return;

      const raw = {
        catalog: cat.data ?? [],
        normRules: (norm.data ?? []).map((r) => [r.from_text, r.to_text]),
        stores: st.data ?? [],
        mealLibrary: lib.data ?? [],
        at: Date.now(),
      };
      setData(hydrate(raw));
      setLoading(false);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)); } catch { /* full disk e.l. */ }
    })();

    return () => { active = false; };
  }, [enabled]);

  return { ...data, loading };
}
