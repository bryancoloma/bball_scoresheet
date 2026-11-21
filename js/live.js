// Runs the scoresheet page. Decides, from who is signed in, whether this
// device KEEPS SCORE or just WATCHES:
//   scorer / admin : can edit; every change saves itself to the game (live)
//   coach / parent : read-only; the sheet follows the live game as it changes
//   signed out / not approved : read-only, with a sign-in note
// Open a specific game with index.html?game=<id> (the admin page links these).
import { isConfigured, db, getMyAccess, getTeams } from "./data.js";
import { esc, shortDate } from "./render.js";
import { initPickers } from "./scoresheet.js";
import { readSheet, applySheet } from "./sheetstate.js";
import { setupSave } from "./savegame.js";

const SAVE_DELAY_MS = 800;     // wait this long after the last tap before saving
const RETRY_MS = 5000;         // try again this often when the connection drops
const WATCH_MS = 4000;         // viewers check for new scores this often
const LIST_MS = 10000;         // the list of live games refreshes this often
const COLS = "id, status, game_date, home_name, away_name, home_score, away_score, sheet, updated_at";

const bar = document.getElementById("gameBar");
let gameId = new URLSearchParams(location.search).get("game");
let access = null;

// ---------- small helpers ----------

const wait = ms => new Promise(r => setTimeout(r, ms));
const clock = iso => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const today = () => new Date().toLocaleDateString("en-CA"); // "2026-11-21" in local time
const matchup = g => `${esc(g.home_name)} <b>${g.home_score}</b>&ndash;<b>${g.away_score}</b> ${esc(g.away_name)}`;

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// Turn editing off (watchers, locked games) or on (scorer).
function setReadOnly(on) {
  document.body.classList.toggle("readOnly", on);
  // Checkboxes stay enabled (disabled ones print faint gray); clicks on them
  // are blocked by the listener below instead.
  document.querySelectorAll(".gameDay_info input, .homeBlock input, .homeBlock select, .homeBlock button, .awayBlock input, .awayBlock select, .awayBlock button")
    .forEach(el => { if (el.type !== "checkbox") el.disabled = on; });
  document.getElementById("saveGameBtn").hidden = on;
}
// Read-only: ticking a playtime or timeout box does nothing.
document.addEventListener("click", e => {
  if (document.body.classList.contains("readOnly") && e.target.matches('input[type="checkbox"]')) e.preventDefault();
}, true);

// The strip under the title: what this device is doing, plus the live games list.
function showBar(status, games = [], { newGame = false } = {}) {
  const others = games.filter(g => g.id !== gameId);
  bar.innerHTML = `
    <p class="gameStatus">${status}</p>
    ${others.length || newGame ? `<div class="gameList">
      ${others.length ? `<span class="muted">Live now:</span>` : ""}
      ${others.map(g => `<a class="gameChip" href="index.html?game=${encodeURIComponent(g.id)}">${matchup(g)}</a>`).join("")}
      ${newGame ? `<a class="gameChip new" href="index.html">+ New game</a>` : ""}
    </div>` : ""}`;
  bar.hidden = false;
}
let lastStatus = "";
let lastList = [];
// "+ New game" only makes sense for a scorer who is already on a game.
const offerNewGame = () => Boolean(access?.canScore && gameId);
function setStatus(html) { lastStatus = html; showBar(html, lastList, { newGame: offerNewGame() }); }
async function refreshList() {
  try {
    lastList = unwrap(await db.from("scoresheets").select(COLS).eq("status", "live").order("updated_at", { ascending: false }).limit(12));
  } catch (err) { console.error(err); }
  showBar(lastStatus, lastList, { newGame: offerNewGame() });
}

async function loadGame(id) {
  const rows = unwrap(await db.from("scoresheets").select(COLS).eq("id", id).limit(1));
  return rows[0] ?? null;
}

// ---------- scorer: live autosave ----------

let saveTimer = null, saving = false, dirty = false, locked = false;

// One database row for the game, built from the sheet.
function rowFromSheet() {
  const sheet = readSheet();
  return {
    game_date: sheet.date || today(),
    game_time: sheet.time || null,
    home_team_id: sheet.home.teamId,
    away_team_id: sheet.away.teamId,
    home_name: sheet.home.label.slice(0, 60),
    away_name: sheet.away.label.slice(0, 60),
    home_score: sheet.home.score,
    away_score: sheet.away.score,
    sheet,
  };
}

function scheduleSave() {
  if (locked) return;
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  setStatus(`<span class="dot live"></span> Keeping score &middot; saving&hellip;`);
}

async function saveNow() {
  saveTimer = null;
  if (!dirty || locked) return;
  // A save is already on its way: try again right after it, so this change isn't lost.
  if (saving) { saveTimer = setTimeout(saveNow, 300); return; }
  const row = rowFromSheet();
  // Only registered teams play: a new game starts once both teams are picked.
  if (!gameId && !(row.home_team_id && row.away_team_id)) {
    dirty = true;
    return setStatus(`Pick the <b>Home</b> and <b>Away</b> teams to start the game.`);
  }
  saving = true;
  dirty = false;
  try {
    if (!gameId) {
      // First change of a new game: create it, and put its id in the address
      // so a refresh (or a dead iPad battery) can pick it back up.
      const created = unwrap(await db.from("scoresheets").insert(row).select("id").single());
      gameId = created.id;
      history.replaceState(null, "", `?game=${encodeURIComponent(gameId)}`);
    } else {
      const updated = unwrap(await db.from("scoresheets").update(row).eq("id", gameId).select("id"));
      // No row updated: the game was saved/locked (or deleted) somewhere else.
      if (!updated.length) return lockedElsewhere();
    }
    setStatus(`<span class="dot live"></span> Keeping score &middot; live &middot; saved ${clock(new Date().toISOString())}`);
  } catch (err) {
    console.error(err);
    dirty = true;
    setStatus(`<span class="dot off"></span> <b>Not saved yet</b>: no connection. Keep scoring; it will retry.`);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, RETRY_MS);
  } finally {
    saving = false;
  }
}

// Save right now and wait for it (used by Save game). Returns the game id.
async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  while (saving) await wait(100);
  dirty = true;
  await saveNow();
  if (dirty || !gameId) throw new Error("Live save failed");
  return gameId;
}

function lockedElsewhere() {
  locked = true;
  setReadOnly(true);
  setStatus(`<span class="dot off"></span> This game was saved and locked on another device. Ask an admin to unlock it.`);
}

function onLocked() {
  locked = true;
  setReadOnly(true);
  setStatus(`Final &middot; saved and locked. An admin can unlock it if something needs fixing.`);
}

function startScoring() {
  // Any typing, ticking or +1/-1 tap saves (debounced).
  for (const type of ["input", "change"]) {
    document.addEventListener(type, e => {
      if (e.target.closest(".gameDay_info, .homeBlock, .awayBlock")) scheduleSave();
    });
  }
  document.addEventListener("click", e => {
    if (e.target.matches(".increment-button-score, .decrement-button-score, .increment-button-foul, .decrement-button-foul")) scheduleSave();
  });
  document.addEventListener("sheet:changed", scheduleSave); // a team's roster finished loading
  // Warn before leaving with a change that hasn't reached the database.
  window.addEventListener("beforeunload", e => { if (dirty || saving) e.preventDefault(); });
  setupSave({ flush, onLocked });
}

// ---------- watchers ----------

async function watch(game) {
  let seen = game.updated_at;
  const describe = g => g.status === "final"
    ? `Final &middot; ${shortDate(g.game_date)}`
    : `<span class="dot live"></span> Watching live &middot; updated ${clock(g.updated_at)}`;
  setStatus(describe(game));
  setInterval(async () => {
    try {
      const g = await loadGame(game.id);
      if (!g) return setStatus("This game was removed.");
      if (g.updated_at !== seen) {
        seen = g.updated_at;
        await applySheet(g.sheet, { withPickers: false });
      }
      setStatus(describe(g));
    } catch (err) {
      console.error(err);
      setStatus(`<span class="dot off"></span> Can't reach the server. Retrying&hellip;`);
    }
  }, WATCH_MS);
}

// ---------- start ----------

async function main() {
  if (!isConfigured) return; // database not set up: the sheet works like paper
  try {
    access = await getMyAccess();
  } catch (err) {
    console.error(err);
    setReadOnly(true);
    return showBar(`Can't reach the server. Check the internet connection and reload.`);
  }
  if (access.isAdmin) document.querySelector(".pageNav")?.insertAdjacentHTML("beforeend", `<a href="admin.html">Admin</a>`);

  // The scoresheet is for signed-in users only: send everyone else to sign in,
  // then back here (to the same game, if the link had one).
  if (!access.user) {
    return location.replace("roster.html?next=" + encodeURIComponent("index.html" + location.search));
  }
  if (!access.isApproved) {
    setReadOnly(true);
    return showBar(`Your account is waiting for the admin to approve it.`);
  }

  const game = gameId ? await loadGame(gameId) : null;
  if (gameId && !game) {
    gameId = null;
    history.replaceState(null, "", "index.html");
  }

  if (access.canScore && (!game || game.status === "live")) {
    // Scorer or admin: edit, with live saving.
    initPickers(await getTeams());
    if (game) {
      await applySheet(game.sheet, { withPickers: true });
      setStatus(`<span class="dot live"></span> Keeping score &middot; live &middot; resumed`);
    } else {
      const date = document.querySelector("input.gameDate");
      if (!date.value) date.value = today();
      setStatus(`New game. Pick the <b>Home</b> and <b>Away</b> teams; it goes live for coaches and parents once both are picked.`);
    }
    startScoring();
  } else {
    // Coaches, parents, or anyone looking at a locked game: read-only.
    setReadOnly(true);
    if (game) {
      await applySheet(game.sheet, { withPickers: false });
      await watch(game);
    } else {
      setStatus(`Pick a live game to watch. Only the scorer can change the sheet.`);
    }
  }
  await refreshList();
  setInterval(refreshList, LIST_MS);
}

main().catch(err => {
  console.error(err);
  setReadOnly(true);
  showBar(`Something went wrong loading the game. Reload to try again.`);
});
