-- ============================================================
-- 0014 Avdelingslista fra SiG
--
-- SiG har tolv avdelinger, og hovedbokrapporten dekker alle sammen.
-- Bare seks av dem er PSI. Resten deler regnskapskonto med oss, men er
-- ikke våre penger, og skal hverken importeres eller spørres om hver
-- gang noen laster opp en rapport.
--
-- Lista er den offisielle fra SiG:
--
--    1  Makerspace                  ikke PSI
--    2  Volleyball                  PSI
--    3  Formula Student             ikke PSI
--    4  Innebandy                   PSI
--    5  Buldre- og klatregruppe     PSI
--    6  Filmklubben                 ikke PSI
--    7  Musikkklubben               ikke PSI
--    8  Sqeeze                      ikke PSI
--    9  Hovedavdeling (DIV)         SiG sin egen
--   10  Fotballklubben              PSI
--   11  Padel                       PSI
--   12  SiG-run                     PSI
--
-- EN AVDELING HAR TRE TILSTANDER, og 0013 klarte bare å uttrykke to.
-- sport_slug null betyr «Felles PSI», så det fantes ingen måte å si
-- «raden finnes, men noen må bestemme seg» på. Derfor `koblet`:
--
--   koblet = true,  sport_slug = 'fotball'   → Fotball
--   koblet = true,  sport_slug = null        → Felles PSI
--   koblet = false                           → importen spør
--   ignorer = true                           → ikke PSI, hoppes over
--
-- To avdelinger står med vilje ukoblet, fordi de trenger en avgjørelse
-- og ikke en gjetning:
--
--   4  Innebandy er en PSI-gruppe hos SiG, men finnes ikke på psiusn.no.
--      Opprettes den, kobles avdelingen til den.
--   9  Hovedavdeling er SiG sin egen. Draktene fra Beha og Protektiv
--      (27 106,71 i 2026) ligger der og hører til Felles PSI i vårt eget
--      budsjett, men avdelingen som helhet gjør det ikke. 0013 gjettet
--      Felles PSI; det var feil, og gjetningen tas bort her.
--
-- Trygg å kjøre flere ganger.
-- ============================================================

alter table public.hovedbok_avdeling add column if not exists navn text;
-- true = ikke PSI. Hoppes over ved import, og det spørres ikke om den.
alter table public.hovedbok_avdeling add column if not exists ignorer boolean not null default false;
-- true = noen har bestemt hvilken gruppe dette er, null inkludert.
alter table public.hovedbok_avdeling add column if not exists koblet boolean not null default false;

-- Rader som fantes før denne migrasjonen: de med en slug var koblet.
-- Avdeling 9 hadde null, som den gang betydde Felles PSI – den regnes
-- som ukoblet nå, siden gjetningen var feil.
update public.hovedbok_avdeling set koblet = true where sport_slug is not null and koblet = false;

insert into public.hovedbok_avdeling (avdeling, navn, ignorer, koblet, sport_slug, notat) values
  ('1',  'Makerspace',              true,  false, null,         null),
  ('2',  'Volleyball',              false, true,  'volleyball', 'Skien Fritidspark, Porsgrunn Arena'),
  ('3',  'Formula Student',         true,  false, null,         null),
  ('4',  'Innebandy',               false, false, null,         'PSI-gruppe hos SiG, men finnes ikke på psiusn.no ennå'),
  ('5',  'Buldre- og klatregruppe', false, true,  'klatring',   'Høyt Under Taket Skien'),
  ('6',  'Filmklubben',             true,  false, null,         null),
  ('7',  'Musikkklubben',           true,  false, null,         null),
  ('8',  'Sqeeze',                  true,  false, null,         null),
  ('9',  'Hovedavdeling (DIV)',     false, false, null,         'SiG sin egen avdeling. Draktene fra Beha og Protektiv ligger her – velg Felles PSI om de skal telle mot vårt budsjett.'),
  ('10', 'Fotballklubben',          false, true,  'fotball',    'Porsgrunn kommune (halleie), Beha Sport, Telemark bedriftsidrettskrets'),
  ('11', 'Padel',                   false, true,  'padel',      'Cage Grenland'),
  ('12', 'SiG-run',                 false, true,  'sigrun',     'Studentsamskipnaden i Sørøst-Norge')
on conflict (avdeling) do update set
  -- Navnene og «ikke PSI» kommer fra SiG og skal alltid være de siste.
  navn = excluded.navn,
  ignorer = excluded.ignorer,
  notat = coalesce(public.hovedbok_avdeling.notat, excluded.notat),
  -- Koblingen er styrets egen. Har noen valgt en gruppe i admin, blir
  -- den stående; ellers legges forslaget inn.
  koblet = public.hovedbok_avdeling.koblet or excluded.koblet,
  sport_slug = case when public.hovedbok_avdeling.koblet then public.hovedbok_avdeling.sport_slug else excluded.sport_slug end;
