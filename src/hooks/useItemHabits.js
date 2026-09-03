import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { lower } from '../lib/text.js';

/**
 * Husholdningens mengdevaner: hvor mye VI pleier å kjøpe av hver vare.
 *
 * Lært av kvitteringene (se applyReceipt). Piloten 2. september viste
 * hvorfor det trengs: 93 artikler kjøpt mot 46 linjer på listen — appen
 * la til 1 av alt, mens familien kjøper to.
 *
 * Prisene er et fellesgode og ligger i item_catalog; mengden er privat og
 * ligger her, bak RLS.
 */
export function useItemHabits(householdId) {
  const [byName, setByName] = useState(() => new Map());
  // Bare siste henting får skrive — et sent svar for forrige husholdning
  // skal ikke overskrive den nye.
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const my = ++reqRef.current;
    if (!householdId) { setByName(new Map()); return; }
    const { data, error } = await supabase
      .from('item_habits')
      .select('item_name, usual_qty, unit, times_bought, last_bought_at')
      .eq('household_id', householdId);
    if (my !== reqRef.current) return;
    // Feiler oppslaget, står appen med tom vane — den legger til 1 som før,
    // og det er en riktigere oppførsel enn å vise en gjetning som fasit.
    if (error) return;
    setByName(new Map((data ?? []).map((h) => [lower(h.item_name), h])));
  }, [householdId]);

  useEffect(() => { load(); }, [load]);

  return { byName, reload: load };
}
