// Scoresheet team pickers.
// Pick a Home or Away team, and that side's first 8 player rows become
// drop-downs of the team's roster (picking a player fills in their number).
// The last 2 rows (and any rows past the roster size) stay free-type for
// players not on the roster yet.
// Only registered teams can play, and Home and Away must be different teams.
// Only scorers and admins get pickers; js/live.js calls initPickers() for them.
import { getScoresheetRoster } from "./data.js";
import { esc } from "./render.js";

const PICK_ROWS = 8; // at most rows 1-8 get drop-downs; rows 9-10 stay free-type

// Player rows for one side, skipping the header row.
export function rowsFor(side) {
  return [...document.querySelectorAll(`.${side}PlayerInfo tr`)].slice(1);
}

// Give each of the first 8 rows a (hidden) drop-down next to its name box.
function addPlayerSelects(side) {
  rowsFor(side).slice(0, PICK_ROWS).forEach((row, i) => {
    const input = row.querySelector(`.${side}Notes`);
    const select = document.createElement("select");
    select.className = `${side}Notes playerPick`;
    select.hidden = true;
    select.setAttribute("aria-label", `${side} player ${i + 1}`);
    input.after(select);
  });
}

// Grey out players already picked in another row on the same side.
export function lockPickedPlayers(side) {
  const selects = [...document.querySelectorAll(`.${side}PlayerInfo select.playerPick`)];
  const picked = new Set(selects.map(s => s.value).filter(Boolean));
  for (const select of selects) {
    for (const opt of select.options) {
      opt.disabled = Boolean(opt.value) && opt.value !== select.value && picked.has(opt.value);
    }
  }
}

// Switch a side between roster drop-downs (players given) and free-type (players null).
// A team gets one drop-down row per roster player (up to 8), so a team with
// few or no players entered yet still has free-type rows to write in.
function showRoster(side, players) {
  const pickRows = players ? Math.min(PICK_ROWS, players.length) : 0;
  rowsFor(side).slice(0, PICK_ROWS).forEach((row, i) => {
    const input = row.querySelector(`input.${side}Notes`);
    const select = row.querySelector("select.playerPick");
    const num = row.querySelector(`.${side}Num`);

    // Clear numbers this picker filled in for the previous team.
    if (num.dataset.autofilled) { num.value = ""; delete num.dataset.autofilled; }

    if (i >= pickRows) {
      select.innerHTML = ""; // no leftover pick from the previous team
      select.hidden = true;
      input.hidden = false;
      return;
    }
    select.innerHTML = `<option value="">Pick player&hellip;</option>` + players.map(p =>
      `<option value="${esc(p.id)}" data-jersey="${esc(p.jersey)}">${esc(p.first_name)} ${esc(p.last_name)}</option>`).join("");
    input.value = "";
    input.hidden = true;
    select.hidden = false;
  });
  lockPickedPlayers(side);
}

function setupSide(side, teams) {
  const teamSelect = document.querySelector(`select.${side}Team`);
  teamSelect.insertAdjacentHTML("beforeend", teams.map(t =>
    `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join(""));

  // When the roster has loaded, tell js/live.js so it saves the new rows.
  teamSelect.addEventListener("change", async () => {
    await loadTeam(side);
    document.dispatchEvent(new CustomEvent("sheet:changed"));
  });

  // Picking a player fills in their number.
  document.querySelector(`.${side}PlayerInfo`).addEventListener("change", e => {
    if (!e.target.matches("select.playerPick")) return;
    const num = e.target.closest("tr").querySelector(`.${side}Num`);
    const jersey = e.target.selectedOptions[0]?.dataset.jersey ?? "";
    num.value = jersey;
    if (jersey) num.dataset.autofilled = "1"; else delete num.dataset.autofilled;
    lockPickedPlayers(side);
  });
  // Typing a number by hand means it's no longer auto-filled.
  document.querySelector(`.${side}PlayerInfo`).addEventListener("input", e => {
    if (e.target.matches(`.${side}Num`)) delete e.target.dataset.autofilled;
  });
}

// A team picked on one side can't be picked on the other.
function lockTeams() {
  const home = document.querySelector("select.homeTeam");
  const away = document.querySelector("select.awayTeam");
  for (const [select, other] of [[home, away], [away, home]]) {
    for (const opt of select.options) {
      if (opt.value) opt.disabled = opt.value === other.value;
    }
  }
}

// Show the picked team's roster on one side.
async function loadTeam(side) {
  const teamSelect = document.querySelector(`select.${side}Team`);
  const teamId = teamSelect.value;
  lockTeams();
  if (!teamId) return showRoster(side, null);
  try {
    // Names + numbers only, alphabetical by first name (sorted by the database).
    showRoster(side, await getScoresheetRoster(teamId));
  } catch (err) {
    console.error(err);
    alert("Couldn't load that roster. Check the connection and pick the team again.");
    teamSelect.value = "";
    lockTeams();
    showRoster(side, null);
  }
}

// Pick a team in code (used when resuming a saved live game). Waits for the roster.
export async function setTeam(side, teamId) {
  const teamSelect = document.querySelector(`select.${side}Team`);
  teamSelect.value = teamId ?? "";
  if (teamSelect.value !== (teamId ?? "")) teamSelect.value = ""; // team no longer exists
  await loadTeam(side);
}

// Fill the team drop-downs and add the player drop-downs (scorers and admins).
export function initPickers(teams) {
  for (const side of ["home", "away"]) {
    addPlayerSelects(side);
    setupSide(side, teams);
  }
}
