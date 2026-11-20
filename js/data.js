// Data access for the team, player and card pages. Read-only.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
// Shared client. The roster page also uses it to sign coaches/admins in.
export const db = isConfigured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

// Throw the Supabase error so the page can show one message for any failure.
function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// Team by slug, or the first team when no slug is given.
export async function getTeam(slug) {
  let q = db.from("teams").select("*");
  q = slug ? q.eq("slug", slug) : q.order("created_at").limit(1);
  const rows = unwrap(await q);
  return rows[0] ?? null;
}

// All teams, alphabetical (for the scoresheet and roster pickers).
// Needs an approved (admin or coach) sign-in; otherwise the database returns none.
export async function getTeams() {
  return unwrap(await db.from("teams").select("id, slug, name, org, season").order("name"));
}

// Who is signed in, and which teams they may view: every team for an admin,
// only their own team(s) for a coach, none if signed out or not yet approved.
export async function getMyAccess() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return { user: null, isAdmin: false, teams: [] };
  const staff = unwrap(await db.from("staff").select("role, team_id"));
  const isAdmin = staff.some(s => s.role === "admin");
  const coachTeamIds = new Set(staff.filter(s => s.role === "coach").map(s => s.team_id));
  const all = staff.length ? await getTeams() : [];
  return { user: session.user, isAdmin, teams: isAdmin ? all : all.filter(t => coachTeamIds.has(t.id)) };
}

// Names and numbers only, for the scoresheet drop-downs (works for any team,
// including opponents). See public.scoresheet_roster in supabase/private_reads.sql.
export async function getScoresheetRoster(teamId) {
  return unwrap(await db.rpc("scoresheet_roster", { team: teamId }));
}

// Active players on a team, by jersey number. Lighter than getRoster (no stats).
export async function getActivePlayers(teamId) {
  return unwrap(await db.from("players")
    .select("id, slug, first_name, last_name, jersey, position, grade")
    .eq("team_id", teamId).eq("active", true)
    .order("jersey", { nullsFirst: false }));
}

// Games for a team, newest first, with the W-L record worked out.
export async function getGames(teamId) {
  const games = unwrap(await db.from("games").select("*").eq("team_id", teamId).order("game_date", { ascending: false }));
  const wins = games.filter(g => g.team_score > g.opp_score).length;
  const losses = games.filter(g => g.team_score < g.opp_score).length;
  return { games, wins, losses };
}

// Active players on a team, each with a `season` object of totals from the view.
export async function getRoster(teamId) {
  const players = unwrap(await db.from("players").select("*").eq("team_id", teamId).eq("active", true));
  if (!players.length) return [];
  const totals = unwrap(await db.from("player_season_stats").select("*").in("player_id", players.map(p => p.id)));
  const byId = new Map(totals.map(t => [t.player_id, t]));
  return players.map(p => ({ ...p, season: byId.get(p.id) ?? emptySeason() }));
}

// One player with team, season totals and game log (newest first).
export async function getPlayer(slug) {
  const rows = unwrap(await db.from("players").select("*, teams(*)").eq("slug", slug).limit(1));
  const player = rows[0];
  if (!player) return null;

  const [seasonRows, logRows, record] = await Promise.all([
    db.from("player_season_stats").select("*").eq("player_id", player.id).then(unwrap),
    db.from("player_game_stats")
      .select("points, fouls, periods, games(game_date, opponent, opponent_short, team_score, opp_score)")
      .eq("player_id", player.id)
      .then(unwrap),
    getGames(player.team_id),
  ]);

  // Embedded rows can't be ordered by the parent here, so sort in the browser.
  const log = logRows
    .map(r => ({ ...r.games, points: r.points, fouls: r.fouls, periods: r.periods }))
    .sort((a, b) => b.game_date.localeCompare(a.game_date));

  return { ...player, team: player.teams, season: seasonRows[0] ?? emptySeason(), log, record };
}

function emptySeason() {
  return { games: 0, points: 0, fouls: 0, periods: 0, high_points: 0 };
}
