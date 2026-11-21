-- Saving a game from the scoresheet. Run after private_reads.sql.
--
-- One "Save game" creates, for each side the user is allowed to save
-- (coach: their own team; admin: any team in the database):
--   * a games row from that team's point of view (date, time, opponent, scores)
--   * a player_game_stats row per roster player (points, fouls, periods played)
--   * a game_guest_stats row per typed-in player not on the roster (rows 9-10)
-- It all happens in one transaction: either everything saves or nothing does.

alter table public.games
  add column game_time time,
  add column saved_by uuid default auth.uid() references auth.users (id) on delete set null,
  add constraint games_opponent_len check (char_length(trim(opponent)) between 1 and 60);

-- Players typed in by hand (not on the roster yet), so their stats aren't lost.
create table public.game_guest_stats (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games (id) on delete cascade,
  name      text not null check (char_length(trim(name)) between 1 and 60),
  jersey    smallint check (jersey between 0 and 99),
  points    smallint not null default 0 check (points >= 0),
  fouls     smallint not null default 0 check (fouls between 0 and 5),
  periods   smallint not null default 0 check (periods between 0 and 8)
);
create index game_guest_stats_game_idx on public.game_guest_stats (game_id);
create index games_saved_by_idx on public.games (saved_by);
alter table public.game_guest_stats enable row level security;

-- ---------- who can save ----------
grant insert (team_id, game_date, game_time, opponent, team_score, opp_score) on public.games to authenticated;
grant insert (game_id, player_id, points, fouls, periods) on public.player_game_stats to authenticated;
grant insert (game_id, name, jersey, points, fouls, periods) on public.game_guest_stats to authenticated;
grant select on public.game_guest_stats to authenticated;

create policy "team staff add games" on public.games
  for insert to authenticated with check (private.can_edit_team(team_id));

-- A stat row must point at a game you can edit AND a player on that game's team.
create policy "team staff add stats" on public.player_game_stats
  for insert to authenticated with check (
    exists (
      select 1 from public.games g join public.players p on p.team_id = g.team_id
      where g.id = game_id and p.id = player_id and private.can_edit_team(g.team_id)
    )
  );

create policy "team staff add guest stats" on public.game_guest_stats
  for insert to authenticated with check (
    exists (select 1 from public.games g where g.id = game_id and private.can_edit_team(g.team_id))
  );
create policy "team staff read guest stats" on public.game_guest_stats
  for select to authenticated using (
    exists (select 1 from public.games g where g.id = game_id and private.can_edit_team(g.team_id))
  );

-- ---------- the save itself ----------
-- Runs with the caller's own rights, so the policies above decide what's allowed.
-- Input shape (built by js/savegame.js):
-- { "game_date": "2026-11-18", "game_time": "18:30",
--   "sides": [ { "team_id": "...", "opponent": "Riverside Hawks", "team_score": 48, "opp_score": 41,
--                "players": [ { "player_id": "...", "points": 12, "fouls": 2, "periods": 6 } ],
--                "guests":  [ { "name": "Sam", "jersey": 30, "points": 2, "fouls": 0, "periods": 3 } ] } ] }
create function public.save_game(game jsonb)
returns uuid[]
language plpgsql security invoker set search_path = '' as $$
declare
  side jsonb;
  p jsonb;
  new_game uuid;
  saved uuid[] := '{}';
begin
  if jsonb_array_length(coalesce(game->'sides', '[]'::jsonb)) = 0 then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  for side in select * from jsonb_array_elements(game->'sides') loop
    insert into public.games (team_id, game_date, game_time, opponent, team_score, opp_score)
    values (
      (side->>'team_id')::uuid,
      (game->>'game_date')::date,
      nullif(game->>'game_time', '')::time,
      side->>'opponent',
      (side->>'team_score')::smallint,
      (side->>'opp_score')::smallint
    )
    returning id into new_game;
    saved := saved || new_game;

    for p in select * from jsonb_array_elements(coalesce(side->'players', '[]'::jsonb)) loop
      insert into public.player_game_stats (game_id, player_id, points, fouls, periods)
      values (new_game, (p->>'player_id')::uuid, (p->>'points')::smallint,
              (p->>'fouls')::smallint, (p->>'periods')::smallint);
    end loop;

    for p in select * from jsonb_array_elements(coalesce(side->'guests', '[]'::jsonb)) loop
      insert into public.game_guest_stats (game_id, name, jersey, points, fouls, periods)
      values (new_game, p->>'name', nullif(p->>'jersey', '')::smallint, (p->>'points')::smallint,
              (p->>'fouls')::smallint, (p->>'periods')::smallint);
    end loop;
  end loop;

  return saved;
end $$;

revoke execute on function public.save_game(jsonb) from public, anon;
grant execute on function public.save_game(jsonb) to authenticated;
