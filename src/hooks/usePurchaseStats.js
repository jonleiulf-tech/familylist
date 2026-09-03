import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { householdStats } from '../lib/purchaseStats.js';

/**
 * Husholdningens kjøpsstatistikk (prisintelligens fase 2).
 *
 * Leser household_purchases — egne kjøpslinjer, bak RLS — for det siste
 * året, og regner alt i klienten: kjøpsfrekvens, butikkpreferanse per
 * vare, foretrukket produkt. Volumet er lite (noen hundre linjer), og å
 * regne her betyr at tallene aldri er en natt gamle. Fase 4 legger til
 * neste-kjøp-sannsynlighet (next), varer som opptrer sammen (together)
 * og sparingen denne måneden (savings).
 *
 * Feiler oppslaget står appen uten statistikk, ikke med en gjetning:
 * optimalisereren bruker da bare priser, og «Dere kjøper vanligvis …»
 * vises ikke.
 */
export function usePurchaseStats(householdId, { days = 365 } = {}) {
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    if (!householdId) { setRows([]); return; }
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const { data, error } = await supabase
      .from('household_purchases')
      // receipt_upload_id: samme kvittering = samme handletur (§21).
      // reference_price/estimated_saving/saving_confidence: sparing (§24).
      .select('item_name, chain_code, product_id, qty, unit, price_paid, unit_price, purchase_reason, purchased_at, source, receipt_upload_id, reference_price, estimated_saving, saving_confidence')
      .eq('household_id', householdId)
      .gte('purchased_at', since)
      .order('purchased_at', { ascending: false })
      .limit(3000);
    if (error) return;
    setRows(Array.isArray(data) ? data : []);
  }, [householdId, days]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => householdStats(rows), [rows]);
  return { ...stats, reload: load };
}
