import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planSql } from './plan-sql.mjs';

/* Migrasjonen er generert fra datafila. Endrer noen en treningstid i
   psi.js uten å oppdatere migrasjonen, sier databasen og nettsiden
   forskjellige ting – og det er nettopp den feilen vi jaget i går. */
describe('planen i databasen', () => {
  it('er den samme som i src/data/psi.js', () => {
    const fil = readFileSync(new URL('../supabase/migrations/0008_plan_volleyball_fredag.sql', import.meta.url), 'utf8');
    for (const linje of planSql().trim().split('\n').slice(1)) {
      expect(fil).toContain(linje);
    }
  });

  it('har volleyball fredag 19:30, slik PSI har bekreftet', () => {
    expect(planSql()).toContain('"day":5,"from":"19:30","to":"22:00","venue":"Porsgrunn Arena"');
  });
});
