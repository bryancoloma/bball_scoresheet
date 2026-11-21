// Admin page: games (live and saved, with Unlock), teams with their coaches'
// contact info and the player-card switch, and new-account approvals.
// The database refuses all of this for anyone who isn't an admin
// (supabase/live_games.sql); this page only decides what to show.
import { isConfigured, db, getMyAccess, getTeams } from "./data.js";
import { esc, shortDate, showMessage, signInPrompt } from "./render.js";

const app = document.getElementById("app");
const REFRESH_MS = 10000; // games section refreshes itself every 10 seconds
const state = { teams: [], staff: [], pending: [], live: [], saved: [] };

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// "Shepherd Eagles 42 – 38 Riverside Hawks"
const matchup = g => `${esc(g.home_name)} <b>${g.home_score}</b> &ndash; <b>${g.away_score}</b> ${esc(g.away_name)}`;
const clock = iso => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const when = iso => `${shortDate(iso.slice(0, 10))} ${clock(iso)}`;
// Phone link keeps only digits and "+", so odd characters can't change the link.
const phoneLink = p => p ? `<a href="tel:${esc(p.replace(/[^\d+]/g, ""))}">${esc(p)}</a>` : `<span class="muted">no phone</span>`;
const person = s => `
  <div class="contact">
    <b>${esc(s.full_name || "(no name)")}</b>
    <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>
    ${phoneLink(s.phone)}
  </div>`;

// ---------- data ----------

async function loadGames() {
  const cols = "id, status, game_date, home_name, away_name, home_score, away_score, updated_at, finished_at";
  [state.live, state.saved] = await Promise.all([
    db.from("scoresheets").select(cols).eq("status", "live").order("updated_at", { ascending: false }).then(unwrap),
    db.from("scoresheets").select(cols).eq("status", "final").order("finished_at", { ascending: false }).limit(20).then(unwrap),
  ]);
}

async function loadPeople() {
  [state.teams, state.staff, state.pending] = await Promise.all([
    getTeams(),
    db.rpc("admin_staff").then(unwrap),
    db.rpc("pending_accounts").then(unwrap),
  ]);
}

// ---------- views ----------

function gamesHtml() {
  const live = state.live.map(g => `<tr data-game="${esc(g.id)}">
      <td>${shortDate(g.game_date)}</td>
      <td>${matchup(g)}</td>
      <td class="muted">updated ${clock(g.updated_at)}</td>
      <td class="actions">
        <a class="button small" href="index.html?game=${encodeURIComponent(g.id)}">Watch</a>
        <button type="button" class="button small ghost" data-action="delete">Delete</button>
      </td></tr>`).join("");
  const saved = state.saved.map(g => `<tr data-game="${esc(g.id)}">
      <td>${shortDate(g.game_date)}</td>
      <td>${matchup(g)}</td>
      <td class="muted">saved ${when(g.finished_at)}</td>
      <td class="actions">
        <a class="button small ghost" href="index.html?game=${encodeURIComponent(g.id)}">View</a>
        <button type="button" class="button small" data-action="unlock">Unlock</button>
      </td></tr>`).join("");
  return `
    <section class="panel" id="games">
      <div class="team-head"><h2>Live games</h2><span class="muted">Updates every 10 seconds</span></div>
      <div class="table-scroll"><table class="data">
        <tbody>${live || `<tr><td class="muted">No games in progress.</td></tr>`}</tbody>
      </table></div>
      <h2>Saved games</h2>
      <p class="muted">Saved games are locked. <b>Unlock</b> reopens one so the scorer can fix it and save again;
        its stats come off the team pages until then.</p>
      <div class="table-scroll"><table class="data">
        <tbody>${saved || `<tr><td class="muted">No saved games yet.</td></tr>`}</tbody>
      </table></div>
    </section>`;
}

function teamsHtml() {
  const rows = state.teams.map(t => {
    const coaches = state.staff.filter(s => s.role === "coach" && s.team_id === t.id);
    return `<tr data-team="${esc(t.id)}">
      <td><b>${esc(t.name)}</b><br><span class="muted">${esc(t.season)}</span></td>
      <td>${coaches.map(person).join("") || `<span class="muted">No coach yet</span>`}</td>
      <td class="actions">
        <span class="muted">${t.cards_released ? "Released" : "Hidden"}</span>
        <button type="button" class="button small${t.cards_released ? " ghost" : ""}" data-action="cards"
          data-release="${t.cards_released ? "" : "1"}">${t.cards_released ? "Hide cards" : "Release cards"}</button>
      </td></tr>`;
  }).join("");
  return `
    <section class="panel">
      <h2>Teams and coaches</h2>
      <div class="table-scroll"><table class="data admin-teams">
        <thead><tr><th>Team</th><th>Coaches (name, email, phone)</th><th>Player cards</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" class="muted">No teams yet. Add one on the Rosters page.</td></tr>`}</tbody>
      </table></div>
      <p class="muted">Coaches see their team's stats. They see player cards only after you release them.</p>
    </section>`;
}

const teamName = id => state.teams.find(t => t.id === id)?.name ?? "team";

function accountsHtml() {
  const teamOptions = state.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  const pending = state.pending.map(a => `<tr data-account="${esc(a.user_id)}">
      <td>${person(a)}<span class="muted">signed up ${shortDate(a.created_at.slice(0, 10))}</span></td>
      <td><select name="role" aria-label="Role">
            <option value="coach">Coach</option><option value="scorer">Scorer</option><option value="parent">Parent</option>
          </select></td>
      <td><select name="team" aria-label="Team">${teamOptions}</select></td>
      <td class="actions"><button type="button" class="button small" data-action="approve">Approve</button></td>
    </tr>`).join("");
  const others = state.staff.filter(s => s.role === "scorer" || s.role === "parent");
  return `
    <section class="panel">
      <h2>Account requests</h2>
      ${pending ? `
        <p class="muted">Only approve people you know. Coaches and parents get one team; scorers don't need one.
          Parents only see their team's page.</p>
        <div class="table-scroll"><table class="data edit">
          <thead><tr><th>Person</th><th>Role</th><th>Team</th><th></th></tr></thead>
          <tbody>${pending}</tbody>
        </table></div>` : `<p class="muted">No one is waiting for approval.</p>`}
      <h2>Scorers and parents</h2>
      <div class="table-scroll"><table class="data">
        <tbody>${others.map(s => `<tr><td>${person(s)}</td><td>${esc(s.role)}${s.role === "parent" ? ` &middot; ${esc(teamName(s.team_id))}` : ""}</td></tr>`).join("") ||
          `<tr><td class="muted">None yet.</td></tr>`}</tbody>
      </table></div>
    </section>`;
}

function render() {
  app.innerHTML = `<h1>Admin</h1>${gamesHtml()}${teamsHtml()}${accountsHtml()}`;
}

// Only the games box redraws on the timer, so selects you're using below don't reset.
async function refreshGames() {
  try {
    await loadGames();
    document.getElementById("games")?.replaceWith(Object.assign(document.createElement("div"), { innerHTML: gamesHtml() }).firstElementChild);
  } catch (err) {
    console.error(err); // keep the last list; try again next time
  }
}

// ---------- actions ----------

app.addEventListener("change", e => {
  // Coaches and parents belong to a team; scorers don't.
  if (e.target.name === "role") e.target.closest("tr").querySelector('[name="team"]').disabled = e.target.value === "scorer";
});

app.addEventListener("click", async e => {
  const action = e.target.dataset.action;
  if (!action) return;
  const button = e.target;
  const row = button.closest("tr");
  button.disabled = true;
  try {
    if (action === "unlock") {
      const name = row.cells[1].textContent.trim();
      if (!confirm(`Unlock this game?\n\n${name}\n\nIts stats come off the team pages until the scorer saves it again.`)) return;
      unwrap(await db.rpc("unlock_game", { sheet_id: row.dataset.game }));
      await refreshGames();
    }
    if (action === "delete") {
      const name = row.cells[1].textContent.trim();
      if (!confirm(`Delete this live game? This can't be undone.\n\n${name}`)) return;
      const rows = unwrap(await db.from("scoresheets").delete().eq("id", row.dataset.game).select("id"));
      if (!rows.length) alert("That game was saved in the meantime, so it wasn't deleted.");
      await refreshGames();
    }
    if (action === "cards") {
      const release = Boolean(button.dataset.release);
      const team = row.cells[0].querySelector("b").textContent;
      if (!confirm(`${release ? "Release" : "Hide"} player cards for ${team}?`)) return;
      unwrap(await db.from("teams").update({ cards_released: release }).eq("id", row.dataset.team).select("id"));
      await loadPeople();
      render();
    }
    if (action === "approve") {
      const role = row.querySelector('[name="role"]').value;
      const team = row.querySelector('[name="team"]');
      const who = row.querySelector(".contact b").textContent;
      const needsTeam = role !== "scorer";
      if (needsTeam && !team.value) return alert("Add a team first (Rosters page), then approve.");
      const what = needsTeam ? `${role} for ${team.selectedOptions[0].textContent}` : role;
      if (!confirm(`Approve ${who} as ${what}?`)) return;
      unwrap(await db.rpc("approve_account", { account: row.dataset.account, new_role: role, team: needsTeam ? team.value : null }));
      await loadPeople();
      render();
    }
  } catch (err) {
    console.error(err);
    alert(err.code === "42501" ? "Your account can't do that." :
          err.code === "P0002" ? "That game isn't locked anymore. Refreshing the list." :
          "Something went wrong. Please try again.");
    await refreshGames();
  } finally {
    button.disabled = false;
  }
});

async function main() {
  if (!isConfigured) return showMessage(app, "Not connected yet", "Add the Supabase URL and publishable key to js/config.js.");
  const access = await getMyAccess();
  if (!access.user) return signInPrompt(app);
  if (!access.isAdmin) return showMessage(app, "Admins only", "This page is for league admins.");
  await Promise.all([loadGames(), loadPeople()]);
  render();
  setInterval(refreshGames, REFRESH_MS);
}

main().catch(err => {
  console.error(err);
  showMessage(app, "Couldn't load the admin page", "Please try again in a moment.");
});
