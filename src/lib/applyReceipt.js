// Skriver en GODKJENT kvittering til databasen.
//
// Kalles først etter at validateReceipt() har sagt ja og brukeren har
// bekreftet. To ting skjer, i denne rekkefølgen:
//   1. Husholdningens eget mønster: prisobservasjoner knyttet til varenavn.
//   2. Anonymt bidrag til den felles prisdatabasen.
//
// Merk at price_observations bevisst ikke har household_id eller user_id —
// bidraget er anonymt, slik handoff-en krever.

import { supabase } from './supabase.js';
import { resolveCatalogItem } from './catalog.js';

/**
 * @param {object} result      fra validateReceipt(), må ha valid === true
 * @param {number} confidence  1.0 for tekst, 0.9 for PDF, 0.6 for OCR
 */
export async function applyReceipt(result, confidence, catalog, normRules) {
  if (!result?.valid) throw new Error('Kvitteringen er ikke godkjent.');

  const observedAt = new Date(`${result.date}T12:00:00`).toISOString();

  const observations = result.lines.map((line) => {
    // Koble kvitteringslinja mot katalogen, slik at «Lettmelk 1,2% 1l»
    // havner på «Melk» og ikke blir en egen vare for hver pakningsstørrelse.
    const { name } = resolveCatalogItem(line.name, catalog, normRules);
    return {
      item_name: name,
      store_code: result.store.code,
      price: line.price,
      observed_at: observedAt,
      source: 'receipt',
      confidence,
    };
  });

  const { error } = await supabase.from('price_observations').insert(observations);
  if (error) throw new Error(error.message);

  return { inserted: observations.length };
}
