-- Parents linked to a team, and player photos. Run after registered_teams.sql.
--
-- Parents:
--   * an admin approves a parent WITH a team (their child's), like a coach
--   * a parent can VIEW that team's page, player pages and (once released)
--     player cards; they can't edit anything and no longer see scoresheets
-- Photos:
--   * stored in the PRIVATE "player-photos" bucket as <team id>/<player id>-<random>.jpg
--   * admins and that team's coaches can upload / replace / remove
--   * only people who can view the team can load them (via short-lived signed links)

-- ---------- parents belong to a team ----------
alter table public.staff drop constraint coach_needs_team;
alter table public.staff add constraint coach_needs_team
  check ((role in ('coach', 'parent')) = (team_id is not null));

create or replace function public.approve_account(account uuid, new_role text, team uuid default null)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.staff (user_id, role, team_id)
  values (account, new_role, case when new_role in ('coach', 'parent') then team end);
end $$;

-- Who may VIEW a team's players, games and stats: admin, its coaches, its parents.
create function private.can_view_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where user_id = (select auth.uid())
      and (role = 'admin' or (role in ('coach', 'parent') and team_id = t))
  );
$$;
revoke all on function private.can_view_team(uuid) from public, anon;
grant execute on function private.can_view_team(uuid) to authenticated;

-- Reading switches from "can edit" to "can view"; editing rules don't change.
drop policy "team staff read players" on public.players;
create policy "team viewers read players" on public.players
  for select to authenticated using (private.can_view_team(team_id));
drop policy "team staff read games" on public.games;
create policy "team viewers read games" on public.games
  for select to authenticated using (private.can_view_team(team_id));
drop policy "team staff read stats" on public.player_game_stats;
create policy "team viewers read stats" on public.player_game_stats
  for select to authenticated using (
    exists (select 1 from public.games g where g.id = game_id and private.can_view_team(g.team_id))
  );

-- Live/saved scoresheets: admins, coaches and scorers (not parents).
create function private.can_watch_games() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where user_id = (select auth.uid()) and role in ('admin', 'coach', 'scorer')
  );
$$;
revoke all on function private.can_watch_games() from public, anon;
grant execute on function private.can_watch_games() to authenticated;
drop policy "approved accounts watch games" on public.scoresheets;
create policy "staff watch games" on public.scoresheets
  for select to authenticated using (private.can_watch_games());

-- ---------- player photos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 2097152, array['image/jpeg']);

-- The photo's place in the bucket. Must live in the player's own team folder.
alter table public.players
  add column photo_path text,
  add constraint players_photo_path_ok check (
    photo_path is null or (
      photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}-[a-z0-9]{6,16}\.jpg$'
      and split_part(photo_path, '/', 1) = team_id::text
    )
  );
grant update (photo_path) on public.players to authenticated; -- "staff edit players" policy still applies

-- The team id from a photo's path ("<team id>/<file>"), or null if the path
-- isn't shaped like that (so a bad name is simply refused, never an error).
create function private.photo_team(object_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end;
$$;
revoke all on function private.photo_team(text) from public, anon;
grant execute on function private.photo_team(text) to authenticated;

-- The first folder in the file's path is the team id.
create policy "team staff upload photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'player-photos' and private.can_edit_team(private.photo_team(name)));
create policy "team staff remove photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'player-photos' and private.can_edit_team(private.photo_team(name)));
create policy "team viewers see photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'player-photos' and private.can_view_team(private.photo_team(name)));
