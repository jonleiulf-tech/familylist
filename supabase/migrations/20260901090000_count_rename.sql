-- Navneendring i en telleliste, uten å røre tallene.
--
-- Uten dette skrev klienten hele items-arrayet på nytt når en hovedvare
-- eller variant fikk nytt navn — med den kopien den tilfeldigvis hadde i
-- minnet. Alt noen andre hadde talt i mellomtiden forsvant. Det er
-- nøyaktig det count_bump ble laget for å hindre, og navneendringen gikk
-- utenom.
--
-- Her endres BARE navnefeltene. qty leses og skrives aldri, så en telling
-- som skjer i samme sekund er trygg.

create or replace function public.count_rename(
  p_list uuid,
  p_kind text,        -- 'row' (én variant) eller 'group' (hovedvare)
  p_key  text,        -- item-id for 'row', gruppenavnet for 'group'
  p_name text
)
returns jsonb
language sql
as $$
  update public.custom_lists cl
  set items = coalesce((
        select jsonb_agg(
                 case
                   when p_kind = 'row' and e->>'id' = p_key
                     then jsonb_set(e, '{n}', to_jsonb(p_name))
                   when p_kind = 'group' and coalesce(e->>'g', '') = coalesce(p_key, '')
                     then jsonb_set(e, '{g}', to_jsonb(p_name))
                   else e
                 end
                 order by ord)
        from jsonb_array_elements(cl.items) with ordinality as t(e, ord)
      ), '[]'::jsonb),
      updated_at = now()
  where cl.id = p_list
    and btrim(coalesce(p_name, '')) <> ''
    and p_kind in ('row', 'group')
  returning cl.items;
$$;

-- SECURITY INVOKER (standard): RLS på custom_lists avgjør hvem som får
-- endre. En som ikke er medlem treffer null rader.
revoke all on function public.count_rename(uuid, text, text, text) from public;
grant execute on function public.count_rename(uuid, text, text, text) to authenticated;
