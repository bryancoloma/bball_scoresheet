-- FAKE sample data for testing the pages. All names and stats are made up.
-- Run after schema.sql. Safe to delete later with: delete from public.teams;

with team as (
  insert into public.teams (slug, name, season)
  values ('shepherd-eagles', 'Shepherd Eagles', '2026')
  returning id
),
players as (
  insert into public.players (team_id, slug, first_name, last_name, jersey, position, grade)
  select team.id, v.slug, v.first_name, v.last_name, v.jersey, v.position, v.grade
  from team, (values
    ('jordan-reyes',  'Jordan', 'Reyes',  24, 'Guard',   '8th'),
    ('marcus-bell',   'Marcus', 'Bell',    3, 'Guard',   '8th'),
    ('elijah-carter', 'Elijah', 'Carter', 11, 'Forward', '8th'),
    ('isaiah-brooks', 'Isaiah', 'Brooks', 22, 'Forward', '8th'),
    ('noah-kim',      'Noah',   'Kim',    15, 'Guard',   '7th'),
    ('caleb-ortiz',   'Caleb',  'Ortiz',  32, 'Center',  '8th'),
    ('tyler-nguyen',  'Tyler',  'Nguyen',  5, 'Guard',   '7th')
  ) as v (slug, first_name, last_name, jersey, position, grade)
  returning id, slug
),
games as (
  insert into public.games (team_id, game_date, opponent, opponent_short, team_score, opp_score)
  select team.id, v.d::date, v.opp, v.short, v.us, v.them
  from team, (values
    ('2026-11-07', 'Riverside',        'Riverside',   48, 41),
    ('2026-11-02', 'St. Mark''s',      'St. Mark''s', 36, 39),
    ('2026-10-26', 'Valley Christian', 'Valley Chr.', 52, 30),
    ('2026-10-19', 'Lincoln',          'Lincoln',     44, 38)
  ) as v (d, opp, short, us, them)
  returning id, game_date
)
insert into public.player_game_stats (game_id, player_id, points, fouls, periods)
select g.id, p.id, s.points, s.fouls, s.periods
from (values
  -- slug,           game date,   pts, fouls, periods
  ('jordan-reyes',  '2026-11-07', 21, 2, 7), ('jordan-reyes',  '2026-11-02',  9, 4, 6),
  ('jordan-reyes',  '2026-10-26', 14, 1, 5), ('jordan-reyes',  '2026-10-19', 12, 2, 8),
  ('marcus-bell',   '2026-11-07',  8, 1, 7), ('marcus-bell',   '2026-11-02', 10, 2, 7),
  ('marcus-bell',   '2026-10-26',  9, 2, 6), ('marcus-bell',   '2026-10-19',  7, 1, 7),
  ('elijah-carter', '2026-11-07',  6, 3, 6), ('elijah-carter', '2026-11-02',  5, 2, 6),
  ('elijah-carter', '2026-10-26',  8, 1, 6), ('elijah-carter', '2026-10-19',  9, 3, 6),
  ('isaiah-brooks', '2026-11-07',  5, 2, 6), ('isaiah-brooks', '2026-11-02',  6, 3, 6),
  ('isaiah-brooks', '2026-10-26',  7, 2, 6), ('isaiah-brooks', '2026-10-19',  6, 1, 6),
  ('noah-kim',      '2026-11-07',  4, 0, 5), ('noah-kim',      '2026-11-02',  3, 1, 5),
  ('noah-kim',      '2026-10-26',  6, 1, 6), ('noah-kim',      '2026-10-19',  5, 2, 5),
  ('caleb-ortiz',   '2026-11-07',  2, 4, 5), ('caleb-ortiz',   '2026-11-02',  2, 3, 5),
  ('caleb-ortiz',   '2026-10-26',  5, 2, 6), ('caleb-ortiz',   '2026-10-19',  3, 3, 4),
  ('tyler-nguyen',  '2026-11-07',  2, 1, 4), ('tyler-nguyen',  '2026-11-02',  1, 0, 5),
  ('tyler-nguyen',  '2026-10-26',  3, 1, 5), ('tyler-nguyen',  '2026-10-19',  2, 0, 4)
) as s (slug, d, points, fouls, periods)
join players p on p.slug = s.slug
join games   g on g.game_date = s.d::date;

-- A FAKE opponent team, so the scoresheet's Away picker has a roster to show.
-- (Run after roster_access.sql, which fills in the slugs automatically.)
with team as (
  insert into public.teams (slug, name, season)
  values ('riverside-hawks', 'Riverside Hawks', '2026')
  returning id
)
insert into public.players (team_id, first_name, last_name, jersey, position, grade)
select team.id, v.f, v.l, v.j, v.p, v.g
from team, (values
  ('Owen',  'Fisher',  2, 'Guard',   '8th'),
  ('Liam',  'Parker', 10, 'Guard',   '8th'),
  ('Mason', 'Reed',   14, 'Forward', '8th'),
  ('Ethan', 'Cole',   21, 'Forward', '7th'),
  ('Lucas', 'Grant',  33, 'Center',  '8th'),
  ('Ryan',  'Hayes',   7, 'Guard',   '7th')
) as v (f, l, j, p, g);
