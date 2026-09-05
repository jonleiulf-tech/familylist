/* Lager SQL som setter treningsplanen i databasen lik den i src/data/psi.js.

   Planen bor ett sted – datafila – og denne skriver den ut som SQL, slik at
   databasen ikke kan komme i utakt med koden. Kjør «npm run plan:sql» og lim
   inn i Supabase, eller la den bli en migrasjon.

   Spond er fortsatt fasiten: dager med Spond-arrangement viker planen for. */
import { sports } from '../src/data/psi.js';

const lit = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

export function planSql(liste = sports) {
  const ut = ['-- Treningsplan fra src/data/psi.js. Generert av scripts/plan-sql.mjs.'];
  for (const s of liste) {
    ut.push(`update public.sports set data = jsonb_set(data, '{schedule}', ${lit(s.schedule || [])}, true) where slug = '${s.slug}';`);
  }
  return ut.join('\n') + '\n';
}

if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(planSql());
