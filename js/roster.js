// Roster page: coaches and admins sign in, then add or edit players.
// The database enforces who can edit what (supabase/roster_access.sql); this
// page only hides buttons the user can't use.
import { db, isConfigured, getTeams, getActivePlayers } from "./data.js";
import { esc, showMessage, safePhoto } from "./render.js";
import { uploadPlayerPhoto, removePlayerPhoto } from "./photos.js";

const app = document.getElementById("app");
const topNav = document.getElementById("topNav"); // "← Scoresheet", signed-in only
const MIN_PASSWORD = 8;
// A password-reset email link lands here with "type=recovery" in the URL.
// Read it now, before the Supabase client tidies the URL.
const arrivedFromResetLink = location.hash.includes("type=recovery");
const state = {
  user: null, isAdmin: false, roles: [], teams: [], teamId: null, players: [],
  // signed-out screens: "signin" | "signup" | "forgot" | "newpassword"
  mode: arrivedFromResetLink ? "newpassword" : "signin",
};

// ---------- helpers ----------

// Turn a Supabase error into something a coach can act on.
function friendlyError(err) {
  if (!err) return "";
  if (err.code === "23505") return "That jersey number is already used by another player on this team.";
  if (err.code === "23514") return "Check the entries: names up to 40 characters, and a number from 0 to 99.";
  if (err.code === "42501") return "Your account can't do that.";
  if (err.code === "invalid_credentials" || err.message === "Invalid login credentials") return "Email or password is incorrect.";
  if (err.code === "user_already_exists") return "That email already has an account. Sign in, or use \"Forgot password\".";
  if (err.code === "weak_password") return `Use a stronger password (at least ${MIN_PASSWORD} characters).`;
  if (err.code === "same_password") return "That's your current password. Pick a new one.";
  if (err.code === "email_address_not_authorized") return "Reset emails can't reach this address yet. Ask the admin to reset your password.";
  if (err.code === "over_email_send_rate_limit" || err.status === 429) return "Too many tries. Wait a few minutes and try again.";
  return "Something went wrong. Please try again.";
}

// After signing in, go back to the page that sent you here (?next=team.html?team=...).
// Only our own pages are allowed, so the link can't send people to another site.
function nextPage() {
  const next = new URLSearchParams(location.search).get("next") ?? "";
  return /^(index|team|player|card|admin|tv)\.html(\?[\w=&%.-]*)?$/.test(next) ? next : null;
}

// The two password boxes must match and be long enough. Returns an error message or "".
function checkNewPassword(form) {
  if (form.password.value.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (form.password.value !== form.confirm.value) return "The two passwords don't match.";
  return "";
}

function setStatus(text, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "status error" : "status ok";
}

// Read and tidy one player's form fields. Returns null if a required field is empty.
function readPlayer(row) {
  const val = name => row.querySelector(`[name="${name}"]`).value.trim();
  const jersey = val("jersey");
  const player = {
    first_name: val("first_name"),
    last_name: val("last_name"),
    jersey: jersey === "" ? null : Number(jersey),
    position: val("position") || null,
    grade: val("grade") || null,
  };
  if (!player.first_name || !player.last_name) return null;
  return player;
}

// ---------- data ----------

async function loadAccess() {
  // Staff rows tell us if this user is an admin, or which teams they coach.
  const { data: staff, error } = await db.from("staff").select("role, team_id");
  if (error) throw error;
  state.roles = [...new Set(staff.map(s => s.role))];
  state.isAdmin = state.roles.includes("admin");
  const allTeams = await getTeams();
  const coachTeamIds = new Set(staff.filter(s => s.role === "coach").map(s => s.team_id));
  state.teams = state.isAdmin ? allTeams : allTeams.filter(t => coachTeamIds.has(t.id));

  // Keep the current team if still allowed; else use ?team= or the first team.
  const wanted = new URLSearchParams(location.search).get("team");
  const fromUrl = state.teams.find(t => t.slug === wanted);
  if (!state.teams.some(t => t.id === state.teamId)) {
    state.teamId = (fromUrl ?? state.teams[0])?.id ?? null;
  }
}

async function loadPlayers() {
  state.players = state.teamId ? await getActivePlayers(state.teamId) : [];
}

// ---------- views ----------

// Sign in, create account, forgot password, and set a new password share one card.
function authView() {
  const emailBox = `<label>Email <input name="email" type="email" autocomplete="username" maxlength="254" required></label>`;
  const newPasswordBoxes = `
    <label>Password (at least ${MIN_PASSWORD} characters)
      <input name="password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>
    <label>Confirm password <input name="confirm" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required></label>`;
  const link = (mode, text) => `<button type="button" class="linklike" data-mode="${mode}">${text}</button>`;

  const screens = {
    signin: {
      title: "Sign in",
      intro: "For admins, coaches, scorers and parents.",
      fields: `${emailBox}<label>Password <input name="password" type="password" autocomplete="current-password" required></label>`,
      submit: "Sign in",
      links: `${link("forgot", "Forgot password?")} ${link("signup", "Create an account")}`,
    },
    signup: {
      title: "Create an account",
      intro: "After you sign up, the admin approves your account (as a coach, scorer or parent). Until then you can't see games or rosters.",
      fields: `
        <label>Full name <input name="full_name" autocomplete="name" maxlength="80" required></label>
        <label>Phone <input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required></label>
        ${emailBox}${newPasswordBoxes}`,
      submit: "Create account",
      links: link("signin", "Already have an account? Sign in"),
    },
    forgot: {
      title: "Reset your password",
      intro: "Enter your email and we'll send you a link to set a new password.",
      fields: emailBox,
      submit: "Send reset link",
      links: link("signin", "Back to sign in"),
    },
    newpassword: {
      title: "Set a new password",
      intro: "Choose a new password for your account.",
      fields: newPasswordBoxes,
      submit: "Save new password",
      links: "",
    },
  };
  const s = screens[state.mode];
  topNav.hidden = true;
  app.innerHTML = `
    <section class="panel narrow">
      <h1>${s.title}</h1>
      <p class="muted">${s.intro}</p>
      <form id="auth-${state.mode}" class="stack">
        ${s.fields}
        <button type="submit" class="button">${s.submit}</button>
        <p id="status" class="status" role="status"></p>
      </form>
      <p class="auth-links">${s.links}</p>
    </section>`;
}

function playerRow(p) {
  return `<tr data-id="${esc(p.id)}">
    <td><input name="jersey" value="${esc(p.jersey)}" inputmode="numeric" maxlength="2" size="3" aria-label="Number"></td>
    <td><input name="first_name" value="${esc(p.first_name)}" maxlength="40" aria-label="First name"></td>
    <td><input name="last_name" value="${esc(p.last_name)}" maxlength="40" aria-label="Last name"></td>
    <td><input name="position" value="${esc(p.position)}" maxlength="20" size="8" aria-label="Position"></td>
    <td><input name="grade" value="${esc(p.grade)}" maxlength="20" size="5" aria-label="Grade"></td>
    <td class="actions">
      <button type="button" class="button small" data-action="save">Save</button>
      <button type="button" class="button small ghost" data-action="remove">Remove</button>
    </td>
  </tr>`;
}

// Player photos: pick a player, pick a photo, upload. Shows the current photo.
function photoPanel() {
  if (!state.players.length) return "";
  const options = state.players.map(p =>
    `<option value="${esc(p.id)}">${p.jersey != null ? `#${esc(p.jersey)} ` : ""}${esc(p.first_name)} ${esc(p.last_name)}${p.photo_path ? " ✓" : ""}</option>`).join("");
  return `
    <section class="panel" id="photos">
      <h2>Player photos</h2>
      <p class="muted">Photos show on the team page, player page and player card. Only signed-in people with
        access to this team can see them. A check (✓) means the player already has a photo.</p>
      <div class="photo-upload">
        <div class="photo-preview" id="photoPreview"></div>
        <div class="stack">
          <label>Player <select id="photoPlayer">${options}</select></label>
          <label>Photo <input type="file" id="photoFile" accept="image/*"></label>
          <div class="actions">
            <button type="button" class="button" data-action="upload-photo">Upload photo</button>
            <button type="button" class="button ghost" data-action="remove-photo">Remove photo</button>
          </div>
          <p id="photoStatus" class="status" role="status"></p>
        </div>
      </div>
    </section>`;
}

// Show the chosen file if one is picked, else the player's current photo.
function showPhotoPreview() {
  const box = document.getElementById("photoPreview");
  if (!box) return;
  const file = document.getElementById("photoFile").files[0];
  if (box.dataset.objectUrl) { URL.revokeObjectURL(box.dataset.objectUrl); delete box.dataset.objectUrl; }
  if (file && file.type.startsWith("image/")) {
    box.dataset.objectUrl = URL.createObjectURL(file);
    box.innerHTML = `<img src="${box.dataset.objectUrl}" alt="New photo preview">`;
    return;
  }
  const player = state.players.find(p => p.id === document.getElementById("photoPlayer").value);
  const src = player && safePhoto(player.photo_url);
  box.innerHTML = src ? `<img src="${esc(src)}" alt="Current photo">` : `<span class="muted">No photo yet</span>`;
}

function setPhotoStatus(text, isError = false) {
  const el = document.getElementById("photoStatus");
  el.textContent = text;
  el.className = isError ? "status error" : "status ok";
}

function rosterView() {
  const team = state.teams.find(t => t.id === state.teamId);
  const teamOptions = state.teams.map(t =>
    `<option value="${esc(t.id)}"${t.id === state.teamId ? " selected" : ""}>${esc(t.name)} (${esc(t.season)})</option>`).join("");

  const adminTools = state.isAdmin ? `
    <details class="panel">
      <summary><b>Add a team</b> (admin)</summary>
      <form id="add-team" class="row-form">
        <label>Team name <input name="name" maxlength="60" required></label>
        <label>Season <input name="season" maxlength="20" size="6" value="${new Date().getFullYear()}" required></label>
        <button type="submit" class="button">Add team</button>
      </form>
    </details>` : "";

  // Scorers and parents don't manage a roster; tell them where to go instead.
  const noTeams = state.teams.length ? "" : `<section class="panel"><p class="muted">${
    state.roles.includes("scorer") ? `Your account is a <b>scorer</b>. Open the <a href="index.html">scoresheet</a> to keep score.` :
    state.roles.includes("parent") ? `Open your <a href="team.html">team page</a>.` :
    "Your account is waiting for the admin to approve it. Check back after they do."}</p></section>`;

  // Approvals, coaches and games live on the admin page now.
  const adminLink = state.isAdmin ? `
    <section class="panel"><p><a class="button-link" href="admin.html">Open the admin page &rarr;</a>
      Approve new accounts, see coaches' contact info, unlock games and release player cards.</p></section>` : "";

  const roster = team ? `
    <section class="panel">
      <div class="team-head">
        <h2>${esc(team.name)} roster</h2>
        <a href="team.html?team=${encodeURIComponent(team.slug)}">View team page &rarr;</a>
      </div>
      <p id="status" class="status" role="status"></p>
      <div class="table-scroll">
        <table class="data edit">
          <thead><tr><th>#</th><th>First name</th><th>Last name</th><th>Position</th><th>Grade</th><th></th></tr></thead>
          <tbody id="players">${state.players.map(playerRow).join("") ||
            `<tr><td colspan="6" class="muted">No players yet. Add the first one below.</td></tr>`}</tbody>
          <tfoot>
            <tr id="new-player">
              <td><input name="jersey" inputmode="numeric" maxlength="2" size="3" aria-label="New player number" placeholder="#"></td>
              <td><input name="first_name" maxlength="40" aria-label="New player first name" placeholder="First"></td>
              <td><input name="last_name" maxlength="40" aria-label="New player last name" placeholder="Last"></td>
              <td><input name="position" maxlength="20" size="8" aria-label="New player position" placeholder="Guard"></td>
              <td><input name="grade" maxlength="20" size="5" aria-label="New player grade" placeholder="8th"></td>
              <td class="actions"><button type="button" class="button small" data-action="add">Add player</button></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
    ${photoPanel()}` : "";

  topNav.hidden = false;
  app.innerHTML = `
    <div class="team-head">
      <div>
        <p class="eyebrow">Signed in as ${esc(state.user.email)}${state.roles.length ? ` &middot; ${esc(state.roles.join(", "))}` : ""}</p>
        <h1>Team rosters</h1>
      </div>
      <button type="button" class="button ghost" id="signout">Sign out</button>
    </div>
    ${state.teams.length ? `<label class="team-pick">Team <select id="team">${teamOptions}</select></label>` : ""}
    ${noTeams}${roster}${adminLink}${adminTools}`;
  showPhotoPreview();
}

async function refresh() {
  try {
    const { data: { session } } = await db.auth.getSession();
    state.user = session?.user ?? null;
    // While setting a new password, stay on that screen even though a session exists.
    if (!state.user || state.mode === "newpassword") return authView();
    await loadAccess();
    // Parents only have team pages.
    if (state.roles.length && state.roles.every(r => r === "parent")) return location.replace("team.html");
    await loadPlayers();
    rosterView();
  } catch (err) {
    console.error(err);
    showMessage(app, "Couldn't load rosters", "Please try again in a moment.");
  }
}

// ---------- actions (one listener for the whole page) ----------

app.addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    if (form.id === "auth-signin") {
      const { error } = await db.auth.signInWithPassword({
        email: form.email.value.trim(),
        password: form.password.value,
      });
      if (error) return setStatus(friendlyError(error), true);
      const next = nextPage();
      if (next) return location.assign(next);
      return refresh();
    }

    if (form.id === "auth-signup") {
      const problem = checkNewPassword(form);
      if (problem) return setStatus(problem, true);
      // Name and phone go in as user metadata; the database copies them into
      // public.profiles for the admin page (supabase/live_games.sql).
      const { data, error } = await db.auth.signUp({
        email: form.email.value.trim(),
        password: form.password.value,
        options: {
          data: { full_name: form.full_name.value.trim(), phone: form.phone.value.trim() },
          // If Supabase sends a "confirm your email" link, it comes back to this
          // sign-in page (not the bare site address, which has no page).
          emailRedirectTo: location.origin + location.pathname,
        },
      });
      if (error) return setStatus(friendlyError(error), true);
      // With "Confirm email" off in Supabase, sign-up signs you straight in.
      if (data.session) return refresh();
      return setStatus("Account created. Ask the admin to confirm it, then sign in.");
    }

    if (form.id === "auth-forgot") {
      const { error } = await db.auth.resetPasswordForEmail(form.email.value.trim(), {
        redirectTo: location.origin + location.pathname, // come back to this page
      });
      if (error) return setStatus(friendlyError(error), true);
      // Same message whether or not the email has an account, so the form can't be used to find accounts.
      return setStatus("If that email has an account, a reset link is on its way. Check your inbox and spam folder.");
    }

    if (form.id === "auth-newpassword") {
      const problem = checkNewPassword(form);
      if (problem) return setStatus(problem, true);
      const { error } = await db.auth.updateUser({ password: form.password.value });
      if (error?.name === "AuthSessionMissingError") return setStatus("This reset link has expired. Use \"Forgot password\" to get a new one.", true);
      if (error) return setStatus(friendlyError(error), true);
      state.mode = "signin";
      return refresh();
    }
  } finally {
    button.disabled = false;
  }

  if (form.id === "add-team") {
    const { data, error } = await db.from("teams")
      .insert({ name: form.name.value.trim(), season: form.season.value.trim() })
      .select("id").single();
    if (error) return alert(friendlyError(error));
    state.teamId = data.id;
    return refresh();
  }
});

app.addEventListener("change", async e => {
  if (e.target.id === "photoPlayer" || e.target.id === "photoFile") return showPhotoPreview();
  if (e.target.id === "team") {
    state.teamId = e.target.value;
    await loadPlayers();
    rosterView();
  }
});

// Jersey boxes: digits only (same rule as the scoresheet).
app.addEventListener("input", e => {
  if (e.target.name === "jersey") e.target.value = e.target.value.replace(/\D/g, "");
});

app.addEventListener("click", async e => {
  if (e.target.id === "signout") {
    await db.auth.signOut({ scope: "local" });
    state.mode = "signin";
    return refresh();
  }
  // Switch between sign in / create account / forgot password.
  if (e.target.dataset.mode) {
    state.mode = e.target.dataset.mode;
    return authView();
  }
  const action = e.target.dataset.action;
  if (!action) return;
  const row = e.target.closest("tr");
  e.target.disabled = true;

  try {
    if (action === "add") {
      const player = readPlayer(row);
      if (!player) return setStatus("Enter a first and last name.", true);
      const { error } = await db.from("players").insert({ ...player, team_id: state.teamId });
      if (error) return setStatus(friendlyError(error), true);
      await loadPlayers();
      rosterView();
      setStatus(`Added ${player.first_name} ${player.last_name}.`);
    }

    if (action === "save") {
      const player = readPlayer(row);
      if (!player) return setStatus("Enter a first and last name.", true);
      const { data, error } = await db.from("players").update(player).eq("id", row.dataset.id).select("id");
      if (error) return setStatus(friendlyError(error), true);
      if (!data.length) return setStatus(friendlyError({ code: "42501" }), true);
      setStatus(`Saved ${player.first_name} ${player.last_name}.`);
    }

    if (action === "upload-photo" || action === "remove-photo") {
      const playerId = document.getElementById("photoPlayer").value;
      const player = state.players.find(p => p.id === playerId);
      const name = `${player.first_name} ${player.last_name}`;
      try {
        if (action === "upload-photo") {
          const file = document.getElementById("photoFile").files[0];
          if (!file) return setPhotoStatus("Choose a photo first.", true);
          setPhotoStatus("Uploading…");
          await uploadPlayerPhoto(player, file);
        } else {
          if (!player.photo_path) return setPhotoStatus(`${name} has no photo.`, true);
          if (!confirm(`Remove ${name}'s photo?`)) return;
          await removePlayerPhoto(player);
        }
      } catch (err) {
        // photos.js only throws messages meant for the coach
        return setPhotoStatus(err.message, true);
      }
      await loadPlayers();
      rosterView();
      document.getElementById("photoPlayer").value = playerId; // stay on the same player
      showPhotoPreview();
      setPhotoStatus(action === "upload-photo" ? `Photo saved for ${name}.` : `Removed ${name}'s photo.`);
    }

    if (action === "remove") {
      const name = `${row.querySelector('[name="first_name"]').value} ${row.querySelector('[name="last_name"]').value}`;
      // Removing hides the player from the roster and scoresheet; their past stats stay.
      if (!confirm(`Remove ${name} from the roster? Their past stats are kept.`)) return;
      const { error } = await db.from("players").update({ active: false }).eq("id", row.dataset.id);
      if (error) return setStatus(friendlyError(error), true);
      await loadPlayers();
      rosterView();
      setStatus(`Removed ${name}.`);
    }
  } finally {
    e.target.disabled = false;
  }
});

if (!isConfigured) {
  showMessage(app, "Not connected yet", "Add the Supabase URL and publishable key to js/config.js.");
} else {
  // Re-render when the session ends elsewhere (e.g. signed out in another tab).
  db.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") { state.mode = "signin"; authView(); }
    // Opened from a reset-password email: show the "Set a new password" screen.
    if (event === "PASSWORD_RECOVERY") { state.mode = "newpassword"; authView(); }
  });
  refresh();
}
