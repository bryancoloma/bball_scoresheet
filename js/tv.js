// TV scoreboard: big score, team fouls, and each team's 5 players on the court,
// following the live game as the scorer updates it.
//   tv.html              follows the live game; when it ends, shows the final
//                        until the next game goes live, then switches to it
//   tv.html?game=<id>    stays on that one game
// Who's on the court: the players ticked in the team's latest playtime box
// once it has all 5 (js/live.js makes the scorer fill each box with exactly 5).
import { isConfigured, db, getMyAccess } from "./data.js";
import { esc } from "./render.js";

const POLL_MS = 3000;   // check for new scores this often
const GAME_COLS = "id, status, home_name, away_name, home_score, away_score, sheet, updated_at";
const PLAYING = 5;

const app = document.getElementById("tv");
const conn = document.getElementById("tvConn");
const pinned = new URLSearchParams(location.search).get("game");
let currentId = pinned;
let shownKey = "";       // what's on screen now, so it only redraws on a change

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

async function loadGame(id) {
  return unwrap(await db.from("scoresheets").select(GAME_COLS).eq("id", id).limit(1))[0] ?? null;
}

async function newestLiveGame() {
  const rows = unwrap(await db.from("scoresheets").select("id")
    .eq("status", "live").order("updated_at", { ascending: false }).limit(1));
  return rows[0] ? loadGame(rows[0].id) : null;
}

// The team's latest playtime box with all 5 players ticked, and those players.
// While the scorer is still ticking the next box, the last full 5 stays up.
export function onCourt(side) {
  const rows = side?.rows ?? [];
  let period = -1;
  for (let j = 7; j >= 0 && period < 0; j--) {
    if (rows.filter(r => r.periods?.[j]).length === PLAYING) period = j;
  }
  const players = period < 0 ? [] : rows.filter(r => r.periods[period]);
  return { period, players };
}

function teamHead(side, name, fouls) {
  return `<div class="tvTeam ${side}">
    <span class="tvSide">${side === "home" ? "Home" : "Away"}</span>
    <span class="tvName">${esc(name)}</span>
    <span class="tvFouls">Team fouls <b>${esc(fouls || 0)}</b></span>
  </div>`;
}

function roster(side, s) {
  const { period, players } = onCourt(s);
  const rows = players.map(r => {
    const fouls = Number(r.fouls) || 0;
    return `<tr${fouls >= 5 ? ' class="fouledOut"' : ""}>
      <td class="num">${esc(r.num) || "&ndash;"}</td>
      <td class="name">${esc(r.pickName || r.name || "Player")}</td>
      <td class="tvStat">${Number(r.points) || 0}</td>
      <td class="tvStat">${fouls}</td>
    </tr>`;
  }).join("");
  return `<section class="tvRoster ${side}">
    <h2>${esc(s?.label ?? side)} <span>${period < 0 ? "Players not in yet" : `On the court &middot; period ${period + 1}`}</span></h2>
    <table>
      <thead><tr><th>#</th><th>Player</th><th>Pts</th><th>Fouls</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="tvWait">Waiting for the scorer to tick the 5 players.</td></tr>`}</tbody>
    </table>
  </section>`;
}

function show(game) {
  const key = game ? `${game.id}|${game.updated_at}|${game.status}` : "none";
  if (key === shownKey) return;
  shownKey = key;
  if (!game) {
    app.innerHTML = `<p class="tvEmpty">No game is being played right now.<br><span>The score shows here as soon as the scorer starts one.</span></p>`;
    return;
  }
  const s = game.sheet ?? {};
  app.innerHTML = `
    <header class="tvScore">
      ${teamHead("home", game.home_name, s.home?.teamFouls)}
      <div class="tvNums">
        <span>${Number(game.home_score) || 0}</span><span class="dash">&ndash;</span><span>${Number(game.away_score) || 0}</span>
        <span class="tvState ${game.status}">${game.status === "final" ? "Final" : "Live"}</span>
      </div>
      ${teamHead("away", game.away_name, s.away?.teamFouls)}
    </header>
    <div class="tvCourt">${roster("home", s.home)}${roster("away", s.away)}</div>`;
}

async function tick() {
  try {
    let game = currentId ? await loadGame(currentId) : null;
    // Following mode: once this game is over (or gone), switch to the next live one.
    if (!pinned && game?.status !== "live") {
      const next = await newestLiveGame();
      if (next) game = next;
    }
    currentId = game?.id ?? (pinned || null);
    show(game);
    conn.textContent = "";
  } catch (err) {
    console.error(err);
    conn.textContent = "Reconnecting…"; // keep the last score on screen
  }
}

// Full screen for the TV (the Esc key leaves it).
const fullBtn = document.getElementById("tvFull");
if (!document.documentElement.requestFullscreen) fullBtn.hidden = true;
fullBtn.addEventListener("click", () => document.documentElement.requestFullscreen().catch(() => {}));

async function main() {
  if (!isConfigured) return show(null);
  const access = await getMyAccess();
  if (!access.user) return location.replace("roster.html?next=" + encodeURIComponent("tv.html" + location.search));
  if (access.parentOnly) return location.replace("team.html");
  if (!access.isApproved) {
    app.innerHTML = `<p class="tvEmpty">Your account is waiting for the admin to approve it.</p>`;
    return;
  }
  await tick();
  setInterval(tick, POLL_MS);
}

main().catch(err => {
  console.error(err);
  app.innerHTML = `<p class="tvEmpty">Can't reach the server. Check the internet connection and reload.</p>`;
});
