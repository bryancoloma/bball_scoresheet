import { isConfigured, getMyAccess, getPlayer } from "./data.js";
import { esc, fullName, cardFront, cardBack, showMessage, signInPrompt } from "./render.js";

const app = document.getElementById("app");

async function main() {
    if (!isConfigured) {
        return showMessage(app, "Not connected yet", "Add the Supabase URL and publishable key to js/config.js.");
    }
    // Signed-in coaches and admins only; the database also hides other teams' players.
    const access = await getMyAccess();
    if (!access.user) return signInPrompt(app);
    const slug = new URLSearchParams(location.search).get("id");
    const p = slug ? await getPlayer(slug) : null;
    if (!p) return showMessage(app, "Player not found", "Check the link. You can only view players on your own team.");
    if (!access.isAdmin && !p.team.cards_released) {
        return showMessage(app, "Player cards aren't out yet", "The league admin will release them for your team.");
    }

    document.title = `${fullName(p)} Player Card`;
    app.innerHTML = `
        <nav class="top-nav">
            <a href="team.html?team=${encodeURIComponent(p.team.slug)}">&larr; ${esc(p.team.name)} roster</a>
            <a href="player.html?id=${encodeURIComponent(p.slug)}">${esc(fullName(p))}'s stats</a>
        </nav>
        <h1 class="view-head">${esc(fullName(p))} &middot; player card</h1>
        <div class="sheet">
            <div class="side"><span class="side-label">Front</span>${cardFront(p, p.team)}</div>
            <div class="side"><span class="side-label">Back</span>${cardBack(p, p.team, p.record)}</div>
        </div>
        <p class="print-tip">Prints at trading-card size, 2.5 &times; 3.5 inches. Print on card stock at 100% scale,
        cut along the dashed lines, and glue the two sides back to back.</p>`;
}

main().catch(err => {
    console.error(err);
    showMessage(app, "Couldn't load the card", "Please try again in a moment.");
});
