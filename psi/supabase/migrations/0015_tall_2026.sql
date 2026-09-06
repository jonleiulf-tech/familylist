-- ============================================================
-- 0015 Tallene for 2026
--
-- Fyller inn det som står i «Budsjett PSI 2026 – justert.xlsx» og i
-- hovedbokrapporten «Report (4).pdf», så ingen trenger å taste dem inn.
--
-- TILDELINGER OG BUDSJETTLINJER kommer fra regnearket, fane for fane.
-- Beløpene er de som står i kolonnen «Budsjettert sum».
--
-- HOVEDBOKSLINJER kommer fra Report (4).pdf, datert 19.08.2026: 43
-- linjer, kr 135 043,17, som er nøyaktig den summen rapporten selv
-- oppgir. Regnskapsperiode 1–7 føres på vår, 8–12 på høst – samme
-- skille som resten av løsningen bruker.
--
-- KOLONNEN «Faktisk beløp (ihht kvitteringer)» I REGNEARKET LEGGES IKKE
-- INN. Den var ufullstendig (8 100 for våren, mot 129 443,17 i
-- hovedboken), og de kjøpene ligger allerede i bokføringslinjene.
-- Hadde vi lagt dem inn som bilag i tillegg, ville de blitt talt to
-- ganger. Bilag registreres framover, etter hvert som de kommer.
--
-- Trygg å kjøre flere ganger: ingenting legges inn to ganger.
-- ============================================================

-- Periodene skal finnes. 0012 lager dem, men vi tar ikke sjansen.
insert into public.budsjett_perioder (ar, semester, gjeldende) values (2026, 'var', false)
on conflict (ar, semester) do nothing;
insert into public.budsjett_perioder (ar, semester, gjeldende) values (2026, 'host', true)
on conflict (ar, semester) do nothing;

-- ---------- Tildelinger ----------
-- Vår: «Innvilget budsjett fra SSN» og «Til gode fra tilskudd 2025».
-- Høst: «Innvilget støtte» / «Innvilget beløp» / «Innvilget SSN».
insert into public.budsjett_tildeling (periode_id, sport_slug, innvilget, overfort, kilde, notat)
select p.id, t.slug, t.innvilget, t.overfort, t.kilde, t.notat
from public.budsjett_perioder p
join (values
  ('var',  'fotball',    22800, 6625, 'SSN', 'Innvilget 2026 pluss til gode fra tilskudd 2025'),
  ('var',  'volleyball', 26250, 0,    'SSN', null),
  ('var',  'klatring',   41000, 0,    'SSN', null),
  ('var',  'padel',      30000, 0,    'SSN', null),
  ('var',  'sigrun',      9000, 0,    'SSN', null),
  ('var',  null,         40000, 0,    'SSN', 'Felles PSI'),
  ('host', 'fotball',    15000, 0,    'SSN', null),
  ('host', 'volleyball', 29000, 0,    'SSN', null),
  ('host', 'klatring',   30500, 0,    'SSN', null),
  ('host', 'padel',      20000, 0,    'SSN', null),
  ('host', 'sigrun',         0, 0,    null,  'Egen søknad – beløp ikke avklart'),
  ('host', null,         20000, 0,    'SiG', 'Felles PSI')
) as t(semester, slug, innvilget, overfort, kilde, notat) on t.semester = p.semester
where p.ar = 2026
on conflict (periode_id, sport_slug) do nothing;

-- ---------- Budsjettlinjer ----------
insert into public.budsjett_poster (periode_id, sport_slug, aktivitet, beskrivelse, budsjettert, kommentar, sort_order)
select p.id, b.slug, b.aktivitet, b.beskrivelse, b.budsjettert, b.kommentar, b.sort_order
from public.budsjett_perioder p
join (values
  -- Vår 2026 – fotball
  ('var','fotball','Bedriftsidrettscup Langesund','2 ekstra lag × 2 500',0,'Stilte kun 2/4 lag, så sparte dette',10),
  ('var','fotball','Halleie april og mai',null,2100,null,20),
  ('var','fotball','Bedriftsserie 7-er fotball','1 lag × 8 900',8900,null,30),
  ('var','fotball','Keeperhansker og flere baller',null,3000,null,40),
  ('var','fotball','Førstehjelp, baller, kjegler',null,2000,null,50),
  ('var','fotball','Infoskjerm / tid',null,2100,null,60),
  ('var','fotball','Drakter',null,13000,null,70),
  ('var','fotball','Leggskinn og mat, cup i Langesund',null,1230,'Utlegg Jon',80),
  -- Vår 2026 – volleyball
  ('var','volleyball','Halleie Porsgrunn Arena','175 kr/t × 2,5 t × 20 økter',8750,null,10),
  ('var','volleyball','Skien Fritidspark','300 kr/t × 2,5 t × 20 økter',15000,null,20),
  ('var','volleyball','Bedriftsidrettscup Langesund','1 lag i volleyball',0,null,30),
  ('var','volleyball','Volleyballturnering i Porsgrunn, mai','2 lag × 1 000',2000,null,40),
  -- Vår 2026 – klatring
  ('var','klatring','Leie Høyt Under Taket','Ca. 20 økter',25500,null,10),
  ('var','klatring','Utstyr','5 seler, 2 par sko, 3 kalk',15500,null,20),
  -- Vår 2026 – padel
  ('var','padel','Baneleie','384 kr per bane × 3 baner × 20 økter (30 % rabatt for SiG)',20000,null,10),
  ('var','padel','Racketer','8 racketer, fellesutstyr',10000,null,20),
  -- Vår 2026 – SiGRUN
  ('var','sigrun','Hinderløp, Bedriftsidretten mai','1 lag × 3 000',0,'Stiller kun 1 lag',10),
  -- Vår 2026 – Felles PSI
  ('var',null,'Treningsdrakter ledere og styre','50 stk, se fane Drakter i regnearket',20981,null,10),
  ('var',null,'Profilutvikling PSI','Logo, rollup og nettside',2000,null,20),
  ('var',null,'Felles sommeravslutning',null,5000,null,30),
  ('var',null,'Ekstra merker PSI, SiG, SSN',null,6262,'Blir liggende på BEHA for å kunne produsere flere drakter billigere',40),
  ('var',null,'Buffer og felles utstyr (HMS/drift)',null,5000,'Brukt på førstehjelpsutstyr fra BEHA',50),
  -- Høst 2026 – fotball
  ('host','fotball','Kjøp av baller og hansker',null,500,null,10),
  ('host','fotball','Deltagelse cup høstferien',null,0,null,20),
  ('host','fotball','JBL Boombox 4','Høyttaler til treninger og aktiviteter',0,null,30),
  ('host','fotball','Halleie Kjølnes Arena, 2 baner','175 kr/t × 4 t × ca. 15 uker',14500,null,40),
  -- Høst 2026 – volleyball
  ('host','volleyball','Halleie Porsgrunn Arena',null,9000,null,10),
  ('host','volleyball','Deltagelse cup høsten',null,0,null,20),
  ('host','volleyball','Nye baller',null,5000,null,30),
  ('host','volleyball','Skien Fritidspark','300 kr/t × 2,5 t × 20 økter',15000,null,40),
  -- Høst 2026 – klatring
  ('host','klatring','Utskifting av utstyr',null,5000,null,10),
  ('host','klatring','Leie Høyt Under Taket','20 økter × 15 deltakere × 85 kr',25500,null,20),
  -- Høst 2026 – padel
  ('host','padel','Baneleie','Ca. 20 økter',20000,null,10),
  -- Høst 2026 – SiGRUN
  ('host','sigrun','Løpedrakter','15 drakter á 500 kr',0,'Egen søknad',10),
  ('host','sigrun','Halvmaraton','5 deltakere × 500',0,'Egen søknad',20),
  ('host','sigrun','Geiteryggen-løpet','5 deltakere × 500',0,'Egen søknad',30),
  -- Høst 2026 – Felles PSI
  ('host',null,'Rollups og standutstyr',null,5000,null,10),
  ('host',null,'Buffer og felles utstyr (HMS/drift)','Del av årspott',15000,null,20)
) as b(semester, slug, aktivitet, beskrivelse, budsjettert, kommentar, sort_order) on b.semester = p.semester
where p.ar = 2026
  and not exists (
    select 1 from public.budsjett_poster x
     where x.periode_id = p.id
       and x.sport_slug is not distinct from b.slug
       and x.aktivitet = b.aktivitet
  );

-- ---------- Bokføringslinjer fra Report (4).pdf ----------
-- Avdeling 9 (Hovedavdeling DIV) føres på Felles PSI: de tre linjene der
-- er draktene fra Beha og Protektiv, og de står som Felles PSI i
-- regnearket. Endres under Hovedbok om det skal være annerledes.
insert into public.hovedbok_linjer (nokkel, periode_id, sport_slug, avdeling, konto, bilagsnr, dato, periode, tekst, mvakode, belop)
select h.nokkel, p.id, h.slug, h.avdeling, h.konto, h.bilagsnr, h.dato, h.periode, h.tekst, h.mvakode, h.belop
from public.budsjett_perioder p
join (values
  ('6565|10|9|2026-01-13|0|249000|0', 'var', 'fotball', '10', '6565', '9', '2026-01-13'::date, 1, '20182 - PING SERVICES AS - fakturanr. 38078036', '0', 2490),
  ('6565|10|9|2026-01-13|1|1760|0', 'var', 'fotball', '10', '6565', '9', '2026-01-13'::date, 1, '20182 - PING SERVICES AS - fakturanr. 38078036', '1', 17.6),
  ('6565|10|10|2026-01-13|0|249000|0', 'var', 'fotball', '10', '6565', '10', '2026-01-13'::date, 1, '20182 - PING SERVICES AS - fakturanr. 38078010', '0', 2490),
  ('6565|10|10|2026-01-13|1|1760|0', 'var', 'fotball', '10', '6565', '10', '2026-01-13'::date, 1, '20182 - PING SERVICES AS - fakturanr. 38078010', '1', 17.6),
  ('6565|10|27|2026-01-16|1|156952|0', 'var', 'fotball', '10', '6565', '27', '2026-01-16'::date, 1, '20259 - Beha Sport - fakturanr. 00098019198', '1', 1569.52),
  ('6565|10|57|2026-01-31|-|175000|0', 'var', 'fotball', '10', '6565', '57', '2026-01-31'::date, 1, '20045 - Porsgrunn kommune - fakturanr. 93166661', null, 1750),
  ('6565|10|109|2026-02-28|0|157500|0', 'var', 'fotball', '10', '6565', '109', '2026-02-28'::date, 2, '20045 - Porsgrunn kommune - fakturanr. 93183135', '0', 1575),
  ('6565|10|163|2026-03-24|1|431688|0', 'var', 'fotball', '10', '6565', '163', '2026-03-24'::date, 3, '20259 - Beha Sport - fakturanr. 00098020101', '1', 4316.88),
  ('6565|10|246|2026-03-31|-|118150|0', 'var', 'fotball', '10', '6565', '246', '2026-03-31'::date, 3, '20045 - Porsgrunn kommune - fakturanr. 93213130', null, 1181.5),
  ('6565|10|250|2026-04-17|1|92608|0', 'var', 'fotball', '10', '6565', '250', '2026-04-17'::date, 4, '20259 - Beha Sport - fakturanr. 00098020348', '1', 926.08),
  ('6565|10|259|2026-04-21|1|175500|0', 'var', 'fotball', '10', '6565', '259', '2026-04-21'::date, 4, null, '1', 1755),
  ('6565|10|258|2026-04-21|1|76792|0', 'var', 'fotball', '10', '6565', '258', '2026-04-21'::date, 4, null, '1', 767.92),
  ('6565|10|258|2026-04-21|-|27000|0', 'var', 'fotball', '10', '6565', '258', '2026-04-21'::date, 4, '®fra:6565 - Undergrupper', null, 270),
  ('6565|10|295|2026-04-28|1|699680|0', 'var', 'fotball', '10', '6565', '295', '2026-04-28'::date, 4, '20259 - Beha Sport - fakturanr. 00098020471', '1', 6996.8),
  ('6565|10|300|2026-04-30|-|118150|0', 'var', 'fotball', '10', '6565', '300', '2026-04-30'::date, 4, '20045 - Porsgrunn kommune - fakturanr. 93229873', null, 1181.5),
  ('6565|10|369|2026-05-16|1|164920|0', 'var', 'fotball', '10', '6565', '369', '2026-05-16'::date, 5, '20259 - Beha Sport - fakturanr. 00098020753', '1', 1649.2),
  ('6565|10|362|2026-05-31|1|77000|0', 'var', 'fotball', '10', '6565', '362', '2026-05-31'::date, 5, '20045 - Porsgrunn kommune - fakturanr. 93247094', '1', 770),
  ('6565|10|378|2026-06-04|-|790000|0', 'var', 'fotball', '10', '6565', '378', '2026-06-04'::date, 6, '20182 - PING SERVICES AS - fakturanr. 45075835', null, 7900),
  ('6565|10|378|2026-06-04|1|1760|0', 'var', 'fotball', '10', '6565', '378', '2026-06-04'::date, 6, '20182 - PING SERVICES AS - fakturanr. 45075835', '1', 17.6),
  ('6565|10|399|2026-06-15|-|534000|0', 'var', 'fotball', '10', '6565', '399', '2026-06-15'::date, 6, '20169 - TELEMARK BEDRIFTSIDRETTSKRETS - fakturanr. 001885', null, 5340),
  ('6565|11|100|2026-03-04|-|57802|0', 'var', 'padel', '11', '6565', '100', '2026-03-04'::date, 3, '®fra:6565 - Undergrupper', null, 578.02),
  ('6565|11|115|2026-03-11|-|46300|0', 'var', 'padel', '11', '6565', '115', '2026-03-11'::date, 3, '®fra:6565 - Undergrupper', null, 463),
  ('6565|11|116|2026-03-18|-|82918|0', 'var', 'padel', '11', '6565', '116', '2026-03-18'::date, 3, '®fra:6565 - Undergrupper', null, 829.18),
  ('6565|11|245|2026-04-07|0|269500|0', 'var', 'padel', '11', '6565', '245', '2026-04-07'::date, 4, '20275 - Cage Grenland AS - fakturanr. 1322', '0', 2695),
  ('6565|11|296|2026-05-04|-|588000|0', 'var', 'padel', '11', '6565', '296', '2026-05-04'::date, 5, '20275 - Cage Grenland AS - fakturanr. 1337', null, 5880),
  ('6565|11|358|2026-06-02|1|294000|0', 'var', 'padel', '11', '6565', '358', '2026-06-02'::date, 6, '20275 - Cage Grenland AS - fakturanr. 1345', '1', 2940),
  ('6565|12|486|2026-08-17|1|560000|0', 'host', 'sigrun', '12', '6565', '486', '2026-08-17'::date, 8, '20057 - Studentsamskipnaden i Sørøst-N - fakturanr. 3225814', '1', 5600),
  ('6565|2|192|2026-01-30|0|221900|0', 'var', 'volleyball', '2', '6565', '192', '2026-01-30'::date, 1, '20139 - Skien Fritidspark - fakturanr. 10939', '0', 2219),
  ('6565|2|57|2026-01-31|-|175000|0', 'var', 'volleyball', '2', '6565', '57', '2026-01-31'::date, 1, '20045 - Porsgrunn kommune - fakturanr. 93166661', null, 1750),
  ('6565|2|110|2026-02-27|0|265100|0', 'var', 'volleyball', '2', '6565', '110', '2026-02-27'::date, 2, '20139 - Skien Fritidspark - fakturanr. 11218', '0', 2651),
  ('6565|2|109|2026-02-28|0|157500|0', 'var', 'volleyball', '2', '6565', '109', '2026-02-28'::date, 2, '20045 - Porsgrunn kommune - fakturanr. 93183135', '0', 1575),
  ('6565|2|167|2026-03-27|-|178400|0', 'var', 'volleyball', '2', '6565', '167', '2026-03-27'::date, 3, '20139 - Skien Fritidspark - fakturanr. 11782', null, 1784),
  ('6565|2|246|2026-03-31|-|118150|0', 'var', 'volleyball', '2', '6565', '246', '2026-03-31'::date, 3, '20045 - Porsgrunn kommune - fakturanr. 93213130', null, 1181.5),
  ('6565|2|300|2026-04-30|-|118150|0', 'var', 'volleyball', '2', '6565', '300', '2026-04-30'::date, 4, '20045 - Porsgrunn kommune - fakturanr. 93229873', null, 1181.5),
  ('6565|2|298|2026-04-30|0|438500|0', 'var', 'volleyball', '2', '6565', '298', '2026-04-30'::date, 4, '20139 - Skien Fritidspark - fakturanr. 12039', '0', 4385),
  ('6565|2|365|2026-05-26|-|265100|0', 'var', 'volleyball', '2', '6565', '365', '2026-05-26'::date, 5, '20139 - Skien Fritidspark - fakturanr. 10711', null, 2651),
  ('6565|2|366|2026-05-26|1|212080|0', 'var', 'volleyball', '2', '6565', '366', '2026-05-26'::date, 5, '20139 - Skien Fritidspark - fakturanr. 10359', '1', 2120.8),
  ('6565|2|362|2026-05-31|1|77000|0', 'var', 'volleyball', '2', '6565', '362', '2026-05-31'::date, 5, '20045 - Porsgrunn kommune - fakturanr. 93247094', '1', 770),
  ('6565|2|432|2026-07-01|1|93240|0', 'var', 'volleyball', '2', '6565', '432', '2026-07-01'::date, 7, '20275 - Cage Grenland AS - fakturanr. 1352', '1', 932.4),
  ('6565|5|101|2026-02-27|13|2276786|0', 'var', 'klatring', '5', '6565', '101', '2026-02-27'::date, 2, '20271 - Høyt Under Taket Skien AS - fakturanr. 1000270', '13', 22767.86),
  ('6565|9|258|2026-04-21|1|41671|0', 'var', null, '9', '6565', '258', '2026-04-21'::date, 4, null, '1', 416.71),
  ('6565|9|293|2026-04-30|1|836000|0', 'var', null, '9', '6565', '293', '2026-04-30'::date, 4, '20259 - Beha Sport - fakturanr. 00098020550', '1', 8360),
  ('6565|9|291|2026-05-04|1|1833000|0', 'var', null, '9', '6565', '291', '2026-05-04'::date, 5, '20008 - Protektiv AS - fakturanr. 351904', '1', 18330)
) as h(nokkel, semester, slug, avdeling, konto, bilagsnr, dato, periode, tekst, mvakode, belop) on h.semester = p.semester
where p.ar = 2026
on conflict (nokkel) do nothing;

-- Avdeling 9 regnes som Felles PSI etter dette, i tråd med linjene over.
update public.hovedbok_avdeling
   set koblet = true, sport_slug = null
 where avdeling = '9' and koblet = false;
