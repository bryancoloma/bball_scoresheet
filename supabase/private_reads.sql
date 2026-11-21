-- Team pages require sign-in. Run after coach_approval.sql.
--
-- Who can read what after this:
--   signed out / not yet approved : nothing
--   coach                         : their own team's players, games and stats;
--                                   every team's NAME (for pickers); any team's
--                                   player names + numbers via scoresheet_roster()
--   admin                         : everything

-- Is the signed-in user an approved admin or coach?
create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;
revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated;

-- Remove the old "anyone can read" rules.
drop policy "public read teams"   on public.teams;
drop policy "public read players" on public.players;
drop policy "public read games"   on public.games;
drop policy "public read stats"   on public.player_game_stats;
revoke select on public.teams, public.players, public.games, public.player_game_stats, public.player_season_stats from anon;

create policy "staff read team names" on public.teams
  for select to authenticated using (private.is_staff());
create policy "team staff read players" on public.players
  for select to authenticated using (private.can_edit_team(team_id));
create policy "team staff read games" on public.games
  for select to authenticated using (private.can_edit_team(team_id));
create policy "team staff read stats" on public.player_game_stats
  for select to authenticated using (
    exists (select 1 from public.games g where g.id = game_id and private.can_edit_team(g.team_id))
  );
-- player_season_stats is a security_invoker view, so it follows the rules above.

-- Scoresheet drop-downs: names and numbers of any team's active players,
-- for approved staff only. Nothing else (no grade, position, photo or stats).
create function public.scoresheet_roster(team uuid)
returns table (id uuid, first_name text, last_name text, jersey smallint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.jersey
  from public.players p
  where p.team_id = team and p.active and private.is_staff()
  order by p.first_name, p.last_name;
$$;
revoke execute on function public.scoresheet_roster(uuid) from public, anon;
grant execute on function public.scoresheet_roster(uuid) to authenticated;
