-- Live games, scorer/parent roles, coach contact info and player-card release.
-- Run after save_game.sql.
--
-- Roles (public.staff.role):
--   admin  : everything, plus unlocking saved games and releasing player cards
--   coach  : their own team's roster, team page and stats (read-only scoresheet)
--   scorer : keeps score on the scoresheet for any game; nothing else
--   parent : watches live / saved scoresheets (read-only); nothing else
-- Accounts nobody has approved yet can't see anything.
--
-- A game is one row in public.scoresheets. The scorer's sheet saves into it
-- as the game goes (status 'live'). "Save game" calls finish_game(), which
-- writes the team/player stats and locks it (status 'final'). An admin can
-- unlock_game() to reopen it: its stats are removed until it's saved again.

-- ---------- roles ----------
alter table public.staff drop constraint staff_role_check;
alter table public.staff add constraint staff_role_check check (role in ('admin', 'coach', 'scorer', 'parent'));
-- Only coach rows name a team.
alter table public.staff drop constraint coach_needs_team;
alter table public.staff add constraint coach_needs_team check ((role = 'coach') = (team_id is not null));

-- Admin or scorer: may keep score.
create function private.can_score() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where user_id = (select auth.uid()) and role in ('admin', 'scorer')
  );
$$;

-- Tightened: only an admin, or a COACH of that team (not scorers/parents).
create or replace function private.can_edit_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff
    where user_id = (select auth.uid())
      and (role = 'admin' or (role = 'coach' and team_id = t))
  );
$$;

-- Roster drop-downs are for whoever keeps score now (not coaches/parents).
create or replace function public.scoresheet_roster(team uuid)
returns table (id uuid, first_name text, last_name text, jersey smallint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name, p.last_name, p.jersey
  from public.players p
  where p.team_id = team and p.active and private.can_score()
  order by p.first_name, p.last_name;
$$;

-- ---------- name and phone, asked at sign-up ----------
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text check (full_name is null or char_length(full_name) between 1 and 80),
  phone      text check (phone is null or char_length(phone) between 1 and 30),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create policy "read own or admin" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());

-- Sign-up sends {full_name, phone} as user metadata; copy it into profiles.
-- Trimmed and cut to length so a long entry can never block a sign-up.
create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, full_name, phone)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 80), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'phone'), 30), '')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.create_profile();
-- Accounts made before this change get an empty profile.
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;

-- ---------- approvals (admin page) ----------
drop function public.pending_accounts();
create function public.pending_accounts()
returns table (user_id uuid, email text, full_name text, phone text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, p.full_name, p.phone, u.created_at
  from auth.users u left join public.profiles p on p.user_id = u.id
  where private.is_admin()
    and not exists (select 1 from public.staff s where s.user_id = u.id)
  order by u.created_at desc;
$$;

-- Everyone with a role, with email/name/phone. Admins only (empty otherwise).
create function public.admin_staff()
returns table (user_id uuid, role text, team_id uuid, email text, full_name text, phone text)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.role, s.team_id, u.email::text, p.full_name, p.phone
  from public.staff s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.user_id = s.user_id
  where private.is_admin()
  order by p.full_name nulls last, u.email;
$$;

-- Approve as coach (with a team), scorer or parent. Runs with the caller's
-- rights; the policy below allows admins only, and never the admin role.
drop policy "admins add coaches" on public.staff;
drop function public.approve_coach(uuid, uuid);
create function public.approve_account(account uuid, new_role text, team uuid default null)
returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.staff (user_id, role, team_id)
  values (account, new_role, case when new_role = 'coach' then team end);
end $$;
create policy "admins add staff" on public.staff
  for insert to authenticated
  with check (private.is_admin() and role in ('coach', 'scorer', 'parent'));

-- ---------- player cards: hidden from coaches until an admin releases them ----------
alter table public.teams add column cards_released boolean not null default false;
grant update (cards_released) on public.teams to authenticated;
create policy "admins update teams" on public.teams
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

-- ---------- live games ----------
create table public.scoresheets (
  id            uuid primary key default gen_random_uuid(),
  status        text not null default 'live' check (status in ('live', 'final')),
  game_date     date not null default current_date,
  game_time     time,
  home_team_id  uuid references public.teams (id) on delete set null,
  away_team_id  uuid references public.teams (id) on delete set null,
  home_name     text not null default 'Home' check (char_length(trim(home_name)) between 1 and 60),
  away_name     text not null default 'Away' check (char_length(trim(away_name)) between 1 and 60),
  home_score    smallint not null default 0 check (home_score >= 0),
  away_score    smallint not null default 0 check (away_score >= 0),
  -- every box on the sheet, so viewers see it and the scorer can resume it
  sheet         jsonb not null default '{}' check (pg_column_size(sheet) < 65536),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index scoresheets_status_idx on public.scoresheets (status, updated_at desc);
create index scoresheets_home_idx on public.scoresheets (home_team_id);
create index scoresheets_away_idx on public.scoresheets (away_team_id);
create index scoresheets_created_by_idx on public.scoresheets (created_by);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger scoresheets_touch before update on public.scoresheets
  for each row execute function private.touch_updated_at();

alter table public.scoresheets enable row level security;
revoke all on public.scoresheets from anon, authenticated;
grant select, delete on public.scoresheets to authenticated;
-- Status, ids and timestamps can't be set from the page.
grant insert (game_date, game_time, home_team_id, away_team_id, home_name, away_name, home_score, away_score, sheet)
  on public.scoresheets to authenticated;
grant update (game_date, game_time, home_team_id, away_team_id, home_name, away_name, home_score, away_score, sheet)
  on public.scoresheets to authenticated;

create policy "approved accounts watch games" on public.scoresheets
  for select to authenticated using (private.is_staff());
create policy "scorers start games" on public.scoresheets
  for insert to authenticated with check (private.can_score() and status = 'live');
-- A saved (final) game is locked: no edits until an admin unlocks it.
create policy "scorers update live games" on public.scoresheets
  for update to authenticated
  using (private.can_score() and status = 'live')
  with check (private.can_score() and status = 'live');
-- For clearing out a game started by mistake.
create policy "admins delete live games" on public.scoresheets
  for delete to authenticated using (private.is_admin() and status = 'live');

-- Saved stats point back at their scoresheet, so unlocking can remove them.
alter table public.games add column scoresheet_id uuid references public.scoresheets (id) on delete cascade;
create index games_scoresheet_idx on public.games (scoresheet_id);

-- ---------- only finish_game() writes stats now ----------
drop function public.save_game(jsonb);
drop policy "team staff add games" on public.games;
drop policy "team staff add stats" on public.player_game_stats;
drop policy "team staff add guest stats" on public.game_guest_stats;
revoke insert on public.games, public.player_game_stats, public.game_guest_stats from authenticated;

-- Save and lock a live game. `game` has the same shape save_game used:
-- { "sides": [ { "team_id", "opponent", "team_score", "opp_score",
--                "players": [ { "player_id", "points", "fouls", "periods" } ],
--                "guests":  [ { "name", "jersey", "points", "fouls", "periods" } ] } ] }
-- security definer (it writes tables the scorer can't), so it checks
-- everything itself: caller is a scorer/admin, the game is live, each side is
-- one of this game's teams, and each player is on that side's team.
create function public.finish_game(sheet_id uuid, game jsonb)
returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  s public.scoresheets%rowtype;
  side jsonb;
  p jsonb;
  team uuid;
  new_game uuid;
  n int;
  saved uuid[] := '{}';
begin
  if not private.can_score() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into s from public.scoresheets where id = sheet_id for update;
  if not found then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;
  if s.status <> 'live' then
    raise exception 'This game is already saved' using errcode = '55000';
  end if;

  for side in select * from jsonb_array_elements(coalesce(game->'sides', '[]'::jsonb)) loop
    team := (side->>'team_id')::uuid;
    if team is null or (team is distinct from s.home_team_id and team is distinct from s.away_team_id) then
      raise exception 'Team is not in this game' using errcode = '42501';
    end if;

    insert into public.games (team_id, game_date, game_time, opponent, team_score, opp_score, scoresheet_id)
    values (team, s.game_date, s.game_time, side->>'opponent',
            (side->>'team_score')::smallint, (side->>'opp_score')::smallint, sheet_id)
    returning id into new_game;
    saved := saved || new_game;

    for p in select * from jsonb_array_elements(coalesce(side->'players', '[]'::jsonb)) loop
      insert into public.player_game_stats (game_id, player_id, points, fouls, periods)
      select new_game, pl.id, (p->>'points')::smallint, (p->>'fouls')::smallint, (p->>'periods')::smallint
      from public.players pl
      where pl.id = (p->>'player_id')::uuid and pl.team_id = team;
      get diagnostics n = row_count;
      if n = 0 then
        raise exception 'Player is not on that team' using errcode = '42501';
      end if;
    end loop;

    for p in select * from jsonb_array_elements(coalesce(side->'guests', '[]'::jsonb)) loop
      insert into public.game_guest_stats (game_id, name, jersey, points, fouls, periods)
      values (new_game, p->>'name', nullif(p->>'jersey', '')::smallint, (p->>'points')::smallint,
              (p->>'fouls')::smallint, (p->>'periods')::smallint);
    end loop;
  end loop;

  update public.scoresheets set status = 'final', finished_at = now() where id = sheet_id;
  return saved;
end $$;

-- Reopen a saved game (admin only). Its stats come off the team pages until
-- the scorer saves it again.
create function public.unlock_game(sheet_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.scoresheets set status = 'live', finished_at = null
  where id = sheet_id and status = 'final';
  if not found then
    raise exception 'That game is not locked' using errcode = 'P0002';
  end if;
  delete from public.games where scoresheet_id = sheet_id;
end $$;

-- ---------- function permissions ----------
revoke all on function private.can_score(), private.create_profile(), private.touch_updated_at() from public, anon;
grant execute on function private.can_score() to authenticated;
revoke execute on function
  public.pending_accounts(), public.admin_staff(), public.approve_account(uuid, text, uuid),
  public.finish_game(uuid, jsonb), public.unlock_game(uuid)
  from public, anon;
grant execute on function
  public.pending_accounts(), public.admin_staff(), public.approve_account(uuid, text, uuid),
  public.finish_game(uuid, jsonb), public.unlock_game(uuid)
  to authenticated;
