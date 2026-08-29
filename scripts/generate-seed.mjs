// Genererer supabase/migrations/*_seed.sql fra designdataene.
// Kjør på nytt hvis fl-data.js eller meals-library.js oppdateres:
//   npm run seed:generate
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { ITEMS, NORM, DINNER_PATTERNS, META } = await import(join(root, 'design-reference/fl-data.js'));
const { MEAL_LIBRARY } = await import(join(root, 'design-reference/meals-library.js'));

// Hovedkategorier — samme MAJOR-kart som prototypen bruker for å sortere listen.
const MAJOR = {
  'Meieri':'Meieri','Melkefritt':'Meieri','Ost':'Ost og pålegg','Pålegg':'Ost og pålegg',
  'Syltetøy':'Ost og pålegg','Kjøtt':'Kjøtt','Kylling':'Kjøtt','Pølser':'Kjøtt','Fisk':'Fisk',
  'Grønnsaker':'Frukt og grønt','Frysegrønt':'Frukt og grønt','Frukt':'Frukt og grønt',
  'Salat':'Frukt og grønt','Bær':'Frukt og grønt','Tørket frukt':'Frukt og grønt',
  'Brød':'Brød og korn','Brød og korn':'Brød og korn','Knekkebrød':'Brød og korn',
  'Frokost':'Brød og korn','Pasta':'Tørrvarer','Tørrvarer':'Tørrvarer','Mel':'Tørrvarer',
  'Baking':'Tørrvarer','Frø':'Tørrvarer','Hermetikk':'Tørrvarer','Belgvekster':'Tørrvarer',
  'Buljong':'Tørrvarer','Søtning':'Tørrvarer','Taco':'Tørrvarer','Gryterett':'Tørrvarer',
  'Suppe':'Tørrvarer','Tilbehør':'Tørrvarer','Krydder':'Krydder og saus','Saus':'Krydder og saus',
  'Olje':'Krydder og saus','Nøtter':'Snacks','Snacks':'Snacks','Kjeks':'Snacks','Godteri':'Snacks',
  'Sjokolade':'Snacks','Dessert':'Snacks','Is':'Frysevarer','Pizza':'Frysevarer',
  'Ferdigmat':'Frysevarer','Drikke':'Drikke','Kaffe':'Drikke','Husholdning':'Hus og hjem',
  'Hygiene':'Hus og hjem','Apotek':'Hus og hjem','Dyremat':'Hus og hjem',
  // Kategorier som finnes i fl-data.js, men ikke i prototypens MAJOR-kart.
  // Uten disse havner over 100 varer i «Annet» og sorterer feil i plukk-rekkefølgen.
  'Brød og bakervarer':'Brød og korn','Egg':'Meieri','Ferdigmiddag':'Frysevarer',
  'Frysevare':'Frysevarer','Hermetisk':'Tørrvarer','Sauser':'Krydder og saus',
  'Asiatisk':'Tørrvarer','Tex-Mex':'Tørrvarer','Personlig hygiene':'Hus og hjem',
  'Helse':'Hus og hjem','Non-food':'Hus og hjem','Ukjent':'Annet',
  // Identitet for hovedkategoriene selv — fl-data.js bruker dem direkte som cat.
  'Frukt og grønt':'Frukt og grønt','Ost og pålegg':'Ost og pålegg',
  'Krydder og saus':'Krydder og saus','Frysevarer':'Frysevarer','Hus og hjem':'Hus og hjem',
  'Annet':'Annet'
};
const majorOf = (cat) => MAJOR[String(cat || '').split('/')[0].trim()] || 'Annet';

// fl-data.js bruker «b» tvetydig: der «en» finnes er «b» merke/variant
// (Gulost -> «Norvegia Duopack»), der «en» er tom er «b» den engelske
// oversettelsen (Bakepulver -> «Baking powder»). Del feltene riktig.
const splitNames = (it) => (it.en
  ? { nameEn: it.en, brand: it.b || '' }
  : { nameEn: it.b || '', brand: '' });

// SQL-literal. Enkeltfnutter dobles; null der verdien mangler.
const s = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 'NULL' : Number(v));
const j = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

const out = [];
out.push(`-- AUTOGENERERT av scripts/generate-seed.mjs — ikke rediger for hånd.`);
out.push(`-- Kilde: ${META.receipts} kvitteringer, ${META.lines} varelinjer (${META.source}).`);
out.push(`-- Oppdatert: ${META.updated}\n`);

// --- Butikker ---------------------------------------------------------------
const STORES = [
  ['COOP_EXTRA', 'Coop Extra', 'lavpris', true, 10],
  ['MENY_NO', 'Meny', 'fullsortiment', false, 20],
  ['REMA_1000', 'Rema 1000', 'lavpris', false, 30],
  ['KIWI', 'KIWI', 'lavpris', false, 40],
  ['COOP_OBS', 'Coop Obs', 'hypermarked', false, 50],
  ['SPAR_NO', 'Spar', 'nærbutikk', false, 60],
  ['JOKER', 'Joker', 'nærbutikk', false, 70]
];
out.push('-- Butikker');
out.push('insert into public.stores (code, name, store_type, is_default, sort_order) values');
out.push(STORES.map(([c, nm, t, d, o]) => `  (${s(c)}, ${s(nm)}, ${s(t)}, ${d}, ${o})`).join(',\n') + ';');
out.push('');

// --- Varekatalog ------------------------------------------------------------
out.push(`-- Varekatalog: ${ITEMS.length} varer`);
const itemRows = ITEMS.map((it) => {
  const { nameEn, brand } = splitNames(it);
  return `  (${s(it.n)}, ${s(nameEn)}, ${s(it.cat)}, ${s(majorOf(it.cat))}, ${it.food ? 'true' : 'false'}, ` +
    `${n(it.ln)}, ${n(it.rc)}, ${n(it.p)}, ${n(it.plo)}, ${n(it.phi)}, ${s(it.sig)}, ${s(it.prim)}, ` +
    `${s(it.dist)}, ${n(it.score) || 0}, ${s(brand)})`;
});
out.push('insert into public.item_catalog');
out.push('  (name, name_en, category, major_category, is_food, line_count, receipt_count,');
out.push('   avg_price, price_low, price_high, frequency_sig, primary_store, store_dist, score, brand)');
out.push('values');
out.push(itemRows.join(',\n'));
out.push('on conflict (name) do nothing;');
out.push('');

// --- Normaliseringsregler ---------------------------------------------------
out.push(`-- Normaliseringsregler: ${NORM.length} regler`);
out.push('insert into public.norm_rules (from_text, to_text) values');
out.push(NORM.map(([f, t]) => `  (${s(f)}, ${s(t)})`).join(',\n'));
out.push('on conflict (from_text) do nothing;');
out.push('');

// --- Middagsbibliotek -------------------------------------------------------
out.push(`-- Middagsbibliotek: ${MEAL_LIBRARY.length} middager (mengder for 2 voksne + 2 barn)`);
out.push('insert into public.meal_library (name, category, ingredients) values');
out.push(MEAL_LIBRARY.map((m) => `  (${s(m.n)}, ${s(m.cat)}, ${j(m.ing)})`).join(',\n'));
out.push('on conflict (name) do nothing;');
out.push('');

// --- Middagsmønstre ---------------------------------------------------------
out.push(`-- Middagsmønstre fra kvitteringsanalysen: ${DINNER_PATTERNS.length}`);
out.push('insert into public.meal_patterns (name, ingredients, hits, rule_text) values');
out.push(DINNER_PATTERNS.map((p) => `  (${s(p.n)}, ${j(p.ing)}, ${n(p.hits) || 0}, ${s(p.rule)})`).join(',\n'));
out.push('on conflict (name) do nothing;');
out.push('');

const target = join(root, 'supabase/migrations/20260829090300_seed_reference_data.sql');
writeFileSync(target, out.join('\n'), 'utf-8');
console.log(`Skrev ${target}`);
console.log(`  ${ITEMS.length} varer, ${NORM.length} normaliseringsregler, ${MEAL_LIBRARY.length} middager, ${DINNER_PATTERNS.length} mønstre, ${STORES.length} butikker`);
