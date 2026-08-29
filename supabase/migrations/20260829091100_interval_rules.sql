-- Ny regeltype: intervall — «Pannekaker ca. hver 2. uke».
-- min/max er ukeskvoter; intervall er en rytme over flere uker, og trengs
-- for middagene man vil ha jevnlig, men ikke ukentlig.
alter table public.rules drop constraint if exists rules_rule_type_check;
alter table public.rules add constraint rules_rule_type_check
  check (rule_type in ('min', 'max', 'weekday', 'interval'));
