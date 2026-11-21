-- Roster editing for coaches and admins. Run after schema.sql.
--
-- Who can do what:
--   anyone (public key) : read teams, players, games, stats (unchanged)
--   coach               : add players to, and edit players on, the team(s) they coach
--   admin               : the same for every team, and add new teams
-- Nobody can delete through the website; "Remove" marks a player inactive so
-- their old stats stay intact.
--
-- Accounts are created by an admin in the Supabase dashboard
-- (Authentication > Users > Add user). See the bottom of this file for how to
-- make someone an admin or a coach.

-- Helper functions live in a schema the website's API can't reach.
create schema if not exists private;

-- ---------- staff: who is an admin, and who coaches which team ----------
create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'coach')),
  team_id    uuid references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- a coach row must name a team; an admin row covers all teams
  constraint coach_needs_team check (role = 'admin' or team_id is not null)
);
create unique index staff_unique_role on public.staff (user_id, role, team_id) nulls not distinct;
create index staff_team_idx on public.staff (team_id);

alter table public.staff enable row level security;
-- Signed-in users can see only their own staff rows (to know which teams they can edit).
create policy "read own staff rows" on public.staff
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.staff from anon, authenticated;
grant select on public.staff to authenticated;

-- ---------- permission checks used by the policies ----------
-- security definer so the check can read the staff table regardless of its RLS.
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create function private.can_edit_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where user_id = (select auth.uid()) and (role = 'admin' or team_id = t)
  );
$$;

-- URL-friendly id like "jordan-reyes-3f9a1" (random ending keeps it unique).
create function private.make_slug(txt text) returns text
language sql volatile set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(txt), '[^a-z0-9]+', '-', 'g'))
         || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
$$;

create function private.set_player_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := private.make_slug(new.first_name || ' ' || new.last_name);
  end if;
  return new;
end $$;

create function private.set_team_slug() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := private.make_slug(new.name);
  end if;
  return new;
end $$;

create trigger players_set_slug before insert on public.players
  for each row execute function private.set_player_slug();
create trigger teams_set_slug before insert on public.teams
  for each row execute function private.set_team_slug();

revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------- data checks (enforced by the database, not just the page) ----------
alter table public.players
  add constraint players_first_len check (char_length(trim(first_name)) between 1 and 40),
  add constraint players_last_len  check (char_length(trim(last_name))  between 1 and 40),
  add constraint players_pos_len   check (position is null or char_length(position) <= 20),
  add constraint players_grade_len check (grade is null or char_length(grade) <= 20);
alter table public.teams
  add constraint teams_name_len   check (char_length(trim(name)) between 1 and 60),
  add constraint teams_season_len check (char_length(trim(season)) between 1 and 20);

-- One active player per jersey number on a team.
create unique index players_team_jersey_active on public.players (team_id, jersey) where active;

-- ---------- write access ----------
-- Column-level grants: the page can only set these fields (not slug, photo, ids).
grant insert (team_id, first_name, last_name, jersey, position, grade) on public.players to authenticated;
grant update (first_name, last_name, jersey, position, grade, active) on public.players to authenticated;
grant insert (name, season) on public.teams to authenticated;

create policy "staff add players" on public.players
  for insert to authenticated with check (private.can_edit_team(team_id));
create policy "staff edit players" on public.players
  for update to authenticated
  using (private.can_edit_team(team_id))
  with check (private.can_edit_team(team_id));
create policy "admins add teams" on public.teams
  for insert to authenticated with check (private.is_admin());

-- ---------- how to add staff (run in the SQL editor) ----------
-- Make someone an admin:
--   insert into public.staff (user_id, role)
--   select id, 'admin' from auth.users where email = 'person@example.com';
-- Make someone the coach of a team:
--   insert into public.staff (user_id, role, team_id)
--   select u.id, 'coach', t.id from auth.users u, public.teams t
--   where u.email = 'coach@example.com' and t.slug = 'shepherd-eagles';
