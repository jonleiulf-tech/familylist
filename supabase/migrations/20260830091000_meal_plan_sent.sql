-- «Varene ligger på handlelisten»-merket på en plandag.
--
-- Når ingrediensene til en middag sendes til handlelisten, stemples dagen
-- med tidspunkt. Dagskortet viser da et lite merke som lenker til Handel,
-- i stedet for at appen hopper dit av seg selv. Byttes middagen på dagen
-- (eller dagen hoppes over), nullstilles merket.

alter table public.meal_plan
  add column if not exists sent_to_list_at timestamptz;
