-- Tilbud: eksempeldata og varemerkelapper for relevansberegning.

-- Skiller eksempeltilbud fra ekte. Uten dette ville seedede demo-tilbud
-- sett ut som ferske tilbud fra en kundeavis, noe de ikke er.
alter table public.offers
  add column if not exists is_sample boolean not null default false;

-- Merkelapper på varenavn, brukt av relevans-scoringen:
--   staple      = fast husholdningsvare (+20)
--   dairy_free  = melkefritt alternativ, viktig for denne familien (+15)
create table if not exists public.item_tags (
  item_name text not null,
  tag       text not null check (tag in ('staple','dairy_free')),
  primary key (item_name, tag)
);
create index if not exists item_tags_tag_idx on public.item_tags(tag);

alter table public.item_tags enable row level security;
drop policy if exists item_tags_read on public.item_tags;
create policy item_tags_read on public.item_tags
  for select to authenticated using (true);
