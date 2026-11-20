// "Save game" on the scoresheet.
// Reads the sheet, shows a summary to confirm, then saves everything in one
// call (public.save_game in supabase/save_game.sql). A coach saves their own
// team's side; an admin can save both sides. Teams typed in by hand ("Other
// team") are recorded only as the opponent's name and score.
import { isConfigured, db, getMyAccess } from "./data.js";
import { esc } from "./render.js";

const dialog = document.getElementById("saveDialog");
const body = dialog.querySelector(".saveBody");
const confirmBtn = dialog.querySelector("#saveConfirm");
const cancelBtn = dialog.querySelector("#saveCancel");
const saveBtn = document.getElementById("saveGameBtn");
let pending = null;      // what will be sent if they confirm
let alreadySaved = false; // warn before saving the same sheet twice

const num = text => parseInt(text, 10) || 0;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// "Riverside Hawks" -> "Riverside Hawks'", "Eagle" -> "Eagle's"
const possessive = name => name.endsWith("s") ? `${name}'` : `${name}'s`;
// "18:30" -> "6:30 PM"
function clockTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Everything on one side of the sheet (side = "home" or "away").
function readSide(side) {
  const teamSelect = document.querySelector(`select.${side}Team`);
  const typedName = document.querySelector(`input.${side}Team`).value.trim();
  const teamId = teamSelect?.value || null;
  const teamName = teamId ? teamSelect.selectedOptions[0].textContent : (typedName || (side === "home" ? "Home" : "Away"));

  const players = [], guests = [], unnamed = [];
  let score = 0;
  [...document.querySelectorAll(`.${side}PlayerInfo tr`)].slice(1).forEach((row, i) => {
    const points = num(row.querySelector('h3[id*="TotalPoints"]').textContent);
    const fouls = num(row.querySelector('h3[id*="TotalFouls"]').textContent);
    const periods = row.querySelectorAll(`.${side}PlaytimeCheckbox:checked`).length;
    const jersey = row.querySelector(`.${side}Num`).value.trim();
    score += points;

    const pick = row.querySelector("select.playerPick");
    if (pick && !pick.hidden && pick.value) {
      players.push({ player_id: pick.value, name: pick.selectedOptions[0].textContent, jersey, points, fouls, periods });
      return;
    }
    const typed = row.querySelector(`input.${side}Notes`).value.trim().slice(0, 60);
    if (typed) guests.push({ name: typed, jersey, points, fouls, periods });
    else if (points || fouls || periods) unnamed.push(i + 1); // stats but no name: can't save this row
  });
  return { side, teamId, teamName, score, players, guests, unnamed };
}

function statLine(p) {
  return `${p.jersey ? `#${esc(p.jersey)} ` : ""}${esc(p.name)} &middot; ${plural(p.points, "pt")}, ${plural(p.fouls, "foul")}, ${p.periods}/8 periods`;
}

function show(html, canSave) {
  body.innerHTML = html;
  confirmBtn.hidden = !canSave;
  cancelBtn.textContent = canSave ? "Cancel" : "Close";
  if (!dialog.open) dialog.showModal();
}

async function prepare() {
  if (!isConfigured) return show("<p>The database isn't connected yet.</p>", false);
  const access = await getMyAccess();
  if (!access.user) return show(`<p>Sign in first to save games.</p><p><a href="roster.html?next=index.html">Go to sign in</a> (this sheet will be cleared, so print it first if needed).</p>`, false);

  const date = document.querySelector("input.gameDate").value;
  if (!date) return show("<p>Enter the game <b>date</b> at the top of the sheet before saving.</p>", false);
  const time = document.querySelector("input.gameTime").value;

  const home = readSide("home"), away = readSide("away");
  const allowed = new Set(access.teams.map(t => t.id));
  const saveable = [home, away].filter(s => s.teamId && allowed.has(s.teamId));
  if (!saveable.length) {
    return show(`<p>Pick <b>your team</b> as Home or Away before saving.</p>
      <p class="muted">Games are saved for teams in the system that you coach${access.isAdmin ? " (admins: any team)" : ""}.</p>`, false);
  }

  // Build the request and the summary together, from the same data.
  const sides = saveable.map(s => {
    const other = s === home ? away : home;
    return {
      team_id: s.teamId, opponent: other.teamName.slice(0, 60), team_score: s.score, opp_score: other.score,
      players: s.players.map(({ player_id, points, fouls, periods }) => ({ player_id, points, fouls, periods })),
      guests: s.guests.map(({ name, jersey, points, fouls, periods }) => ({ name, jersey, points, fouls, periods })),
    };
  });
  pending = { game_date: date, game_time: time, sides };

  const when = new Date(date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const sideHtml = saveable.map(s => `
    <h3>${esc(s.teamName)}</h3>
    <ul>${s.players.map(p => `<li>${statLine(p)}</li>`).join("")}
        ${s.guests.map(p => `<li>${statLine(p)} <span class="muted">(not on roster)</span></li>`).join("")}</ul>
    ${!s.players.length && !s.guests.length ? `<p class="muted">No players listed.</p>` : ""}`).join("");

  const notes = [];
  for (const s of [home, away]) {
    if (!saveable.includes(s)) notes.push(`${esc(possessive(s.teamName))} player stats won't be saved${s.teamId ? " (not your team)" : " (not in the system)"}; only their score is kept.`);
    if (s.unnamed.length) notes.push(`${esc(s.teamName)} row${s.unnamed.length > 1 ? "s" : ""} ${s.unnamed.join(", ")} ha${s.unnamed.length > 1 ? "ve" : "s"} stats but no player name and won't be saved.`);
  }
  if (alreadySaved) notes.unshift("<b>This game was already saved.</b> Saving again creates a second copy.");

  show(`
    <p class="saveScore">${esc(home.teamName)} <b>${home.score}</b> &ndash; <b>${away.score}</b> ${esc(away.teamName)}</p>
    <p class="muted">${esc(when)}${time ? ` at ${esc(clockTime(time))}` : ""}</p>
    ${notes.length ? `<ul class="saveNotes">${notes.map(n => `<li>${n}</li>`).join("")}</ul>` : ""}
    ${sideHtml}
    <p><b>Do you really want to save this game?</b> Saved games can't be changed from the scoresheet.</p>`, true);
}

async function save() {
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  confirmBtn.textContent = "Saving…";
  try {
    const { error } = await db.rpc("save_game", { game: pending });
    if (error) throw error;
    alreadySaved = true;
    saveBtn.textContent = "Game saved ✓";
    show(`<p><b>Game saved.</b> Player stats are on the team page now.</p>
      <p><a href="team.html">Open team page</a></p>`, false);
  } catch (err) {
    console.error(err);
    const msg = err.code === "23514" ? "Some numbers are out of range (fouls 0–5, periods 0–8)." :
                err.code === "42501" ? "Your account can't save games for that team." :
                "Couldn't save. Check your internet connection and try again. Nothing was saved.";
    show(`<p>${esc(msg)}</p>`, false);
  } finally {
    confirmBtn.disabled = false;
    cancelBtn.disabled = false;
    confirmBtn.textContent = "Yes, save game";
  }
}

saveBtn.addEventListener("click", () => prepare().catch(err => {
  console.error(err);
  show("<p>Couldn't check your account. Try again in a moment.</p>", false);
}));
confirmBtn.addEventListener("click", save);
cancelBtn.addEventListener("click", () => dialog.close());
