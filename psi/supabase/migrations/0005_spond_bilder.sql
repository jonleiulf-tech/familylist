-- ============================================================
-- psiusn.no: bilder fra Spond-innlegg. Kjøres etter 0004.
-- Kjøres av `npm run db`, eller lim fila inn i Supabase → SQL Editor.
-- Trygg å kjøre flere ganger.
--
-- Bilder som følger med et Spond-innlegg lastes ned og lagres hos oss, i
-- stedet for å lenke til Spond sin server. Da virker de selv om Spond
-- bytter adresser, og nettsiden laster ikke noe fra en tredjepart.
--
-- Grensen på 30 bilder per gruppe var ment for galleriet, som styret
-- fyller selv. Bilder fra Spond skal ikke spise av den kvoten.
-- ============================================================

alter table public.media add column if not exists source text not null default 'manual';
create index if not exists media_source on public.media (source);

create or replace function public.media_limit()
returns trigger language plpgsql as $$
begin
  -- Synken har ingen kvote; den henter det som følger med innleggene.
  if new.source <> 'manual' then
    return new;
  end if;
  if (select count(*) from public.media
      where sport_slug is not distinct from new.sport_slug
        and source = 'manual') >= 30 then
    raise exception 'Maks 30 bilder per gruppe. Slett noen først.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
