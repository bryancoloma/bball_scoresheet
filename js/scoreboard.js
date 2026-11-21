// The sticky scoreboard at the top of the scoresheet. It copies the team
// names, scores and team fouls from the two team strips, so the score stays
// in view while you scroll down to the other team.
const SIDES = { home: "Home", away: "Away" };

// The picked team, else "Home"/"Away".
function teamName(side) {
  const select = document.querySelector(`select.${side}Team`);
  return select?.value ? select.selectedOptions[0].textContent : SIDES[side];
}

export function syncScoreboard() {
  for (const [side, Side] of Object.entries(SIDES)) {
    document.getElementById(`sb${Side}Name`).textContent = teamName(side);
    document.getElementById(`sb${Side}Score`).textContent = document.getElementById(`${side}TotalScore`).value || "0";
    document.getElementById(`sb${Side}Fouls`).textContent = document.getElementById(`${side}TotalFouls`).value || "0";
  }
}

// +1/-1 taps (their inline onclick runs first), typing, picking a team,
// and a team's roster finishing loading all refresh it.
for (const type of ["click", "input", "change", "sheet:changed"]) {
  document.addEventListener(type, syncScoreboard);
}
syncScoreboard();
