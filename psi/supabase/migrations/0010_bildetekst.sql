-- 0010: beskrivelse på bilder.
--
-- caption har vært en kort bildetekst. Nå brukes den som tittel, og
-- description er den lengre teksten – hva man ser, hvor det er, hva som
-- skjedde. Begge er { nb, en }, som resten av innholdet.
--
-- Ingenting går tapt: bildene som har en caption fra før beholder den,
-- og den blir tittelen.
-- Kjøres på nytt uten skade.

alter table public.media add column if not exists description jsonb;
