-- Oppskriftskvalitet per kilde — leser høsteren riktig fra hver side?
--
-- Lim inn HELE filen i Supabase → SQL Editor og kjør. Bare SELECT.
--
-- Én rad per kilde. Prosentene sier hvor mange av oppskriftene som har
-- det appen faktisk trenger: ingredienser (handlelista), porsjoner
-- (skalering), tid og bilde. En kilde med mange oppskrifter men 0 %
-- porsjoner er en kilde parseren leser halvveis — da er det noe å rette.
-- «rare_titler» er titler som ser ut som sidetitler («… | Coop») eller
-- er tomme/korte: tegn på at navnet plukkes fra feil sted.

with k as (
  select
    source_id,
    title,
    image_url,
    total_minutes,
    servings,
    coalesce((payload->>'ingredient_count')::int, jsonb_array_length(coalesce(payload->'raw_ingredients', '[]'::jsonb))) as ingredienser,
    (payload->>'completeness')::numeric as completeness,
    jsonb_array_length(coalesce(payload->'categories', '[]'::jsonb)) as kategorier,
    discovered_at
  from public.external_recipe_candidates
)
select
  source_id                                                    as kilde,
  count(*)                                                     as oppskrifter,
  round(100.0 * count(*) filter (where ingredienser >= 3) / count(*))        as "% med ≥3 ingredienser",
  round(100.0 * count(*) filter (where servings is not null) / count(*))     as "% med porsjoner",
  round(100.0 * count(*) filter (where total_minutes is not null) / count(*)) as "% med tid",
  round(100.0 * count(*) filter (where image_url is not null) / count(*))    as "% med bilde",
  round(100.0 * count(*) filter (where kategorier > 0) / count(*))           as "% med kategori",
  round(avg(completeness))                                     as snitt_completeness,
  count(*) filter (where title ~ '\|' or length(title) < 4 or title ~* '(oppskrifter|meny\.no|coop\.no|rema\.no|tine\.no)$') as rare_titler,
  max(discovered_at)::date                                     as sist_ny,
  (array_agg(title order by discovered_at desc))[1:3]          as siste_titler
from k
group by source_id
order by oppskrifter desc;
