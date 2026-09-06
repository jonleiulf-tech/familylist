-- 0004 – Retter to hull som ble funnet i kvalitetsgjennomgangen:
--
-- 1. BOOTSTRAP-PROBLEM: policyen project_members_insert_manager krever at
--    man allerede er owner/admin i prosjektet for å legge til medlemmer.
--    Ved opprettelse av et helt nytt prosjekt finnes det ingen medlemmer,
--    så ingen kunne noen gang bli det første medlemmet (og dermed heller
--    ikke se prosjektet sitt). Løses med en trigger som automatisk legger
--    inn oppretteren som owner, i tillegg til at oppretteren alltid kan
--    lese sitt eget prosjekt.
--
-- 2. INVITASJONER: en invitert bruker (invited_email satt, user_id null)
--    fikk aldri tilgang, fordi RLS matcher på user_id. Nå kobles raden
--    automatisk når personen registrerer seg med samme e-post, og ved
--    invitasjon av en e-post som allerede har en profil kobles den straks.

-- ---------------------------------------------------------------------
-- 1a. Oppretteren kan alltid lese eget prosjekt (også før medlemsraden
--     finnes – nødvendig for INSERT ... RETURNING).
-- ---------------------------------------------------------------------
drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member" on public.projects
  for select using (public.is_project_member(id) or created_by = auth.uid());

-- ---------------------------------------------------------------------
-- 1b. Trigger: legg inn oppretteren som owner automatisk.
--     security definer slik at innsettingen ikke stoppes av RLS.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_email text;
  v_first text;
  v_last text;
begin
  select p.full_name, p.email into v_full_name, v_email
  from public.profiles p
  where p.id = new.created_by;

  v_full_name := coalesce(nullif(trim(v_full_name), ''), split_part(coalesce(v_email, 'Bruker'), '@', 1));
  v_first := split_part(v_full_name, ' ', 1);
  v_last := nullif(trim(substr(v_full_name, length(v_first) + 1)), '');

  insert into public.project_members (project_id, user_id, first_name, last_name, email, role)
  values (new.id, new.created_by, v_first, coalesce(v_last, ''), v_email, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute procedure public.handle_new_project();

-- ---------------------------------------------------------------------
-- 2a. Én invitasjon per e-post per prosjekt.
-- ---------------------------------------------------------------------
create unique index if not exists project_members_project_invited_email_uq
  on public.project_members (project_id, lower(invited_email))
  where invited_email is not null and user_id is null;

-- ---------------------------------------------------------------------
-- 2b. Koble ventende invitasjoner når en ny bruker registrerer seg.
--     Utvider den eksisterende handle_new_user-funksjonen.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  update public.project_members
     set user_id = new.id
   where user_id is null
     and invited_email is not null
     and lower(invited_email) = lower(new.email);

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2c. Hjelpefunksjon for invitasjon: finn eksisterende bruker på e-post
--     (profiles er lesbar for innloggede, men vi vil ikke lekke hele
--     tabellen til klienten – kun id for én eksakt e-post).
-- ---------------------------------------------------------------------
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id from public.profiles p where lower(p.email) = lower(p_email) limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to authenticated;
