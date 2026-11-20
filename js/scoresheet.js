// Scoresheet team pickers.
// Pick a Home or Away team, and that side's first 8 player rows become
// drop-downs of the team's roster (picking a player fills in their number).
// The last 2 rows stay free-type for players not on the roster yet.
// With no team picked (or if the database can't be reached), every row stays
// free-type, exactly like the paper sheet.
import { isConfigured, db, getTeams, getScoresheetRoster } from "./data.js";
import { esc } from "./render.js";

const PICK_ROWS = 8; // rows 1-8 get drop-downs; rows 9-10 stay free-type

// Player rows for one side, skipping the header row.
function rowsFor(side) {
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
function lockPickedPlayers(side) {
  const selects = [...document.querySelectorAll(`.${side}PlayerInfo select.playerPick`)];
  const picked = new Set(selects.map(s => s.value).filter(Boolean));
  for (const select of selects) {
    for (const opt of select.options) {
      opt.disabled = Boolean(opt.value) && opt.value !== select.value && picked.has(opt.value);
    }
  }
}

// Switch a side between roster drop-downs (players given) and free-type (players null).
function showRoster(side, players) {
  rowsFor(side).slice(0, PICK_ROWS).forEach(row => {
    const input = row.querySelector(`input.${side}Notes`);
    const select = row.querySelector("select.playerPick");
    const num = row.querySelector(`.${side}Num`);

    // Clear numbers this picker filled in for the previous team.
    if (num.dataset.autofilled) { num.value = ""; delete num.dataset.autofilled; }

    if (!players) {
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

async function setupSide(side, teams) {
  const teamSelect = document.querySelector(`select.${side}Team`);
  const teamText = document.querySelector(`input.${side}Team`);
  teamSelect.insertAdjacentHTML("beforeend", teams.map(t =>
    `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join(""));

  teamSelect.addEventListener("change", async () => {
    const teamId = teamSelect.value;
    // The text box is only for teams that aren't in the list.
    teamText.hidden = Boolean(teamId);
    if (!teamId) return showRoster(side, null);
    try {
      // Names + numbers only, alphabetical by first name (sorted by the database).
      showRoster(side, await getScoresheetRoster(teamId));
    } catch (err) {
      console.error(err);
      alert("Couldn't load that roster. You can still type the names.");
      teamSelect.value = "";
      teamText.hidden = false;
      showRoster(side, null);
    }
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

async function main() {
  if (!isConfigured) return;
  // Rosters are for signed-in coaches and admins. Signed out, the sheet is all free-type.
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    const hint = document.createElement("p");
    hint.className = "signInHint";
    hint.textContent = "Sign in on the Rosters page to pick teams and players.";
    document.querySelector(".pageNav")?.after(hint);
    return;
  }
  let teams;
  try {
    teams = await getTeams();
  } catch (err) {
    // Offline or database down: the sheet still works as free-type.
    console.error(err);
    return;
  }
  for (const side of ["home", "away"]) {
    addPlayerSelects(side);
    await setupSide(side, teams);
  }
}

main();
