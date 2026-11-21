-- Shepherd basketball schema: teams, players, games and per-game player stats.
-- Run once in the shepherd_basketball project (SQL editor or migration).
--
-- Access model for now: the public pages can READ everything, and nobody can
-- write through the public (anon) key. Writes happen from the Supabase
-- dashboard until coach/scorekeeper logins are added.

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,              -- used in URLs: team.html?team=<slug>
  name        text not null,
  org         text not null default 'Shepherd Sports',
  season      text not null,
  created_at  timestamptz not null default now()
);

create table public.players (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  slug        text not null unique,              -- used in URLs: player.html?id=<slug>
  first_name  text not null,
  last_name   text not null,
  jersey      smallint check (jersey between 0 and 99),
  position    text,
  grade       text,
  photo_url   text,                              -- null shows a silhouette
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.games (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams (id) on delete cascade,
  game_date       date not null,
  opponent        text not null,
  opponent_short  text,                          -- shorter name for the card back
  team_score      smallint check (team_score >= 0),
  opp_score       smallint check (opp_score >= 0),
  created_at      timestamptz not null default now()
);

-- One row per player per game. Limits match the scoresheet (5 fouls, 8 periods).
create table public.player_game_stats (
  game_id    uuid not null references public.games (id) on delete cascade,
  player_id  uuid not null references public.players (id) on delete cascade,
  points     smallint not null default 0 check (points >= 0),
  fouls      smallint not null default 0 check (fouls between 0 and 5),
  periods    smallint not null default 0 check (periods between 0 and 8),
  primary key (game_id, player_id)
);

create index players_team_idx on public.players (team_id);
create index games_team_date_idx on public.games (team_id, game_date desc);
create index pgs_player_idx on public.player_game_stats (player_id);

-- Season totals per player, calculated from the game rows.
-- security_invoker makes the view follow the RLS rules of the tables under it.
create view public.player_season_stats
with (security_invoker = true) as
select
  p.id                          as player_id,
  count(s.game_id)::int         as games,
  coalesce(sum(s.points), 0)::int  as points,
  coalesce(sum(s.fouls), 0)::int   as fouls,
  coalesce(sum(s.periods), 0)::int as periods,
  coalesce(max(s.points), 0)::int  as high_points
from public.players p
left join public.player_game_stats s on s.player_id = p.id
group by p.id;

-- Row level security: read-only for the public site.
alter table public.teams             enable row level security;
alter table public.players           enable row level security;
alter table public.games             enable row level security;
alter table public.player_game_stats enable row level security;

create policy "public read teams"   on public.teams             for select to anon, authenticated using (true);
create policy "public read players" on public.players           for select to anon, authenticated using (true);
create policy "public read games"   on public.games             for select to anon, authenticated using (true);
create policy "public read stats"   on public.player_game_stats for select to anon, authenticated using (true);

-- Only SELECT is granted to the public roles, so writes are blocked twice over
-- (no grant and no write policy).
revoke all on public.teams, public.players, public.games, public.player_game_stats, public.player_season_stats
  from anon, authenticated;
grant select on public.teams, public.players, public.games, public.player_game_stats, public.player_season_stats
  to anon, authenticated;
