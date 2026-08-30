-- Skjulte biblioteksmiddager per husholdning.
--
-- Sletter man en lagret middag som også finnes i det innebygde biblioteket
-- («Omelett med skinke»), skal den ikke dukke opp igjen i «Velg middag»
-- eller «Foreslå ny ukemeny». Navnene lagres her; lagrer husholdningen
-- middagen på nytt (f.eks. fra «Legg til ny middag»), fjernes den fra
-- listen igjen automatisk.

alter table public.households
  add column if not exists hidden_meals jsonb not null default '[]'::jsonb;
