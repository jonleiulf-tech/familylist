-- Kilderevisjonen 5. sept 2026 (npm run recipes:audit) viste at Godfisk,
-- PRIOR og Mills alle har robots.txt som tillater oss, og JSON-LD med
-- porsjoner, tid og bilder på prøvesidene. De sto avslått bare av
-- prioritering. Koden (sources.js) er slått på; her følger registeret i
-- basen etter, så de to ikke sier ulike ting. Trygt å kjøre flere ganger.
update public.recipe_sources
set enabled = true
where id in ('godfisk', 'prior', 'mills');
