// Skriver en GODKJENT kvittering til databasen.
//
// Kalles først etter at validateReceipt() har sagt ja og brukeren har
// bekreftet. Fire ting skjer, i denne rekkefølgen:
//   1. Kvitteringen REGISTRERES — butikk, dato, antall linjer og totalsum.
//      Dette er også duplikatsperren: samme kvittering to ganger lærer
//      ingenting nytt, og gir poeng én gang.
//   2. Anonymt bidrag til den felles prisdatabasen (price_observations),
//      med mengde, enhetspris og ORDINÆR enhetspris.
//   3. Husholdningens egen vane: hvor mye VI pleier å kjøpe (item_habits).
//   4. Ingenting mer. Selve prisjusteringen av item_catalog gjøres av
//      learn-prices-funksjonen, som har skriverett — katalogen er
//      referansedata og kan bare endres av service_role.
//
// Merk at price_observations bevisst ikke har household_id eller user_id —
// bidraget er anonymt, slik handoff-en krever. Mengdevanen er det motsatte:
// den er privat, og hører til husholdningen.
//
// Radene legges inn gjennom record_price_observations() og ikke direkte.
// Grunnen: den direkte veien var åpen for alle uten tak, og læringsjobben
// skriver videre til item_catalog som ALLE husholdninger leser. Ti tusen
// rader som sa «Melk = 99 kroner» ville flyttet prisen for alle andre
// familier — og fordi radene er anonyme med vilje, kunne ingen ryddet opp
// etterpå. Funksjonen har dagskvote og vasker verdiene.

import { supabase } from './supabase.js';
import { resolveCatalogItem } from './catalog.js';
import { nextHabit } from './priceLearning.js';

/**
 * @param {object} result      fra validateReceipt(), må ha valid === true
 * @param {number} confidence  1.0 for tekst, 0.9 for PDF, 0.6 for OCR
 * @param {object[]} catalog   varedatabasen, til navnekobling
 * @param {Map} normRules      navneregler
 * @param {{householdId?: string, source?: string}} [opts]
 * @returns {Promise<{inserted:number, habits:number, points:number,
 *                    duplicate:boolean, message:string|null}>}
 */
export async function applyReceipt(result, confidence, catalog, normRules, opts = {}) {
  if (!result?.valid) throw new Error('Kvitteringen er ikke godkjent.');

  const observedAt = new Date(`${result.date}T12:00:00`).toISOString();

  // Koble kvitteringslinja mot katalogen, slik at «Lettmelk 1,2% 1l»
  // havner på «Melk» og ikke blir en egen vare for hver pakningsstørrelse.
  const rows = result.lines.map((line) => {
    const { name, item, confidence: matchConfidence, method } = resolveCatalogItem(line.name, catalog, normRules);
    return { name, line, matchConfidence: matchConfidence ?? (item ? 0.5 : 0), method: method ?? (item ? 'unknown' : 'none'), matched: Boolean(item) };
  });

  // 1) Registrer kvitteringen først. Er den alt registrert, er prisene i
  //    den alt lært — og da skal ingenting skrives på nytt. Uten denne
  //    sperren var to opplastinger av samme fil nok til å passere
  //    terskelen på to observasjoner, så én feillest OCR-linje kunne
  //    flytte prisen helt alene.
  const receipt = await logUpload(result, opts);
  if (receipt.duplicate) {
    return {
      inserted: 0, habits: 0, points: 0, duplicate: true,
      message: receipt.message ?? 'Denne kvitteringen er alt lagt inn.',
    };
  }

  // 2) Anonymt prisbidrag.
  const observations = rows.map(({ name, line, matchConfidence, method }) => ({
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
    confidence,
    // Fase 1 (docs/prisintelligens-plan.md §2a): samme rad gir OGSÅ en
    // privat kjøpslinje i household_purchases når husholdningen er kjent.
    // Funksjonen skriver aldri household_id på den anonyme observasjonen.
    household_id: opts.householdId ?? null,
    source: 'receipt',
    match_confidence: matchConfidence,
    match_method: method,
    discount_amount: line.discount ?? null,
  }));

  const { data: inserted, error } = await supabase
    .rpc('record_price_observations', { p_rows: observations });
  if (error) throw new Error(error.message);

  const quotaSpent = Number(inserted) === -1;

  // Usikre treff blir ikke stille permanente (§2d). Linjer katalogen ikke
  // kjente igjen legges i vaskelista til bekreftelse. Feiler dette, er
  // kvitteringen likevel lagret.
  await queueUncertain(rows, opts.householdId);

  // 3) Husholdningens mengdevaner.
  const habits = await updateHabits(rows, observedAt, opts.householdId);

  return {
    inserted: quotaSpent ? 0 : Number(inserted) || 0,
    habits,
    points: receipt.points,
    duplicate: false,
    message: quotaSpent
      ? 'Kvitteringen er registrert, men dagens prisbidrag er brukt opp. Prøv resten i morgen.'
      : receipt.message,
  };
}

/** Legger ukjente kvitteringslinjer i vaskelista (import_queue). Høyst 20 per kvittering. */
async function queueUncertain(rows, householdId) {
  if (!householdId) return 0;
  const usikre = rows
    .filter((r) => !r.matched && String(r.line?.name ?? '').trim().length >= 2)
    .slice(0, 20)
    .map((r) => ({ household_id: householdId, raw_text: String(r.line.name).slice(0, 120), suggestion: r.name, status: 'pending' }));
  if (!usikre.length) return 0;
  const { error } = await supabase.from('import_queue').insert(usikre);
  return error ? 0 : usikre.length;
}

/**
 * Registrerer kvitteringen og henter ut Plukkepoengene.
 *
 * Feiler kallet — gammel database, nettet borte — går kvitteringen likevel
 * inn. Poeng er en hyggelig bonus; prisene er poenget.
 */
async function logUpload(result, opts) {
  if (!opts.householdId) return { duplicate: false, points: 0, message: null };
  const { data, error } = await supabase.rpc('log_receipt_upload', {
    p_household: opts.householdId,
    p_store: result.store.code,
    p_date: result.date,
    p_lines: result.lines.length,
    p_total: result.total ?? result.lineSum,
    p_source: opts.source ?? null,
  });
  if (error) return { duplicate: false, points: 0, message: null };
  const row = Array.isArray(data) ? data[0] : data;
  // ok=true og points=0 betyr «alt registrert» ELLER «poengtaket nådd».
  // Bare den første skal stoppe skrivingen, og den kjennes på meldingen.
  const already = /alt registrert/i.test(String(row?.message ?? ''));
  return {
    duplicate: Boolean(already),
    points: Number(row?.points) || 0,
    message: row?.message ?? null,
  };
}

/**
 * Oppdaterer husholdningens mengdevaner fra kvitteringen.
 *
 * Feiler dette, er kvitteringen likevel lagret — prisobservasjonene er det
 * viktige, og vanen tas igjen neste tur. Derfor kastes ingen feil videre.
 */
async function updateHabits(rows, observedAt, householdId) {
  if (!householdId) return 0;

  // SUMMER først, blend etterpå. Agurk på to linjer er to agurker kjøpt,
  // ikke to observasjoner à én. Før ble hver linje blandet inn for seg,
  // så en vane på 2 gikk 2 → 1,7 → 1,49 og appen lærte «kjøp én» av at
  // familien kjøpte to. Nøyaktig den underestimeringen piloten avslørte.
  const perItem = new Map();
  for (const { name, line } of rows) {
    const qty = Number(line.qty);
    if (!(qty > 0)) continue;
    const key = `${name}|${line.unit ?? ''}`;
    const prev = perItem.get(key);
    if (prev) prev.qty += qty;
    else perItem.set(key, { name, unit: line.unit ?? null, qty });
  }
  if (!perItem.size) return 0;

  const names = [...new Set([...perItem.values()].map((r) => r.name))];
  const { data: existing, error } = await supabase
    .from('item_habits')
    .select('item_name, usual_qty, unit, times_bought')
    .eq('household_id', householdId)
    .in('item_name', names);
  if (error) return 0;

  const byName = new Map((existing ?? []).map((h) => [h.item_name, h]));
  const payload = [];
  for (const row of perItem.values()) {
    const habit = nextHabit(byName.get(row.name) ?? null, { qty: row.qty, unit: row.unit });
    if (!habit) continue;
    byName.set(row.name, habit);
    payload.push({
      household_id: householdId,
      item_name: row.name,
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

  // ÉN RAD AV GANGEN, i porsjoner. Med hele kvitteringen i én upsert
  // kunne én urimelig mengde få databasen til å avvise ALLE vanene fra
  // den kvitteringen — og feilen ble svelget, så brukeren fikk en
  // suksessmelding og ingen læring.
  const rowsOut = [...merged.values()];
  let saved = 0;
  for (let i = 0; i < rowsOut.length; i += 25) {
    const chunk = rowsOut.slice(i, i + 25);
    // eslint-disable-next-line no-await-in-loop
    const { error: upsertError } = await supabase
      .from('item_habits')
      .upsert(chunk, { onConflict: 'household_id,item_name' });
    if (!upsertError) saved += chunk.length;
  }
  return saved;
}
