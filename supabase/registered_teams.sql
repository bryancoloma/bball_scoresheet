-- Only registered teams can play. Run after live_games.sql.
--
-- Every game must name a Home and an Away team from public.teams, and they
-- must be different teams. (The scoresheet no longer has "Other team".)
-- A team that has games can't be deleted, so a game never loses a side.

alter table public.scoresheets
  drop constraint scoresheets_home_team_id_fkey,
  drop constraint scoresheets_away_team_id_fkey;

alter table public.scoresheets
  alter column home_team_id set not null,
  alter column away_team_id set not null,
  add constraint scoresheets_home_team_id_fkey foreign key (home_team_id) references public.teams (id) on delete restrict,
  add constraint scoresheets_away_team_id_fkey foreign key (away_team_id) references public.teams (id) on delete restrict,
  add constraint scoresheets_two_teams check (home_team_id <> away_team_id);
