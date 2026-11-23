// "Save game" on the scoresheet (scorers and admins).
// The sheet is already saving itself live (js/live.js). Save game shows a
// summary to confirm, then calls public.finish_game (supabase/live_games.sql),
// which writes each player's points, fouls and playtime for both teams and
// LOCKS the game. Only an admin can unlock it.
import { db } from "./data.js";
import { esc } from "./render.js";
import { readSheet, readSide, shortBoxes, PLAYERS_PER_BOX } from "./sheetstate.js";

const dialog = document.getElementById("saveDialog");
const body = dialog.querySelector(".saveBody");
const confirmBtn = dialog.querySelector("#saveConfirm");
const cancelBtn = dialog.querySelector("#saveCancel");
const saveBtn = document.getElementById("saveGameBtn");

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
// "18:30" -> "6:30 PM"
function clockTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

// live: { flush(): Promise<gameId>, onLocked() } from js/live.js
export function setupSave(live) {
  let pending = null; // what finish_game gets if they confirm

  function prepare() {
    const sheet = readSheet();
    if (!sheet.date) return show("<p>Enter the game <b>date</b> at the top of the sheet before saving.</p>", false);

    const home = readSide(sheet, "home"), away = readSide(sheet, "away");
    // Only registered teams play, so both sides are always saved.
    if (!home.teamId || !away.teamId) return show("<p>Pick the <b>Home</b> and <b>Away</b> teams before saving.</p>", false);
    // Every playtime box that was used needs exactly 5 players.
    const short = shortBoxes(sheet);
    if (short.length) {
      return show(`<p><b>Each playtime box needs ${PLAYERS_PER_BOX} players.</b> Fix these before saving:</p>
        <ul class="saveNotes">${short.map(s => `<li>${esc(s.team)}: box ${s.box} has ${s.count} of ${PLAYERS_PER_BOX}</li>`).join("")}</ul>`, false);
    }
    const saveable = [home, away];
    pending = {
      sides: saveable.map(s => {
        const other = s === home ? away : home;
        return {
          team_id: s.teamId, opponent: other.teamName.slice(0, 60), team_score: s.score, opp_score: other.score,
          players: s.players.map(({ player_id, points, fouls, periods }) => ({ player_id, points, fouls, periods })),
          guests: s.guests.map(({ name, jersey, points, fouls, periods }) => ({ name, jersey, points, fouls, periods })),
        };
      }),
    };

    const when = new Date(sheet.date + "T00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const sideHtml = saveable.map(s => `
      <h3>${esc(s.teamName)}</h3>
      <ul>${s.players.map(p => `<li>${statLine(p)}</li>`).join("")}
          ${s.guests.map(p => `<li>${statLine(p)} <span class="muted">(not on roster)</span></li>`).join("")}</ul>
      ${!s.players.length && !s.guests.length ? `<p class="muted">No players listed.</p>` : ""}`).join("");

    const notes = [];
    for (const s of [home, away]) {
      if (s.unnamed.length) notes.push(`${esc(s.teamName)} row${s.unnamed.length > 1 ? "s" : ""} ${s.unnamed.join(", ")} ha${s.unnamed.length > 1 ? "ve" : "s"} stats but no player name and won't be saved.`);
    }

    show(`
      <p class="saveScore">${esc(home.teamName)} <b>${home.score}</b> &ndash; <b>${away.score}</b> ${esc(away.teamName)}</p>
      <p class="muted">${esc(when)}${sheet.time ? ` at ${esc(clockTime(sheet.time))}` : ""}</p>
      ${notes.length ? `<ul class="saveNotes">${notes.map(n => `<li>${n}</li>`).join("")}</ul>` : ""}
      ${sideHtml}
      <p><b>Do you really want to save this game?</b> It will be <b>locked</b>: no more changes unless an admin unlocks it.</p>`, true);
  }

  async function save() {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    confirmBtn.textContent = "Saving…";
    try {
      // Make sure the latest boxes are stored before locking.
      const gameId = await live.flush();
      const { error } = await db.rpc("finish_game", { sheet_id: gameId, game: pending });
      if (error) throw error;
      live.onLocked();
      show(`<p><b>Game saved and locked.</b> Player stats are on the team pages now.</p>
        <p class="muted">If something needs fixing, ask an admin to unlock it.</p>`, false);
    } catch (err) {
      console.error(err);
      const msg = err.code === "23514" ? "Some numbers are out of range (fouls 0–5, periods 0–8)." :
                  err.code === "42501" ? "Your account can't save this game." :
                  err.code === "55000" ? "This game was already saved and locked." :
                  "Couldn't save. Check your internet connection and try again. Nothing was locked.";
      show(`<p>${esc(msg)}</p>`, false);
    } finally {
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
      confirmBtn.textContent = "Yes, save game";
    }
  }

  saveBtn.addEventListener("click", prepare);
  confirmBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", () => dialog.close());
}
