// Skriver en GODKJENT kvittering til databasen.
//
// Kalles først etter at validateReceipt() har sagt ja og brukeren har
// bekreftet. Tre ting skjer, i denne rekkefølgen:
//   1. Anonymt bidrag til den felles prisdatabasen (price_observations),
//      nå med mengde, enhetspris og ORDINÆR enhetspris.
//   2. Husholdningens egen vane: hvor mye VI pleier å kjøpe (item_habits).
//   3. Ingenting mer. Selve prisjusteringen av item_catalog gjøres av
//      learn-prices-funksjonen, som har skriverett — katalogen er
//      referansedata og kan bare endres av service_role.
//
// Merk at price_observations bevisst ikke har household_id eller user_id —
// bidraget er anonymt, slik handoff-en krever. Mengdevanen er det motsatte:
// den er privat, og hører til husholdningen.

import { supabase } from './supabase.js';
import { resolveCatalogItem } from './catalog.js';
import { nextHabit } from './priceLearning.js';

/**
 * @param {object} result      fra validateReceipt(), må ha valid === true
 * @param {number} confidence  1.0 for tekst, 0.9 for PDF, 0.6 for OCR
 * @param {object[]} catalog   varedatabasen, til navnekobling
 * @param {Map} normRules      navneregler
 * @param {{householdId?: string}} [opts]
 */
export async function applyReceipt(result, confidence, catalog, normRules, opts = {}) {
  if (!result?.valid) throw new Error('Kvitteringen er ikke godkjent.');

  const observedAt = new Date(`${result.date}T12:00:00`).toISOString();

  // Koble kvitteringslinja mot katalogen, slik at «Lettmelk 1,2% 1l»
  // havner på «Melk» og ikke blir en egen vare for hver pakningsstørrelse.
  const rows = result.lines.map((line) => {
    const { name } = resolveCatalogItem(line.name, catalog, normRules);
    return { name, line };
  });

  const observations = rows.map(({ name, line }) => ({
    item_name: name,
    store_code: result.store.code,
    price: line.price,
    qty: line.qty ?? null,
    unit: line.unit ?? null,
    unit_price: line.unit_price ?? null,
    // Tilbudsprisen er ikke den vanlige prisen. Står ordinærprisen på
    // kvitteringen, er det DEN læringen skal bruke.
    regular_unit_price: line.regular_unit_price ?? null,
    observed_at: observedAt,
    source: 'receipt',
    confidence,
  }));

  const { error } = await supabase.from('price_observations').insert(observations);
  if (error) throw new Error(error.message);

  const habits = await updateHabits(rows, observedAt, opts.householdId);

  return { inserted: observations.length, habits };
}

/**
 * Oppdaterer husholdningens mengdevaner fra kvitteringen.
 *
 * Feiler dette, er kvitteringen likevel lagret — prisobservasjonene er det
 * viktige, og vanen tas igjen neste tur. Derfor kastes ingen feil videre.
 */
async function updateHabits(rows, observedAt, householdId) {
  if (!householdId) return 0;
  const withQty = rows.filter(({ line }) => Number(line.qty) > 0);
  if (!withQty.length) return 0;

  const names = [...new Set(withQty.map(({ name }) => name))];
  const { data: existing, error } = await supabase
    .from('item_habits')
    .select('item_name, usual_qty, unit, times_bought')
    .eq('household_id', householdId)
    .in('item_name', names);
  if (error) return 0;

  const byName = new Map((existing ?? []).map((h) => [h.item_name, h]));
  const payload = [];
  for (const { name, line } of withQty) {
    const habit = nextHabit(byName.get(name) ?? null, { qty: line.qty, unit: line.unit });
    if (!habit) continue;
    // Samme vare to ganger på én kvittering (to størrelser agurk): den
    // andre raden skal bygge på den første, ikke på den gamle verdien.
    byName.set(name, habit);
    payload.push({
      household_id: householdId,
      item_name: name,
      usual_qty: habit.usual_qty,
      unit: habit.unit,
      times_bought: habit.times_bought,
      last_bought_at: observedAt,
      updated_at: new Date().toISOString(),
    });
  }
  if (!payload.length) return 0;

  // Duplikater samles: upsert tåler ikke samme nøkkel to ganger i én batch.
  const merged = new Map(payload.map((row) => [row.item_name, row]));
  const { error: upsertError } = await supabase
    .from('item_habits')
    .upsert([...merged.values()], { onConflict: 'household_id,item_name' });
  return upsertError ? 0 : merged.size;
}
