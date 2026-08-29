// Genererer migrasjonsseeden for recipe_sources fra det kanoniske
// registeret i src/lib/recipes/sources.js. Kjør etter endringer der:
//   node scripts/generate-recipe-sources-sql.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { RECIPE_SOURCES } = await import(join(root, 'src/lib/recipes/sources.js'));

const s = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (v) => `array[${(v ?? []).map((x) => s(x)).join(', ')}]::text[]`;
const b = (v) => (v ? 'true' : 'false');

const out = [`-- AUTOGENERERT av scripts/generate-recipe-sources-sql.mjs — ikke rediger for hånd.
-- Kanonisk kilde: src/lib/recipes/sources.js (${RECIPE_SOURCES.length} kilder).

insert into public.recipe_sources
  (id, name, base_url, country, language, priority, integration_modes, enabled,
   can_discover, can_fetch_recipe, can_store_metadata, can_store_ingredients,
   can_store_instructions, can_store_images, requires_attribution,
   terms_status, robots_status, sample_urls, notes)
values`];

out.push(RECIPE_SOURCES.map((src) =>
  `  (${s(src.id)}, ${s(src.name)}, ${s(src.base_url)}, ${s(src.country)}, ${s(src.language)}, ` +
  `${src.priority}, ${arr(src.integration_modes)}, ${b(src.enabled)}, ` +
  `${b(src.can_discover)}, ${b(src.can_fetch_recipe)}, ${b(src.can_store_metadata)}, ` +
  `${b(src.can_store_ingredients)}, ${b(src.can_store_instructions)}, ${b(src.can_store_images)}, ` +
  `${b(src.requires_attribution)}, ${s(src.terms_status)}, ${s(src.robots_status)}, ` +
  `${arr(src.sample_urls)}, ${s(src.notes)})`
).join(',\n'));

out.push(`on conflict (id) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  priority = excluded.priority,
  integration_modes = excluded.integration_modes,
  sample_urls = excluded.sample_urls,
  notes = excluded.notes;
-- enabled/can_*-flagg oppdateres BEVISST ikke ved konflikt: en manuell
-- innstramming i databasen skal ikke reverseres av en ny deploy.
`);

const target = join(root, 'supabase/migrations/20260830090100_seed_recipe_sources.sql');
writeFileSync(target, out.join('\n'), 'utf-8');
console.log(`Skrev ${target} (${RECIPE_SOURCES.length} kilder)`);
