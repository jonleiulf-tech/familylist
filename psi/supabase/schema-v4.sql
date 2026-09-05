-- ============================================================
-- psiusn.no: innlegg fra Spond. Kjøres etter schema-v3.sql.
-- Lim hele fila inn i Supabase → SQL Editor → Run. Trygg å kjøre flere ganger.
--
-- Vegginnlegg fra Spond havner i news, samme tabell som nyhetene styret
-- skriver selv. De kommer inn som UTKAST, ikke publisert: et innlegg
-- skrevet til en lukket gruppe er ikke automatisk noe som tåler å ligge
-- åpent på nett. Noen i styret trykker publiser.
--
-- Vil dere heller publisere automatisk, skru på «Publiser innlegg
-- automatisk» under Innstillinger → Spond. Da havner de rett ut.
-- ============================================================

alter table public.news add column if not exists source          text not null default 'manual';
alter table public.news add column if not exists external_id     text;
alter table public.news add column if not exists hidden_by_admin boolean not null default false;

create unique index if not exists news_external_id on public.news (external_id) where external_id is not null;
create index if not exists news_source on public.news (source);

-- Skjulte innlegg forsvinner fra nettsiden, men blir stående i /admin.
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to anon, authenticated
  using ((status = 'published' and not hidden_by_admin)
         or public.can_manage_sport(sport_slug)
         or (sport_slug is null and public.is_admin()));
