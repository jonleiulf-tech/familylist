-- 0009: hovedgalleri på tvers av gruppene.
--
-- «Vis i galleriet» har hele tiden betydd galleriet på gruppas egen side,
-- og hovedgalleriet på /om har bare vist bilder som ikke tilhørte noen
-- gruppe. Da fantes det ingen måte å løfte et godt fotballbilde opp til
-- fellesgalleriet.
--
-- Nå er det to brytere:
--   show_in_gallery  galleriet på gruppesiden
--   show_in_main     hovedgalleriet, felles for hele PSI
--
-- Bilder uten gruppe som alt lå i galleriet, blir stående i
-- hovedgalleriet uten at noen må huke av på nytt – det er dem det har
-- vist hittil.
-- Kjøres på nytt uten skade.

alter table public.media add column if not exists show_in_main boolean not null default false;

update public.media set show_in_main = true
where sport_slug is null and show_in_gallery and not show_in_main;

create index if not exists media_main on public.media (show_in_main) where show_in_main;
