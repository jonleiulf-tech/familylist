-- Profilbilder og avatarer.
--
-- members.avatar holder enten en avatar-id ('a01'–'a50', tegnet i klienten)
-- eller URL-en til et opplastet profilbilde. Bildene ligger i den offentlige
-- storage-bucketen «avatars», der hver bruker bare kan skrive i sin egen
-- mappe (<user_id>/…). Lokal test-Postgres har ikke storage-skjemaet, derfor
-- er bucket-delen pakket i en betinget blokk.

alter table public.members add column if not exists avatar text;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('avatars', 'avatars', true)
    on conflict (id) do nothing;

    -- Alle kan se (bucketen er offentlig); bare eieren kan skrive i sin mappe.
    execute $p$
      drop policy if exists avatars_insert on storage.objects;
      create policy avatars_insert on storage.objects
        for insert to authenticated
        with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

      drop policy if exists avatars_update on storage.objects;
      create policy avatars_update on storage.objects
        for update to authenticated
        using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

      drop policy if exists avatars_delete on storage.objects;
      create policy avatars_delete on storage.objects
        for delete to authenticated
        using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
    $p$;
  end if;
end $$;
