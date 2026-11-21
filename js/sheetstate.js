// Read the whole scoresheet into plain data, and put it back.
// The snapshot is what's stored in public.scoresheets.sheet: viewers redraw
// the sheet from it, and a scorer can resume a game from it.
import { rowsFor, setTeam, lockPickedPlayers } from "./scoresheet.js";
import { syncScoreboard } from "./scoreboard.js";

const SIDES = ["home", "away"];
const num = text => parseInt(text, 10) || 0;
const cap = (side) => side[0].toUpperCase() + side.slice(1); // "home" -> "Home"

// The team's display name: the picked team, else "Home"/"Away".
function teamLabel(side) {
  const select = document.querySelector(`select.${side}Team`);
  return select?.value ? select.selectedOptions[0].textContent : cap(side);
}

function readRow(side, row) {
  const pick = row.querySelector("select.playerPick");
  const picked = pick && !pick.hidden && pick.value;
  return {
    pick: picked ? pick.value : null,
    pickName: picked ? pick.selectedOptions[0].textContent : null,
    name: picked ? "" : row.querySelector(`input.${side}Notes`).value.trim().slice(0, 60),
    num: row.querySelector(`.${side}Num`).value.trim(),
    periods: [...row.querySelectorAll(`.${side}PlaytimeCheckbox`)].map(c => c.checked),
    points: num(row.querySelector('h3[id*="TotalPoints"]').textContent),
    fouls: num(row.querySelector('h3[id*="TotalFouls"]').textContent),
  };
}

export function readSheet() {
  const sheet = {
    v: 1,
    date: document.querySelector("input.gameDate").value,
    time: document.querySelector("input.gameTime").value,
  };
  for (const side of SIDES) {
    const rows = rowsFor(side).map(row => readRow(side, row));
    sheet[side] = {
      teamId: document.querySelector(`select.${side}Team`)?.value || null,
      label: teamLabel(side),
      timeouts: [...document.querySelectorAll(`.${side}TimeOut input[type="checkbox"]`)].map(c => c.checked),
      teamFouls: document.getElementById(`${side}TotalFouls`).value,
      score: rows.reduce((sum, r) => sum + r.points, 0),
      rows,
    };
  }
  return sheet;
}

// Put a snapshot back on the page.
// withPickers: true for a scorer resuming a game (team and player drop-downs
// are set and the roster is loaded); false for viewers, who just see names.
export async function applySheet(sheet, { withPickers }) {
  document.querySelector("input.gameDate").value = sheet.date ?? "";
  document.querySelector("input.gameTime").value = sheet.time ?? "";

  for (const side of SIDES) {
    const s = sheet[side];
    if (!s) continue;
    const teamSelect = document.querySelector(`select.${side}Team`);
    if (withPickers) {
      await setTeam(side, s.teamId);
    } else {
      // Viewers: the (locked) team box just shows the team's name.
      teamSelect.replaceChildren(new Option(s.label ?? cap(side), s.teamId ?? "", true, true));
    }

    document.querySelectorAll(`.${side}TimeOut input[type="checkbox"]`)
      .forEach((c, i) => { c.checked = Boolean(s.timeouts?.[i]); });

    rowsFor(side).forEach((row, i) => {
      const r = s.rows?.[i] ?? {};
      const pick = row.querySelector("select.playerPick");
      const input = row.querySelector(`input.${side}Notes`);
      if (withPickers && pick && !pick.hidden) {
        pick.value = r.pick ?? "";
        input.value = "";
      } else {
        input.value = r.pickName || r.name || "";
      }
      const numBox = row.querySelector(`.${side}Num`);
      numBox.value = r.num ?? "";
      if (r.pick) numBox.dataset.autofilled = "1"; else delete numBox.dataset.autofilled;
      row.querySelectorAll(`.${side}PlaytimeCheckbox`).forEach((c, j) => { c.checked = Boolean(r.periods?.[j]); });

      const pts = row.querySelector('h3[id*="TotalPoints"]');
      const fls = row.querySelector('h3[id*="TotalFouls"]');
      pts.textContent = r.points ?? 0;
      fls.textContent = r.fouls ?? 0;
      // Helpers from score_foul.js keep the red 5-foul mark and -1 buttons right.
      toggleFoulMaxClass(fls, r.fouls ?? 0);
      updateScoreDecrementButton(pts.id);
      updateFoulDecrementButton(fls.id);
    });
    if (withPickers && teamSelect.value) lockPickedPlayers(side);
  }

  // Recalculate the score and team foul boxes from the player rows.
  addTotalHomePoints(); addTotalAwayPoints(); addTotalHomeFouls(); addTotalAwayFouls();
  syncScoreboard();
}

// Everything finish_game() needs for one side: roster players (by id),
// typed-in players (guests), and rows with stats but no name (can't be saved).
export function readSide(sheet, side) {
  const s = sheet[side];
  const players = [], guests = [], unnamed = [];
  s.rows.forEach((r, i) => {
    const stats = { points: r.points, fouls: r.fouls, periods: r.periods.filter(Boolean).length };
    if (r.pick) players.push({ player_id: r.pick, name: r.pickName, jersey: r.num, ...stats });
    else if (r.name) guests.push({ name: r.name, jersey: r.num, ...stats });
    else if (stats.points || stats.fouls || stats.periods) unnamed.push(i + 1);
  });
  return { side, teamId: s.teamId, teamName: s.label, score: s.score, players, guests, unnamed };
}
