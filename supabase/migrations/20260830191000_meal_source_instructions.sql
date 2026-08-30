-- Husholdningens eget utklipp av en nett-oppskrifts fremgangsmåte.
-- Hentes når familien selv velger å koble en oppskrift til middagen sin
-- (fetch-recipe-funksjonen) og lagres KUN på husholdningens middag —
-- den delte kokeboka (external_recipe_candidates) forblir uten fulltekst.
-- Format: [{section?, text}], med kilde i instructions_url/source_label.
alter table public.meals
  add column if not exists source_instructions jsonb;
