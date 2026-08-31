-- Tellelister: atomisk økning av ÉN linje i en liste.
--
-- Egne lister lagrer alle elementene i én jsonb-kolonne. Når to personer
-- teller samtidig (Per teller sko mens Ola teller t-skjorter) og hver
-- klient skriver hele arrayet, overskriver den siste den andres tellinger.
-- Denne funksjonen endrer bare den ene linjen, inne i databasen, så begge
-- økningene alltid blir med.
--
-- SECURITY INVOKER (standard): RLS på custom_lists gjør autorisasjonen —
-- bare medlemmer av husholdningen kan oppdatere sine egne lister.
create or replace function public.count_bump(p_list uuid, p_item text, p_delta int)
returns jsonb
language sql
as $$
  update public.custom_lists cl
  set items = coalesce((
        select jsonb_agg(
                 case when e->>'id' = p_item
                   then jsonb_set(e, '{qty}',
                          to_jsonb(greatest(0, coalesce((e->>'qty')::int, 0) + p_delta)))
                   else e
                 end
                 order by ord)
        from jsonb_array_elements(cl.items) with ordinality as t(e, ord)
      ), '[]'::jsonb),
      updated_at = now()
  where cl.id = p_list
  returning cl.items;
$$;

revoke all on function public.count_bump(uuid, text, int) from public;
grant execute on function public.count_bump(uuid, text, int) to authenticated;
