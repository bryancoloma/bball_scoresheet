// Shared HTML builders for the team, player and card pages.
// Every value from the database goes through esc() before it reaches innerHTML.

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Average per game, one decimal. 0 games shows 0.0 instead of NaN.
export const avg = (total, games) => (games ? total / games : 0).toFixed(1);

export const fullName = p => `${p.first_name} ${p.last_name}`;

// "2026-11-07" -> "Nov 7" (parsed as a local date, so it never shifts a day).
export function shortDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Only allow http(s) photo links, so a bad URL can't run script.
export function safePhoto(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

const silhouette = `<svg viewBox="0 0 100 110" aria-hidden="true"><circle cx="50" cy="34" r="22"></circle><path d="M8 110c0-26 19-44 42-44s42 18 42 44z"></path></svg>`;

export function photoBlock(p) {
  const src = safePhoto(p.photo_url);
  return src
    ? `<div class="photo"><img src="${esc(src)}" alt="${esc(fullName(p))}"></div>`
    : `<div class="photo" role="img" aria-label="No photo yet">${silhouette}<span class="photo-label">Photo coming soon</span></div>`;
}

// Filled boxes for periods played, out of 8.
export function quarters(n) {
  let s = "";
  for (let i = 0; i < 8; i++) s += `<span${i < n ? ' class="on"' : ""}></span>`;
  return `<span class="quarters" aria-label="${n} of 8 periods">${s}</span>`;
}

export function resultCell(g) {
  const won = g.team_score > g.opp_score;
  const tie = g.team_score === g.opp_score;
  const label = tie ? "T" : won ? "W" : "L";
  return `<td class="result ${won ? "w" : "l"}">${label} ${g.team_score}&ndash;${g.opp_score}</td>`;
}

export const recordText = r => `${r.wins}&ndash;${r.losses}`;

// ---------- trading card (25em x 35em = 2.5in x 3.5in when printed) ----------
export function cardFront(p, team) {
  const src = safePhoto(p.photo_url);
  const pic = src ? `<img class="pic" src="${esc(src)}" alt="">` : `<div class="no-pic">${silhouette}</div>`;
  return `<div class="card front">
    ${pic}
    <span class="team-tag">${esc(team.name)}</span>
    <span class="number">${esc(p.jersey)}</span>
    <div class="nameplate">
      <div class="first">${esc(p.first_name)}</div>
      <div class="last">${esc(p.last_name)}</div>
      <div class="pos">${esc(p.position)} &middot; ${esc(p.grade)} grade</div>
    </div>
  </div>`;
}

export function cardBack(p, team, record) {
  const s = p.season;
  // The card back has room for about 4 games.
  const rows = p.log.slice(0, 4).map(g =>
    `<tr><td>vs ${esc(g.opponent_short || g.opponent)}</td><td>${g.points}</td><td>${g.fouls}</td><td>${g.periods}</td></tr>`).join("");
  const high = p.log.reduce((best, g) => (!best || g.points > best.points ? g : best), null);
  const highText = high
    ? `<p class="highlight"><b>Season high:</b> ${high.points} points vs ${esc(high.opponent)} on ${shortDate(high.game_date)}.</p>`
    : "";
  return `<div class="card back">
    <div class="head"><span class="name">${esc(fullName(p))}</span><span class="num">#${esc(p.jersey)}</span></div>
    <div class="body">
      <div class="bio">
        <div><span class="k">Position</span><span class="v">${esc(p.position)}</span></div>
        <div><span class="k">Grade</span><span class="v">${esc(p.grade)}</span></div>
        <div><span class="k">Record</span><span class="v">${recordText(record)}</span></div>
      </div>
      <div class="section-title">Season stats</div>
      <table>
        <thead><tr><th>Game</th><th>Pts</th><th>Fls</th><th>Per</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Season avg</td><td>${avg(s.points, s.games)}</td><td>${avg(s.fouls, s.games)}</td><td>${avg(s.periods, s.games)}</td></tr></tfoot>
      </table>
      <div class="section-title">Season totals</div>
      <div class="bio">
        <div><span class="k">Games</span><span class="v">${s.games}</span></div>
        <div><span class="k">Points</span><span class="v">${s.points}</span></div>
        <div><span class="k">Fouls</span><span class="v">${s.fouls}</span></div>
      </div>
      ${highText}
    </div>
    <div class="foot">${esc(team.org)} &middot; ${esc(team.season)} Season</div>
  </div>`;
}

// Small clickable card used on the roster and profile.
export function thumb(p, team) {
  return `<a class="thumb" href="card.html?id=${encodeURIComponent(p.slug)}" aria-label="See ${esc(fullName(p))}'s player card">${cardFront(p, team)}</a>`;
}

// Shown on team, player and card pages when nobody is signed in.
// After signing in, the roster page sends them back here (?next=).
export function signInPrompt(el) {
  const here = location.pathname.split("/").pop() + location.search;
  el.innerHTML = `<section class="panel narrow">
    <h2>Sign in to view teams</h2>
    <p class="muted">Team pages, player stats and cards are for coaches and admins.</p>
    <a class="button-link" href="roster.html?next=${encodeURIComponent(here)}">Sign in</a>
  </section>`;
}

// Friendly message for setup problems and load errors.
export function showMessage(el, title, detail) {
  el.innerHTML = `<section class="panel"><h2>${esc(title)}</h2><p class="muted">${esc(detail)}</p></section>`;
}
